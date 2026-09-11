import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const prescriptionOrderSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    doctorName: {
      type: String,
      trim: true,
      default: '',
    },
    doctorPhone: {
      type: String,
      trim: true,
      default: '',
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      trim: true,
      default: '',
    },
    patientPhone: {
      type: String,
      required: [true, 'Patient phone number is required'],
      trim: true,
      index: true,
    },
    orderId: {
      type: String,
      trim: true,
      index: true,
      default: function () {
        return this.patientPhone ? this.patientPhone.trim() : '';
      },
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PharmacyProduct',
      default: null,
    },
    medicationName: {
      type: String,
      required: [true, 'Medication name is required'],
      trim: true,
    },
    power: {
      type: String,
      trim: true,
      default: '', // e.g. "500mg", "650mg", "10mg", "250mg/5ml"
    },
    dosage: {
      type: String,
      trim: true,
      default: '',
    },
    frequency: {
      type: String,
      enum: ['once_daily', 'twice_daily', 'thrice_daily', 'four_times_daily', 'weekly', 'as_needed'],
      default: 'once_daily',
    },
    suggestedTimes: {
      type: [String],
      default: ['08:00'],
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
    totalUnits: {
      type: Number,
      default: null, // auto-calculated: dosage × doses_per_day × duration_days
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    priority: {
      type: String,
      enum: ['routine', 'urgent', 'stat'],
      default: 'routine',
    },
    status: {
      type: String,
      enum: ['sent_to_pharmacy', 'dispensed', 'cancelled'],
      default: 'sent_to_pharmacy',
      index: true,
    },
    pharmacistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pharmacistName: {
      type: String,
      trim: true,
      default: '',
    },
    dispensedAt: {
      type: Date,
      default: null,
    },
    pharmacyNotes: {
      type: String,
      trim: true,
      default: '',
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
        return ret;
      },
    },
  }
);

export const PrescriptionOrder = mongoose.model('PrescriptionOrder', prescriptionOrderSchema);
