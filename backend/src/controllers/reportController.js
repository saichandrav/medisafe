import { PatientReport } from '../models/PatientReport.js';
import { CaregiverLink } from '../models/CaregiverLink.js';
import { decryptField } from '../utils/encryption.js';

/**
 * GET /api/reports/my-reports
 * Allows authenticated patients (and authorized caregivers) to view clinical reports uploaded by doctors.
 */
export const getMyReports = async (req, res) => {
  try {
    let targetPatientId = req.user._id;

    // If caregiver requests patient reports
    if (req.query.patientId && !req.user._id.equals(req.query.patientId)) {
      const link = await CaregiverLink.findOne({
        caregiverId: req.user._id,
        patientId: req.query.patientId,
        status: 'active',
      });
      if (!link) {
        return res.status(403).json({ success: false, message: 'You do not have authorized caregiver access to this patient.' });
      }
      targetPatientId = req.query.patientId;
    }

    const reports = await PatientReport.find({ patientId: targetPatientId })
      .sort({ testDate: -1, createdAt: -1 });

    // Ensure encrypted fields are cleanly mapped
    const formattedReports = reports.map((r) => {
      const obj = r.toObject ? r.toObject() : r;
      ['diagnosis', 'clinicalNotes', 'recommendations'].forEach((field) => {
        if (typeof obj[field] === 'string' && /^enc:v\d:/.test(obj[field])) {
          obj[field] = decryptField(obj[field]) || '';
        }
      });
      return obj;
    });

    return res.json({
      success: true,
      reports: formattedReports,
    });
  } catch (err) {
    console.error('[getMyReports]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch medical reports.' });
  }
};

/**
 * GET /api/reports/:id
 * Fetches a single diagnostic report by ID for patient or authorized doctor/caregiver
 */
export const getReportById = async (req, res) => {
  try {
    const report = await PatientReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    // Verify ownership
    const isPatient = report.patientId.equals(req.user._id);
    const isDoctor = report.doctorId.equals(req.user._id);

    if (!isPatient && !isDoctor) {
      const link = await CaregiverLink.findOne({
        caregiverId: req.user._id,
        patientId: report.patientId,
        status: 'active',
      });
      if (!link) {
        return res.status(403).json({ success: false, message: 'Unauthorized to view this report.' });
      }
    }

    const obj = report.toObject ? report.toObject() : report;
    ['diagnosis', 'clinicalNotes', 'recommendations'].forEach((field) => {
      if (typeof obj[field] === 'string' && /^enc:v\d:/.test(obj[field])) {
        obj[field] = decryptField(obj[field]) || '';
      }
    });

    return res.json({ success: true, report: obj });
  } catch (err) {
    console.error('[getReportById]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch report details.' });
  }
};
