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
import { apiLimiter } from './middleware/rateLimiter.js';
import { startSmsReminderScheduler } from './services/smsReminderService.js';
import { startEmailReminderScheduler } from './services/emailReminderService.js';

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('http://localhost') || origin === CLIENT_URL) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed from origin: ' + origin));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

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
