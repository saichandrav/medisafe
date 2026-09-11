import mongoose from 'mongoose';

const pharmacyProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
      index: true,
    },
    genericName: {
      type: String,
      trim: true,
      default: '',
    },
    power: {
      type: String,
      required: [true, 'Power / strength is required (e.g. 650mg, 500mg)'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'],
      default: 'Tablet',
    },
    manufacturer: {
      type: String,
      trim: true,
      default: '',
    },
    quantity: {
      type: Number,
      default: 100,
      min: 0,
    },
    inStock: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    sideEffects: {
      type: String,
      trim: true,
      default: '',
    },
    pharmacistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pharmacistName: {
      type: String,
      trim: true,
      default: 'Hospital Dispensary',
    },
  },
  {
    timestamps: true,
  }
);

// Search index for instant catalog lookup by name, generic name, manufacturer, and power
pharmacyProductSchema.index({ name: 'text', genericName: 'text', manufacturer: 'text', power: 'text' });

export const PharmacyProduct = mongoose.model('PharmacyProduct', pharmacyProductSchema);
