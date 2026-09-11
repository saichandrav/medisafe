import { CaregiverLink } from '../models/CaregiverLink.js';
import { User } from '../models/User.js';
import { Medication } from '../models/Medication.js';
import { AdherenceLog } from '../models/AdherenceLog.js';
import { Communication } from '../models/Communication.js';
import { normalizePhoneNumber } from '../config/twilio.js';

// POST /api/caregivers/invite
export const sendCaregiverInvite = async (req, res) => {
  try {
    const { phone, relationship } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Caregiver phone number is required.' });
    }

    let normalizedPhone;
    try {
      normalizedPhone = normalizePhoneNumber(phone);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }

    // Find or auto-provision pending caregiver account
    let caregiver = await User.findOne({ phone: normalizedPhone });
    if (!caregiver) {
      caregiver = await User.create({
        phone: normalizedPhone,
        name: relationship ? `Family Member (${relationship})` : 'Invited Caregiver',
        role: 'caregiver',
        isProfileComplete: false,
      });
    }

    if (caregiver._id.equals(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot link yourself as a caregiver.' });
    }

    // Check if link already exists
    const existing = await CaregiverLink.findOne({ patientId: req.user._id, caregiverId: caregiver._id });
    if (existing) {
      return res.status(409).json({ success: false, message: `Link already exists (status: ${existing.status}).` });
    }

    const link = await CaregiverLink.create({
      patientId: req.user._id,
      caregiverId: caregiver._id,
      relationship: relationship || 'Family Proxy',
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: `Invitation successfully sent to ${normalizedPhone}. The link is pending verification.`,
      link,
    });
  } catch (err) {
    console.error('[sendCaregiverInvite]', err);
    return res.status(500).json({ success: false, message: 'Failed to send invite.' });
  }
};

// PUT /api/caregivers/:linkId/respond
export const respondToInvite = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be accepted or rejected.' });
    }

    const link = await CaregiverLink.findOne({ _id: req.params.linkId, caregiverId: req.user._id });
    if (!link) {
      return res.status(404).json({ success: false, message: 'Invite not found.' });
    }

    link.status = status;
    await link.save();

    return res.json({ success: true, message: `Invite ${status}.`, link });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to respond.' });
  }
};

// GET /api/caregivers/my-links
export const getMyLinks = async (req, res) => {
  try {
    // Links where I am the patient
    const asPatient = await CaregiverLink.find({ patientId: req.user._id }).populate('caregiverId', 'name phone role');

    // Links where I am the caregiver
    const asCaregiver = await CaregiverLink.find({ caregiverId: req.user._id }).populate('patientId', 'name phone role');

    return res.json({ success: true, asPatient, asCaregiver });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch links.' });
  }
};

// GET /api/caregivers/patient/:patientId/data
export const getLinkedPatientData = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify caregiver has accepted link
    const link = await CaregiverLink.findOne({
      patientId,
      caregiverId: req.user._id,
      status: 'accepted',
    });

    if (!link) {
      return res.status(403).json({ success: false, message: 'No active caregiver link to this patient.' });
    }

    const result = {};

    if (link.canViewMedications) {
      result.medications = await Medication.find({ userId: patientId, isActive: true });
    }

    if (link.canViewAdherence) {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      result.recentAdherence = await AdherenceLog.find({
        userId: patientId,
        scheduledTime: { $gte: sevenDaysAgo },
      }).populate('medicationId', 'name dosage').sort({ scheduledTime: -1 });
    }

    const patient = await User.findById(patientId).select('name phone');
    result.patient = patient;

    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch patient data.' });
  }
};

// DELETE /api/caregivers/:linkId
export const removeLink = async (req, res) => {
  try {
    const link = await CaregiverLink.findOne({
      _id: req.params.linkId,
      $or: [{ patientId: req.user._id }, { caregiverId: req.user._id }],
    });

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found.' });
    }

    await CaregiverLink.deleteOne({ _id: link._id });
    return res.json({ success: true, message: 'Link removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to remove link.' });
  }
};

// GET /api/caregivers/dashboard-summary
export const getCaregiverDashboardSummary = async (req, res) => {
  try {
    const links = await CaregiverLink.find({ caregiverId: req.user._id, status: 'accepted' })
      .populate('patientId', 'name phone email bloodGroup dateOfBirth emergencyContact');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const patientSummaries = [];
    const allMissedAlerts = [];
    const allMedicationConcerns = [];

    for (const link of links) {
      const patient = link.patientId;
      if (!patient) continue;

      const medications = await Medication.find({ userId: patient._id, isActive: true });

      // Adherence logs over 7 days
      const logs = await AdherenceLog.find({
        userId: patient._id,
        scheduledTime: { $gte: sevenDaysAgo },
      }).populate('medicationId', 'name dosage');

      const totalDoses = logs.length;
      const takenDoses = logs.filter((l) => l.status === 'taken' || l.status === 'late').length;
      const missedDoses = logs.filter((l) => l.status === 'missed').length;
      const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 100;

      // Check for doses missed today
      const todayMissed = logs.filter(
        (l) => l.status === 'missed' && new Date(l.scheduledTime) >= todayStart
      );

      todayMissed.forEach((m) => {
        allMissedAlerts.push({
          patientId: patient._id,
          patientName: patient.name,
          medicationName: m.medicationId?.name || 'Scheduled Dose',
          dosage: m.medicationId?.dosage || '',
          scheduledTime: m.scheduledTime,
          alertTime: m.createdAt,
        });
      });

      // Medication concerns: side effects reported or refill needed
      medications.forEach((med) => {
        if (med.sideEffects && med.sideEffects.trim()) {
          allMedicationConcerns.push({
            patientId: patient._id,
            patientName: patient.name,
            medicationName: med.name,
            sideEffects: med.sideEffects,
            prescribedBy: med.prescribedBy,
          });
        }
      });

      patientSummaries.push({
        linkId: link._id,
        patient,
        relationship: link.relationship,
        canViewMedications: link.canViewMedications,
        canViewAdherence: link.canViewAdherence,
        canManageConsent: link.canManageConsent,
        activeMedCount: medications.length,
        medications,
        adherenceRate,
        totalDoses,
        takenDoses,
        missedDoses,
        todayMissedCount: todayMissed.length,
      });
    }

    // Care team communications for these patients
    const patientIds = links.map((l) => l.patientId?._id).filter(Boolean);
    const recentCommunications = await Communication.find({ patientId: { $in: patientIds } })
      .populate('senderId', 'name role phone')
      .populate('patientId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json({
      success: true,
      patientCount: patientSummaries.length,
      patients: patientSummaries,
      missedAlerts: allMissedAlerts,
      medicationConcerns: allMedicationConcerns,
      recentCommunications,
    });
  } catch (err) {
    console.error('[getCaregiverDashboardSummary]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate caregiver summary.' });
  }
};

// PATCH /api/caregivers/links/:linkId/permissions
export const updateConsentAndPermissions = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { canViewMedications, canViewAdherence, canManageConsent, relationship } = req.body;

    const link = await CaregiverLink.findOne({
      _id: linkId,
      $or: [{ patientId: req.user._id }, { caregiverId: req.user._id }],
    });

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found.' });
    }

    if (canViewMedications !== undefined) link.canViewMedications = canViewMedications;
    if (canViewAdherence !== undefined) link.canViewAdherence = canViewAdherence;
    if (canManageConsent !== undefined) link.canManageConsent = canManageConsent;
    if (relationship !== undefined) link.relationship = relationship;

    await link.save();

    return res.json({
      success: true,
      message: 'Caregiver consent & permissions updated.',
      link,
    });
  } catch (err) {
    console.error('[updateConsentAndPermissions]', err);
    return res.status(500).json({ success: false, message: 'Failed to update permissions.' });
  }
};

