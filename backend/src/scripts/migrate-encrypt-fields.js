import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { encryptField, isEncrypted } from '../utils/encryption.js';

async function migrateFieldsToEncryptedAtRest() {
  console.log('=== MedSafe Field-Level Encryption Migration Utility ===\n');
  await connectDB();

  const db = mongoose.connection.db;

  // 1. Migrate Users
  console.log('1. Checking Users collection...');
  const usersColl = db.collection('users');
  const users = await usersColl.find({}).toArray();
  let usersMigrated = 0;

  for (const user of users) {
    const updates = {};
    if (user.bloodGroup && !isEncrypted(user.bloodGroup)) {
      updates.bloodGroup = encryptField(user.bloodGroup);
    }
    if (user.emergencyContact && !isEncrypted(user.emergencyContact)) {
      updates.emergencyContact = encryptField(user.emergencyContact);
    }

    if (Object.keys(updates).length > 0) {
      await usersColl.updateOne({ _id: user._id }, { $set: updates });
      usersMigrated++;
    }
  }
  console.log(`[OK] Users checked: ${users.length}, migrated to AES-256-GCM: ${usersMigrated}`);

  // 2. Migrate Medications
  console.log('\n2. Checking Medications collection...');
  const medsColl = db.collection('medications');
  const meds = await medsColl.find({}).toArray();
  let medsMigrated = 0;

  for (const med of meds) {
    const updates = {};
    if (med.instructions && !isEncrypted(med.instructions)) {
      updates.instructions = encryptField(med.instructions);
    }
    if (med.sideEffects && !isEncrypted(med.sideEffects)) {
      updates.sideEffects = encryptField(med.sideEffects);
    }

    if (Object.keys(updates).length > 0) {
      await medsColl.updateOne({ _id: med._id }, { $set: updates });
      medsMigrated++;
    }
  }
  console.log(`[OK] Medications checked: ${meds.length}, migrated to AES-256-GCM: ${medsMigrated}`);

  // 3. Migrate Adherence Logs
  console.log('\n3. Checking AdherenceLogs collection...');
  const logsColl = db.collection('adherencelogs');
  const logs = await logsColl.find({}).toArray();
  let logsMigrated = 0;

  for (const log of logs) {
    if (log.notes && !isEncrypted(log.notes)) {
      await logsColl.updateOne({ _id: log._id }, { $set: { notes: encryptField(log.notes) } });
      logsMigrated++;
    }
  }
  console.log(`[OK] AdherenceLogs checked: ${logs.length}, migrated to AES-256-GCM: ${logsMigrated}`);

  // 4. Migrate DoctorPatientLinks
  console.log('\n4. Checking DoctorPatientLinks collection...');
  const linksColl = db.collection('doctorpatientlinks');
  const links = await linksColl.find({}).toArray();
  let linksMigrated = 0;

  for (const link of links) {
    if (link.notes && !isEncrypted(link.notes)) {
      await linksColl.updateOne({ _id: link._id }, { $set: { notes: encryptField(link.notes) } });
      linksMigrated++;
    }
  }
  console.log(`[OK] DoctorPatientLinks checked: ${links.length}, migrated to AES-256-GCM: ${linksMigrated}`);

  console.log('\n======================================================');
  console.log('FIELD-LEVEL ENCRYPTION MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  process.exit(0);
}

migrateFieldsToEncryptedAtRest().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
