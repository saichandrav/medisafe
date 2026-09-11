import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PharmacyProduct } from '../models/PharmacyProduct.js';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medsafe_db';

const BASIC_MEDICATIONS = [
  {
    name: 'Dolo 650',
    genericName: 'Paracetamol',
    power: '650mg',
    category: 'Tablet',
    manufacturer: 'Micro Labs Ltd',
    quantity: 250,
    inStock: true,
    description: 'Analgesic and antipyretic for moderate fever, body ache, and mild inflammatory pain. Take with water after food.',
    sideEffects: 'Rare mild nausea if taken without food; safe when taken within prescribed limit (max 3g/day).',
  },
  {
    name: 'Paracetamol',
    genericName: 'Acetaminophen / Paracetamol',
    power: '500mg',
    category: 'Tablet',
    manufacturer: 'GSK Pharmaceuticals',
    quantity: 300,
    inStock: true,
    description: 'Standard fast-acting fever reducer and acute pain reliever.',
    sideEffects: 'Avoid alcohol during course; do not exceed daily liver safety limit.',
  },
  {
    name: 'Amoxicillin',
    genericName: 'Amoxicillin Trihydrate',
    power: '500mg',
    category: 'Capsule',
    manufacturer: 'Cipla Ltd',
    quantity: 160,
    inStock: true,
    description: 'Broad-spectrum beta-lactam antibiotic for bacterial respiratory, ENT, and dental infections.',
    sideEffects: 'Mild stomach upset, loose stools. Complete full prescribed course.',
  },
  {
    name: 'Pantoprazole',
    genericName: 'Pantoprazole Sodium',
    power: '40mg',
    category: 'Tablet',
    manufacturer: 'Sun Pharma',
    quantity: 220,
    inStock: true,
    description: 'Proton pump inhibitor (PPI) for gastric acid reflux, GERD, and stomach ulcer prophylaxis. Take 30 mins before morning breakfast.',
    sideEffects: 'Mild headache or dry mouth.',
  },
  {
    name: 'Cetirizine',
    genericName: 'Cetirizine Hydrochloride',
    power: '10mg',
    category: 'Tablet',
    manufacturer: "Dr. Reddy's Laboratories",
    quantity: 180,
    inStock: true,
    description: 'Second-generation antihistamine for seasonal allergic rhinitis, watery eyes, sneezing, and skin urticaria.',
    sideEffects: 'Mild daytime drowsiness in sensitive individuals; best taken at bedtime.',
  },
  {
    name: 'Azithromycin',
    genericName: 'Azithromycin Dihydrate',
    power: '500mg',
    category: 'Tablet',
    manufacturer: 'Zydus Cadila',
    quantity: 120,
    inStock: true,
    description: 'Macrolide antibiotic 3-day or 5-day course for upper and lower respiratory tract infections.',
    sideEffects: 'Mild abdominal cramping or nausea.',
  },
  {
    name: 'Metformin',
    genericName: 'Metformin Hydrochloride',
    power: '500mg',
    category: 'Tablet',
    manufacturer: 'USV Pvt Ltd',
    quantity: 240,
    inStock: true,
    description: 'First-line biguanide oral antihyperglycemic for Type 2 Diabetes management. Take immediately with or after meals.',
    sideEffects: 'Initial gastrointestinal discomfort or metallic taste; resolves within days.',
  },
  {
    name: 'ORS Electrolyte Salts',
    genericName: 'Oral Rehydration Salts IP',
    power: '21.8g Sachet',
    category: 'Other',
    manufacturer: 'FDC Ltd',
    quantity: 350,
    inStock: true,
    description: 'WHO-formula electrolyte rehydration formula for dehydration, acute gastroenteritis, and heat exhaustion. Dissolve 1 sachet in 1 liter clean drinking water.',
    sideEffects: 'None when mixed with correct proportion of clean water.',
  },
];

async function seedCatalog() {
  try {
    console.log('Connecting to MongoDB at:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);

    // Find a pharmacist in the database to link as default listing pharmacist
    const pharmacist = await mongoose.connection.collection('users').findOne({ role: 'pharmacist' });
    const pharmacistId = pharmacist?._id || null;
    const pharmacistName = pharmacist?.name || 'MedSafe Main Dispensary';

    console.log(`Linking catalog to Pharmacist: ${pharmacistName}`);

    for (const item of BASIC_MEDICATIONS) {
      await PharmacyProduct.findOneAndUpdate(
        { name: item.name, power: item.power },
        {
          ...item,
          pharmacistId,
          pharmacistName,
        },
        { upsert: true, new: true }
      );
      console.log(`[OK] Catalog item seeded: ${item.name} (${item.power}) - [${item.category}]`);
    }

    const total = await PharmacyProduct.countDocuments();
    console.log(`\nSuccessfully seeded pharmacy catalog! Total products: ${total}`);
  } catch (err) {
    console.error('Failed to seed catalog:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedCatalog();
