import nodemailer from 'nodemailer';
import { getEmailTransporter, getEmailFrom, isEtherealAccount } from '../config/email.js';
import { User } from '../models/User.js';
import { Medication } from '../models/Medication.js';
import { AdherenceLog } from '../models/AdherenceLog.js';
import { EmailNotification } from '../models/EmailNotification.js';

/**
 * Builds clean clinical HTML email templates for all 3 stages
 */
export const buildMedicationEmailContent = (
  type,
  { patientName, medName, dosage, timeStr, instructions }
) => {
  const name = patientName || 'Patient';
  const doseLabel = dosage ? `${medName} (${dosage})` : medName;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  let subject = '';
  let badgeText = '';
  let badgeColor = '';
  let mainHeading = '';
  let alertMessage = '';
  let actionText = 'Open MedSafe Schedule';

  switch (type) {
    case '1h_before':
      subject = `[MedSafe Reminder] Upcoming Dose in 1 Hour: ${doseLabel}`;
      badgeText = '1 HOUR UPCOMING REMINDER';
      badgeColor = '#0284c7'; // Sky-600
      mainHeading = 'Upcoming Medication Dose in 1 Hour';
      alertMessage = `This is a scheduled clinical reminder that your dose of <strong>${doseLabel}</strong> is scheduled for intake in 1 hour at <strong>${timeStr}</strong>. Please ensure you have water ready and stay on track with your prescribed regimen.`;
      break;

    case 'exact_time':
      subject = `[MedSafe Alert] Time to Take Medicine NOW: ${doseLabel}`;
      badgeText = 'DUE NOW - TAKE MEDICINE';
      badgeColor = '#059669'; // Emerald-600
      mainHeading = 'Time to Take Your Medicine Right Now';
      alertMessage = `Exact medication time reached: It is now <strong>${timeStr}</strong>. Please take your prescribed dose of <strong>${doseLabel}</strong> immediately and record your intake in MedSafe.`;
      break;

    case '1h_after':
      subject = `[MedSafe Urgent Alert] Late Medication Warning: ${doseLabel} (1 Hour Late)`;
      badgeText = 'URGENT LATE DOSE ALERT';
      badgeColor = '#d97706'; // Amber-600
      mainHeading = 'Late Medication Warning (1 Hour Overdue)';
      alertMessage = `Notice: You have not logged your dose of <strong>${doseLabel}</strong> scheduled for <strong>${timeStr}</strong> (currently 1 hour late). Please take your medicine promptly as late before the 3-hour auto-skip window closes!`;
      actionText = 'Log Dose as Late Now';
      break;

    case 'test':
      subject = `[MedSafe Test] Email Notification Delivery Verified`;
      badgeText = 'TEST VERIFICATION';
      badgeColor = '#4f46e5'; // Indigo-600
      mainHeading = 'Email Reminder System Active';
      alertMessage = `This is a test notification confirming that email medication alerts are active for your account. You will receive: (1) 1-Hour before reminder, (2) Exact time alert to take now, and (3) 1-Hour after late alert if pending.`;
      break;

    default:
      subject = `[MedSafe] Medication Reminder: ${doseLabel}`;
      badgeText = 'MEDICATION NOTICE';
      badgeColor = '#2563eb';
      mainHeading = 'Medication Notification';
      alertMessage = `Scheduled reminder for ${doseLabel} at ${timeStr}.`;
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 24px 28px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff;">
              <table width="100%">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #38bdf8;">Med<span style="color: #ffffff;">Safe</span></span>
                    <span style="font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Adherence Platform</span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; font-size: 10px; font-weight: 700; color: #ffffff; background-color: ${badgeColor}; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">${badgeText}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 28px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #0f172a;">${mainHeading}</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Hello <strong>${name}</strong>,
              </p>
              <div style="background-color: #f1f5f9; border-left: 4px solid ${badgeColor}; padding: 14px 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                ${alertMessage}
              </div>

              <!-- Dose Clinical Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; padding: 16px;">
                <tr>
                  <td style="padding: 6px 0; font-size: 12px; color: #64748b; width: 35%;">Medication:</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${medName}</td>
                </tr>
                ${dosage ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 12px; color: #64748b;">Dosage:</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #334155;">${dosage}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 6px 0; font-size: 12px; color: #64748b;">Scheduled Time:</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: ${badgeColor};">${timeStr}</td>
                </tr>
                ${instructions ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 12px; color: #64748b;">Instructions:</td>
                  <td style="padding: 6px 0; font-size: 12px; font-style: italic; color: #475569;">${instructions}</td>
                </tr>` : ''}
              </table>

              <!-- Action CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${clientUrl}/medications" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(2,132,199,0.25);">
                      ${actionText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
              This is an automated medication adherence notification from MedSafe.<br>
              MedSafe Clinical Platform &copy; ${new Date().getFullYear()} &bull; Strictly Non-Commercial
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, html, text: `${mainHeading}\n\n${alertMessage.replace(/<[^>]+>/g, '')}\n\nMedication: ${medName}\nDosage: ${dosage || 'Standard'}\nTime: ${timeStr}\nInstructions: ${instructions || 'Follow doctor advice'}\n\nView schedule: ${clientUrl}/medications` };
};

/**
 * Dispatches an email notification with deduplication
 */
export const dispatchMedicationEmail = async ({
  userId,
  email,
  patientName,
  medicationId,
  medicationName,
  dosage,
  instructions,
  scheduledTime,
  timeStr,
  type,
  customSubject,
  customHtml,
}) => {
  if (!email) {
    return { success: false, reason: 'Missing email address' };
  }

  // Deduplication check: Do not send the same notification type twice for the same scheduled dose
  if (medicationId && scheduledTime) {
    const existing = await EmailNotification.findOne({
      medicationId,
      scheduledTime,
      type,
    });
    // Only treat as duplicate if previously delivered via real production SMTP (not Ethereal test account)
    if (
      existing &&
      existing.status === 'sent' &&
      !existing.previewUrl &&
      !existing.messageId?.includes('@medsafe.health')
    ) {
      return { success: true, duplicate: true, notification: existing };
    }
  }

  const { subject, html, text } = customSubject && customHtml
    ? { subject: customSubject, html: customHtml, text: customSubject }
    : buildMedicationEmailContent(type, {
        patientName,
        medName: medicationName || 'Medication',
        dosage: dosage || '',
        timeStr: timeStr || 'Scheduled Time',
        instructions: instructions || '',
      });

  let status = 'sent';
  let previewUrl = '';
  let messageId = '';
  let error = '';

  try {
    const transporter = await getEmailTransporter();
    const fromAddress = getEmailFrom();

    const info = await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject,
      text,
      html,
    });

    messageId = info.messageId || '';

    // If Ethereal test inbox, generate preview URL
    if (isEtherealAccount()) {
      previewUrl = nodemailer.getTestMessageUrl(info) || '';
      console.log(`[Email Dispatched (Ethereal)] Type: ${type} | To: ${email} | Preview: ${previewUrl}`);
    } else {
      console.log(`[Email Dispatched (SMTP)] Type: ${type} | To: ${email} | ID: ${messageId}`);
    }
  } catch (err) {
    console.error(`[Email Error] Type: ${type} | To: ${email} | Error:`, err.message);
    status = 'failed';
    error = err.message;
  }

  // Persist record to DB for auditing and deduplication
  try {
    const notification = await EmailNotification.findOneAndUpdate(
      medicationId && scheduledTime
        ? { medicationId, scheduledTime, type }
        : { userId, type, sentAt: { $gte: new Date(Date.now() - 60000) } },
      {
        userId,
        medicationId,
        medicationName,
        dosage,
        email,
        scheduledTime,
        timeStr,
        type,
        subject,
        message: text,
        status,
        previewUrl,
        messageId,
        error,
        sentAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { success: status === 'sent', status, notification, previewUrl, error };
  } catch (dbErr) {
    console.error('[Email Notification Save Error]:', dbErr.message);
    return { success: status === 'sent', status, error: dbErr.message, previewUrl };
  }
};

/**
 * Runs a complete check cycle for scheduled doses today and sends:
 * 1. 1 hour before reminder (-60 <= diffMins < 0)
 * 2. Exact medication time alert (0 <= diffMins <= 30)
 * 3. 1 hour after late alert (60 <= diffMins <= 120)
 */
export const runEmailReminderCycle = async (targetUserId = null) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  try {
    const userQuery = targetUserId
      ? { _id: targetUserId }
      : { role: { $in: ['patient', 'user'] } };

    const patients = await User.find(userQuery).select('_id name email phone role');
    if (!patients.length) return { processed: 0, sent: 0 };

    let processedCount = 0;
    let sentCount = 0;

    for (const patient of patients) {
      if (!patient.email) continue;

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
            const result = await dispatchMedicationEmail({
              userId: patient._id,
              email: patient.email,
              patientName: patient.name,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              instructions: med.instructions,
              scheduledTime,
              timeStr,
              type: '1h_before',
            });
            if (result.success && !result.duplicate) sentCount++;
          }

          // 2. Message 2: Exact medication time (0 <= diffMins <= 30) if not taken
          if (diffMins >= 0 && diffMins <= 30 && !isTaken) {
            const result = await dispatchMedicationEmail({
              userId: patient._id,
              email: patient.email,
              patientName: patient.name,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              instructions: med.instructions,
              scheduledTime,
              timeStr,
              type: 'exact_time',
            });
            if (result.success && !result.duplicate) sentCount++;
          }

          // 3. Message 3: 1 hour after late alert (60 <= diffMins <= 120) if not taken
          if (diffMins >= 60 && diffMins <= 120 && !isTaken) {
            const result = await dispatchMedicationEmail({
              userId: patient._id,
              email: patient.email,
              patientName: patient.name,
              medicationId: med._id,
              medicationName: med.name,
              dosage: med.dosage,
              instructions: med.instructions,
              scheduledTime,
              timeStr,
              type: '1h_after',
            });
            if (result.success && !result.duplicate) sentCount++;
          }
        }
      }
    }

    return { processed: processedCount, sent: sentCount };
  } catch (err) {
    console.error('[runEmailReminderCycle Error]:', err);
    return { processed: 0, sent: 0, error: err.message };
  }
};

let emailSchedulerInterval = null;

/**
 * Starts background email reminder scheduler running every 30 seconds
 */
export const startEmailReminderScheduler = () => {
  if (emailSchedulerInterval) return;

  console.log('[EmailReminderScheduler] Initializing 30-second medication Email monitor...');

  // Immediate check 5 seconds after startup
  setTimeout(() => {
    runEmailReminderCycle().catch((err) =>
      console.error('[EmailReminderScheduler Initial Run Error]:', err.message)
    );
  }, 5000);

  // Periodic 30-second monitor
  emailSchedulerInterval = setInterval(() => {
    runEmailReminderCycle().catch((err) =>
      console.error('[EmailReminderScheduler Periodic Error]:', err.message)
    );
  }, 30000);
};

export default {
  buildMedicationEmailContent,
  dispatchMedicationEmail,
  runEmailReminderCycle,
  startEmailReminderScheduler,
};
