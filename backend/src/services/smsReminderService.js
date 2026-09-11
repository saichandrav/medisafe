import { getClient, getTwilioConfig, normalizePhoneNumber } from '../config/twilio.js';
import { User } from '../models/User.js';
import { Medication } from '../models/Medication.js';
import { AdherenceLog } from '../models/AdherenceLog.js';
import { SmsNotification } from '../models/SmsNotification.js';

/**
 * Builds the 3 required custom messages for medication alerts:
 * 1. 1 hour before: Reminding upcoming dose
 * 2. Exact medication time: Time to take medicine right now
 * 3. 1 hour after: Alerting late medication and prompting to take medicine late
 */
export const buildMedicationMessage = (type, { medName, dosage, timeStr }) => {
  const doseLabel = dosage ? `${medName} (${dosage})` : medName;

  switch (type) {
    case '1h_before':
      return `[MedSafe Reminder] Upcoming Dose in 1 Hour: Please remember to take your ${doseLabel} scheduled for ${timeStr}. Keep water ready and stay on track with your health schedule.`;

    case 'exact_time':
      return `[MedSafe Alert] Time to Take Medicine NOW: It is ${timeStr}. Please take your prescribed dose of ${doseLabel} right now and log your intake in MedSafe.`;

    case '1h_after':
      return `[MedSafe Urgent Alert] Late Medication Warning: You have not taken ${doseLabel} scheduled for ${timeStr} (1 hour late). Please take your medicine now as late before the 3-hour window expires and it gets skipped!`;

    case 'test':
      return `[MedSafe Test Notification] SMS delivery verified successfully! You will receive: (1) 1h-before reminder, (2) Exact-time alert to take right now, and (3) 1h-after late alert if pending.`;

    default:
      return `[MedSafe] Medication reminder for ${doseLabel} scheduled at ${timeStr}.`;
  }
};

/**
 * Dispatches an SMS using Twilio Programmable SMS with deduplication
 */
export const dispatchMedicationSms = async ({
  userId,
  phone,
  medicationId,
  medicationName,
  scheduledTime,
  timeStr,
  type,
  customMessage,
}) => {
  if (!phone) {
    return { success: false, reason: 'Missing phone number' };
  }

  // Deduplication check: Do not send the same notification type twice for the same scheduled dose
  if (medicationId && scheduledTime) {
    const existing = await SmsNotification.findOne({
      medicationId,
      scheduledTime,
      type,
    });
    if (existing && existing.status === 'sent') {
      return { success: true, duplicate: true, notification: existing };
    }
  }

  const message = customMessage || buildMedicationMessage(type, {
    medName: medicationName || 'Medication',
    dosage: '',
    timeStr: timeStr || 'now',
  });

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhoneNumber(phone);
  } catch (normErr) {
    console.warn(`[SMS Service] Invalid phone format ${phone}: ${normErr.message}`);
    return { success: false, reason: normErr.message };
  }

  const twilioConfig = getTwilioConfig();
  const twilioClient = getClient();

  let status = 'simulated';
  let twilioSid = '';
  let error = '';

  if (twilioClient && twilioConfig.phoneNumber) {
    try {
      const response = await twilioClient.messages.create({
        body: message,
        from: twilioConfig.phoneNumber,
        to: normalizedPhone,
      });
      status = 'sent';
      twilioSid = response.sid;
      console.log(`[Twilio SMS Sent] Type: ${type} | To: ${normalizedPhone} | SID: ${twilioSid}`);
    } catch (sendErr) {
      console.error(`[Twilio SMS Error] Type: ${type} | To: ${normalizedPhone} | Error:`, sendErr.message);
      status = 'failed';
      error = sendErr.message;
    }
  } else {
    console.log(`[SMS Service (Simulated)] Type: ${type} | To: ${normalizedPhone} | Body: ${message}`);
  }

  // Save record to DB for auditing, tracking, and deduplication
  try {
    const notification = await SmsNotification.findOneAndUpdate(
      medicationId && scheduledTime
        ? { medicationId, scheduledTime, type }
        : { userId, type, sentAt: { $gte: new Date(Date.now() - 60000) } },
      {
        userId,
        medicationId,
        medicationName,
        phone: normalizedPhone,
        scheduledTime,
        timeStr,
        type,
        message,
        status,
        twilioSid,
        error,
        sentAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { success: status === 'sent', status, notification, twilioSid, error };
  } catch (dbErr) {
    console.error('[SMS Notification Save Error]:', dbErr.message);
    return { success: status === 'sent', status, error: dbErr.message };
  }
};

/**
 * Runs a complete check cycle for scheduled doses today and sends:
 * 1. 1 hour before reminder (-60 <= diffMins <= -5)
 * 2. Exact medication time alert (0 <= diffMins <= 15)
 * 3. 1 hour after late alert (60 <= diffMins <= 80)
 */
export const runSmsReminderCycle = async (targetUserId = null) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  try {
    const userQuery = targetUserId
      ? { _id: targetUserId }
      : { role: { $in: ['patient', 'user'] } };

    const patients = await User.find(userQuery).select('_id name phone role');
    if (!patients.length) return { processed: 0, sent: 0 };

    let processedCount = 0;
    let sentCount = 0;

    for (const patient of patients) {
      if (!patient.phone) continue;

      const medications = await Medication.find({
        userId: patient._id,
        isActive: true,
        startDate: { $lte: endOfDay },
        $or: [{ endDate: null }, { endDate: { $gte: startOfDay } }],
      });

      if (!medications.length) continue;

      for (const med of medications) {
        if (!med.times || !med.times.length) continue;

        for (const timeStr of med.times) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes)) continue;

          const scheduledTime = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hours,
            minutes,
            0,
            0
          );

          const diffMins = Math.floor((now.getTime() - scheduledTime.getTime()) / (60 * 1000));

          // Check if dose has already been marked as taken
          const existingLog = await AdherenceLog.findOne({
            userId: patient._id,
            medicationId: med._id,
            scheduledTime,
          });

          const isTaken = existingLog && existingLog.status === 'taken';

          processedCount++;

          // 1. Message 1: 1 hour before reminder (-60 <= diffMins < 0)
          if (diffMins >= -60 && diffMins < 0) {
            const result = await dispatchMedicationSms({
              userId: patient._id,
              phone: patient.phone,
              medicationId: med._id,
              medicationName: med.name,
              scheduledTime,
              timeStr,
              type: '1h_before',
              customMessage: buildMedicationMessage('1h_before', {
                medName: med.name,
                dosage: med.dosage,
                timeStr,
              }),
            });
            if (result.success && !result.duplicate) sentCount++;
          }

          // 2. Message 2: Exact medication time (0 <= diffMins <= 30) if not taken
          if (diffMins >= 0 && diffMins <= 30 && !isTaken) {
            const result = await dispatchMedicationSms({
              userId: patient._id,
              phone: patient.phone,
              medicationId: med._id,
              medicationName: med.name,
              scheduledTime,
              timeStr,
              type: 'exact_time',
              customMessage: buildMedicationMessage('exact_time', {
                medName: med.name,
                dosage: med.dosage,
                timeStr,
              }),
            });
            if (result.success && !result.duplicate) sentCount++;
          }

          // 3. Message 3: 1 hour after late alert (60 <= diffMins <= 120) if not taken
          if (diffMins >= 60 && diffMins <= 120 && !isTaken) {
            const result = await dispatchMedicationSms({
              userId: patient._id,
              phone: patient.phone,
              medicationId: med._id,
              medicationName: med.name,
              scheduledTime,
              timeStr,
              type: '1h_after',
              customMessage: buildMedicationMessage('1h_after', {
                medName: med.name,
                dosage: med.dosage,
                timeStr,
              }),
            });
            if (result.success && !result.duplicate) sentCount++;
          }
        }
      }
    }

    return { processed: processedCount, sent: sentCount };
  } catch (err) {
    console.error('[runSmsReminderCycle Error]:', err);
    return { processed: 0, sent: 0, error: err.message };
  }
};

let schedulerInterval = null;

/**
 * Starts background scheduler interval running every 30 seconds
 */
export const startSmsReminderScheduler = () => {
  if (schedulerInterval) return;

  console.log('[SmsReminderScheduler] Initializing 30-second medication SMS monitor...');

  // Run immediate first check 3 seconds after startup
  setTimeout(() => {
    runSmsReminderCycle().catch((err) =>
      console.error('[SmsReminderScheduler Initial Run Error]:', err.message)
    );
  }, 3000);

  // Periodic 30-second check
  schedulerInterval = setInterval(() => {
    runSmsReminderCycle().catch((err) =>
      console.error('[SmsReminderScheduler Periodic Error]:', err.message)
    );
  }, 30000);
};

export default {
  buildMedicationMessage,
  dispatchMedicationSms,
  runSmsReminderCycle,
  startSmsReminderScheduler,
};
