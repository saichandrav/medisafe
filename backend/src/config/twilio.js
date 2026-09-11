import dotenv from 'dotenv';
dotenv.config();
import twilio from 'twilio';

let twilioClient = null;

export const getTwilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  const isConfigured = Boolean(
    accountSid &&
    authToken &&
    !accountSid.includes('your_twilio_') &&
    !authToken.includes('your_twilio_') &&
    accountSid.startsWith('AC')
  );

  return {
    accountSid,
    authToken,
    verifySid: verifySid && !verifySid.includes('your_twilio_') ? verifySid : null,
    phoneNumber: phoneNumber && !phoneNumber.includes('+1234567890') ? phoneNumber : null,
    isConfigured
  };
};

export const initTwilio = () => {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    console.warn('[Twilio] Credentials not fully configured in .env. Real SMS dispatch will require valid TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    return null;
  }

  try {
    twilioClient = twilio(config.accountSid, config.authToken);
    console.log('[Twilio] SDK initialized successfully.');
    if (config.verifySid) {
      console.log(`[Twilio] Verify Service enabled: ${config.verifySid.slice(0, 6)}...`);
    } else if (config.phoneNumber) {
      console.log(`[Twilio] Programmable SMS mode enabled using sender: ${config.phoneNumber}`);
    }
    return twilioClient;
  } catch (error) {
    console.error(`[Twilio] Initialization error: ${error.message}`);
    return null;
  }
};

export const getClient = () => {
  if (!twilioClient) {
    return initTwilio();
  }
  return twilioClient;
};

/**
 * Normalizes phone numbers to standard E.164 international format (+[country_code][number]).
 * Defaults to Indian standard +91 if 10 digits provided without prefix.
 */
export const normalizePhoneNumber = (rawPhone) => {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Remove spaces, dashes, parentheses
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('+')) {
    // Already in international format
    const digitsOnly = cleaned.slice(1);
    if (!/^\d{10,15}$/.test(digitsOnly)) {
      throw new Error('Invalid international phone number format. Must contain 10-15 digits.');
    }
    return cleaned;
  }

  // If 10 digits (Standard Indian format like 9876543210), prefix +91
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // If starts with 0 and 11 digits (e.g. 09876543210)
  if (/^0\d{10}$/.test(cleaned)) {
    return `+91${cleaned.slice(1)}`;
  }

  // If 12 digits starting with 91
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  throw new Error('Invalid phone number format. Please provide a valid 10-digit mobile number or standard E.164 number with country code (+91XXXXXXXXXX).');
};
