import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getPrescriptions,
  checkSafetyForPatient,
  getRefillRequests,
  updateRefillRequest,
  updateMedicationDispenseStatus,
  notifyPatientAndCareTeam,
  searchOrdersByPhone,
  dispensePrescriptionOrder,
  getInventory,
  addInventoryProduct,
  updateInventoryProduct,
  deleteInventoryProduct,
} from '../controllers/pharmacistController.js';

const router = express.Router();

router.use(requireAuth);

// Pharmacy Inventory Catalog (Amazon seller-style product management, NO PRICES)
router.get('/inventory', getInventory);
router.post('/inventory', addInventoryProduct);
router.patch('/inventory/:id', updateInventoryProduct);
router.delete('/inventory/:id', deleteInventoryProduct);

// Prescription inspection
router.get('/prescriptions', getPrescriptions);

// Doctor prescription orders (Search by patient phone / Order ID - NO OTP NEEDED)
router.get('/orders', searchOrdersByPhone);
router.post('/orders/:orderId/dispense', dispensePrescriptionOrder);

// Clinical safety & duplicate detection
router.get('/safety-check/:patientId', checkSafetyForPatient);

// Refill management
router.get('/refills', getRefillRequests);
router.patch('/refills/:id', updateRefillRequest);

// Dispensing status
router.patch('/medications/:id/dispense-status', updateMedicationDispenseStatus);

// Alerts & notifications
router.post('/notify', notifyPatientAndCareTeam);

export default router;

