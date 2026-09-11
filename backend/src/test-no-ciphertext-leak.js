import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Medication } from './models/Medication.js';

const BASE_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'production_jwt_super_secret_key_change_in_production_min_32_chars';

async function testNoCiphertextLeak() {
  console.log('=== Running Server-Side No-Ciphertext-Leak Security Test ===\n');
  await connectDB();

  const testUser = await User.findOneAndUpdate(
    { phone: '+919876500099' },
    { name: 'Leak Test Patient', role: 'patient', isProfileComplete: true },
    { upsert: true, new: true }
  );

  const token = jwt.sign({ id: testUser._id.toString(), phone: testUser.phone }, JWT_SECRET, { expiresIn: '1h' });
  const cookieHeader = `token=${token}; Path=/; HttpOnly; SameSite=Strict`;

  // 1. Create a medication with sensitive clinical instructions and side effects
  const rawInstructions = 'Take 2 capsules with cold water after dinner. Avoid grapefruit.';
  const rawSideEffects = 'Mild dizziness or dry mouth.';
  
  const createdMed = await Medication.create({
    userId: testUser._id,
    name: 'CipherLeakCheck Drug',
    dosage: '25mg',
    frequency: 'once_daily',
    times: ['21:00'],
    instructions: rawInstructions,
    sideEffects: rawSideEffects,
    isActive: true,
  });

  // Verify it is encrypted at rest in raw MongoDB storage
  const rawInMongo = await mongoose.connection.db.collection('medications').findOne({ _id: createdMed._id });
  console.log('1. Raw Storage in MongoDB (At Rest):');
  console.log('   - instructions at rest:', rawInMongo.instructions);
  console.log('   - sideEffects at rest:', rawInMongo.sideEffects);

  if (!rawInMongo.instructions.startsWith('enc:v1:')) {
    throw new Error('FAILED: instructions field is not encrypted at rest in raw MongoDB!');
  }
  console.log('[OK] Verified: Data is encrypted at rest in MongoDB BSON.\n');

  // 2. Fetch via GET /api/medications (the exact endpoint the frontend hits)
  console.log('2. Fetching via client endpoint: GET /api/medications');
  const res1 = await fetch(`${BASE_URL}/medications`, {
    headers: { Cookie: cookieHeader }
  });
  const data1 = await res1.json();

  if (!res1.ok || !data1.success) {
    throw new Error(`Failed to fetch /medications: ${JSON.stringify(data1)}`);
  }

  // Deep scan the entire response JSON for any string matching /^enc:v\d:/
  function assertNoCiphertext(obj, path = '') {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      if (/^enc:v\d:/.test(obj) || obj.includes('enc:v1:')) {
        throw new Error(`CRITICAL SECURITY FAILURE: Ciphertext leak detected at ${path}: "${obj}"`);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => assertNoCiphertext(item, `${path}[${index}]`));
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach((key) => assertNoCiphertext(obj[key], `${path}.${key}`));
    }
  }

  assertNoCiphertext(data1, 'data1');
  console.log('[OK] Passed: Zero ciphertext strings found in GET /api/medications response.');

  // Find our created medication in the response and verify decrypted text
  const returnedMed = data1.medications.find(m => m._id === createdMed._id.toString() || m.id === createdMed._id.toString());
  if (!returnedMed) {
    throw new Error('Created medication not found in returned list');
  }
  console.log('   - returnedMed.instructions:', returnedMed.instructions);
  console.log('   - returnedMed.sideEffects:', returnedMed.sideEffects);
  if (returnedMed.instructions !== rawInstructions) {
    throw new Error(`Expected instructions to equal "${rawInstructions}", got "${returnedMed.instructions}"`);
  }
  console.log('[OK] Passed: Instructions correctly decrypted to plaintext.\n');

  // 3. Fetch via GET /api/medications/today-schedule
  console.log('3. Fetching via client endpoint: GET /api/medications/today-schedule');
  const res2 = await fetch(`${BASE_URL}/medications/today-schedule`, {
    headers: { Cookie: cookieHeader }
  });
  const data2 = await res2.json();
  assertNoCiphertext(data2, 'data2');
  console.log('[OK] Passed: Zero ciphertext strings found in GET /api/medications/today-schedule response.\n');

  // Clean up
  await Medication.deleteOne({ _id: createdMed._id });
  console.log('================================================================');
  console.log('ZERO CIPHERTEXT LEAKAGE GUARANTEE VERIFIED 100%! [OK] ');
  console.log('================================================================');

  await mongoose.disconnect();
  process.exit(0);
}

testNoCiphertextLeak().catch(async (err) => {
  console.error('[FAIL] Test failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
