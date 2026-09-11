import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const adherenceLogSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    scheduledTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['taken', 'missed', 'skipped', 'late'],
      required: true,
    },
    takenAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
    runSettersOnQuery: true,
  }
);

// Compound index to prevent duplicate logs
adherenceLogSchema.index({ userId: 1, medicationId: 1, scheduledTime: 1 }, { unique: true });

export const AdherenceLog = mongoose.model('AdherenceLog', adherenceLogSchema);
export default AdherenceLog;
