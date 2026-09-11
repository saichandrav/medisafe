import mongoose from 'mongoose';
import { encryptField, decryptField } from '../utils/encryption.js';

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'caregiver', 'pharmacist', 'admin'],
      default: 'patient',
    },
    dateOfBirth: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      enum: ['', 'male', 'female', 'other'],
      default: '',
    },
    bloodGroup: {
      type: String,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    emergencyContact: {
      type: String,
      default: '',
      set: encryptField,
      get: decryptField,
    },
    avatar: {
      type: String,
      default: '',
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { getters: true },
    runSettersOnQuery: true,
  }
);

userSchema.methods.toPublicProfile = function () {
  return {
    id: this._id,
    phone: this.phone,
    name: this.name,
    email: this.email,
    isProfileComplete: this.isProfileComplete,
    role: this.role,
    dateOfBirth: this.dateOfBirth,
    gender: this.gender,
    bloodGroup: this.bloodGroup,
    emergencyContact: this.emergencyContact,
    avatar: this.avatar,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
