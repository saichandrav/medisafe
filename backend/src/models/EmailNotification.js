import mongoose from 'mongoose';

const emailNotificationSchema = new mongoose.Schema(
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
    dosage: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
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
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'simulated', 'failed'],
      default: 'sent',
    },
    previewUrl: {
      type: String,
      trim: true,
      default: '',
    },
    messageId: {
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

// Compound index to prevent sending the same reminder type multiple times for the same scheduled dose
emailNotificationSchema.index(
  { medicationId: 1, scheduledTime: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      medicationId: { $type: 'objectId' },
      scheduledTime: { $type: 'date' },
    },
  }
);

export const EmailNotification = mongoose.model('EmailNotification', emailNotificationSchema);
export default EmailNotification;
