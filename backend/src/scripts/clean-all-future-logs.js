import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from '../config/db.js';
import { AdherenceLog } from '../models/AdherenceLog.js';

const run = async () => {
  await connectDB();
  const now = new Date();
  console.log('Current System Time:', now.toISOString(), now.toLocaleString());

  const futureLogs = await AdherenceLog.find({ scheduledTime: { $gt: now } });
  console.log(`Found ${futureLogs.length} future adherence logs:`);
  futureLogs.forEach((l) => {
    console.log(` - ID: ${l._id} | Scheduled: ${l.scheduledTime.toISOString()} | Status: ${l.status}`);
  });

  const res = await AdherenceLog.deleteMany({ scheduledTime: { $gt: now } });
  console.log(`Successfully deleted ${res.deletedCount} future adherence logs from database.`);
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
