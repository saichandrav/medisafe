import { Router } from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  searchPatients,
  addPatient,
  getMyPatients,
  requestMedicationOtp,
  confirmMedicationWithOtp,
  requestReportAccessOtp,
  grantReportAccessWithOtp,
  getPatientReports,
  addClinicalReport,
  sendToPharmacist,
  getPatientPrescriptionOrders,
  getPharmacyCatalog,
  getAllDoctorPrescriptionOrders,
  submitPrescriptionCart,
  updatePatientMedication,
  adjustDosage,
} from '../controllers/doctorController.js';

const router = Router();

// Doctor routes require authentication
router.use(authenticateUser);

// Pharmacy catalog browsing (Amazon customer style, NO PRICES)
router.get('/catalog', getPharmacyCatalog);

// Orders database in doctor dashboard (Search by Order ID / phone / med)
router.get('/prescription-orders', getAllDoctorPrescriptionOrders);

// Patient discovery & roster
router.get('/search-patients', searchPatients);
router.post('/add-patient', addPatient);
router.get('/patients', getMyPatients);

// Patient prescription consent OTP flow (Direct Doctor Assignment)
router.post('/patients/:patientId/request-medication-otp', requestMedicationOtp);
router.post('/patients/:patientId/confirm-medication', confirmMedicationWithOtp);

// Patient clinical report access authorization flow (1-hour temporary access)
router.post('/patients/:patientId/request-access-otp', requestReportAccessOtp);
router.post('/patients/:patientId/grant-access', grantReportAccessWithOtp);

// Clinical tracking & reports
router.get('/patients/:patientId/reports', getPatientReports);
router.post('/patients/:patientId/reports', addClinicalReport);

// Pharmacy routing, cart submission & order tracking
router.post('/patients/:patientId/send-to-pharmacist', sendToPharmacist);
router.post('/patients/:patientId/prescription-cart', submitPrescriptionCart);
router.get('/patients/:patientId/prescription-orders', getPatientPrescriptionOrders);

// Medication management by doctor
router.put('/medications/:medicationId', updatePatientMedication);
router.patch('/medications/:medicationId/dosage', adjustDosage);

export default router;

