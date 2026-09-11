import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Medication } from './models/Medication.js';
import { AdherenceLog } from './models/AdherenceLog.js';
import { User } from './models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medsafe';

async function runTest() {
  await mongoose.connect(MONGO_URI);
  console.log('[OK] Connected to MongoDB');

  // Find or create test patient
  let patient = await User.findOne({ phone: '+919999900010' });
  if (!patient) {
    patient = await User.create({
      phone: '+919999900010',
      name: 'Test Patient Rule',
      role: 'patient',
    });
  }

  // Clean previous adherence logs and test meds for this user
  await AdherenceLog.deleteMany({ userId: patient._id });
  await Medication.deleteMany({ userId: patient._id });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  // Calculate times for testing:
  // 1. T1: 1 hour in the future (45 minutes from now) -> triggers 1-hour before reminder
  const t1 = new Date(now.getTime() + 45 * 60 * 1000);
  const timeStr1 = `${pad(t1.getHours())}:${pad(t1.getMinutes())}`;

  // 2. T2: Exact time now (5 minutes ago) -> triggers exact time due alert (<= 10 min window)
  const t2 = new Date(now.getTime() - 5 * 60 * 1000);
  const timeStr2 = `${pad(t2.getHours())}:${pad(t2.getMinutes())}`;

  // 3. T3: 15 minutes ago -> crosses 10 min -> marked as LATE
  const t3 = new Date(now.getTime() - 15 * 60 * 1000);
  const timeStr3 = `${pad(t3.getHours())}:${pad(t3.getMinutes())}`;

  // 4. T4: 75 minutes ago (1h 15m ago) -> crosses 1 hour overdue -> 1-hour after overdue alert
  const t4 = new Date(now.getTime() - 75 * 60 * 1000);
  const timeStr4 = `${pad(t4.getHours())}:${pad(t4.getMinutes())}`;

  // 5. T5: 200 minutes ago (> 3 hours ago) -> late by 3 hours -> automatically marked SKIPPED
  const t5 = new Date(now.getTime() - 200 * 60 * 1000);
  const timeStr5 = `${pad(t5.getHours())}:${pad(t5.getMinutes())}`;

  console.log('Creating test medications with scheduled times:', {
    future_1h: timeStr1,
    exact_due: timeStr2,
    late_15m: timeStr3,
    overdue_75m: timeStr4,
    autoskip_200m: timeStr5,
  });

  const med1 = await Medication.create({
    userId: patient._id,
    name: 'Future Med (1h Reminder)',
    dosage: '500mg',
    times: [timeStr1],
    isActive: true,
  });

  const med2 = await Medication.create({
    userId: patient._id,
    name: 'Due Now Med',
    dosage: '250mg',
    times: [timeStr2],
    isActive: true,
  });

  const med3 = await Medication.create({
    userId: patient._id,
    name: 'Late Med (>10m)',
    dosage: '650mg',
    times: [timeStr3],
    isActive: true,
  });

  const med4 = await Medication.create({
    userId: patient._id,
    name: 'Overdue 1h Med',
    dosage: '10mg',
    times: [timeStr4],
    isActive: true,
  });

  const med5 = await Medication.create({
    userId: patient._id,
    name: 'Auto-Skip Med (>3h)',
    dosage: '40mg',
    times: [timeStr5],
    isActive: true,
  });

  // Call getTodaySchedule logic
  const { getTodaySchedule } = await import('./controllers/medicationController.js');

  const req = { user: patient };
  let responseData = null;
  const res = {
    json: (data) => {
      responseData = data;
    },
    status: () => res,
  };

  await getTodaySchedule(req, res);

  if (!responseData || !responseData.success) {
    throw new Error('getTodaySchedule returned failure');
  }

  const { schedule, alerts } = responseData;
  console.log(`[OK] Retrieved ${schedule.length} schedule items and ${alerts.length} dynamic alerts.`);

  // Verify Schedule Statuses
  const itemFuture = schedule.find((s) => s.medicationName === 'Future Med (1h Reminder)');
  const itemDueNow = schedule.find((s) => s.medicationName === 'Due Now Med');
  const itemLate = schedule.find((s) => s.medicationName === 'Late Med (>10m)');
  const itemOverdue = schedule.find((s) => s.medicationName === 'Overdue 1h Med');
  const itemAutoSkip = schedule.find((s) => s.medicationName === 'Auto-Skip Med (>3h)');

  console.log('Schedule statuses:');
  console.log(' - Future Med:', itemFuture?.status, '(Expected: pending)');
  console.log(' - Due Now Med:', itemDueNow?.status, '(Expected: pending)');
  console.log(' - Late Med (>10m):', itemLate?.status, '(Expected: late)');
  console.log(' - Overdue 1h Med:', itemOverdue?.status, '(Expected: late)');
  console.log(' - Auto-Skip Med (>3h):', itemAutoSkip?.status, '(Expected: skipped)');

  if (itemLate?.status !== 'late') throw new Error(`Expected Late Med to be 'late', got '${itemLate?.status}'`);
  if (itemAutoSkip?.status !== 'skipped') throw new Error(`Expected Auto-Skip Med to be 'skipped', got '${itemAutoSkip?.status}'`);

  // Verify AdherenceLog persistence for auto-skipped dose
  const persistedSkipLog = await AdherenceLog.findOne({
    userId: patient._id,
    medicationId: med5._id,
  });
  if (!persistedSkipLog || persistedSkipLog.status !== 'skipped') {
    throw new Error('AdherenceLog was not automatically persisted as skipped for >3h dose');
  }
  console.log('[OK] Persisted Auto-Skip AdherenceLog verified in MongoDB:', persistedSkipLog.notes);

  // Verify Alerts
  console.log('Generated Alerts:');
  alerts.forEach((a) => console.log(` [${a.type}] ${a.title} -> ${a.message}`));

  const has1hBefore = alerts.some((a) => a.type === '1h_before');
  const hasExactTime = alerts.some((a) => a.type === 'exact_time');
  const has1hAfter = alerts.some((a) => a.type === '1h_after');
  const has3hSkipped = alerts.some((a) => a.type === '3h_skipped');

  console.log({
    has1hBefore,
    hasExactTime,
    has1hAfter,
    has3hSkipped,
  });

  if (!has1hBefore) throw new Error('Missing 1h before reminder alert');
  if (!hasExactTime) throw new Error('Missing exact time due alert');
  if (!has1hAfter) throw new Error('Missing 1h after overdue alert');
  if (!has3hSkipped) throw new Error('Missing 3h auto-skipped alert');

  // Verify logAdherence rule adjustments
  const { logAdherence } = await import('./controllers/adherenceController.js');

  // Taking Late Med (>10m) -> Should be adjusted to 'late'
  let logRes1 = null;
  await logAdherence(
    {
      user: patient,
      body: {
        medicationId: med3._id,
        scheduledTime: itemLate.scheduledTime,
        status: 'taken',
      },
    },
    { json: (d) => { logRes1 = d; }, status: () => ({ json: (d) => { logRes1 = d; } }) }
  );
  console.log('Logging Late Med as "taken" -> Resulting status:', logRes1?.log?.status);
  if (logRes1?.log?.status !== 'late') throw new Error(`Expected status 'late', got '${logRes1?.log?.status}'`);

  // Taking Auto-Skip Med (>3h) -> Should be adjusted to 'skipped'
  let logRes2 = null;
  await logAdherence(
    {
      user: patient,
      body: {
        medicationId: med5._id,
        scheduledTime: itemAutoSkip.scheduledTime,
        status: 'taken',
      },
    },
    { json: (d) => { logRes2 = d; }, status: () => ({ json: (d) => { logRes2 = d; } }) }
  );
  console.log('Logging 3h+ Med as "taken" -> Resulting status:', logRes2?.log?.status);
  if (logRes2?.log?.status !== 'skipped') throw new Error(`Expected status 'skipped', got '${logRes2?.log?.status}'`);

  console.log('\nALL SCHEDULE & TIMING RULES VERIFIED SUCCESSFULLY! [OK]');
  await mongoose.disconnect();
}

runTest().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
