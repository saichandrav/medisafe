import mongoose from 'mongoose';

const otpTokenSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true,
    },
    hashedOtp: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    purpose: {
      type: String,
      default: 'auth', // 'auth' | 'medication_consent'
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '5m' }, // Auto remove after 5 minutes
    },
  },
  {
    timestamps: true,
  }
);

export const OtpToken = mongoose.model('OtpToken', otpTokenSchema);
