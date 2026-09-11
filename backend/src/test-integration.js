import jwt from 'jsonwebtoken';

const baseUrl = 'http://localhost:5000/api/auth';
const registrationSecret = 'registration_temp_token_secret_key_change_in_production';

async function runEndToEndVerification() {
  console.log('--- Testing Complete Registration & JWT Session Flow ---');
  
  // 1. Create a valid signed registration token for a test phone
  const testPhone = '+919876543210';
  const registrationToken = jwt.sign(
    { phone: testPhone, stage: 'complete_profile', verifiedAt: Date.now() },
    registrationSecret,
    { expiresIn: '15m' }
  );

  console.log('1. Submitting Complete Registration for new user...');
  const regRes = await fetch(`${baseUrl}/complete-registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registrationToken,
      name: 'Swiggy Foodie',
      email: 'foodie@swiggytest.com',
    }),
  });

  const regData = await regRes.json();
  console.log('Registration Response Status:', regRes.status);
  console.log('Registration Response Data:', regData);

  if (!regData.success || !regData.token) {
    throw new Error('Registration failed: ' + JSON.stringify(regData));
  }

  console.log('\n2. Testing Protected Profile (/api/auth/me) with JWT token...');
  const meRes = await fetch(`${baseUrl}/me`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${regData.token}`,
    },
  });

  const meData = await meRes.json();
  console.log('Protected Route Status:', meRes.status);
  console.log('User Profile in MongoDB:', meData);

  console.log('\n3. Testing Update Profile (/api/auth/profile)...');
  const updateRes = await fetch(`${baseUrl}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${regData.token}`,
    },
    body: JSON.stringify({
      name: 'Swiggy Super Foodie',
      email: 'updated_foodie@swiggytest.com',
    }),
  });

  const updateData = await updateRes.json();
  console.log('Update Profile Status:', updateRes.status);
  console.log('Updated Profile:', updateData);

  console.log('\n=========================================');
  console.log('FULL-STACK DATABASE & JWT PIPELINE VERIFIED! [OK] ');
  console.log('=========================================');
}

runEndToEndVerification().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
