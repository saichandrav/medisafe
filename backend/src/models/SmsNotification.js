import mongoose from 'mongoose';

const smsNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    medicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medication',
      required: false,
      index: true,
    },
    medicationName: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    scheduledTime: {
      type: Date,
      required: false,
    },
    timeStr: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: ['1h_before', 'exact_time', '1h_after', 'test'],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'simulated'],
      default: 'sent',
    },
    twilioSid: {
      type: String,
      trim: true,
      default: '',
    },
    error: {
      type: String,
      trim: true,
      default: '',
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate notifications of the same type for the same dose
smsNotificationSchema.index(
  { medicationId: 1, scheduledTime: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      medicationId: { $type: 'objectId' },
      scheduledTime: { $type: 'date' },
    },
  }
);

export const SmsNotification = mongoose.model('SmsNotification', smsNotificationSchema);
export default SmsNotification;
