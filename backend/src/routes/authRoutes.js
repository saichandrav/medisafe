import { Router } from 'express';
import {
  sendOtp,
  verifyOtp,
  completeRegistration,
  getMe,
  updateProfile,
  logout,
  getHealth,
} from '../controllers/authController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  otpSendLimiter,
  otpVerifyLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

// Public routes
router.post('/send-otp', otpSendLimiter, sendOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);
router.post('/complete-registration', completeRegistration);
router.get('/health', getHealth);
router.post('/logout', logout);

// Protected routes
router.get('/me', authenticateUser, getMe);
router.put('/profile', authenticateUser, updateProfile);

export default router;
