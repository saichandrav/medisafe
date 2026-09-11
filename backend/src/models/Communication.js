import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const communicationSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ['patient', 'caregiver', 'doctor', 'pharmacist'],
      required: true,
    },
    recipientRole: {
      type: String,
      enum: ['patient', 'caregiver', 'doctor', 'pharmacist', 'all'],
      default: 'all',
    },
    category: {
      type: String,
      enum: ['general', 'side_effect_alert', 'dosage_query', 'refill_notification', 'missed_dose_alert'],
      default: 'general',
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      default: '',
    },
    message: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
    runSettersOnQuery: true,
  }
);

export const Communication = mongoose.model('Communication', communicationSchema);
export default Communication;
