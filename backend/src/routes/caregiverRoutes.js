import { Router } from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  sendCaregiverInvite,
  respondToInvite,
  getMyLinks,
  getLinkedPatientData,
  removeLink,
  getCaregiverDashboardSummary,
  updateConsentAndPermissions,
} from '../controllers/caregiverController.js';

const router = Router();

router.use(authenticateUser);

router.get('/dashboard-summary', getCaregiverDashboardSummary);
router.patch('/links/:linkId/permissions', updateConsentAndPermissions);
router.post('/invite', sendCaregiverInvite);
router.put('/:linkId/respond', respondToInvite);
router.get('/my-links', getMyLinks);
router.get('/patient/:patientId/data', getLinkedPatientData);
router.delete('/:linkId', removeLink);

export default router;
