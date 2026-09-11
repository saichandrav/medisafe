import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medsafe_db';

// Test / synthetic phone numbers created by automated test flows
const FAKE_PHONES = [
  '+919998887771', // Ramesh Patel
  '+919876543219', // Pooja Patel
  '+919999900001', // Dr. Ramesh Sharma
  '+919999900002', // Anita Verma
  '+919999900010', // Rohan Sharma
  '+919999900011', // Sunita Sharma
  '+919999900012', // Dr. Vikram Seth
  '+919999900013', // Pharm. Ananya Roy
  '+919876500099', // Leak Test Patient
  '+919876543210', // Pharmacist UserPharmacist User
];

async function runCleanup() {
  try {
    console.log('Connecting to MongoDB at:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    // 1. Find the fake user documents
    const fakeUsers = await db.collection('users').find({ phone: { $in: FAKE_PHONES } }).toArray();
    const fakeUserIds = fakeUsers.map((u) => u._id);
    console.log(`Found ${fakeUsers.length} fake user accounts to clean up:`, fakeUsers.map((u) => `${u.name} (${u.phone})`));

    // 2. Delete medications belonging to fake users or with test drug names
    const medDeleteResult = await db.collection('medications').deleteMany({
      $or: [
        { userId: { $in: fakeUserIds } },
        { name: 'CipherLeakCheck Drug' },
      ],
    });
    console.log(`Deleted ${medDeleteResult.deletedCount} fake medications.`);

    // 3. Delete prescription orders belonging to fake users
    const orderDeleteResult = await db.collection('prescriptionorders').deleteMany({
      $or: [
        { patientId: { $in: fakeUserIds } },
        { patientPhone: { $in: FAKE_PHONES } },
        { doctorId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${orderDeleteResult.deletedCount} fake prescription orders.`);

    // 4. Delete refill requests belonging to fake users
    const refillDeleteResult = await db.collection('refillrequests').deleteMany({
      $or: [
        { patientId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${refillDeleteResult.deletedCount} fake refill requests.`);

    // 5. Delete adherence logs belonging to fake users
    const adherenceDeleteResult = await db.collection('adherencelogs').deleteMany({
      $or: [
        { userId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${adherenceDeleteResult.deletedCount} fake adherence logs.`);

    // 6. Delete communications belonging to fake users
    const commsDeleteResult = await db.collection('communications').deleteMany({
      $or: [
        { patientId: { $in: fakeUserIds } },
        { senderId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${commsDeleteResult.deletedCount} fake communications.`);

    // 7. Delete caregiver links involving fake users
    const caregiverLinkDeleteResult = await db.collection('caregiverlinks').deleteMany({
      $or: [
        { patientId: { $in: fakeUserIds } },
        { caregiverId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${caregiverLinkDeleteResult.deletedCount} fake caregiver links.`);

    // 8. Delete doctor-patient links involving fake users
    const doctorLinkDeleteResult = await db.collection('doctorpatientlinks').deleteMany({
      $or: [
        { patientId: { $in: fakeUserIds } },
        { doctorId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${doctorLinkDeleteResult.deletedCount} fake doctor-patient links.`);

    // 9. Delete test patient reports
    const reportDeleteResult = await db.collection('patientreports').deleteMany({
      $or: [
        { patientId: { $in: fakeUserIds } },
      ],
    });
    console.log(`Deleted ${reportDeleteResult.deletedCount} fake patient reports.`);

    // 10. Delete the fake users themselves
    const userDeleteResult = await db.collection('users').deleteMany({
      _id: { $in: fakeUserIds },
    });
    console.log(`Deleted ${userDeleteResult.deletedCount} fake users.`);

    // 11. Print remaining authentic database state
    console.log('\n--- REMAINING AUTHENTIC DATABASE STATE ---');
    const remainingUsers = await db.collection('users').find({}).toArray();
    console.log(`Users (${remainingUsers.length}):`);
    remainingUsers.forEach((u) => console.log(`  - [${u.role}] ${u.name} (${u.phone})`));

    const remainingMeds = await db.collection('medications').find({}).toArray();
    console.log(`Medications (${remainingMeds.length}):`);
    remainingMeds.forEach((m) => console.log(`  - ${m.name} (${m.dosage}) for userId: ${m.userId}`));

    const remainingOrders = await db.collection('prescriptionorders').find({}).toArray();
    console.log(`Prescription Orders (${remainingOrders.length}):`);
    remainingOrders.forEach((o) => console.log(`  - ${o.medicationName} for ${o.patientName} (${o.status})`));

    const remainingRefills = await db.collection('refillrequests').find({}).toArray();
    console.log(`Refill Requests (${remainingRefills.length}):`);
    remainingRefills.forEach((r) => console.log(`  - Refill for medId: ${r.medicationId} (${r.status})`));

    console.log('\nDatabase cleanup finished successfully.');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runCleanup();
