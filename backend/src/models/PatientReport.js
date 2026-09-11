import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const patientReportSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
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
    title: {
      type: String,
      required: [true, 'Report title is required'],
      trim: true,
    },
    reportType: {
      type: String,
      enum: [
        'bp_report',
        'sugar_report',
        'lab_report',
        'radiology',
        'consultation',
        'diagnosis',
        'progress_note',
        'discharge_summary',
      ],
      default: 'bp_report',
    },
    testDate: {
      type: Date,
      default: Date.now,
    },
    attachment: {
      fileName: { type: String, default: '' },
      fileType: { type: String, default: '' },
      fileData: { type: String, default: '' }, // Data URI / Base64
      fileSize: { type: Number, default: 0 },
    },
    diagnosis: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    clinicalNotes: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    vitals: {
      bloodPressure: { type: String, default: '' }, // e.g. "120/80 mmHg"
      systolic: { type: String, default: '' },      // e.g. "120"
      diastolic: { type: String, default: '' },     // e.g. "80"
      heartRate: { type: String, default: '' },     // e.g. "72 bpm"
      temperature: { type: String, default: '' },   // e.g. "98.6 °F"
      bloodSugar: { type: String, default: '' },    // e.g. "110 mg/dL"
      fastingSugar: { type: String, default: '' },  // e.g. "95 mg/dL"
      postPrandialSugar: { type: String, default: '' }, // e.g. "135 mg/dL"
      hba1c: { type: String, default: '' },         // e.g. "5.7 %"
      weight: { type: String, default: '' },        // e.g. "70 kg"
    },
    recommendations: {
      type: String,
      trim: true,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    status: {
      type: String,
      default: 'final',
    },
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      transform: (doc, ret) => {
        ['diagnosis', 'clinicalNotes', 'recommendations'].forEach((field) => {
          if (typeof ret[field] === 'string' && /^enc:v\d:/.test(ret[field])) {
            const dec = decryptField(ret[field]);
            ret[field] = /^enc:v\d:/.test(dec) ? '' : dec;
          }
        });
        return ret;
      },
    },
    toObject: {
      getters: true,
      transform: (doc, ret) => {
        ['diagnosis', 'clinicalNotes', 'recommendations'].forEach((field) => {
          if (typeof ret[field] === 'string' && /^enc:v\d:/.test(ret[field])) {
            const dec = decryptField(ret[field]);
            ret[field] = /^enc:v\d:/.test(dec) ? '' : dec;
          }
        });
        return ret;
      },
    },
  }
);

export const PatientReport = mongoose.model('PatientReport', patientReportSchema);
