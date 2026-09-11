import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Medication } from './models/Medication.js';
import { OtpToken } from './models/OtpToken.js';
import { DoctorPatientLink } from './models/DoctorPatientLink.js';

const JWT_SECRET = process.env.JWT_SECRET || 'production_jwt_super_secret_key_change_in_production_min_32_chars';
const baseUrl = 'http://localhost:5000/api';

async function runDoctorIntegrationTest() {
  console.log('--- Connecting to DB to prepare test doctor & patient ---');
  await connectDB();

  // Create or update test doctor
  const doctorPhone = '+919999900001';
  let doctor = await User.findOne({ phone: doctorPhone });
  if (!doctor) {
    doctor = await User.create({
      phone: doctorPhone,
      name: 'Dr. Ramesh Sharma',
      email: 'dr.sharma@medsafe.org',
      role: 'doctor',
      isProfileComplete: true,
    });
  } else {
    doctor.role = 'doctor';
    doctor.name = 'Dr. Ramesh Sharma';
    await doctor.save();
  }

  // Create or update test patient
  const patientPhone = '+919999900002';
  let patient = await User.findOne({ phone: patientPhone });
  if (!patient) {
    patient = await User.create({
      phone: patientPhone,
      name: 'Anita Verma',
      email: 'anita.verma@example.com',
      role: 'patient',
      bloodGroup: 'B+',
      isProfileComplete: true,
    });
  } else {
    patient.name = 'Anita Verma';
    patient.role = 'patient';
    await patient.save();
  }

  const doctorToken = jwt.sign({ id: doctor._id, phone: doctor.phone }, JWT_SECRET, { expiresIn: '1h' });
  const authHeader = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${doctorToken}`,
  };

  console.log('\n1. Testing Patient Search (GET /api/doctor/search-patients?q=Anita)...');
  const searchRes = await fetch(`${baseUrl}/doctor/search-patients?q=Anita`, { headers: authHeader });
  const searchData = await searchRes.json();
  console.log('Search Response:', searchData);
  if (!searchData.success || searchData.patients.length === 0) {
    throw new Error('Patient search failed');
  }
  console.log('[OK] Patient found:', searchData.patients[0].name);

  console.log('\n2. Testing Add Patient to Doctor Roster (POST /api/doctor/add-patient)...');
  const addRes = await fetch(`${baseUrl}/doctor/add-patient`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ patientId: patient._id, notes: 'Hypertension monitoring' }),
  });
  const addData = await addRes.json();
  console.log('Add Patient Response:', addData);
  if (!addData.success) throw new Error('Add patient failed: ' + addData.message);
  console.log('[OK] Patient added to roster successfully');

  console.log('\n3. Testing Request Medication OTP (POST /api/doctor/patients/:id/request-medication-otp)...');
  const reqOtpRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/request-medication-otp`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ name: 'Amlodipine', dosage: '5mg' }),
  });
  const reqOtpData = await reqOtpRes.json();
  console.log('Request OTP Response:', reqOtpData);
  if (!reqOtpData.success) throw new Error('Request OTP failed');

  // Fetch generated OTP from database for testing
  const otpDoc = await OtpToken.findOne({ phone: patient.phone, purpose: 'medication_consent' });
  if (!otpDoc) throw new Error('OTP was not stored in database');
  console.log('[OK] Medication consent OTP record found for patient');

  // If debugOtp was provided, verify it works
  const debugOtp = reqOtpData.debugOtp;
  console.log('Using OTP:', debugOtp);

  console.log('\n4. Testing Confirm Medication with OTP (POST /api/doctor/patients/:id/confirm-medication)...');
  const confirmRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/confirm-medication`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      otp: debugOtp,
      medicationData: {
        name: 'Amlodipine',
        dosage: '5mg',
        frequency: 'once_daily',
        times: ['08:00'],
        instructions: 'Take 1 tablet in morning after breakfast',
      },
    }),
  });
  const confirmData = await confirmRes.json();
  console.log('Confirm Medication Response:', confirmData);
  if (!confirmData.success || !confirmData.medication) {
    throw new Error('Confirm medication failed: ' + JSON.stringify(confirmData));
  }
  console.log('[OK] Prescription authorized and created: Med ID', confirmData.medication._id);

  console.log('\n5. Testing Clinical Reports & Tracking (GET /api/doctor/patients/:id/reports)...');
  const reportRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/reports?days=7`, {
    headers: authHeader,
  });
  const reportData = await reportRes.json();
  console.log('Report Response Stats:', reportData.stats);
  console.log('Patient Medications Count:', reportData.medications?.length);
  if (!reportData.success || reportData.medications.length === 0) {
    throw new Error('Get reports failed');
  }
  console.log('[OK] Clinical report successfully retrieved');

  console.log('\n6. Testing Adjust Dosage (PATCH /api/doctor/medications/:id/dosage)...');
  const adjustRes = await fetch(`${baseUrl}/doctor/medications/${confirmData.medication._id}/dosage`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({
      newDosage: '10mg',
      reason: 'Titrated up for blood pressure control',
    }),
  });
  const adjustData = await adjustRes.json();
  console.log('Adjust Dosage Response:', adjustData);
  if (!adjustData.success || adjustData.medication.dosage !== '10mg') {
    throw new Error('Adjust dosage failed: ' + JSON.stringify(adjustData));
  }
  console.log('[OK] Dosage adjusted to 10mg successfully');

  console.log('\n7. Testing Update Medication (PUT /api/doctor/medications/:id)...');
  const updateMedRes = await fetch(`${baseUrl}/doctor/medications/${confirmData.medication._id}`, {
    method: 'PUT',
    headers: authHeader,
    body: JSON.stringify({
      name: 'Amlodipine Besylate',
      dosage: '10mg',
      frequency: 'twice_daily',
      times: ['08:00', '20:00'],
      instructions: 'Take 1 tablet after breakfast and dinner',
    }),
  });
  const updateMedData = await updateMedRes.json();
  console.log('Update Medication Response:', updateMedData);
  if (!updateMedData.success || updateMedData.medication.name !== 'Amlodipine Besylate') {
    throw new Error('Update medication failed: ' + JSON.stringify(updateMedData));
  }
  console.log('[OK] Medication full edit successfully updated to:', updateMedData.medication.name);

  console.log('\n8. Testing Report Access Expiration & Locking...');
  // Artificially expire the doctor-patient access window
  await DoctorPatientLink.updateOne(
    { doctorId: doctor._id, patientId: patient._id },
    { accessExpiresAt: new Date(Date.now() - 1000) }
  );

  const lockedRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/reports?days=7`, {
    headers: authHeader,
  });
  const lockedData = await lockedRes.json();
  console.log('Locked Reports Response:', {
    success: lockedData.success,
    isAccessExpired: lockedData.isAccessExpired,
    patientFound: Boolean(lockedData.patient?.name),
    medicationsLength: lockedData.medications?.length,
  });
  if (!lockedData.success || !lockedData.isAccessExpired || lockedData.medications.length !== 0) {
    throw new Error('Expired access was not locked correctly!');
  }
  if (!lockedData.patient?.name) {
    throw new Error('Patient profile was not returned in locked state!');
  }
  console.log('[OK] Verified: Patient profile is returned while clinical reports are securely locked when expired');

  console.log('\n9. Testing Request Report Access OTP (POST /api/doctor/patients/:id/request-access-otp)...');
  const reqAccessOtpRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/request-access-otp`, {
    method: 'POST',
    headers: authHeader,
  });
  const reqAccessOtpData = await reqAccessOtpRes.json();
  console.log('Request Access OTP Response:', reqAccessOtpData);
  if (!reqAccessOtpData.success || !reqAccessOtpData.debugOtp) {
    throw new Error('Failed to request report access OTP: ' + JSON.stringify(reqAccessOtpData));
  }
  console.log('[OK] Report access OTP successfully dispatched:', reqAccessOtpData.debugOtp);

  console.log('\n10. Testing Grant Report Access with OTP (POST /api/doctor/patients/:id/grant-access)...');
  const grantAccessRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/grant-access`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ otp: reqAccessOtpData.debugOtp }),
  });
  const grantAccessData = await grantAccessRes.json();
  console.log('Grant Access Response:', grantAccessData);
  if (!grantAccessData.success || !grantAccessData.accessExpiresAt || !grantAccessData.isAccessActive) {
    throw new Error('Grant report access failed: ' + JSON.stringify(grantAccessData));
  }
  const remainingMinutes = Math.round((new Date(grantAccessData.accessExpiresAt).getTime() - Date.now()) / 60000);
  console.log(`[OK] 1-hour access successfully granted! Access expires in ~${remainingMinutes} minutes.`);

  console.log('\n11. Testing Re-querying Reports with Active 1-Hour Access...');
  const unlockedRes = await fetch(`${baseUrl}/doctor/patients/${patient._id}/reports?days=7`, {
    headers: authHeader,
  });
  const unlockedData = await unlockedRes.json();
  console.log('Unlocked Reports Response:', {
    isAccessExpired: unlockedData.isAccessExpired,
    medicationsCount: unlockedData.medications?.length,
  });
  if (!unlockedData.success || unlockedData.isAccessExpired || unlockedData.medications.length === 0) {
    throw new Error('Reports did not unlock after OTP verification!');
  }
  console.log('[OK] Verified: Clinical reports successfully unlocked with verified 1-hour window');

  console.log('\n=========================================');
  console.log('DOCTOR DASHBOARD & 1-HOUR ACCESS FLOW 100% VERIFIED! [OK] ');
  console.log('=========================================');
  process.exit(0);
}

runDoctorIntegrationTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
