import jwt from 'jsonwebtoken';
import { normalizePhoneNumber, getTwilioConfig } from './config/twilio.js';

console.log('--- Testing Phone Number Normalization ---');
const testCases = [
  { input: '9876543210', expected: '+919876543210' },
  { input: '+919876543210', expected: '+919876543210' },
  { input: '09876543210', expected: '+919876543210' },
  { input: '+14155552671', expected: '+14155552671' },
];

let allPassed = true;
for (const tc of testCases) {
  const res = normalizePhoneNumber(tc.input);
  if (res === tc.expected) {
    console.log(`[OK] Passed: "${tc.input}" -> "${res}"`);
  } else {
    console.error(` Failed: "${tc.input}" -> got "${res}", expected "${tc.expected}"`);
    allPassed = false;
  }
}

console.log('\n--- Testing Registration Token Flow ---');
const secret = 'test_registration_secret_key_1234567890';
const token = jwt.sign(
  { phone: '+919876543210', stage: 'complete_profile', verifiedAt: Date.now() },
  secret,
  { expiresIn: '15m' }
);
console.log('Generated Registration Token:', token.slice(0, 30) + '...');

const decoded = jwt.verify(token, secret);
console.log('[OK] Token decoded successfully:', decoded.phone, 'Stage:', decoded.stage);

console.log('\n--- Twilio Configuration Check ---');
const twilioConfig = getTwilioConfig();
console.log('Twilio Config Status:', twilioConfig);

console.log('\n=========================================');
console.log(allPassed ? 'ALL UNIT TESTS PASSED SUCCESSFULLY! [OK] ' : 'TESTS FAILED');
console.log('=========================================');
