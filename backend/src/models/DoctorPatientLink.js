import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const doctorPatientLinkSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending'],
      default: 'active',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    linkedAt: {
      type: Date,
      default: Date.now,
    },
    accessExpiresAt: {
      type: Date,
      default: null,
    },
    lastAccessGrantedAt: {
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

doctorPatientLinkSchema.index({ doctorId: 1, patientId: 1 }, { unique: true });

export const DoctorPatientLink = mongoose.model('DoctorPatientLink', doctorPatientLinkSchema);
export default DoctorPatientLink;
