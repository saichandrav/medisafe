import { Medication } from '../models/Medication.js';
import { RefillRequest } from '../models/RefillRequest.js';
import { Communication } from '../models/Communication.js';
import { CaregiverLink } from '../models/CaregiverLink.js';
import { AdherenceLog } from '../models/AdherenceLog.js';
import { SmsNotification } from '../models/SmsNotification.js';
import { EmailNotification } from '../models/EmailNotification.js';
import {
  dispatchMedicationSms,
  buildMedicationMessage,
  runSmsReminderCycle,
} from '../services/smsReminderService.js';
import {
  dispatchMedicationEmail,
  buildMedicationEmailContent,
  runEmailReminderCycle,
} from '../services/emailReminderService.js';

// POST /api/medications
export const addMedication = async (req, res) => {
  try {
    if (req.user.role === 'caregiver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Caregivers have read-only monitoring access and cannot add or alter prescriptions.',
      });
    }

    const { name, dosage, frequency, times, prescribedBy, pharmacy, startDate, endDate, instructions, refillDate, sideEffects } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Medication name is required.' });
    }

    const medication = await Medication.create({
      userId: req.user._id,
      name: name.trim(),
      dosage: dosage || '',
      frequency: frequency || 'once_daily',
      times: times && times.length > 0 ? times : ['08:00'],
      prescribedBy: prescribedBy || '',
      pharmacy: pharmacy || '',
      startDate: startDate || new Date(),
      endDate: endDate || null,
      instructions: instructions || '',
      refillDate: refillDate || null,
      sideEffects: sideEffects || '',
    });

    return res.status(201).json({ success: true, message: 'Medication added.', medication });
  } catch (err) {
    console.error('[addMedication]', err);
    return res.status(500).json({ success: false, message: 'Failed to add medication.' });
  }
};

// GET /api/medications
export const getMyMedications = async (req, res) => {
  try {
    const { active } = req.query;
    const filter = { userId: req.user._id };
    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;

    const medications = await Medication.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, medications });
  } catch (err) {
    console.error('[getMyMedications]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch medications.' });
  }
};

// GET /api/medications/:id
export const getMedicationById = async (req, res) => {
  try {
    const med = await Medication.findOne({ _id: req.params.id, userId: req.user._id });
    if (!med) return res.status(404).json({ success: false, message: 'Medication not found.' });
    return res.json({ success: true, medication: med });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch medication.' });
  }
};

// PUT /api/medications/:id
export const updateMedication = async (req, res) => {
  try {
    if (req.user.role === 'caregiver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Caregivers have read-only monitoring access and cannot alter prescriptions.',
      });
    }

    const med = await Medication.findOne({ _id: req.params.id, userId: req.user._id });
    if (!med) return res.status(404).json({ success: false, message: 'Medication not found.' });

    const allowed = ['name', 'dosage', 'frequency', 'times', 'prescribedBy', 'pharmacy', 'startDate', 'endDate', 'instructions', 'refillDate', 'sideEffects', 'isActive'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        med[key] = req.body[key];
      }
    }
    await med.save();
    return res.json({ success: true, message: 'Medication updated.', medication: med });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update medication.' });
  }
};

// DELETE /api/medications/:id
export const deleteMedication = async (req, res) => {
  try {
    if (req.user.role === 'caregiver') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Caregivers have read-only monitoring access and cannot deactivate prescriptions.',
      });
    }

    const med = await Medication.findOne({ _id: req.params.id, userId: req.user._id });
    if (!med) return res.status(404).json({ success: false, message: 'Medication not found.' });

    med.isActive = false;
    await med.save();
    return res.json({ success: true, message: 'Medication deactivated.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete medication.' });
  }
};

// GET /api/medications/today-schedule
export const getTodaySchedule = async (req, res) => {
  try {
    const medications = await Medication.find({ userId: req.user._id, isActive: true });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Support date query param: ?date=YYYY-MM-DD
    let targetStart = todayStart;
    if (req.query.date && typeof req.query.date === 'string') {
      const parts = req.query.date.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          targetStart = new Date(y, m, d);
        }
      }
    }
    const targetEnd = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);

    const isToday = targetStart.getTime() === todayStart.getTime();
    const isPast = targetStart.getTime() < todayStart.getTime();
    const isFuture = targetStart.getTime() > todayStart.getTime();

    // Get all adherence logs for target date
    const dayLogs = await AdherenceLog.find({
      userId: req.user._id,
      scheduledTime: { $gte: targetStart, $lt: targetEnd },
    });

    const logMap = {};
    for (const log of dayLogs) {
      const key = `${log.medicationId}_${log.scheduledTime.toISOString()}`;
      logMap[key] = log;
    }

    const schedule = [];
    const alerts = [];

    for (const med of medications) {
      // Check if medication is active for target date
      if (med.startDate && new Date(med.startDate) > targetEnd) continue;
      if (med.endDate && new Date(med.endDate) < targetStart) continue;

      for (const timeStr of med.times) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const scheduledTime = new Date(targetStart.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);
        const key = `${med._id}_${scheduledTime.toISOString()}`;
        let log = logMap[key];

        // diffMins > 0: scheduled time has passed
        // diffMins < 0: scheduled time is in future
        const diffMs = now.getTime() - scheduledTime.getTime();
        const diffMins = Math.floor(diffMs / (60 * 1000));

        let status = log ? log.status : 'pending';
        let autoSkipped = false;
        let isLate = false;

        if (isToday) {
          if (diffMins < 0) {
            // Upcoming dose: scheduled time has not yet arrived!
            // Strictly pending: upcoming medications cannot be taken, skipped, or late.
            status = 'pending';
            autoSkipped = false;
            isLate = false;
            log = null;
          } else {
            // Scheduled time has arrived or passed (diffMins >= 0)
            // Rule: If person is late by 3 hours, mark medication automatically skipped
            // Rule: If time crosses above 10 min, medication marked as late
            if (!log || (log.status !== 'taken' && log.status !== 'late')) {
              if (diffMins >= 180) {
                status = 'skipped';
                autoSkipped = true;

                // Automatically persist auto-skip in AdherenceLog
                if (!log || log.status !== 'skipped') {
                  try {
                    log = await AdherenceLog.findOneAndUpdate(
                      { userId: req.user._id, medicationId: med._id, scheduledTime },
                      {
                        userId: req.user._id,
                        medicationId: med._id,
                        scheduledTime,
                        status: 'skipped',
                        notes: 'Auto-skipped: Dose was not taken within 3-hour window',
                      },
                      { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                    logMap[key] = log;
                  } catch (upsertErr) {
                    console.error('[autoSkipUpsert]', upsertErr.message);
                  }
                }
              } else if (diffMins > 10) {
                status = 'late';
                isLate = true;
              } else {
                status = log ? log.status : 'pending';
              }
            }
          }
        } else if (isPast) {
          // Past date:
          if (log) {
            status = log.status;
            if (status === 'skipped' && log.notes && log.notes.includes('Auto-skipped')) {
              autoSkipped = true;
            }
            if (status === 'late') {
              isLate = true;
            }
          } else {
            status = 'missed';
          }
        } else {
          // Future date
          status = 'pending';
          log = null;
        }

        const isUpcoming = isToday ? diffMins < 0 : isFuture;
        if (isUpcoming) {
          status = 'pending';
          isLate = false;
          autoSkipped = false;
        }

        const scheduleItem = {
          medicationId: med._id,
          medicationName: med.name,
          dosage: med.dosage,
          instructions: med.instructions,
          scheduledTime,
          timeStr,
          status,
          logId: isUpcoming ? null : (log ? log._id : null),
          takenAt: isUpcoming ? null : (log ? log.takenAt : null),
          isLate: isUpcoming ? false : isLate,
          autoSkipped: isUpcoming ? false : autoSkipped,
          diffMins,
          isToday,
          isPast,
          isFuture,
          isUpcoming,
        };
        schedule.push(scheduleItem);

        // Reminders and alerts ONLY generate if viewing today
        if (isToday) {
          // 1. Reminder 1 hour before medication time (-60 <= diffMins < 0)
          if (diffMins >= -60 && diffMins < 0) {
            const minsRemaining = Math.abs(diffMins);
            alerts.push({
              id: `rem_1h_${key}`,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              timeStr,
              scheduledTime,
              type: '1h_before',
              severity: 'info',
              title: '1-Hour Upcoming Dose Reminder',
              message: `Upcoming dose reminder: Take ${med.name} (${med.dosage || 'prescribed dose'}) in ${minsRemaining} min at ${timeStr}.`,
            });
          }

          // 2. Reminder at exact medication time (0 <= diffMins <= 10)
          if (diffMins >= 0 && diffMins <= 10 && status !== 'taken') {
            alerts.push({
              id: `due_now_${key}`,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              timeStr,
              scheduledTime,
              type: 'exact_time',
              severity: 'urgent',
              title: 'Medication Due Now',
              message: `Exact medication time reached: Take ${med.name} (${med.dosage || 'prescribed dose'}) scheduled for ${timeStr} now.`,
            });
          }

          // 3. Alert 1 hour after medication if skipped or not yet taken (60 <= diffMins < 180)
          if (diffMins >= 60 && diffMins < 180 && status !== 'taken') {
            const isSkippedDose = status === 'skipped';
            alerts.push({
              id: `overdue_1h_${key}`,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              timeStr,
              scheduledTime,
              type: '1h_after',
              severity: 'warning',
              title: isSkippedDose ? 'Skipped Dose Notice (1h Post)' : 'Overdue Alert (1 Hour Late)',
              message: isSkippedDose
                ? `Notice: ${med.name} scheduled for ${timeStr} was skipped.`
                : `Alert: You have not yet taken ${med.name} scheduled for ${timeStr} (1 hour overdue). Please take your dose promptly or mark your status.`,
            });
          }

          // 4. If late by 3 hours, mark the medication automatically skipped alert
          if (diffMins >= 180 && (autoSkipped || status === 'skipped')) {
            alerts.push({
              id: `auto_skip_3h_${key}`,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              timeStr,
              scheduledTime,
              type: '3h_skipped',
              severity: 'critical',
              title: 'Medication Automatically Skipped',
              message: `Dose Auto-Skipped: ${med.name} scheduled for ${timeStr} was not taken within 3 hours and has been automatically marked as skipped.`,
            });
          }
        }
      }
    }

    // Sort by time
    schedule.sort((a, b) => a.scheduledTime - b.scheduledTime);

    // If viewing today, asynchronously evaluate SMS and Email reminders
    if (isToday) {
      runSmsReminderCycle(req.user._id).catch((err) =>
        console.error('[runSmsReminderCycle error]', err.message)
      );
      runEmailReminderCycle(req.user._id).catch((err) =>
        console.error('[runEmailReminderCycle error]', err.message)
      );
    }

    const smsNotifications = await SmsNotification.find({ userId: req.user._id })
      .sort({ sentAt: -1 })
      .limit(10);

    const emailNotifications = await EmailNotification.find({ userId: req.user._id })
      .sort({ sentAt: -1 })
      .limit(10);

    return res.json({
      success: true,
      schedule,
      alerts,
      smsNotifications,
      emailNotifications,
      date: targetStart.toISOString().split('T')[0],
      isToday,
      isPast,
      isFuture,
    });
  } catch (err) {
    console.error('[getTodaySchedule]', err);
    return res.status(500).json({ success: false, message: 'Failed to get schedule.' });
  }
};

// GET /api/medications/conflicts
export const checkConflicts = async (req, res) => {
  try {
    const medications = await Medication.find({ userId: req.user._id, isActive: true });

    const conflicts = [];

    // Check for duplicate medication names
    const nameCount = {};
    for (const med of medications) {
      const lower = med.name.toLowerCase();
      if (!nameCount[lower]) nameCount[lower] = [];
      nameCount[lower].push(med);
    }

    for (const [name, meds] of Object.entries(nameCount)) {
      if (meds.length > 1) {
        conflicts.push({
          type: 'duplicate',
          severity: 'warning',
          message: `"${meds[0].name}" appears ${meds.length} times in your medications. This may indicate a duplicate prescription.`,
          medications: meds.map(m => ({ id: m._id, name: m.name, prescribedBy: m.prescribedBy })),
        });
      }
    }

    // Check for medications needing refill
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    for (const med of medications) {
      if (med.refillDate && new Date(med.refillDate) <= sevenDays) {
        conflicts.push({
          type: 'refill',
          severity: new Date(med.refillDate) <= now ? 'critical' : 'info',
          message: `"${med.name}" ${new Date(med.refillDate) <= now ? 'needs immediate refill' : 'needs refill within 7 days'}.`,
          medications: [{ id: med._id, name: med.name, refillDate: med.refillDate }],
        });
      }
    }

    // Check for expired medications
    for (const med of medications) {
      if (med.endDate && new Date(med.endDate) < now) {
        conflicts.push({
          type: 'expired',
          severity: 'warning',
          message: `"${med.name}" prescription has expired (ended ${new Date(med.endDate).toLocaleDateString()}).`,
          medications: [{ id: med._id, name: med.name }],
        });
      }
    }

    return res.json({ success: true, conflicts });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to check conflicts.' });
  }
};

// POST /api/medications/:id/request-refill
export const requestRefill = async (req, res) => {
  try {
    const { id } = req.params;
    const { pharmacy, notes } = req.body;

    const med = await Medication.findById(id);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medication not found.' });
    }

    // Ensure user is the patient or an authorized caregiver
    const isOwner = med.userId.equals(req.user._id);
    if (!isOwner) {
      const link = await CaregiverLink.findOne({
        patientId: med.userId,
        caregiverId: req.user._id,
        status: 'accepted',
      });
      if (!link) {
        return res.status(403).json({ success: false, message: 'Not authorized to request refill for this patient.' });
      }
    }

    // Check for an existing pending request
    const existing = await RefillRequest.findOne({
      medicationId: id,
      status: 'pending',
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A refill request for this medication is already pending review.', refillRequest: existing });
    }

    const refillReq = await RefillRequest.create({
      patientId: med.userId,
      medicationId: id,
      pharmacy: pharmacy || med.pharmacy || '',
      notes: notes || '',
      status: 'pending',
    });

    // Also dispatch notice to care team
    await Communication.create({
      patientId: med.userId,
      senderId: req.user._id,
      senderRole: req.user.role || 'patient',
      recipientRole: 'pharmacist',
      category: 'refill_notification',
      subject: `Refill Requested: ${med.name}`,
      message: `Refill request submitted for ${med.name} (${med.dosage || 'standard dosage'}). Preferred Pharmacy: ${pharmacy || med.pharmacy || 'Not specified'}. Note: ${notes || 'Standard refill request.'}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Refill request submitted successfully to pharmacy.',
      refillRequest: refillReq,
    });
  } catch (err) {
    console.error('[requestRefill]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit refill request.' });
  }
};

// GET /api/medications/refills/my-requests
export const getMyRefillRequests = async (req, res) => {
  try {
    const requests = await RefillRequest.find({ patientId: req.user._id })
      .populate('medicationId', 'name dosage frequency times pharmacy refillDate dispenseStatus')
      .sort({ requestedAt: -1 });

    return res.json({ success: true, count: requests.length, refillRequests: requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load refill requests.' });
  }
};

// GET /api/medications/sms-logs
export const getSmsNotificationLogs = async (req, res) => {
  try {
    const logs = await SmsNotification.find({ userId: req.user._id })
      .sort({ sentAt: -1 })
      .limit(30);

    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('[getSmsNotificationLogs]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve SMS logs.' });
  }
};

// POST /api/medications/send-test-sms
export const sendTestSms = async (req, res) => {
  try {
    const { type = 'exact_time', medicationName = 'Dolo-650', dosage = '650mg', timeStr = '09:00' } = req.body;

    const userPhone = req.user.phone;
    if (!userPhone) {
      return res.status(400).json({ success: false, message: 'No phone number registered for this account.' });
    }

    const message = buildMedicationMessage(type, {
      medName: medicationName,
      dosage,
      timeStr,
    });

    const result = await dispatchMedicationSms({
      userId: req.user._id,
      phone: userPhone,
      medicationName,
      timeStr,
      type,
      customMessage: message,
    });

    return res.json({
      success: true,
      message: `SMS (${type}) dispatched to ${userPhone}.`,
      result,
      smsBody: message,
    });
  } catch (err) {
    console.error('[sendTestSms]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to dispatch test SMS.' });
  }
};

// GET /api/medications/email-logs
export const getEmailNotificationLogs = async (req, res) => {
  try {
    const logs = await EmailNotification.find({ userId: req.user._id })
      .sort({ sentAt: -1 })
      .limit(30);

    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('[getEmailNotificationLogs]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve Email logs.' });
  }
};

// POST /api/medications/send-test-email
export const sendTestEmail = async (req, res) => {
  try {
    const {
      type = 'exact_time',
      medicationName = 'Dolo-650',
      dosage = '650mg',
      timeStr = '09:00',
      instructions = 'Take after meal',
    } = req.body;

    const userEmail = req.user.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'No email address registered for this account.' });
    }

    const result = await dispatchMedicationEmail({
      userId: req.user._id,
      email: userEmail,
      patientName: req.user.name,
      medicationName,
      dosage,
      instructions,
      timeStr,
      type,
    });

    return res.json({
      success: true,
      message: `Email alert (${type}) dispatched to ${userEmail}.`,
      result,
    });
  } catch (err) {
    console.error('[sendTestEmail]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to dispatch test Email.' });
  }
};


