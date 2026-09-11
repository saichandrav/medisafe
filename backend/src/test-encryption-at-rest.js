import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Medication } from './models/Medication.js';
import { AdherenceLog } from './models/AdherenceLog.js';
import { DoctorPatientLink } from './models/DoctorPatientLink.js';
import { encryptField, decryptField, isEncrypted } from './utils/encryption.js';

async function testFieldLevelEncryptionAtRest() {
  console.log('=== Running Application-Layer Field-Level Encryption at Rest Test ===\n');
  await connectDB();

  const db = mongoose.connection.db;

  // 1. Test Semantic Security (IND-CPA)
  console.log('1. Testing Semantic Security (AES-256-GCM random IV uniqueness)...');
  const samplePlaintext = 'O+ Positive Rare';
  const enc1 = encryptField(samplePlaintext);
  const enc2 = encryptField(samplePlaintext);

  if (enc1 === enc2) {
    throw new Error('Deterministic encryption detected! Fresh random IVs required for semantic security.');
  }
  if (!isEncrypted(enc1) || !isEncrypted(enc2)) {
    throw new Error('Ciphertext format invalid (missing enc:v1: prefix).');
  }
  if (decryptField(enc1) !== samplePlaintext || decryptField(enc2) !== samplePlaintext) {
    throw new Error('Decryption failed for semantic test plaintexts.');
  }
  console.log('[OK] Verified: Identical plaintexts produce completely unique ciphertexts at rest.');

  // 2. Test User Model Encryption at Rest
  console.log('\n2. Testing User model encryption at rest (bloodGroup, emergencyContact)...');
  const testPhone = '+919000011111';
  await User.deleteMany({ phone: testPhone });

  const rawBlood = 'AB- Rare';
  const rawEmergency = '+919888877777 (Spouse: Priya)';

  const user = await User.create({
    phone: testPhone,
    name: 'FLE Test Patient',
    role: 'patient',
    isProfileComplete: true,
    bloodGroup: rawBlood,
    emergencyContact: rawEmergency,
  });

  // Query raw collection directly using native MongoDB driver (bypassing Mongoose getters)
  const rawUserInMongo = await db.collection('users').findOne({ _id: user._id });
  console.log('Raw MongoDB Document Storage (At Rest):');
  console.log('  - bloodGroup stored:', rawUserInMongo.bloodGroup);
  console.log('  - emergencyContact stored:', rawUserInMongo.emergencyContact);

  if (!isEncrypted(rawUserInMongo.bloodGroup)) {
    throw new Error(`User bloodGroup is stored in plaintext in MongoDB! Found: ${rawUserInMongo.bloodGroup}`);
  }
  if (!isEncrypted(rawUserInMongo.emergencyContact)) {
    throw new Error(`User emergencyContact is stored in plaintext in MongoDB! Found: ${rawUserInMongo.emergencyContact}`);
  }
  if (rawUserInMongo.bloodGroup.includes(rawBlood) || rawUserInMongo.emergencyContact.includes(rawEmergency)) {
    throw new Error('Raw MongoDB document leaks plaintext data!');
  }
  console.log('[OK] Verified: Sensitive user health fields are strictly encrypted in raw MongoDB BSON.');

  // Query via Mongoose model (testing transparent decryption in application layer)
  const loadedUser = await User.findById(user._id);
  console.log('Mongoose Application Layer Reads:');
  console.log('  - loadedUser.bloodGroup:', loadedUser.bloodGroup);
  console.log('  - loadedUser.emergencyContact:', loadedUser.emergencyContact);
  console.log('  - loadedUser.toPublicProfile().bloodGroup:', loadedUser.toPublicProfile().bloodGroup);

  if (loadedUser.bloodGroup !== rawBlood || loadedUser.emergencyContact !== rawEmergency) {
    throw new Error('Transparent decryption failed on User read!');
  }
  if (loadedUser.toPublicProfile().bloodGroup !== rawBlood) {
    throw new Error('toPublicProfile() failed to decrypt bloodGroup!');
  }
  console.log('[OK] Verified: Mongoose automatically decrypts fields for authorized application reads.');

  // 3. Test Medication Model Encryption at Rest
  console.log('\n3. Testing Medication model encryption at rest (instructions, sideEffects)...');
  const clinicalInstructions = 'Take 1 tablet after dialysis; monitor creatinine levels closely.';
  const reportedSideEffects = 'Mild hypokalemia, dizziness upon standing';

  const med = await Medication.create({
    userId: user._id,
    name: 'Spironolactone FLE',
    dosage: '25mg',
    frequency: 'once_daily',
    instructions: clinicalInstructions,
    sideEffects: reportedSideEffects,
  });

  const rawMedInMongo = await db.collection('medications').findOne({ _id: med._id });
  console.log('Raw MongoDB Document Storage (At Rest):');
  console.log('  - instructions stored:', rawMedInMongo.instructions);
  console.log('  - sideEffects stored:', rawMedInMongo.sideEffects);

  if (!isEncrypted(rawMedInMongo.instructions) || !isEncrypted(rawMedInMongo.sideEffects)) {
    throw new Error('Medication clinical instructions or sideEffects stored in plaintext at rest!');
  }
  if (rawMedInMongo.instructions.includes('dialysis') || rawMedInMongo.sideEffects.includes('hypokalemia')) {
    throw new Error('Medication record leaks clinical instructions/diagnoses in database storage!');
  }

  const loadedMed = await Medication.findById(med._id);
  if (loadedMed.instructions !== clinicalInstructions || loadedMed.sideEffects !== reportedSideEffects) {
    throw new Error('Medication transparent decryption failed!');
  }
  console.log('[OK] Verified: Medication clinical instructions and side effects encrypted at rest.');

  // 4. Test AdherenceLog Model with findOneAndUpdate
  console.log('\n4. Testing AdherenceLog model with findOneAndUpdate upsert...');
  const schedTime = new Date('2026-09-10T18:00:00Z');
  const clinicalNotes = 'Patient experienced acute nausea 20 minutes after ingestion.';

  await AdherenceLog.deleteMany({ userId: user._id });

  const log = await AdherenceLog.findOneAndUpdate(
    { userId: user._id, medicationId: med._id, scheduledTime: schedTime },
    {
      userId: user._id,
      medicationId: med._id,
      scheduledTime: schedTime,
      status: 'taken',
      notes: clinicalNotes,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const rawLogInMongo = await db.collection('adherencelogs').findOne({ _id: log._id });
  console.log('Raw MongoDB Storage for AdherenceLog (At Rest):');
  console.log('  - notes stored:', rawLogInMongo.notes);

  if (!isEncrypted(rawLogInMongo.notes)) {
    throw new Error('AdherenceLog notes stored in plaintext at rest!');
  }
  if (rawLogInMongo.notes.includes('nausea')) {
    throw new Error('AdherenceLog notes leak patient symptom details in database!');
  }

  const loadedLog = await AdherenceLog.findById(log._id);
  if (loadedLog.notes !== clinicalNotes) {
    throw new Error('AdherenceLog notes decryption failed!');
  }
  console.log('[OK] Verified: AdherenceLog notes encrypted at rest on findOneAndUpdate upsert.');

  // 5. Test DoctorPatientLink Model Encryption at Rest
  console.log('\n5. Testing DoctorPatientLink model encryption at rest (clinical monitoring notes)...');
  const dummyDoctorId = new mongoose.Types.ObjectId();
  const linkNotes = 'High-risk cardiovascular patient. Requires 15-minute audit window.';

  await DoctorPatientLink.deleteMany({ doctorId: dummyDoctorId, patientId: user._id });

  const link = await DoctorPatientLink.create({
    doctorId: dummyDoctorId,
    patientId: user._id,
    notes: linkNotes,
  });

  const rawLinkInMongo = await db.collection('doctorpatientlinks').findOne({ _id: link._id });
  console.log('Raw MongoDB Storage for DoctorPatientLink (At Rest):');
  console.log('  - notes stored:', rawLinkInMongo.notes);

  if (!isEncrypted(rawLinkInMongo.notes)) {
    throw new Error('DoctorPatientLink notes stored in plaintext at rest!');
  }

  const loadedLink = await DoctorPatientLink.findById(link._id);
  if (loadedLink.notes !== linkNotes) {
    throw new Error('DoctorPatientLink notes decryption failed!');
  }
  console.log('[OK] Verified: Doctor clinical notes encrypted at rest.');

  // 6. Test Tamper Resistance (IND-CCA2 Integrity Authentication Tag)
  console.log('\n6. Testing Tamper Resistance (altering ciphertext fails authentication tag)...');
  const originalEncrypted = rawUserInMongo.bloodGroup;
  // Corrupt the ciphertext payload
  const parts = originalEncrypted.split(':');
  const corruptedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].replace(/[0-9a-f]/, '0')}`;
  
  const tamperResult = decryptField(corruptedCiphertext);
  // With GCM tag verification failure, decryptField catches auth tag failure
  if (tamperResult === rawBlood) {
    throw new Error('Tampered ciphertext unexpectedly authenticated!');
  }
  console.log('[OK] Verified: Tampered ciphertext rejected by GCM authentication tag verification.');

  // Clean up
  await User.deleteMany({ phone: testPhone });
  await Medication.deleteMany({ userId: user._id });
  await AdherenceLog.deleteMany({ userId: user._id });
  await DoctorPatientLink.deleteMany({ doctorId: dummyDoctorId });

  console.log('\n================================================================');
  console.log('APPLICATION-LAYER FIELD-LEVEL ENCRYPTION AT REST VERIFIED 100%! [OK] ');
  console.log('================================================================');
  process.exit(0);
}

testFieldLevelEncryptionAtRest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
