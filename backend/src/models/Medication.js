import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const medicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Medication name is required'],
      trim: true,
    },
    dosage: {
      type: String,
      trim: true,
      default: '',
    },
    power: {
      type: String,
      trim: true,
      default: '',
    },
    frequency: {
      type: String,
      enum: ['once_daily', 'twice_daily', 'thrice_daily', 'four_times_daily', 'weekly', 'as_needed'],
      default: 'once_daily',
    },
    times: {
      type: [String],
      default: ['08:00'],
    },
    prescribedBy: {
      type: String,
      trim: true,
      default: '',
    },
    pharmacy: {
      type: String,
      trim: true,
      default: '',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    duration: {
      type: String,
      trim: true,
      default: '',
    },
    durationDays: {
      type: Number,
      default: null,
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    refillDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sideEffects: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    dispenseStatus: {
      type: String,
      enum: ['pending_dispense', 'ready_for_pickup', 'dispensed', 'out_of_stock'],
      default: 'dispensed',
    },
    lastDispensedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      transform: (doc, ret) => {
        if (typeof ret.instructions === 'string' && /^enc:v\d:/.test(ret.instructions)) {
          const dec = decryptField(ret.instructions);
          ret.instructions = /^enc:v\d:/.test(dec) ? '' : dec;
        }
        if (typeof ret.sideEffects === 'string' && /^enc:v\d:/.test(ret.sideEffects)) {
          const dec = decryptField(ret.sideEffects);
          ret.sideEffects = /^enc:v\d:/.test(dec) ? '' : dec;
        }
        return ret;
      },
    },
    toObject: {
      getters: true,
      transform: (doc, ret) => {
        if (typeof ret.instructions === 'string' && /^enc:v\d:/.test(ret.instructions)) {
          const dec = decryptField(ret.instructions);
          ret.instructions = /^enc:v\d:/.test(dec) ? '' : dec;
        }
        if (typeof ret.sideEffects === 'string' && /^enc:v\d:/.test(ret.sideEffects)) {
          const dec = decryptField(ret.sideEffects);
          ret.sideEffects = /^enc:v\d:/.test(dec) ? '' : dec;
        }
        return ret;
      },
    },
    runSettersOnQuery: true,
  }
);

medicationSchema.methods.toSafeJSON = function () {
  return this.toJSON();
};

export const Medication = mongoose.model('Medication', medicationSchema);
export default Medication;
