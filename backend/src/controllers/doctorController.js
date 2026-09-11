import crypto from 'crypto';
import { User } from '../models/User.js';
import { Medication } from '../models/Medication.js';
import { AdherenceLog } from '../models/AdherenceLog.js';
import { OtpToken } from '../models/OtpToken.js';
import { DoctorPatientLink } from '../models/DoctorPatientLink.js';
import { PrescriptionOrder } from '../models/PrescriptionOrder.js';
import { PatientReport } from '../models/PatientReport.js';
import { Communication } from '../models/Communication.js';
import { PharmacyProduct } from '../models/PharmacyProduct.js';
import { getClient, getTwilioConfig } from '../config/twilio.js';
import { getEmailTransporter, getEmailFrom } from '../config/email.js';

const maskPhone = (phone) => {
  if (!phone || phone.length < 8) return phone;
  const last4 = phone.slice(-4);
  const prefix = phone.slice(0, phone.length - 7);
  return `${prefix}***${last4}`;
};

/**
 * GET /api/doctor/search-patients?q=...
 * Searches existing patient records by name, phone, or email
 */
export const searchPatients = async (req, res) => {
  try {
    const { q } = req.query;
    const query = { _id: { $ne: req.user._id } };

    if (q && q.trim()) {
      const cleanQ = q.trim();
      const digitsOnly = cleanQ.replace(/\D/g, '');
      const regex = new RegExp(cleanQ, 'i');
      const conditions = [
        { name: regex },
        { phone: regex },
        { email: regex },
      ];
      if (digitsOnly.length >= 3) {
        conditions.push({ phone: new RegExp(digitsOnly, 'i') });
      }
      query.$or = conditions;
    } else {
      // If no query, return recent patients
      query.role = { $in: ['patient', 'user'] };
    }

    const patients = await User.find(query)
      .select('name phone email role bloodGroup dateOfBirth gender emergencyContact')
      .limit(20);

    return res.json({
      success: true,
      patients,
      count: patients.length,
    });
  } catch (err) {
    console.error('[searchPatients]', err);
    return res.status(500).json({ success: false, message: 'Failed to search patients.' });
  }
};

/**
 * POST /api/doctor/add-patient
 * Links a patient to the doctor's roster
 */
export const addPatient = async (req, res) => {
  try {
    const { patientId, notes } = req.body;

    if (!patientId) {
      return res.status(400).json({ success: false, message: 'patientId is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    if (patient._id.equals(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself as a patient.' });
    }

    let link = await DoctorPatientLink.findOne({
      doctorId: req.user._id,
      patientId: patient._id,
    });

    if (link) {
      link.status = 'active';
      if (notes) link.notes = notes;
      await link.save();
      return res.json({
        success: true,
        message: 'Patient is already in your roster.',
        link,
        patient,
      });
    }

    link = await DoctorPatientLink.create({
      doctorId: req.user._id,
      patientId: patient._id,
      status: 'active',
      notes: notes || '',
    });

    return res.status(201).json({
      success: true,
      message: `Patient ${patient.name || patient.phone} added to your roster successfully.`,
      link,
      patient,
    });
  } catch (err) {
    console.error('[addPatient]', err);
    return res.status(500).json({ success: false, message: 'Failed to add patient to roster.' });
  }
};

/**
 * GET /api/doctor/patients
 * Returns all patients linked to the logged-in doctor with adherence & medication summaries
 */
export const getMyPatients = async (req, res) => {
  try {
    const links = await DoctorPatientLink.find({ doctorId: req.user._id })
      .populate('patientId', 'name phone email role bloodGroup dateOfBirth gender emergencyContact')
      .sort({ updatedAt: -1 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const patientSummaries = await Promise.all(
      links
        .filter((link) => link.patientId)
        .map(async (link) => {
          const patient = link.patientId;
          const [medCount, logs] = await Promise.all([
            Medication.countDocuments({ userId: patient._id, isActive: true }),
            AdherenceLog.find({ userId: patient._id, scheduledTime: { $gte: sevenDaysAgo } }),
          ]);

          const total = logs.length;
          const taken = logs.filter((l) => l.status === 'taken' || l.status === 'late').length;
          const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

          const isAccessActive = Boolean(link.accessExpiresAt && new Date(link.accessExpiresAt) > new Date());

          return {
            linkId: link._id,
            patient,
            status: link.status,
            notes: link.notes,
            linkedAt: link.linkedAt || link.createdAt,
            accessExpiresAt: link.accessExpiresAt || null,
            isAccessActive,
            medCount,
            adherenceRate,
            recentLogsCount: total,
          };
        })
    );

    return res.json({
      success: true,
      patients: patientSummaries,
    });
  } catch (err) {
    console.error('[getMyPatients]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch doctor patients.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/request-medication-otp
 * Dispatches 6-digit consent OTP to patient mobile for medication authorization
 */
export const requestMedicationOtp = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { name, dosage } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Medication name is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(rawOtp).digest('hex');

    // Clean up previous medication consent OTPs for this patient
    await OtpToken.deleteMany({ phone: patient.phone, purpose: 'medication_consent' });

    // Store new consent OTP with 5 minute expiration
    await OtpToken.create({
      phone: patient.phone,
      hashedOtp,
      purpose: 'medication_consent',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const doctorName = req.user.name ? `Dr. ${req.user.name}` : 'Your doctor';
    const messageBody = `MedSafe Consent: ${doctorName} has prescribed ${name}${dosage ? ` (${dosage})` : ''}. Your authorization OTP code is ${rawOtp}. Valid for 5 minutes.`;

    console.log(`[Doctor Rx OTP] Patient: ${patient.phone} | Medication: ${name} | OTP: ${rawOtp}`);

    const twilioConfig = getTwilioConfig();
    const twilioClient = getClient();
    let smsSent = false;
    let emailSent = false;

    // 1. Dispatch SMS via Twilio if available
    if (twilioClient && twilioConfig.phoneNumber) {
      try {
        await twilioClient.messages.create({
          body: messageBody,
          from: twilioConfig.phoneNumber,
          to: patient.phone,
        });
        smsSent = true;
        console.log(`[Twilio SMS] Consent OTP delivered to ${patient.phone}`);
      } catch (smsError) {
        console.warn('[Twilio SMS Warning]: SMS could not be sent to carrier:', smsError.message);
      }
    }

    // 2. Dispatch Email immediately to patient's registered email address
    if (patient.email) {
      try {
        const transporter = await getEmailTransporter();
        const from = getEmailFrom();
        await transporter.sendMail({
          from,
          to: patient.email,
          subject: `[MedSafe Authorization Code] Prescription Consent: ${rawOtp}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #1e3a8a; margin-bottom: 8px;">MedSafe Prescription Authorization</h2>
              <p style="font-size: 14px; color: #475569;">Hello <strong>${patient.name || 'Patient'}</strong>,</p>
              <p style="font-size: 14px; color: #475569;">
                <strong>${doctorName}</strong> has prescribed <strong>${name} ${dosage ? `(${dosage})` : ''}</strong> for your medical regimen.
              </p>
              <p style="font-size: 14px; color: #475569;">Your 6-digit patient authorization code is:</p>
              <div style="background: #eff6ff; border: 1px dashed #3b82f6; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1d4ed8;">${rawOtp}</span>
              </div>
              <p style="font-size: 12px; color: #64748b;">This verification code is valid for 5 minutes. Please quote this code to your doctor to authorize your prescription.</p>
            </div>
          `,
        });
        emailSent = true;
        console.log(`[Email] Consent OTP sent successfully to ${patient.email}`);
      } catch (emailErr) {
        console.warn('[Email Warning]: Failed to dispatch consent OTP email:', emailErr.message);
      }
    }

    return res.json({
      success: true,
      message: `Authorization OTP sent to patient mobile ${maskPhone(patient.phone)}${patient.email ? ` and email ${patient.email}` : ''}.`,
      maskedPhone: maskPhone(patient.phone),
      patientEmail: patient.email || '',
      debugOtp: rawOtp,
      smsSent,
      emailSent,
    });
  } catch (err) {
    console.error('[requestMedicationOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to send medication consent OTP.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/confirm-medication
 * Validates patient OTP and creates the prescribed medication
 */
export const confirmMedicationWithOtp = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { otp, medicationData } = req.body;

    if (!otp || !String(otp).trim()) {
      return res.status(400).json({ success: false, message: 'Patient authorization OTP is required.' });
    }

    if (!medicationData || !medicationData.name) {
      return res.status(400).json({ success: false, message: 'Valid medication data is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient record not found.' });
    }

    const cleanOtp = String(otp).trim();
    const hashedOtp = crypto.createHash('sha256').update(cleanOtp).digest('hex');

    // Find and verify OTP token
    const tokenRecord = await OtpToken.findOne({
      phone: patient.phone,
      purpose: 'medication_consent',
      hashedOtp,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired patient authorization OTP. Please request a new OTP.',
      });
    }

    // Delete used OTP
    await OtpToken.deleteOne({ _id: tokenRecord._id });

    // Format prescribedBy name cleanly
    let doctorDisplay = 'Treating Physician';
    if (req.user.name) {
      doctorDisplay = req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`;
    }

    // Calculate duration & endDate if durationDays is provided
    let endDate = medicationData.endDate || null;
    let duration = medicationData.duration || '';
    let durationDays = medicationData.durationDays ? Number(medicationData.durationDays) : null;
    const startDate = medicationData.startDate ? new Date(medicationData.startDate) : new Date();
    if (durationDays && !endDate) {
      endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      if (!duration) duration = `${durationDays} days`;
    }

    // Create medication record assigned to patient
    const medication = await Medication.create({
      userId: patient._id,
      name: medicationData.name.trim(),
      dosage: medicationData.dosage || medicationData.power || '',
      power: medicationData.power || medicationData.dosage || '',
      frequency: medicationData.frequency || 'once_daily',
      times: medicationData.times && medicationData.times.length > 0 ? medicationData.times : ['08:00'],
      prescribedBy: doctorDisplay,
      pharmacy: medicationData.pharmacy || '',
      startDate,
      endDate,
      duration,
      durationDays,
      instructions: medicationData.instructions || '',
      refillDate: medicationData.refillDate || null,
      sideEffects: medicationData.sideEffects || '',
      isActive: true,
    });

    // Ensure doctor-patient link is active and grant 1-hour access window
    const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await DoctorPatientLink.findOneAndUpdate(
      { doctorId: req.user._id, patientId: patient._id },
      {
        status: 'active',
        linkedAt: new Date(),
        accessExpiresAt,
        lastAccessGrantedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: `Prescription authorized and successfully added for ${patient.name || patient.phone}!`,
      medication,
      accessExpiresAt,
      isAccessActive: true,
    });
  } catch (err) {
    console.error('[confirmMedicationWithOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to confirm prescription authorization.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/request-access-otp
 * Dispatches 6-digit consent OTP to patient mobile for 1-hour report access authorization
 */
export const requestReportAccessOtp = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(rawOtp).digest('hex');

    // Clean up previous report access OTPs for this patient
    await OtpToken.deleteMany({ phone: patient.phone, purpose: 'report_access' });

    // Store new OTP token with 5 minute expiration
    await OtpToken.create({
      phone: patient.phone,
      hashedOtp,
      purpose: 'report_access',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const doctorName = req.user.name
      ? (req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`)
      : 'Your doctor';
    const messageBody = `MedSafe: ${doctorName} has requested 1-hour access to review your clinical reports & medication regimen. Your authorization OTP is ${rawOtp}. Valid for 5 minutes.`;

    console.log(`[Doctor Report Access OTP] Patient: ${patient.phone} | OTP: ${rawOtp}`);

    const twilioConfig = getTwilioConfig();
    const twilioClient = getClient();
    let smsSent = false;
    let emailSent = false;

    // 1. Dispatch SMS via Twilio
    if (twilioClient && twilioConfig.phoneNumber) {
      try {
        await twilioClient.messages.create({
          body: messageBody,
          from: twilioConfig.phoneNumber,
          to: patient.phone,
        });
        smsSent = true;
        console.log(`[Twilio SMS] Report access OTP delivered to ${patient.phone}`);
      } catch (smsError) {
        console.warn('[Twilio SMS Warning]: SMS could not be sent to carrier:', smsError.message);
      }
    }

    // 2. Dispatch Email immediately to patient's registered email address
    if (patient.email) {
      try {
        const transporter = await getEmailTransporter();
        const from = getEmailFrom();
        await transporter.sendMail({
          from,
          to: patient.email,
          subject: `[MedSafe Authorization Code] Doctor Report Access: ${rawOtp}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #1e3a8a; margin-bottom: 8px;">MedSafe Clinical Access Authorization</h2>
              <p style="font-size: 14px; color: #475569;">Hello <strong>${patient.name || 'Patient'}</strong>,</p>
              <p style="font-size: 14px; color: #475569;">
                <strong>${doctorName}</strong> has requested 1-hour access to review your clinical records, blood pressure examinations, and diagnostic test reports.
              </p>
              <p style="font-size: 14px; color: #475569;">Your 6-digit access authorization code is:</p>
              <div style="background: #eff6ff; border: 1px dashed #3b82f6; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1d4ed8;">${rawOtp}</span>
              </div>
              <p style="font-size: 12px; color: #64748b;">This verification code is valid for 5 minutes. Share this code with your doctor to unlock 1-hour clinical record access.</p>
            </div>
          `,
        });
        emailSent = true;
        console.log(`[Email] Report access OTP sent successfully to ${patient.email}`);
      } catch (emailErr) {
        console.warn('[Email Warning]: Failed to dispatch report access OTP email:', emailErr.message);
      }
    }

    return res.json({
      success: true,
      message: `Report access authorization OTP sent to patient mobile ${maskPhone(patient.phone)}${patient.email ? ` and email ${patient.email}` : ''}.`,
      maskedPhone: maskPhone(patient.phone),
      patientEmail: patient.email || '',
      debugOtp: rawOtp,
      smsSent,
      emailSent,
    });
  } catch (err) {
    console.error('[requestReportAccessOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to send report access authorization OTP.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/grant-access
 * Verifies patient OTP and grants 1-hour access window to view reports and medication data
 */
export const grantReportAccessWithOtp = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { otp } = req.body;

    if (!otp || !String(otp).trim()) {
      return res.status(400).json({ success: false, message: 'Patient authorization OTP is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const cleanOtp = String(otp).trim();
    const hashedOtp = crypto.createHash('sha256').update(cleanOtp).digest('hex');

    const tokenRecord = await OtpToken.findOne({
      phone: patient.phone,
      purpose: 'report_access',
      hashedOtp,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired authorization OTP. Please request a new OTP.',
      });
    }

    // Delete used OTP
    await OtpToken.deleteOne({ _id: tokenRecord._id });

    // Grant 1 hour of access from current timestamp
    const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await DoctorPatientLink.findOneAndUpdate(
      { doctorId: req.user._id, patientId: patient._id },
      {
        status: 'active',
        accessExpiresAt,
        lastAccessGrantedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: '1-hour clinical report access granted successfully!',
      accessExpiresAt,
      isAccessActive: true,
    });
  } catch (err) {
    console.error('[grantReportAccessWithOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to grant report access.' });
  }
};

/**
 * GET /api/doctor/patients/:patientId/reports
 * Returns comprehensive clinical tracking, adherence analytics, and medication history
 * Requires an active 1-hour access window
 */
export const getPatientReports = async (req, res) => {
  try {
    const { patientId } = req.params;
    const days = parseInt(req.query.days) || 7;

    const patient = await User.findById(patientId).select(
      'name phone email bloodGroup dateOfBirth gender emergencyContact'
    );

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    // Check doctor-patient link and 1-hour access window
    const link = await DoctorPatientLink.findOne({
      doctorId: req.user._id,
      patientId: patient._id,
    });

    const isAccessActive = Boolean(link?.accessExpiresAt && new Date(link.accessExpiresAt) > new Date());

    if (!isAccessActive) {
      return res.json({
        success: true,
        isAccessExpired: true,
        accessExpiresAt: link?.accessExpiresAt || null,
        patient,
        days,
        medications: [],
        reports: [],
        stats: null,
        history: [],
        conflicts: [],
      });
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [medications, logs, reports] = await Promise.all([
      Medication.find({ userId: patient._id }).sort({ createdAt: -1 }),
      AdherenceLog.find({
        userId: patient._id,
        scheduledTime: { $gte: startDate },
      })
        .populate('medicationId', 'name dosage frequency')
        .sort({ scheduledTime: -1 }),
      PatientReport.find({ patientId: patient._id }).sort({ createdAt: -1 }),
    ]);

    const total = logs.length;
    const taken = logs.filter((l) => l.status === 'taken' || l.status === 'late').length;
    const missed = logs.filter((l) => l.status === 'missed').length;
    const skipped = logs.filter((l) => l.status === 'skipped').length;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

    // Detect known potential conflicts among patient's active medications
    const activeMeds = medications.filter((m) => m.isActive);
    const conflicts = [];
    const activeNames = activeMeds.map((m) => m.name.toLowerCase());

    const KNOWN_INTERACTIONS = [
      { drugs: ['aspirin', 'warfarin'], severity: 'high', message: 'Increased risk of bleeding when Aspirin and Warfarin are combined.' },
      { drugs: ['lisinopril', 'spironolactone'], severity: 'high', message: 'Risk of hyperkalemia (dangerously elevated potassium) when combining ACE inhibitors with potassium-sparing diuretics.' },
      { drugs: ['ibuprofen', 'lisinopril'], severity: 'medium', message: 'NSAIDs like Ibuprofen may decrease the antihypertensive effect of Lisinopril.' },
      { drugs: ['metformin', 'furosemide'], severity: 'medium', message: 'Furosemide may increase blood concentrations of Metformin.' },
    ];

    for (const rule of KNOWN_INTERACTIONS) {
      const match = rule.drugs.filter((d) => activeNames.some((n) => n.includes(d)));
      if (match.length >= 2) {
        conflicts.push(rule);
      }
    }

    return res.json({
      success: true,
      isAccessExpired: false,
      accessExpiresAt: link?.accessExpiresAt || null,
      patient,
      days,
      medications,
      reports: reports || [],
      stats: {
        total,
        taken,
        missed,
        skipped,
        adherenceRate,
        activeMedCount: activeMeds.length,
      },
      history: logs,
      conflicts,
    });
  } catch (err) {
    console.error('[getPatientReports]', err);
    return res.status(500).json({ success: false, message: 'Failed to load patient clinical reports.' });
  }
};

/**
 * PUT /api/doctor/medications/:medicationId
 * Allows doctor to edit patient medication details (dosage, frequency, times, instructions, status)
 */
export const updatePatientMedication = async (req, res) => {
  try {
    const { medicationId } = req.params;
    const med = await Medication.findById(medicationId);

    if (!med) {
      return res.status(404).json({ success: false, message: 'Medication not found.' });
    }

    const doctorDisplay = req.user.name
      ? (req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`)
      : 'Physician';

    const allowed = ['name', 'dosage', 'frequency', 'times', 'pharmacy', 'startDate', 'endDate', 'duration', 'durationDays', 'instructions', 'refillDate', 'sideEffects', 'isActive'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        med[key] = req.body[key];
      }
    }

    if (req.body.durationDays !== undefined) {
      if (req.body.durationDays) {
        const dDays = Number(req.body.durationDays);
        med.durationDays = dDays;
        med.duration = req.body.duration || `${dDays} days`;
        const start = med.startDate ? new Date(med.startDate) : new Date();
        med.endDate = new Date(start.getTime() + dDays * 24 * 60 * 60 * 1000);
      } else {
        med.durationDays = null;
        med.duration = req.body.duration || '';
        if (req.body.endDate === undefined) {
          med.endDate = null;
        }
      }
    }
    med.prescribedBy = doctorDisplay;

    await med.save();
    return res.json({
      success: true,
      message: 'Medication updated successfully.',
      medication: med,
    });
  } catch (err) {
    console.error('[updatePatientMedication]', err);
    return res.status(500).json({ success: false, message: 'Failed to update medication.' });
  }
};

/**
 * PATCH /api/doctor/medications/:medicationId/dosage
 * Allows doctor to quickly increase or adjust dosage with an optional clinical note
 */
export const adjustDosage = async (req, res) => {
  try {
    const { medicationId } = req.params;
    const { newDosage, dosage, reason, clinicalReason } = req.body;
    const effectiveDosage = newDosage || dosage;
    const effectiveReason = reason || clinicalReason || '';

    if (!effectiveDosage || !String(effectiveDosage).trim()) {
      return res.status(400).json({ success: false, message: 'New dosage is required.' });
    }

    const med = await Medication.findById(medicationId);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medication not found.' });
    }

    const prevDosage = med.dosage;
    med.dosage = String(effectiveDosage).trim();

    const doctorDisplay = req.user.name
      ? (req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`)
      : 'Physician';
    med.prescribedBy = doctorDisplay;

    if (effectiveReason && effectiveReason.trim()) {
      const adjustmentNote = `[Dosage updated from ${prevDosage || 'prior'} to ${med.dosage}: ${effectiveReason.trim()} by ${doctorDisplay}]`;
      med.instructions = med.instructions
        ? `${med.instructions}\n${adjustmentNote}`
        : adjustmentNote;
    }

    await med.save();
    return res.json({
      success: true,
      message: `Dosage adjusted to ${med.dosage} successfully.`,
      medication: med,
    });
  } catch (err) {
    console.error('[adjustDosage]', err);
    return res.status(500).json({ success: false, message: 'Failed to adjust medication dosage.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/reports
 * Adds clinical consultation report (vitals, diagnosis, notes)
 * Protected by 1-hour OTP consultation access window
 */
export const addClinicalReport = async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      title,
      reportType,
      diagnosis,
      clinicalNotes,
      vitals,
      recommendations,
      attachment,
      testDate,
      otp,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Report title is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    let link = await DoctorPatientLink.findOne({
      doctorId: req.user._id,
      patientId: patient._id,
    });

    let isAccessActive = Boolean(link?.accessExpiresAt && new Date(link.accessExpiresAt) > new Date());

    // If access has expired or link not present, check if valid OTP was provided with the report submission
    if (!isAccessActive && otp) {
      const cleanOtp = String(otp).trim();
      const hashedOtp = crypto.createHash('sha256').update(cleanOtp).digest('hex');
      const tokenRecord = await OtpToken.findOne({
        phone: patient.phone,
        purpose: 'report_access',
        hashedOtp,
        expiresAt: { $gt: new Date() },
      });

      if (tokenRecord) {
        await OtpToken.deleteOne({ _id: tokenRecord._id });
        const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        link = await DoctorPatientLink.findOneAndUpdate(
          { doctorId: req.user._id, patientId: patient._id },
          { status: 'active', accessExpiresAt, lastAccessGrantedAt: new Date() },
          { upsert: true, new: true }
        );
        isAccessActive = true;
      }
    }

    // Auto-link doctor if treated directly
    if (!link) {
      link = await DoctorPatientLink.create({
        doctorId: req.user._id,
        patientId: patient._id,
        status: 'active',
        accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastAccessGrantedAt: new Date(),
      });
    }

    // Clinical report added by physician directly into patient records

    const doctorDisplay = req.user.name
      ? (req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`)
      : 'Consulting Physician';

    const newReport = await PatientReport.create({
      patientId: patient._id,
      doctorId: req.user._id,
      doctorName: doctorDisplay,
      title: title.trim(),
      reportType: reportType || 'bp_report',
      diagnosis: diagnosis || '',
      clinicalNotes: clinicalNotes || '',
      vitals: vitals || {},
      attachment: attachment || { fileName: '', fileType: '', fileData: '', fileSize: 0 },
      testDate: testDate ? new Date(testDate) : new Date(),
      recommendations: recommendations || '',
      status: 'final',
    });

    return res.status(201).json({
      success: true,
      message: `Clinical report "${newReport.title}" successfully transferred to patient database!`,
      report: newReport,
    });
  } catch (err) {
    console.error('[addClinicalReport]', err);
    return res.status(500).json({ success: false, message: 'Failed to save clinical report to patient records.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/send-to-pharmacist
 * Doctor sends prescription with power/dosage to the pharmacist queue
 * Pharmacist can view and dispense using patient phone number (No OTP needed for pharmacist)
 */
export const sendToPharmacist = async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      medicationName,
      power,
      dosage,
      frequency = 'once_daily',
      suggestedTimes = ['08:00'],
      duration = '',
      durationDays = null,
      instructions = '',
      priority = 'routine',
    } = req.body;

    if (!medicationName || !medicationName.trim()) {
      return res.status(400).json({ success: false, message: 'Medication name is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const effectivePower = (power || dosage || '').trim();
    const effectiveDosage = (dosage || power || '').trim();

    let calcDuration = duration;
    if (durationDays && !calcDuration) {
      calcDuration = `${durationDays} days`;
    }

    const doctorDisplay = req.user.name
      ? (req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`)
      : 'Prescribing Physician';

    const order = await PrescriptionOrder.create({
      orderId: patient.phone.trim(),
      productId: req.body.productId || null,
      doctorId: req.user._id,
      doctorName: doctorDisplay,
      doctorPhone: req.user.phone || '',
      patientId: patient._id,
      patientName: patient.name || 'Patient',
      patientPhone: patient.phone,
      medicationName: medicationName.trim(),
      power: effectivePower,
      dosage: effectiveDosage,
      frequency,
      suggestedTimes: Array.isArray(suggestedTimes) && suggestedTimes.length > 0 ? suggestedTimes : ['08:00'],
      duration: calcDuration,
      durationDays: durationDays ? Number(durationDays) : null,
      instructions: instructions.trim(),
      priority,
      status: 'sent_to_pharmacy',
    });

    // Notify patient & pharmacy team
    try {
      await Communication.create({
        patientId: patient._id,
        senderId: req.user._id,
        senderRole: 'doctor',
        recipientRole: 'all',
        category: 'prescription_routed',
        subject: `Prescription Sent to Pharmacy: ${order.medicationName}`,
        message: `${doctorDisplay} has prescribed ${order.medicationName}${effectivePower ? ` (${effectivePower})` : ''} and routed it to the hospital pharmacy for dispensing. Order ID: ${order.orderId}.`,
      });
    } catch (notifyErr) {
      console.warn('[Communication Notice Warning]:', notifyErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Prescription for ${order.medicationName} (${order.power || 'standard'}) routed to pharmacist successfully! Order ID: ${order.orderId}`,
      order,
    });
  } catch (err) {
    console.error('[sendToPharmacist]', err);
    return res.status(500).json({ success: false, message: 'Failed to send prescription to pharmacy.' });
  }
};

/**
 * GET /api/doctor/patients/:patientId/prescription-orders
 * Returns list of prescription orders sent to pharmacy for this patient
 */
export const getPatientPrescriptionOrders = async (req, res) => {
  try {
    const { patientId } = req.params;
    const orders = await PrescriptionOrder.find({ patientId })
      .populate('productId')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (err) {
    console.error('[getPatientPrescriptionOrders]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pharmacy prescription orders.' });
  }
};

/**
 * GET /api/doctor/catalog
 * Allows doctor to search pharmacy inventory like an Amazon customer (NO PRICES)
 */
export const getPharmacyCatalog = async (req, res) => {
  try {
    const { q, category, inStock } = req.query;
    const query = {};

    if (inStock !== undefined && inStock !== '') {
      query.inStock = inStock === 'true';
    }

    if (category && category.trim()) {
      query.category = category.trim();
    }

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { name: regex },
        { genericName: regex },
        { power: regex },
        { manufacturer: regex },
        { description: regex },
      ];
    }

    const products = await PharmacyProduct.find(query).sort({ inStock: -1, name: 1 });

    return res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (err) {
    console.error('[getPharmacyCatalog]', err);
    return res.status(500).json({ success: false, message: 'Failed to search pharmacy catalog.' });
  }
};

/**
 * GET /api/doctor/prescription-orders
 * Ordering database view in doctor dashboard: search all prescription orders with Order ID / phone / med search
 */
export const getAllDoctorPrescriptionOrders = async (req, res) => {
  try {
    const { q, phone, orderId, status } = req.query;
    const query = {};

    if (orderId && orderId.trim()) {
      const cleanOrderId = orderId.trim();
      const digitsOnly = cleanOrderId.replace(/\D/g, '');
      query.$or = [
        { orderId: cleanOrderId },
        { patientPhone: new RegExp(digitsOnly.length >= 4 ? digitsOnly : cleanOrderId, 'i') },
      ];
    } else if (phone && phone.trim()) {
      const cleanPhone = phone.trim();
      const digitsOnly = cleanPhone.replace(/\D/g, '');
      query.$or = [
        { patientPhone: new RegExp(digitsOnly.length >= 4 ? digitsOnly : cleanPhone, 'i') },
        { orderId: cleanPhone },
      ];
    } else if (q && q.trim()) {
      const cleanQ = q.trim();
      const digits = cleanQ.replace(/\D/g, '');
      const regex = new RegExp(cleanQ, 'i');
      const conditions = [
        { orderId: regex },
        { patientName: regex },
        { medicationName: regex },
        { doctorName: regex },
        { patientPhone: regex },
      ];
      if (digits.length >= 4) {
        conditions.push({ patientPhone: new RegExp(digits, 'i') });
        conditions.push({ orderId: new RegExp(digits, 'i') });
      }
      query.$or = conditions;
    }

    if (status && status.trim()) {
      query.status = status.trim();
    }

    const orders = await PrescriptionOrder.find(query)
      .populate('patientId', 'name phone email bloodGroup dateOfBirth gender')
      .populate('doctorId', 'name phone email')
      .populate('productId')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (err) {
    console.error('[getAllDoctorPrescriptionOrders]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch doctor prescription orders.' });
  }
};

/**
 * POST /api/doctor/patients/:patientId/prescription-cart
 * Doctor submits items from patient prescription cart to pharmacy
 * Order ID is set to the patient's phone number
 */
export const submitPrescriptionCart = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Prescription cart is empty. Please add medications from catalog.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const doctorDisplay = req.user.name
      ? (req.user.name.startsWith('Dr.') ? req.user.name : `Dr. ${req.user.name}`)
      : 'Prescribing Physician';

    const orderId = patient.phone.trim();
    const createdOrders = [];

    for (const item of items) {
      const medName = (item.medicationName || item.name || '').trim();
      if (!medName) continue;

      const effectivePower = (item.power || item.dosage || '').trim();
      const effectiveDosage = (item.dosage || item.power || '').trim();
      const frequency = item.frequency || 'once_daily';
      const suggestedTimes = Array.isArray(item.times || item.suggestedTimes) && (item.times || item.suggestedTimes).length > 0
        ? (item.times || item.suggestedTimes)
        : ['08:00'];
      const durationDays = item.durationDays ? Number(item.durationDays) : 7;
      const duration = item.duration || `${durationDays} days`;
      const instructions = (item.instructions || '').trim();
      const priority = item.priority || 'routine';
      const productId = item.productId || item._id || null;
      // Auto-calculated units (from frontend) — fallback: times/day × days
      const totalUnits = item.totalUnits ? Number(item.totalUnits) : suggestedTimes.length * durationDays;

      const order = await PrescriptionOrder.create({
        orderId,
        productId,
        doctorId: req.user._id,
        doctorName: doctorDisplay,
        doctorPhone: req.user.phone || '',
        patientId: patient._id,
        patientName: patient.name || 'Patient',
        patientPhone: patient.phone,
        medicationName: medName,
        power: effectivePower,
        dosage: effectiveDosage,
        frequency,
        suggestedTimes,
        duration,
        durationDays,
        totalUnits,
        instructions,
        priority,
        status: 'sent_to_pharmacy',
      });

      createdOrders.push(order);
    }

    if (createdOrders.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid medication items found in cart.' });
    }

    // Communication notice to patient
    try {
      const medListStr = createdOrders.map((o) => `${o.medicationName} (${o.power || 'std'})`).join(', ');
      await Communication.create({
        patientId: patient._id,
        senderId: req.user._id,
        senderRole: 'doctor',
        recipientRole: 'all',
        category: 'prescription_routed',
        subject: `Prescription Order Ready for Pickup: ${medListStr}`,
        message: `${doctorDisplay} has routed your prescription for [${medListStr}] to the dispensary with Order ID: ${orderId}. Please provide your mobile phone number at the counter to collect your medicines.`,
      });
    } catch (commErr) {
      console.warn('[Communication Notice Warning]:', commErr.message);
    }

    return res.status(201).json({
      success: true,
      orderId,
      message: `Prescription order with ${createdOrders.length} medicine(s) placed! Order ID is patient mobile phone (${orderId}).`,
      orders: createdOrders,
    });
  } catch (err) {
    console.error('[submitPrescriptionCart]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit prescription cart.' });
  }
};


