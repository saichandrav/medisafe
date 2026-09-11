import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  sendMessage,
  getPatientThread,
  getInbox,
  markAsRead,
} from '../controllers/communicationController.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', sendMessage);
router.get('/inbox', getInbox);
router.get('/patient/:patientId', getPatientThread);
router.patch('/:id/read', markAsRead);

export default router;
