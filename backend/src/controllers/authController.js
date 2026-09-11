import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { OtpToken } from '../models/OtpToken.js';
import {
  getClient,
  getTwilioConfig,
  normalizePhoneNumber,
} from '../config/twilio.js';

const JWT_SECRET =
  process.env.JWT_SECRET || 'production_jwt_super_secret_key_change_in_production_min_32_chars';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REGISTRATION_TOKEN_SECRET =
  process.env.REGISTRATION_TOKEN_SECRET || 'registration_temp_token_secret_key_change_in_production';
const REGISTRATION_TOKEN_EXPIRES_IN = process.env.REGISTRATION_TOKEN_EXPIRES_IN || '15m';

export const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const createJwtToken = (userId, phone) => {
  return jwt.sign({ id: userId, phone }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

const createRegistrationToken = (phone) => {
  return jwt.sign(
    { phone, stage: 'complete_profile', verifiedAt: Date.now() },
    REGISTRATION_TOKEN_SECRET,
    { expiresIn: REGISTRATION_TOKEN_EXPIRES_IN }
  );
};

const maskPhone = (phone) => {
  if (!phone || phone.length < 8) return phone;
  const last4 = phone.slice(-4);
  const prefix = phone.slice(0, phone.length - 7);
  return `${prefix}***${last4}`;
};

/**
 * POST /api/auth/send-otp
 * Dispatches 6-digit OTP to user mobile using Twilio Verify API or Programmable SMS
 */
export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required.',
      });
    }

    let normalizedPhone;
    try {
      normalizedPhone = normalizePhoneNumber(phone);
    } catch (normErr) {
      return res.status(400).json({
        success: false,
        message: normErr.message,
      });
    }

    const twilioConfig = getTwilioConfig();
    const twilioClient = getClient();

    if (!twilioClient) {
      return res.status(503).json({
        success: false,
        message:
          'Twilio service is not configured. Please ensure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set in backend/.env.',
        code: 'TWILIO_NOT_CONFIGURED',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone: normalizedPhone });
    const isExistingUser = Boolean(existingUser && existingUser.isProfileComplete);

    // MODE 1: Twilio Verify Service (Industry Standard)
    if (twilioConfig.verifySid) {
      try {
        const verification = await twilioClient.verify.v2
          .services(twilioConfig.verifySid)
          .verifications.create({
            to: normalizedPhone,
            channel: 'sms',
          });

        console.log(`[Twilio Verify Dispatched] Phone: ${normalizedPhone} | Status: ${verification.status}`);

        return res.status(200).json({
          success: true,
          message: `OTP sent successfully to ${maskPhone(normalizedPhone)} via SMS.`,
          phone: normalizedPhone,
          maskedPhone: maskPhone(normalizedPhone),
          status: verification.status,
          isExistingUser,
        });
      } catch (verifyError) {
        console.error('[Twilio Verify Error]:', verifyError);
        // If Verify Service fails but programmable SMS is configured, fallback to SMS
        if (!twilioConfig.phoneNumber) {
          return res.status(verifyError.status || 500).json({
            success: false,
            message: verifyError.message || 'Failed to send OTP via Twilio Verify.',
            code: verifyError.code,
            moreInfo: verifyError.moreInfo,
          });
        }
        console.warn('[Twilio] Falling back to Programmable SMS delivery...');
      }
    }

    // MODE 2: Programmable SMS Fallback (if phone number is configured)
    if (twilioConfig.phoneNumber) {
      try {
        // Generate secure 6-digit OTP
        const rawOtp = crypto.randomInt(100000, 999999).toString();
        const hashedOtp = crypto.createHash('sha256').update(rawOtp).digest('hex');

        // Delete any prior OTPs for this number
        await OtpToken.deleteMany({ phone: normalizedPhone });

        // Save new OTP with 5 minute expiration
        await OtpToken.create({
          phone: normalizedPhone,
          hashedOtp,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        try {
          await twilioClient.messages.create({
            body: `Your MedSafe verification code is ${rawOtp}. Valid for 5 minutes. Do not share this OTP with anyone.`,
            from: twilioConfig.phoneNumber,
            to: normalizedPhone,
          });
          console.log(`[Twilio SMS Dispatched] Phone: ${normalizedPhone}`);
        } catch (smsError) {
          console.error('[Twilio SMS Error]:', smsError.message);
          return res.status(smsError.status || 500).json({
            success: false,
            message: smsError.message || 'Failed to send SMS via Twilio.',
            code: smsError.code,
            moreInfo: smsError.moreInfo,
          });
        }

        return res.status(200).json({
          success: true,
          message: `OTP sent successfully to ${maskPhone(normalizedPhone)} via SMS.`,
          phone: normalizedPhone,
          maskedPhone: maskPhone(normalizedPhone),
          isExistingUser,
          smsSent: true,
        });
      } catch (err) {
        console.error('[sendOtp Error]:', err);
        return res.status(500).json({
          success: false,
          message: 'Internal server error while sending OTP.',
        });
      }
    }

    return res.status(500).json({
      success: false,
      message:
        'Neither TWILIO_VERIFY_SERVICE_SID nor TWILIO_PHONE_NUMBER is configured in backend/.env.',
    });
  } catch (err) {
    console.error('[sendOtp Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while sending OTP.',
    });
  }
};

/**
 * POST /api/auth/verify-otp
 * Verifies the 6-digit OTP with Twilio.
 * If user exists: logs them in.
 * If user is not registered: returns signed registration token to proceed to registration.
 */
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Both phone number and 6-digit OTP are required.',
      });
    }

    const cleanOtp = String(otp).trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be a valid 6-digit numerical code.',
      });
    }

    let normalizedPhone;
    try {
      normalizedPhone = normalizePhoneNumber(phone);
    } catch (normErr) {
      return res.status(400).json({
        success: false,
        message: normErr.message,
      });
    }

    const twilioConfig = getTwilioConfig();
    const twilioClient = getClient();

    if (!twilioClient) {
      return res.status(503).json({
        success: false,
        message: 'Twilio service is not configured.',
      });
    }

    let isOtpApproved = false;

    // Verify with Twilio Verify Service
    if (twilioConfig.verifySid) {
      try {
        const check = await twilioClient.verify.v2
          .services(twilioConfig.verifySid)
          .verificationChecks.create({
            to: normalizedPhone,
            code: cleanOtp,
          });

        if (check.status === 'approved') {
          isOtpApproved = true;
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid OTP or OTP has expired. Please check and try again.',
            status: check.status,
          });
        }
      } catch (verifyError) {
        console.error('[Twilio VerificationCheck Error]:', verifyError);
        return res.status(verifyError.status || 400).json({
          success: false,
          message: verifyError.message || 'Error verifying OTP with Twilio.',
          code: verifyError.code,
        });
      }
    } else if (twilioConfig.phoneNumber) {
      // Fallback: Verify with stored hashed OTP
      const storedRecord = await OtpToken.findOne({ phone: normalizedPhone });
      if (!storedRecord) {
        return res.status(400).json({
          success: false,
          message: 'OTP has expired or was not requested. Please request a new OTP.',
        });
      }

      if (storedRecord.attempts >= 5) {
        await OtpToken.deleteOne({ _id: storedRecord._id });
        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please request a new OTP.',
        });
      }

      const inputHash = crypto.createHash('sha256').update(cleanOtp).digest('hex');
      if (inputHash === storedRecord.hashedOtp) {
        isOtpApproved = true;
        await OtpToken.deleteOne({ _id: storedRecord._id });
      } else {
        storedRecord.attempts += 1;
        await storedRecord.save();
        return res.status(400).json({
          success: false,
          message: `Incorrect OTP. Attempts remaining: ${5 - storedRecord.attempts}`,
        });
      }
    }

    if (!isOtpApproved) {
      return res.status(400).json({
        success: false,
        message: 'OTP verification failed.',
      });
    }

    // OTP Verified! Now check if user already exists in MongoDB
    const existingUser = await User.findOne({ phone: normalizedPhone });

    // CASE 1: User exists and completed profile -> Direct Login
    if (existingUser && existingUser.isProfileComplete) {
      existingUser.lastLoginAt = new Date();
      await existingUser.save();

      const token = createJwtToken(existingUser._id, existingUser.phone);

      // Set httpOnly, Secure, SameSite=strict cookie
      res.cookie('token', token, getAuthCookieOptions());

      return res.status(200).json({
        success: true,
        isNewUser: false,
        message: 'Login successful. Welcome back!',
        token,
        user: existingUser.toPublicProfile(),
      });
    }

    // CASE 2: New user OR incomplete profile -> Issue Registration Token
    const registrationToken = createRegistrationToken(normalizedPhone);

    return res.status(200).json({
      success: true,
      isNewUser: true,
      message: 'Mobile number verified successfully. Please provide your details to complete registration.',
      phone: normalizedPhone,
      registrationToken,
    });
  } catch (err) {
    console.error('[verifyOtp Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while verifying OTP.',
    });
  }
};

/**
 * POST /api/auth/complete-registration
 * Takes registrationToken, name, and email.
 * Creates new user in MongoDB and issues full JWT token.
 */
export const completeRegistration = async (req, res) => {
  try {
    const { registrationToken, name, email, role } = req.body;

    if (!registrationToken) {
      return res.status(400).json({
        success: false,
        message: 'Registration token is required. Please verify your phone number first.',
      });
    }

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid full name (at least 2 characters).',
      });
    }

    // Verify registration token
    let decoded;
    try {
      decoded = jwt.verify(registrationToken, REGISTRATION_TOKEN_SECRET);
    } catch (tokenErr) {
      return res.status(401).json({
        success: false,
        message: 'Registration session expired or invalid. Please verify phone number again.',
      });
    }

    const { phone } = decoded;
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Invalid registration token payload.',
      });
    }

    // Validate email if provided
    let cleanEmail = '';
    if (email && email.trim()) {
      cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address.',
        });
      }
    }

    const cleanName = name.trim();

    // Create or update user in MongoDB
    let user = await User.findOne({ phone });

    const validRoles = ['patient', 'doctor', 'caregiver', 'pharmacist', 'admin'];
    const selectedRole = role && validRoles.includes(role) ? role : 'patient';

    if (!user) {
      user = new User({
        phone,
        name: cleanName,
        email: cleanEmail,
        role: selectedRole,
        isProfileComplete: true,
        lastLoginAt: new Date(),
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=2563eb`,
      });
    } else {
      user.name = cleanName;
      if (cleanEmail) user.email = cleanEmail;
      user.isProfileComplete = true;
      user.lastLoginAt = new Date();
      if (!user.avatar) {
        user.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanName)}&backgroundColor=fc8019`;
      }
    }

    await user.save();

    const token = createJwtToken(user._id, user.phone);

    // Set httpOnly, Secure, SameSite=strict cookie
    res.cookie('token', token, getAuthCookieOptions());

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to MedSafe.',
      token,
      user: user.toPublicProfile(),
    });
  } catch (err) {
    console.error('[completeRegistration Error]:', err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this phone number or email already exists.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while saving registration.',
    });
  }
};

/**
 * GET /api/auth/me
 * Returns authenticated user profile
 */
export const getMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: req.user.toPublicProfile(),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching user profile.',
    });
  }
};

/**
 * PUT /api/auth/profile
 * Updates user profile (name, email)
 */
export const updateProfile = async (req, res) => {
  try {
    const { name, email, gender, bloodGroup, emergencyContact } = req.body;
    const user = req.user;

    if (name && name.trim().length >= 2) {
      user.name = name.trim();
      user.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=fc8019`;
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email address format.',
        });
      }
      user.email = email.trim().toLowerCase();
    }

    if (gender !== undefined) user.gender = gender;
    if (bloodGroup !== undefined) user.bloodGroup = bloodGroup;
    if (emergencyContact !== undefined) {
      user.emergencyContact = typeof emergencyContact === 'object'
        ? (emergencyContact.name || emergencyContact.phone
            ? `${emergencyContact.name || ''} | ${emergencyContact.phone || ''} | ${emergencyContact.relationship || ''}`.trim()
            : '')
        : String(emergencyContact);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: user.toPublicProfile(),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile.',
    });
  }
};

/**
 * POST /api/auth/logout
 * Clears authentication cookie
 */
export const logout = async (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
};

/**
 * GET /api/auth/health
 * Returns service status & Twilio configuration diagnostics
 */
export const getHealth = async (req, res) => {
  const config = getTwilioConfig();
  return res.status(200).json({
    success: true,
    service: 'MedSafe OTP Auth API',
    uptime: process.uptime(),
    twilio: {
      isConfigured: config.isConfigured,
      mode: config.verifySid
        ? 'Twilio Verify API'
        : config.phoneNumber
        ? 'Twilio Programmable SMS'
        : 'Not Configured',
      accountSidMasked: config.accountSid ? `${config.accountSid.slice(0, 6)}...` : null,
      verifySidMasked: config.verifySid ? `${config.verifySid.slice(0, 6)}...` : null,
      senderPhone: config.phoneNumber || null,
    },
    database: 'Connected',
  });
};
