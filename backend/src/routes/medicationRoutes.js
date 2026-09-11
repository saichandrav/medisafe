import { Router } from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  addMedication,
  getMyMedications,
  getMedicationById,
  updateMedication,
  deleteMedication,
  getTodaySchedule,
  checkConflicts,
  requestRefill,
  getMyRefillRequests,
  getSmsNotificationLogs,
  sendTestSms,
  getEmailNotificationLogs,
  sendTestEmail,
} from '../controllers/medicationController.js';

const router = Router();

router.use(authenticateUser);

router.get('/today-schedule', getTodaySchedule);
router.get('/sms-logs', getSmsNotificationLogs);
router.post('/send-test-sms', sendTestSms);
router.get('/email-logs', getEmailNotificationLogs);
router.post('/send-test-email', sendTestEmail);
router.get('/conflicts', checkConflicts);
router.get('/refills/my-requests', getMyRefillRequests);
router.post('/:id/request-refill', requestRefill);
router.post('/', addMedication);
router.get('/', getMyMedications);
router.get('/:id', getMedicationById);
router.put('/:id', updateMedication);
router.delete('/:id', deleteMedication);

export default router;
