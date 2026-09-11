import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from '../config/db.js';
import { AdherenceLog } from '../models/AdherenceLog.js';

const run = async () => {
  await connectDB();
  const now = new Date();
  const res = await AdherenceLog.deleteMany({
    scheduledTime: { $gt: now },
    status: { $in: ['skipped', 'late', 'missed'] },
  });
  console.log(`Deleted ${res.deletedCount} future skipped/late/missed logs from database.`);
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
