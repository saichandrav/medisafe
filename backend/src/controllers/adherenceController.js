import { AdherenceLog } from '../models/AdherenceLog.js';
import { Medication } from '../models/Medication.js';

// POST /api/adherence
export const logAdherence = async (req, res) => {
  try {
    const { medicationId, scheduledTime, status, notes } = req.body;

    if (!medicationId || !scheduledTime || !status) {
      return res.status(400).json({ success: false, message: 'medicationId, scheduledTime, and status are required.' });
    }

    if (!['taken', 'missed', 'skipped', 'late'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use: taken, missed, skipped, late.' });
    }

    // Verify medication belongs to user
    const med = await Medication.findOne({ _id: medicationId, userId: req.user._id });
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medication not found.' });
    }

    const schedDate = new Date(scheduledTime);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - schedDate.getTime()) / (60 * 1000));

    // Guard: Prevent updating upcoming medications before their scheduled time arrives
    if (diffMins < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot update upcoming medication. Dose scheduled for ${schedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} can only be logged once its scheduled time arrives.`,
      });
    }

    let finalStatus = status;
    let finalNotes = notes || '';

    // Rule: If late by 3 hours, mark the medication automatically skipped
    // Rule: If time crosses above 10 min, medication marked as late
    if (status === 'taken' || status === 'late') {
      if (diffMins >= 180) {
        finalStatus = 'skipped';
        finalNotes = finalNotes ? `${finalNotes} (Auto-skipped: 3+ hours late)` : 'Auto-skipped: Not taken within 3-hour window';
      } else if (diffMins > 10) {
        finalStatus = 'late';
        finalNotes = finalNotes || `Taken ${diffMins} minutes past scheduled time (Late)`;
      } else {
        finalStatus = 'taken';
      }
    }

    // Upsert — update if already exists, create if not
    const log = await AdherenceLog.findOneAndUpdate(
      { userId: req.user._id, medicationId, scheduledTime: schedDate },
      {
        userId: req.user._id,
        medicationId,
        scheduledTime: schedDate,
        status: finalStatus,
        takenAt: finalStatus === 'taken' || finalStatus === 'late' ? now : null,
        notes: finalNotes,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: `Dose marked as ${finalStatus}${finalStatus !== status ? ' (adjusted according to schedule intake window)' : ''}.`,
      log,
    });
  } catch (err) {
    console.error('[logAdherence]', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Adherence already logged for this dose.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to log adherence.' });
  }
};

// GET /api/adherence/today
export const getTodayAdherence = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const logs = await AdherenceLog.find({
      userId: req.user._id,
      scheduledTime: { $gte: todayStart, $lt: todayEnd },
    }).populate('medicationId', 'name dosage');

    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch adherence.' });
  }
};

// Helper: Unified adherence analytics computation (single source of truth)
async function computeAdherenceDataset(userId, days = 7, medicationId = null) {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  startDate.setHours(0, 0, 0, 0);

  const query = {
    userId,
    scheduledTime: { $gte: startDate },
  };
  if (medicationId) {
    query.medicationId = medicationId;
  }

  const logs = await AdherenceLog.find(query)
    .populate('medicationId', 'name dosage power frequency times instructions')
    .sort({ scheduledTime: -1 });

  // 1. Overall stats
  const total = logs.length;
  const taken = logs.filter((l) => l.status === 'taken' || l.status === 'late').length;
  const missed = logs.filter((l) => l.status === 'missed').length;
  const skipped = logs.filter((l) => l.status === 'skipped').length;
  const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

  // 2. Trend analysis (day-by-day buckets)
  const dayMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    const monthShort = d.toLocaleString('en-US', { month: 'short' });
    const dayNum = d.getDate();
    dayMap[key] = {
      date: key,
      label: `${monthShort} ${dayNum}`,
      dayOfWeek: d.toLocaleString('en-US', { weekday: 'short' }),
      total: 0,
      taken: 0,
      missed: 0,
      skipped: 0,
    };
  }

  for (const log of logs) {
    const key = new Date(log.scheduledTime).toISOString().split('T')[0];
    if (dayMap[key]) {
      dayMap[key].total++;
      if (log.status === 'taken' || log.status === 'late') dayMap[key].taken++;
      else if (log.status === 'missed') dayMap[key].missed++;
      else if (log.status === 'skipped') dayMap[key].skipped++;
    }
  }
  const trend = Object.values(dayMap);

  // 3. Per-Medication Breakdown
  const medMap = {};
  for (const log of logs) {
    const med = log.medicationId;
    const medId = med?._id?.toString() || 'unknown';
    const medName = med?.name || 'Unknown Medication';
    const medDosage = med?.dosage || '';

    if (!medMap[medId]) {
      medMap[medId] = {
        medicationId: medId,
        name: medName,
        dosage: medDosage,
        total: 0,
        taken: 0,
        missed: 0,
        skipped: 0,
      };
    }
    medMap[medId].total++;
    if (log.status === 'taken' || log.status === 'late') medMap[medId].taken++;
    else if (log.status === 'missed') medMap[medId].missed++;
    else if (log.status === 'skipped') medMap[medId].skipped++;
  }

  const perMedication = Object.values(medMap).map((m) => ({
    ...m,
    adherenceRate: m.total > 0 ? Math.round((m.taken / m.total) * 100) : 100,
  }));

  // 4. Streaks: Query broader log history (up to 60 days) to compute current & longest streaks
  const streakStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const allLogs = await AdherenceLog.find({
    userId,
    scheduledTime: { $gte: streakStartDate },
  }).sort({ scheduledTime: 1 });

  const dateStatusMap = {};
  for (const log of allLogs) {
    const dStr = new Date(log.scheduledTime).toISOString().split('T')[0];
    if (!dateStatusMap[dStr]) {
      dateStatusMap[dStr] = { total: 0, taken: 0 };
    }
    dateStatusMap[dStr].total++;
    if (log.status === 'taken' || log.status === 'late') {
      dateStatusMap[dStr].taken++;
    }
  }

  let currentStreak = 0;
  let longestStreak = 0;
  let runningStreak = 0;

  const sortedDates = Object.keys(dateStatusMap).sort();
  for (const dStr of sortedDates) {
    const info = dateStatusMap[dStr];
    if (info.total > 0 && info.taken === info.total) {
      runningStreak++;
      if (runningStreak > longestStreak) {
        longestStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
    }
  }

  // Calculate current streak backwards from today or yesterday
  const todayKey = now.toISOString().split('T')[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = yesterday.toISOString().split('T')[0];

  let checkDate = new Date(now);
  if (!dateStatusMap[todayKey] || dateStatusMap[todayKey].total === 0) {
    // If no doses yet for today, check from yesterday
    checkDate = yesterday;
  }

  for (let i = 0; i < 60; i++) {
    const dStr = checkDate.toISOString().split('T')[0];
    const info = dateStatusMap[dStr];
    if (info && info.total > 0 && info.taken === info.total) {
      currentStreak++;
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  return {
    stats: { total, taken, missed, skipped, adherenceRate, days },
    overallAdherence: adherenceRate,
    logs,
    history: logs,
    perMedication,
    trend,
    streak: {
      current: currentStreak,
      longest: Math.max(longestStreak, currentStreak),
    },
    days,
  };
}

// GET /api/adherence/history?days=7&medicationId=...
export const getAdherenceHistory = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const medicationId = req.query.medicationId || null;
    const dataset = await computeAdherenceDataset(req.user._id, days, medicationId);
    return res.json({ success: true, ...dataset });
  } catch (err) {
    console.error('[getAdherenceHistory]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch history.' });
  }
};

// GET /api/adherence/stats?days=7&medicationId=...
export const getAdherenceStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const medicationId = req.query.medicationId || null;
    const dataset = await computeAdherenceDataset(req.user._id, days, medicationId);
    return res.json({ success: true, ...dataset });
  } catch (err) {
    console.error('[getAdherenceStats]', err);
    return res.status(500).json({ success: false, message: 'Failed to compute stats.' });
  }
};
