import dotenv from 'dotenv';
dotenv.config();
import nodemailer from 'nodemailer';

let transporter = null;
let isEthereal = false;

export const initEmailTransporter = async () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const rawPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : null;
  const pass = rawPass ? rawPass.replace(/\s+/g, '') : null;

  if (user && pass) {
    try {
      const isGmail = host.includes('gmail') || user.endsWith('@gmail.com');
      const transportOptions = isGmail
        ? {
            service: 'gmail',
            auth: { user, pass },
          }
        : {
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
          };

      transporter = nodemailer.createTransport(transportOptions);
      await transporter.verify();
      console.log(`[Email] SMTP Transporter connected as ${user} (${isGmail ? 'Gmail Service' : `${host}:${port}`})`);
      isEthereal = false;
      return transporter;
    } catch (err) {
      console.warn(`[Email] SMTP verification failed: ${err.message}. Falling back to Ethereal test inbox...`);
    }
  }

  // Fallback: Automated Ethereal test account (real emails with instant preview URL)
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    isEthereal = true;
    console.log(`[Email] Ethereal test transporter initialized (${testAccount.user}). Instant preview URLs enabled.`);
    return transporter;
  } catch (etherealErr) {
    console.warn(`[Email] Could not create Ethereal account: ${etherealErr.message}. Initializing jsonTransport fallback.`);
    transporter = nodemailer.createTransport({ jsonTransport: true });
    isEthereal = false;
    return transporter;
  }
};

export const getEmailTransporter = async () => {
  dotenv.config();
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : null;

  // Upgrade immediately to real SMTP if credentials are configured
  if (!transporter || (isEthereal && user && pass)) {
    return await initEmailTransporter();
  }
  return transporter;
};

export const getEmailFrom = () => {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || '"MedSafe Alerts" <alerts@medsafe.health>';
};

export const isEtherealAccount = () => isEthereal;

export default {
  initEmailTransporter,
  getEmailTransporter,
  getEmailFrom,
  isEtherealAccount,
};
