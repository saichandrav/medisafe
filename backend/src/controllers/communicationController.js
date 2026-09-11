import { Communication } from '../models/Communication.js';
import { User } from '../models/User.js';
import { CaregiverLink } from '../models/CaregiverLink.js';
import { DoctorPatientLink } from '../models/DoctorPatientLink.js';

/**
 * 1. POST /api/communications
 * Send a message or alert between care team members
 */
export const sendMessage = async (req, res) => {
  try {
    const { patientId, recipientRole = 'all', category = 'general', subject, message } = req.body;

    if (!patientId || !message) {
      return res.status(400).json({ success: false, message: 'patientId and message are required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const comm = await Communication.create({
      patientId,
      senderId: req.user._id,
      senderRole: req.user.role || 'patient',
      recipientRole,
      category,
      subject: subject || `${category.replace(/_/g, ' ').toUpperCase()}`,
      message,
    });

    const populated = await Communication.findById(comm._id)
      .populate('senderId', 'name role phone')
      .populate('patientId', 'name phone');

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully.',
      communication: populated,
    });
  } catch (err) {
    console.error('[sendMessage]', err);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
};

/**
 * 2. GET /api/communications/patient/:patientId
 * Get conversation history and clinical alerts for a patient
 */
export const getPatientThread = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify authorized access: patient themselves, or linked doctor/caregiver, or pharmacist
    const isSelf = req.user._id.equals(patientId);
    const isPharmacist = req.user.role === 'pharmacist';
    
    let isLinkedCaregiver = false;
    let isLinkedDoctor = false;

    if (!isSelf && !isPharmacist) {
      const cLink = await CaregiverLink.findOne({ patientId, caregiverId: req.user._id, status: 'accepted' });
      if (cLink) isLinkedCaregiver = true;

      const dLink = await DoctorPatientLink.findOne({ patientId, doctorId: req.user._id, status: 'active' });
      if (dLink) isLinkedDoctor = true;
    }

    if (!isSelf && !isPharmacist && !isLinkedCaregiver && !isLinkedDoctor) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view communication records for this patient.' });
    }

    const messages = await Communication.find({ patientId })
      .populate('senderId', 'name role phone')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (err) {
    console.error('[getPatientThread]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
};

/**
 * 3. GET /api/communications/inbox
 * Get messages and alerts where logged-in user is involved
 */
export const getInbox = async (req, res) => {
  try {
    // If user is patient: get all messages for themselves
    // If user is caregiver: get messages for their accepted patients
    // If user is doctor: get messages for their active patients or sent by themselves
    // If user is pharmacist: get pharmacy alerts
    let query = {};

    if (req.user.role === 'patient') {
      query = { patientId: req.user._id };
    } else if (req.user.role === 'caregiver') {
      const links = await CaregiverLink.find({ caregiverId: req.user._id, status: 'accepted' });
      const patientIds = links.map((l) => l.patientId);
      query = {
        $or: [
          { senderId: req.user._id },
          { patientId: { $in: patientIds } },
        ],
      };
    } else if (req.user.role === 'doctor') {
      const links = await DoctorPatientLink.find({ doctorId: req.user._id, status: 'active' });
      const patientIds = links.map((l) => l.patientId);
      query = {
        $or: [
          { senderId: req.user._id },
          { patientId: { $in: patientIds } },
        ],
      };
    } else if (req.user.role === 'pharmacist') {
      query = {
        $or: [
          { senderId: req.user._id },
          { category: 'refill_notification' },
          { recipientRole: { $in: ['pharmacist', 'all'] } },
        ],
      };
    }

    const messages = await Communication.find(query)
      .populate('senderId', 'name role phone')
      .populate('patientId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (err) {
    console.error('[getInbox]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch inbox.' });
  }
};

/**
 * 4. PATCH /api/communications/:id/read
 * Mark message as read
 */
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const msg = await Communication.findById(id);
    if (!msg) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    msg.isRead = true;
    await msg.save();

    return res.json({ success: true, message: 'Message marked as read.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update message.' });
  }
};
