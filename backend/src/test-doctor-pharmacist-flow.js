import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
dotenv.config();

import { User } from './models/User.js';
import { Medication } from './models/Medication.js';
import { DoctorPatientLink } from './models/DoctorPatientLink.js';
import { OtpToken } from './models/OtpToken.js';
import { PrescriptionOrder } from './models/PrescriptionOrder.js';
import { PatientReport } from './models/PatientReport.js';

const BASE_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'production_jwt_super_secret_key_change_in_production_min_32_chars';

const makeCookie = (user) => {
  const token = jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
  return `token=${token}`;
};

const runIntegrationTest = async () => {
  console.log('\n======================================================');
  console.log(' Starting Doctor-Pharmacist-Patient Flow Test');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medsafe_db');

  // Clean up any test users
  const doctorPhone = '+919876543210';
  const patientPhone = '+919876543220';
  const pharmacistPhone = '+919876543230';

  await User.deleteMany({ phone: { $in: [doctorPhone, patientPhone, pharmacistPhone] } });

  // 1. Create Doctor, Patient, Pharmacist
  const doctor = await User.create({
    name: 'Dr. Sarah Jenkins',
    phone: doctorPhone,
    role: 'doctor',
    isPhoneVerified: true,
  });

  const patient = await User.create({
    name: 'Robert Miller',
    phone: patientPhone,
    role: 'patient',
    bloodGroup: 'B+',
    isPhoneVerified: true,
  });

  const pharmacist = await User.create({
    name: 'Priya Sharma, RPh',
    phone: pharmacistPhone,
    role: 'pharmacist',
    isPhoneVerified: true,
  });

  const doctorCookie = makeCookie(doctor);
  const pharmacistCookie = makeCookie(pharmacist);
  const patientCookie = makeCookie(patient);

  console.log('[OK] Created Doctor, Patient, and Pharmacist test accounts.');

  // 2. Doctor searches for patient by phone number
  const searchRes = await fetch(`${BASE_URL}/doctor/search-patients?q=9876543220`, {
    headers: { Cookie: doctorCookie },
  });
  const searchData = await searchRes.json();
  if (!searchData.success || searchData.patients.length === 0) {
    throw new Error('Doctor phone search failed: patient not found.');
  }
  console.log(`[OK] Doctor successfully searched patient by phone number (${searchData.patients[0].name}).`);

  // Doctor links patient
  await fetch(`${BASE_URL}/doctor/add-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ patientId: patient._id.toString() }),
  });

  // 3. Test report access OTP verification
  const otpReqRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/request-access-otp`, {
    method: 'POST',
    headers: { Cookie: doctorCookie },
  });
  const otpReqData = await otpReqRes.json();
  const rawAccessOtp = otpReqData.debugOtp;
  if (!rawAccessOtp) {
    throw new Error('Debug OTP was not returned in dev mode.');
  }

  const grantRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/grant-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ otp: rawAccessOtp }),
  });
  const grantData = await grantRes.json();
  if (!grantData.success || !grantData.isAccessActive) {
    throw new Error('Granting 15-minute access failed.');
  }
  console.log('[OK] Doctor verified patient consent OTP and unlocked 15-minute access window.');

  // 4. Doctor adds a clinical report to the patient's database
  const reportPayload = {
    title: 'Cardiology Assessment & ECG Review',
    reportType: 'consultation',
    diagnosis: 'Mild Stage 1 Hypertension with sinus rhythm',
    clinicalNotes: 'Blood pressure slightly elevated. Advised low-sodium diet and medication regimen.',
    vitals: {
      bloodPressure: '138/88 mmHg',
      heartRate: '76 bpm',
      temperature: '98.4 °F',
      weight: '74 kg',
    },
    recommendations: 'Prescribed Paracetamol 650mg for tension headaches, follow-up in 2 weeks.',
  };

  const addReportRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify(reportPayload),
  });
  const addReportData = await addReportRes.json();
  if (!addReportData.success || !addReportData.report) {
    throw new Error('Failed to add clinical report to patient database.');
  }
  console.log(`[OK] Doctor added clinical report "${addReportData.report.title}" to patient database.`);

  // Verify report is in DB and decrypted in getPatientReports
  const reportsViewRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/reports`, {
    headers: { Cookie: doctorCookie },
  });
  const reportsViewData = await reportsViewRes.json();
  if (!reportsViewData.reports || reportsViewData.reports.length === 0) {
    throw new Error('Clinical report not listed in patient reports dossier.');
  }
  const savedReport = reportsViewData.reports[0];
  if (savedReport.diagnosis !== reportPayload.diagnosis) {
    throw new Error(`Report diagnosis mismatch: got "${savedReport.diagnosis}"`);
  }
  console.log('[OK] Verified clinical report is stored in patient database and correctly decrypted.');

  // 5. Doctor sends medication with power to Pharmacist
  const sendPharmRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/send-to-pharmacist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({
      medicationName: 'Paracetamol',
      power: '650mg',
      dosage: '650mg',
      frequency: 'twice_daily',
      suggestedTimes: ['08:00', '20:00'],
      durationDays: 5,
      instructions: 'Take one tablet after breakfast and after dinner with water.',
      priority: 'routine',
    }),
  });
  const sendPharmData = await sendPharmRes.json();
  if (!sendPharmData.success || !sendPharmData.order) {
    throw new Error('Doctor send to pharmacist failed.');
  }
  const orderId = sendPharmData.order._id;
  console.log(`[OK] Doctor sent prescription for Paracetamol (Power: 650mg) to Pharmacist queue.`);

  // 6. Pharmacist looks up orders using JUST the patient's phone number (NO OTP NEEDED!)
  const cleanPatientDigits = patientPhone.replace(/\D/g, '');
  const pharmLookupRes = await fetch(`${BASE_URL}/pharmacist/orders?phone=${cleanPatientDigits}`, {
    headers: { Cookie: pharmacistCookie },
  });
  const pharmLookupData = await pharmLookupRes.json();
  if (!pharmLookupData.success || pharmLookupData.orders.length === 0) {
    throw new Error('Pharmacist lookup by phone failed: order not found.');
  }
  const retrievedOrder = pharmLookupData.orders.find((o) => o._id.toString() === orderId);
  if (!retrievedOrder) {
    throw new Error('Prescription order missing from pharmacist query results.');
  }
  if (retrievedOrder.power !== '650mg') {
    throw new Error(`Expected power 650mg, got ${retrievedOrder.power}`);
  }
  console.log(`[OK] Pharmacist looked up orders using JUST patient phone number (${patientPhone}) with NO OTP required.`);

  // 7. Pharmacist dispenses medicine and marks medicine provided
  const dispenseRes = await fetch(`${BASE_URL}/pharmacist/orders/${orderId}/dispense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pharmacistCookie },
    body: JSON.stringify({
      power: '650mg',
      times: ['08:00', '20:00'],
      frequency: 'twice_daily',
      advanceDays: 5,
      pharmacyNotes: 'Dispensed original blister pack of 10 tablets.',
    }),
  });
  const dispenseData = await dispenseRes.json();
  if (!dispenseData.success || !dispenseData.medication) {
    throw new Error('Pharmacist dispense failed.');
  }
  console.log('[OK] Pharmacist marked medicine provided and dispensed.');

  // 8. Verify the medication was automatically created and activated in patient's database
  const patientMedsRes = await fetch(`${BASE_URL}/medications`, {
    headers: { Cookie: patientCookie },
  });
  const patientMedsData = await patientMedsRes.json();
  const createdMed = patientMedsData.medications?.find((m) => m.name === 'Paracetamol');
  if (!createdMed) {
    throw new Error('Medication was not added to patient database after pharmacist dispensing.');
  }
  if (createdMed.power !== '650mg' && createdMed.dosage !== '650mg') {
    throw new Error(`Medication dosage/power mismatch: got ${createdMed.power || createdMed.dosage}`);
  }
  if (!createdMed.times?.includes('08:00') || !createdMed.times?.includes('20:00')) {
    throw new Error(`Medication times mismatch: got ${JSON.stringify(createdMed.times)}`);
  }
  if (!createdMed.isActive || createdMed.dispenseStatus !== 'dispensed') {
    throw new Error('Medication isActive or dispenseStatus is invalid.');
  }
  console.log(`[OK] Verified medication is active in patient database with dosage 650mg and schedule [${createdMed.times.join(', ')}].`);

  // 9. Verify Doctor can also use direct doctor prescription with instant OTP flow
  const medOtpRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/request-medication-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ name: 'Amlodipine', dosage: '5mg' }),
  });
  const medOtpData = await medOtpRes.json();
  const rawMedOtp = medOtpData.debugOtp;

  const directRxRes = await fetch(`${BASE_URL}/doctor/patients/${patient._id}/confirm-medication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({
      otp: rawMedOtp,
      medicationData: {
        name: 'Amlodipine',
        dosage: '5mg',
        power: '5mg',
        frequency: 'once_daily',
        times: ['08:00'],
        instructions: 'Take in morning with breakfast.',
      },
    }),
  });
  const directRxData = await directRxRes.json();
  if (!directRxData.success || !directRxData.medication) {
    throw new Error('Direct doctor prescription failed.');
  }
  console.log('[OK] Verified Doctor direct medication assignment with instant OTP also functions seamlessly.');

  // Clean up test users
  await User.deleteMany({ phone: { $in: [doctorPhone, patientPhone, pharmacistPhone] } });
  await Medication.deleteMany({ userId: patient._id });
  await DoctorPatientLink.deleteMany({ doctorId: doctor._id });
  await PrescriptionOrder.deleteMany({ patientId: patient._id });
  await PatientReport.deleteMany({ patientId: patient._id });

  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED.');
  console.log('======================================================\n');
  process.exit(0);
};

runIntegrationTest().catch((err) => {
  console.error('\n[FAIL] Test failed:', err);
  process.exit(1);
});
