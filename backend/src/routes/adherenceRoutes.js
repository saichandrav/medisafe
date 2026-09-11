import { Router } from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  logAdherence,
  getTodayAdherence,
  getAdherenceHistory,
  getAdherenceStats,
} from '../controllers/adherenceController.js';

const router = Router();

router.use(authenticateUser);

router.post('/', logAdherence);
router.get('/today', getTodayAdherence);
router.get('/history', getAdherenceHistory);
router.get('/stats', getAdherenceStats);

export default router;
