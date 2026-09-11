import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const refillRequestSchema = new mongoose.Schema(
  {
    patientId: {
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
    pharmacistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    pharmacy: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'ready_for_pickup', 'dispensed', 'rejected'],
      default: 'pending',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    pharmacistNotes: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
    runSettersOnQuery: true,
  }
);

export const RefillRequest = mongoose.model('RefillRequest', refillRequestSchema);
export default RefillRequest;
