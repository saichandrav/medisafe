import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import { initTwilio } from './config/twilio.js';
import authRoutes from './routes/authRoutes.js';
import medicationRoutes from './routes/medicationRoutes.js';
import adherenceRoutes from './routes/adherenceRoutes.js';
import caregiverRoutes from './routes/caregiverRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import pharmacistRoutes from './routes/pharmacistRoutes.js';
import communicationRoutes from './routes/communicationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { startSmsReminderScheduler } from './services/smsReminderService.js';
import { startEmailReminderScheduler } from './services/emailReminderService.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Parse and normalize CLIENT_URL (handles comma-separated lists and removes trailing slashes)
const rawClientUrls = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((u) => u.trim().replace(/\/+$/, ''))
  : [];

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'https://medisafe-frontend.onrender.com',
];

const allowedOrigins = Array.from(new Set([...rawClientUrls, ...defaultAllowedOrigins]));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server, curl, Postman) where origin is undefined
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');

    try {
      const urlObj = new URL(cleanOrigin);
      const isAllowed =
        allowedOrigins.includes(cleanOrigin) ||
        /^http:\/\/localhost(:\d+)?$/.test(cleanOrigin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin) ||
        urlObj.hostname.endsWith('.onrender.com') ||
        urlObj.hostname.endsWith('.vercel.app');

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`[CORS Blocked] Origin not allowed: ${cleanOrigin}`);
        callback(null, false);
      }
    } catch {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  optionsSuccessStatus: 204,
};

// 1. CORS registered first to handle all origins and preflight requests
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 2. Helmet security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/adherence', adherenceRoutes);
app.use('/api/caregivers', caregiverRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/pharmacist', pharmacistRoutes);
app.use('/api/communications', communicationRoutes);
app.use('/api/reports', reportRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'MedSafe Medication Management API',
    status: 'Running',
    version: '1.0.0',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const startServer = async () => {
  try {
    await connectDB();
    initTwilio();
    startSmsReminderScheduler();
    startEmailReminderScheduler();

    app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`  MedSafe Server running on port ${PORT}`);
      console.log(`  API: http://localhost:${PORT}/api`);
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
