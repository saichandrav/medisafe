import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const caregiverLinkSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
    relationship: {
      type: String,
      trim: true,
      default: '',
    },
    canViewMedications: {
      type: Boolean,
      default: true,
    },
    canViewAdherence: {
      type: Boolean,
      default: true,
    },
    canManageConsent: {
      type: Boolean,
      default: false,
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

caregiverLinkSchema.index({ patientId: 1, caregiverId: 1 }, { unique: true });

export const CaregiverLink = mongoose.model('CaregiverLink', caregiverLinkSchema);
export default CaregiverLink;
