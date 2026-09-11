import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Medication } from '../models/Medication.js';
import { User } from '../models/User.js';
import { AdherenceLog } from '../models/AdherenceLog.js';
import { DoctorPatientLink } from '../models/DoctorPatientLink.js';
import { decryptField, encryptField } from '../utils/encryption.js';

async function migrate() {
  console.log('=== Re-encrypting all database fields with primary FIELD_ENCRYPTION_KEY ===');
  await connectDB();

  // 1. Medications
  const meds = await Medication.find({});
  let medCount = 0;
  for (const m of meds) {
    const rawDoc = m.toObject({ getters: false });
    const decInstructions = decryptField(rawDoc.instructions);
    const decSideEffects = decryptField(rawDoc.sideEffects);
    
    // Save cleanly decrypted string, which triggers setter with current primary key
    m.instructions = decInstructions;
    m.sideEffects = decSideEffects;
    await m.save();
    medCount++;
  }
  console.log(`[OK] Re-encrypted ${medCount} Medication documents`);

  // 2. Users
  const users = await User.find({});
  let userCount = 0;
  for (const u of users) {
    const rawDoc = u.toObject({ getters: false });
    const decBlood = decryptField(rawDoc.bloodGroup);
    const decEmerg = decryptField(rawDoc.emergencyContact);
    u.bloodGroup = decBlood;
    u.emergencyContact = decEmerg;
    await u.save();
    userCount++;
  }
  console.log(`[OK] Re-encrypted ${userCount} User documents`);

  console.log('=== Migration completed successfully! ===');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(async (err) => {
  console.error('Migration error:', err);
  await mongoose.disconnect();
  process.exit(1);
});
