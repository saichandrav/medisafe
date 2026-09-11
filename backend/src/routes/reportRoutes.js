import { Router } from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { getMyReports, getReportById } from '../controllers/reportController.js';

const router = Router();

router.use(authenticateUser);

router.get('/my-reports', getMyReports);
router.get('/:id', getReportById);

export default router;
