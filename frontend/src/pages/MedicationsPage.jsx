import React, { useState, useEffect } from 'react';
import { medApi, adherenceApi } from '../services/api';
import { sanitizeHealthText } from '../utils/sanitize';

const FREQUENCY_OPTIONS = [
  { value: 'once_daily', label: 'Once Daily', times: ['08:00'] },
  { value: 'twice_daily', label: 'Twice Daily', times: ['08:00', '20:00'] },
  { value: 'thrice_daily', label: 'Thrice Daily', times: ['08:00', '14:00', '20:00'] },
  { value: 'four_times_daily', label: 'Four Times Daily', times: ['08:00', '12:00', '16:00', '20:00'] },
  { value: 'weekly', label: 'Weekly', times: ['08:00'] },
  { value: 'as_needed', label: 'As Needed', times: [] },
];

const emptyForm = {
  name: '',
  dosage: '',
  frequency: 'once_daily',
  times: ['08:00'],
  prescribedBy: '',
  pharmacy: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  instructions: '',
  refillDate: '',
  sideEffects: '',
};

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const todayStr = getTodayStr();
  if (dateStr === todayStr) {
    return 'Today (' + dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ')';
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (dateStr === yStr) {
    return 'Yesterday (' + dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ')';
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  if (dateStr === tStr) {
    return 'Tomorrow (' + dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ')';
  }
  return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const shiftDate = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + days);
  const nextYear = dateObj.getFullYear();
  const nextMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
  const nextDay = String(dateObj.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

export default function MedicationsPage() {
  const [medications, setMedications] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [conflicts, setConflicts] = useState([]);

  // Selected date state for viewing today, upcoming, or past schedules
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const todayStr = getTodayStr();
  const isToday = selectedDate === todayStr;
  const isPast = selectedDate < todayStr;
  const isFuture = selectedDate > todayStr;

  // Live current time clock to actively monitor schedule windows and unlock doses in real time
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // 1-second ticker to actively monitor current time
    return () => clearInterval(clockTimer);
  }, []);

  const checkIsUpcoming = (item) => {
    if (isFuture) return true;
    if (isPast) return false;
    if (!item || !item.scheduledTime) return false;
    const schedDate = new Date(item.scheduledTime);
    return schedDate.getTime() > currentTime.getTime();
  };

  // Schedule state for the 3 period boxes
  const [schedule, setSchedule] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleActionError, setScheduleActionError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Refill Modal state
  const [refillModalOpen, setRefillModalOpen] = useState(false);
  const [selectedMedForRefill, setSelectedMedForRefill] = useState(null);
  const [refillUrgency, setRefillUrgency] = useState('routine');
  const [refillPharmacy, setRefillPharmacy] = useState('');
  const [refillNotes, setRefillNotes] = useState('');
  const [submittingRefill, setSubmittingRefill] = useState(false);
  const [refillSuccess, setRefillSuccess] = useState('');

  const fetchSchedule = async (targetDate = selectedDate) => {
    try {
      setScheduleLoading(true);
      const res = await medApi.todaySchedule(targetDate);
      if (res && res.success) {
        setSchedule(res.schedule || []);
      }
    } catch (err) {
      console.error('[fetchSchedule]', err);
    } finally {
      setScheduleLoading(false);
    }
  };

  const fetchMeds = async () => {
    try {
      // If statusFilter is 'all', query without active param
      const activeParam = statusFilter === 'all' ? undefined : statusFilter === 'active';
      const [resMeds, resConflicts] = await Promise.all([
        medApi.getAll(activeParam),
        medApi.conflicts().catch(() => ({ conflicts: [] })),
      ]);
      setMedications(resMeds.medications || []);
      setConflicts(resConflicts.conflicts || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch medications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMeds();
  }, [statusFilter]);

  useEffect(() => {
    fetchSchedule(selectedDate);

    // Only auto-refresh periodically if viewing today
    if (selectedDate === getTodayStr()) {
      const timer = setInterval(() => {
        fetchSchedule(selectedDate);
      }, 30000);

      return () => clearInterval(timer);
    }
  }, [selectedDate]);

  const handleFrequencyChange = (freq) => {
    const opt = FREQUENCY_OPTIONS.find((f) => f.value === freq);
    setForm({ ...form, frequency: freq, times: opt ? [...opt.times] : form.times });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Medication name is required');
      return;
    }
    setError('');
    try {
      const payload = {
        ...form,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        refillDate: form.refillDate || undefined,
      };
      if (editing) {
        await medApi.update(editing, payload);
      } else {
        await medApi.add(payload);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      fetchMeds();
      fetchSchedule();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (med) => {
    setForm({
      name: sanitizeHealthText(med.name),
      dosage: med.dosage || '',
      frequency: med.frequency,
      times: med.times || ['08:00'],
      prescribedBy: med.prescribedBy || '',
      pharmacy: med.pharmacy || '',
      startDate: med.startDate ? new Date(med.startDate).toISOString().split('T')[0] : '',
      endDate: med.endDate ? new Date(med.endDate).toISOString().split('T')[0] : '',
      instructions: sanitizeHealthText(med.instructions) || '',
      refillDate: med.refillDate ? new Date(med.refillDate).toISOString().split('T')[0] : '',
      sideEffects: sanitizeHealthText(med.sideEffects) || '',
    });
    setEditing(med._id);
    setShowForm(true);
  };

  const [confirmDeactivateId, setConfirmDeactivateId] = useState(null);

  const handleDeactivate = async (id) => {
    try {
      await medApi.remove(id);
      setConfirmDeactivateId(null);
      fetchMeds();
      fetchSchedule();
    } catch (err) {
      setError(err.message || 'Failed to deactivate medication.');
    }
  };

  const handleReactivate = async (id) => {
    try {
      await medApi.update(id, { isActive: true });
      fetchMeds();
      fetchSchedule();
    } catch (err) {
      setError(err.message || 'Failed to reactivate medication.');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm({ ...emptyForm });
    setError('');
  };

  const openRefillModal = (med) => {
    setSelectedMedForRefill(med);
    setRefillPharmacy(med.pharmacy || '');
    setRefillUrgency('routine');
    setRefillNotes('');
    setRefillSuccess('');
    setRefillModalOpen(true);
  };

  const handleRefillSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMedForRefill) return;
    setSubmittingRefill(true);
    try {
      await medApi.requestRefill(selectedMedForRefill._id, {
        pharmacy: refillPharmacy,
        urgency: refillUrgency,
        patientNotes: refillNotes,
      });
      setRefillSuccess(
        `Refill request for ${selectedMedForRefill.name} submitted! Your pharmacist and doctor have been notified.`
      );
      setTimeout(() => {
        setRefillModalOpen(false);
        setRefillSuccess('');
      }, 1600);
    } catch (err) {
      setError(err.message || 'Failed to submit refill request.');
    } finally {
      setSubmittingRefill(false);
    }
  };

  // Helper: calculate days to refill
  const getRefillDaysBadge = (refillDateStr) => {
    if (!refillDateStr) return null;
    const rDate = new Date(refillDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    rDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((rDate - today) / (24 * 60 * 60 * 1000));

    if (diffDays < 0) {
      return { label: `Refill Overdue (${Math.abs(diffDays)}d)`, color: 'bg-rose-100 text-rose-800 border-rose-200' };
    } else if (diffDays === 0) {
      return { label: 'Refill Due Today', color: 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold' };
    } else if (diffDays <= 5) {
      return { label: `Refill in ${diffDays} days`, color: 'bg-amber-50 text-amber-800 border-amber-200' };
    } else {
      return { label: `Refill in ${diffDays} days`, color: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  // Helper: check if a medication is involved in a drug-drug conflict
  const getMedConflict = (med) => {
    if (!conflicts || conflicts.length === 0) return null;
    const medNameLower = (med.name || '').toLowerCase().trim();
    return conflicts.find((c) => {
      const msgLower = (c.message || '').toLowerCase();
      return msgLower.includes(medNameLower);
    });
  };

  // Extract unique doctors for filter dropdown
  const uniqueDoctors = Array.from(
    new Set(medications.map((m) => m.prescribedBy).filter((p) => Boolean(p && p.trim())))
  );

  // Apply client search & doctor filter
  const filteredMedications = medications.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      m.name?.toLowerCase().includes(q) ||
      m.dosage?.toLowerCase().includes(q) ||
      m.prescribedBy?.toLowerCase().includes(q) ||
      m.instructions?.toLowerCase().includes(q);

    const matchesDoctor = doctorFilter === 'all' || m.prescribedBy === doctorFilter;

    return matchesQuery && matchesDoctor;
  });

  const markDoseOptimistic = async (item, targetStatus) => {
    if (checkIsUpcoming(item)) {
      setScheduleActionError(`Upcoming medications cannot be updated before their scheduled time (${item.timeStr}).`);
      return;
    }

    const origSchedule = [...schedule];
    setSchedule((prev) =>
      prev.map((s) =>
        s.medicationId === item.medicationId && s.timeStr === item.timeStr
          ? {
              ...s,
              status: targetStatus,
              isLate: targetStatus === 'late',
              autoSkipped: targetStatus === 'skipped' && s.autoSkipped,
              takenAt: targetStatus === 'taken' || targetStatus === 'late' ? new Date().toISOString() : null,
            }
          : s
      )
    );

    try {
      await adherenceApi.log({
        medicationId: item.medicationId,
        scheduledTime: item.scheduledTime,
        status: targetStatus,
      });
      const res = await medApi.todaySchedule(selectedDate);
      if (res && res.success) {
        setSchedule(res.schedule || []);
      }
    } catch (err) {
      setSchedule(origSchedule);
      setScheduleActionError(`Failed to update dose for ${item.medicationName}. Please try again.`);
    }
  };

  const getTimeBadge = (scheduledTimeStr, status, autoSkipped = false, isItemUpcoming = false) => {
    const schedTime = new Date(scheduledTimeStr);
    const diffMs = currentTime.getTime() - schedTime.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));

    // Upcoming dose: scheduled time has not yet arrived!
    // Upcoming doses can NEVER be shown as Taken, Skipped, Late, or Missed!
    if (isItemUpcoming || diffMins < 0) {
      const futureMins = Math.abs(diffMins);
      const futureHours = Math.floor(futureMins / 60);
      const remainingLabel = futureHours > 0 ? `In ${futureHours}h ${futureMins % 60}m` : `In ${futureMins}m`;

      if (diffMins >= -60 && diffMins < 0) {
        return {
          isUpcoming1h: true,
          label: `${remainingLabel} (1h Reminder)`,
          color: 'blue',
        };
      }

      return {
        isFuture: true,
        label: remainingLabel,
        color: 'blue',
      };
    }

    if (status === 'taken') {
      return { label: 'Taken', isTaken: true, color: 'emerald' };
    }

    if (status === 'late') {
      return { label: 'Taken Late', isLate: true, color: 'amber' };
    }
    if (status === 'skipped') {
      return {
        label: autoSkipped ? 'Auto-Skipped (>3h)' : 'Skipped',
        isSkipped: true,
        color: 'rose',
      };
    }
    if (status === 'missed') {
      return {
        label: 'Missed',
        isMissed: true,
        color: 'rose',
      };
    }

    if (isPast) {
      return {
        label: 'Past Unlogged',
        isOverdue: true,
        color: 'rose',
      };
    }

    if (diffMins >= 180 || autoSkipped) {
      return {
        isAutoSkipped: true,
        isOverdue: true,
        label: 'Auto-Skipped (>3h Late)',
        color: 'rose',
      };
    }

    if (diffMins > 10) {
      const overdueHours = Math.floor(diffMins / 60);
      const overdueMins = diffMins % 60;
      const timeStr = overdueHours > 0 ? `${overdueHours}h ${overdueMins}m` : `${overdueMins}m`;
      return {
        isLate: true,
        isOverdue: true,
        label: `Late (${timeStr})`,
        color: 'amber',
      };
    }

    if (diffMins >= 0 && diffMins <= 10) {
      return {
        isDueNow: true,
        label: 'Due Now',
        color: 'emerald',
      };
    }

    return {
      isFuture: true,
      label: 'Scheduled',
      color: 'blue',
    };
  };

  const getDosePeriod = (item) => {
    let hours = null;
    if (item.timeStr && typeof item.timeStr === 'string' && item.timeStr.includes(':')) {
      hours = parseInt(item.timeStr.split(':')[0], 10);
    } else if (item.scheduledTime) {
      hours = new Date(item.scheduledTime).getHours();
    }
    if (hours === null || isNaN(hours)) return 'morning';
    if (hours >= 5 && hours < 12) return 'morning';
    if (hours >= 12 && hours < 17) return 'midday';
    return 'night';
  };

  const morningDoses = schedule.filter((item) => getDosePeriod(item) === 'morning');
  const middayDoses = schedule.filter((item) => getDosePeriod(item) === 'midday');
  const nightDoses = schedule.filter((item) => getDosePeriod(item) === 'night');

  const getTakenCount = (doses) => {
    return doses.filter(
      (d) => !checkIsUpcoming(d) && (d.status === 'taken' || (d.status === 'late' && d.takenAt))
    ).length;
  };

  const renderDoseCard = (item, idx) => {
    const isItemUpcoming = checkIsUpcoming(item);
    const badge = getTimeBadge(item.scheduledTime, item.status, item.autoSkipped, isItemUpcoming);
    const isOverdue = badge?.isOverdue;
    const medInstructions = sanitizeHealthText(item.instructions);

    return (
      <div
        key={`${item.medicationId}_${item.timeStr}_${idx}`}
        className={`p-3.5 rounded-xl border transition-all ${
          isItemUpcoming
            ? 'bg-white border-gray-200 border-l-4 border-l-blue-400'
            : item.autoSkipped
            ? 'bg-rose-50/50 border-rose-200 border-l-4 border-l-rose-500'
            : item.status === 'late' && !item.takenAt
            ? 'bg-amber-50/60 border-amber-200 border-l-4 border-l-amber-500 shadow-xs'
            : item.status === 'taken' || (item.status === 'late' && item.takenAt)
            ? 'bg-emerald-50/40 border-emerald-200 border-l-4 border-l-emerald-500'
            : item.status === 'skipped'
            ? 'bg-gray-50 border-gray-200 border-l-4 border-l-gray-400 opacity-85'
            : item.status === 'missed'
            ? 'bg-rose-50/50 border-rose-200 border-l-4 border-l-rose-400'
            : isOverdue
            ? 'bg-rose-50/40 border-rose-200 border-l-4 border-l-rose-500'
            : 'bg-white border-gray-200 border-l-4 border-l-blue-400 hover:border-blue-300 hover:shadow-xs'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h5 className="font-bold text-gray-900 text-sm truncate">
                {sanitizeHealthText(item.medicationName)}
              </h5>
              {item.dosage && (
                <span className="text-[11px] text-gray-600 font-semibold bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  {item.dosage}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Scheduled for <strong className="text-gray-700">{item.timeStr}</strong></span>
            </div>
          </div>
          {badge && (
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                badge.color === 'emerald'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : badge.color === 'amber'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : badge.color === 'rose'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}
            >
              {badge.label}
            </span>
          )}
        </div>

        {medInstructions && (
          <p className="text-[11px] text-gray-500 italic mt-2 bg-gray-50/80 p-1.5 rounded border border-gray-100 line-clamp-2">
            {medInstructions}
          </p>
        )}

        {/* Action Buttons & Status */}
        <div className="mt-3 pt-2.5 border-t border-gray-100/90">
          {isItemUpcoming ? (
            <div className="flex items-center justify-between text-xs text-gray-500 py-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                <span className="text-[11px] font-semibold text-gray-700">
                  Scheduled for {item.timeStr}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                Locked until {item.timeStr}
              </span>
            </div>
          ) : isPast ? (
            item.status === 'taken' || item.status === 'late' || item.status === 'skipped' ? (
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                    item.status === 'taken'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : item.status === 'late'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}
                >
                  {item.status === 'late' ? 'Taken Late' : item.status}
                </span>
                <button
                  type="button"
                  onClick={() => markDoseOptimistic(item, item.status === 'taken' ? 'skipped' : 'taken')}
                  className="text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
                  title="Change dose log status"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                  Missed / Unlogged
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => markDoseOptimistic(item, 'taken')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1 px-2 rounded transition-colors cursor-pointer"
                  >
                    Mark Taken
                  </button>
                  <button
                    type="button"
                    onClick={() => markDoseOptimistic(item, 'skipped')}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-medium py-1 px-2 rounded transition-colors cursor-pointer"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )
          ) : item.autoSkipped ? (
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-extrabold px-2.5 py-1 rounded uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                Auto-Skipped (&gt;3h)
              </span>
              <span className="text-[10px] text-gray-400 italic">Expired window</span>
            </div>
          ) : item.status === 'pending' ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => markDoseOptimistic(item, 'taken')}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-2 rounded-lg shadow-xs transition-colors cursor-pointer text-center"
              >
                Take Dose
              </button>
              <button
                type="button"
                onClick={() => markDoseOptimistic(item, 'late')}
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer"
                title="Mark as taken late"
              >
                Late
              </button>
              <button
                type="button"
                onClick={() => markDoseOptimistic(item, 'skipped')}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Skip
              </button>
            </div>
          ) : item.status === 'late' && !item.takenAt ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => markDoseOptimistic(item, 'late')}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-1.5 px-2 rounded-lg shadow-xs transition-colors cursor-pointer text-center"
                title="Take dose now (marked late)"
              >
                Take Dose (Late)
              </button>
              <button
                type="button"
                onClick={() => markDoseOptimistic(item, 'skipped')}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Skip
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                  item.status === 'taken'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : item.status === 'late'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : item.status === 'skipped'
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {item.status === 'late' ? 'Taken Late' : item.status}
              </span>
              <button
                type="button"
                onClick={() => markDoseOptimistic(item, item.status === 'taken' ? 'skipped' : 'taken')}
                className="text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer"
                title="Change dose log status"
              >
                Change
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Prescriptions & Medications</h2>
          <p className="text-xs text-gray-500">
            Manage your daily regimen, dosage titration history, and pharmacy refills.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            cancelForm();
            setShowForm(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-xs self-start sm:self-auto flex items-center gap-1"
        >
          <span>+</span> Add Medication
        </button>
      </div>

      {/* Schedule Action Error */}
      {scheduleActionError && (
        <div className="bg-red-50 text-red-700 text-xs p-3 rounded-xl border border-red-200 flex items-center justify-between">
          <span>{scheduleActionError}</span>
          <button type="button" onClick={() => setScheduleActionError('')} className="text-red-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Today's / Date Medication Schedule - 3 Vertical Period Boxes (Morning, Mid-Day, Night) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-sm">
                {isToday ? "Today's Medication Schedule" : isPast ? "Past Medication Schedule" : "Upcoming Medication Schedule"}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isToday
                    ? 'bg-blue-100 text-blue-800'
                    : isPast
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {isToday ? 'Today' : isPast ? 'Past' : 'Upcoming'}
              </span>
              {isToday && (
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDateLabel(selectedDate)} &bull; Dosages organized in three periods: Morning, Mid-Day, and Night
            </p>
          </div>

          {/* Date Selector & Navigation Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                title="Previous Day"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="relative flex items-center">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="text-xs font-semibold text-gray-800 bg-transparent px-2 py-0.5 focus:outline-none cursor-pointer border-0"
                />
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors cursor-pointer"
                title="Next Day"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayStr())}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer border border-blue-200"
              >
                Today
              </button>
            )}

            <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 shrink-0">
              {getTakenCount(schedule)} of {schedule.length} Taken
            </span>
          </div>
        </div>

        {scheduleLoading && (
          <div className="h-0.5 w-full bg-blue-100 overflow-hidden">
            <div className="w-full h-full bg-blue-600 animate-pulse"></div>
          </div>
        )}

        {schedule.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h4 className="text-xs font-bold text-gray-800">
              {isToday ? 'No Medications Scheduled Today' : `No Medications Scheduled for ${formatDateLabel(selectedDate)}`}
            </h4>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {isPast
                ? 'No active prescriptions or logged doses found for this past date.'
                : isFuture
                ? 'No medications scheduled for this upcoming date.'
                : 'Add your daily medications to generate your daily Morning, Mid-Day, and Night intake schedule.'}
            </p>
          </div>
        ) : (
          <div className="p-4 bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
              {/* 1st Vertical Box: Morning Tablets & Medications */}
              <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs flex flex-col overflow-hidden min-h-[260px]">
                {/* Morning Header */}
                <div className="p-3.5 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-b border-amber-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-gray-900 text-sm">Morning</h4>
                      <span className="text-[10px] text-gray-500 font-medium">05:00 AM - 11:59 AM</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    {getTakenCount(morningDoses)}/{morningDoses.length} Taken
                  </span>
                </div>

                {/* Morning List */}
                <div className="p-3 space-y-3 flex-1 flex flex-col">
                  {morningDoses.length === 0 ? (
                    <div className="my-auto py-8 text-center space-y-1">
                      <p className="text-xs font-bold text-gray-500">No Morning Medications</p>
                      <p className="text-[11px] text-gray-400">No doses scheduled for this morning window.</p>
                    </div>
                  ) : (
                    morningDoses.map((item, idx) => renderDoseCard(item, idx))
                  )}
                </div>
              </div>

              {/* 2nd Vertical Box: Mid-Day Tablets & Medications */}
              <div className="bg-white rounded-xl border border-sky-200/90 shadow-xs flex flex-col overflow-hidden min-h-[260px]">
                {/* Mid-Day Header */}
                <div className="p-3.5 bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent border-b border-sky-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 shadow-xs">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-gray-900 text-sm">Mid-Day</h4>
                      <span className="text-[10px] text-gray-500 font-medium">12:00 PM - 04:59 PM</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                    {getTakenCount(middayDoses)}/{middayDoses.length} Taken
                  </span>
                </div>

                {/* Mid-Day List */}
                <div className="p-3 space-y-3 flex-1 flex flex-col">
                  {middayDoses.length === 0 ? (
                    <div className="my-auto py-8 text-center space-y-1">
                      <p className="text-xs font-bold text-gray-500">No Mid-Day Medications</p>
                      <p className="text-[11px] text-gray-400">No doses scheduled for this afternoon window.</p>
                    </div>
                  ) : (
                    middayDoses.map((item, idx) => renderDoseCard(item, idx))
                  )}
                </div>
              </div>

              {/* 3rd Vertical Box: Night Tablets & Medications */}
              <div className="bg-white rounded-xl border border-indigo-200/90 shadow-xs flex flex-col overflow-hidden min-h-[260px]">
                {/* Night Header */}
                <div className="p-3.5 bg-gradient-to-r from-indigo-500/15 via-indigo-500/5 to-transparent border-b border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-xs">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-gray-900 text-sm">Night</h4>
                      <span className="text-[10px] text-gray-500 font-medium">05:00 PM onwards</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {getTakenCount(nightDoses)}/{nightDoses.length} Taken
                  </span>
                </div>

                {/* Night List */}
                <div className="p-3 space-y-3 flex-1 flex flex-col">
                  {nightDoses.length === 0 ? (
                    <div className="my-auto py-8 text-center space-y-1">
                      <p className="text-xs font-bold text-gray-500">No Night Medications</p>
                      <p className="text-[11px] text-gray-400">No doses scheduled for this night window.</p>
                    </div>
                  ) : (
                    nightDoses.map((item, idx) => renderDoseCard(item, idx))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by drug name, doctor, or dosage..."
            className="w-full text-xs pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs"></span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs font-bold"
            >
              &times;
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Doctor Filter Dropdown */}
          {uniqueDoctors.length > 0 && (
            <select
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Prescribers</option>
              {uniqueDoctors.map((doc, idx) => (
                <option key={idx} value={doc}>
                  {doc}
                </option>
              ))}
            </select>
          )}

          {/* Active / Inactive / All Status Toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                statusFilter === 'active' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                statusFilter === 'inactive' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Inactive
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-xs p-3 rounded-xl border border-red-200 flex items-center justify-between">
          <span> {error}</span>
          <button type="button" onClick={() => setError('')} className="text-red-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Add/Edit Medication Form Modal or Card */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white p-5 rounded-2xl border border-blue-200 shadow-md space-y-4 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">
                {editing ? 'Edit Medication Regimen' : 'Add Medication to Plan'}
              </h3>
              {editing && form.prescribedBy && (
                <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
                   Prescribed by {form.prescribedBy}. Clinical updates will be archived in consultation history.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={cancelForm}
              className="text-gray-400 hover:text-gray-600 font-bold text-base cursor-pointer"
            >
              &times;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Medication Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Metformin or Amlodipine"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Dosage</label>
              <input
                type="text"
                value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 500mg or 10mg"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Frequency</label>
              <select
                value={form.frequency}
                onChange={(e) => handleFrequencyChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500"
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Intake Times ({form.times.length})</label>
              <div className="flex gap-1.5 flex-wrap">
                {form.times.map((t, i) => (
                  <input
                    key={i}
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const ts = [...form.times];
                      ts[i] = e.target.value;
                      setForm({ ...form, times: ts });
                    }}
                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Prescribing Doctor (Optional)</label>
              <input
                type="text"
                value={form.prescribedBy}
                onChange={(e) => setForm({ ...form, prescribedBy: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Dr. Ramesh Sharma"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Dispensing Pharmacy (Optional)</label>
              <input
                type="text"
                value={form.pharmacy}
                onChange={(e) => setForm({ ...form, pharmacy: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Apollo Pharmacy Central"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Estimated Next Refill Date</label>
              <input
                type="date"
                value={form.refillDate}
                onChange={(e) => setForm({ ...form, refillDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Clinical Instructions (Encrypted at rest AES-256-GCM)
              </label>
              <input
                type="text"
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Take 1 tablet with evening meal. Avoid dairy products within 2 hours."
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Side Effects / Warnings / Allergies (Encrypted at rest)
              </label>
              <input
                type="text"
                value={form.sideEffects}
                onChange={(e) => setForm({ ...form, sideEffects: e.target.value })}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. May cause mild nausea during the first week."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={cancelForm}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              {editing ? 'Save Regimen Changes' : 'Add Medication'}
            </button>
          </div>
        </form>
      )}

      {/* Medication Cards List */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-2xl"></div>
          ))}
        </div>
      ) : filteredMedications.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-gray-200 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl">
            
          </div>
          <h4 className="text-xs font-bold text-gray-800">
            {searchQuery
              ? `No medications matching "${searchQuery}"`
              : `No ${statusFilter === 'all' ? '' : statusFilter} medications found`}
          </h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {searchQuery
              ? 'Try clearing your search keyword or adjust the active/inactive filter.'
              : 'Add your first medication to monitor schedules, interaction alerts, and refill reminders.'}
          </p>
          {!showForm && (
            <button
              type="button"
              onClick={() => {
                cancelForm();
                setShowForm(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              + Add Medication Now
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMedications.map((med) => {
            const refillBadge = getRefillDaysBadge(med.refillDate);
            const conflictAlert = getMedConflict(med);
            const isDoctorPrescribed = Boolean(med.prescribedBy && med.prescribedBy.trim());
            const medInstructions = sanitizeHealthText(med.instructions);
            const medSideEffects = sanitizeHealthText(med.sideEffects);

            return (
              <div
                key={med._id}
                className={`bg-white p-5 rounded-2xl border transition-all shadow-xs space-y-3 ${
                  !med.isActive
                    ? 'border-gray-200 bg-gray-50/50 opacity-75'
                    : conflictAlert
                    ? 'border-amber-300 ring-2 ring-amber-100'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    {/* Header line: Name, Dosage, Status Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-gray-900 text-base">
                        {sanitizeHealthText(med.name)}
                      </h3>
                      {med.dosage && (
                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-lg border border-blue-200">
                          {med.dosage}
                        </span>
                      )}

                      {/* Active / Inactive Tag */}
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          med.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {med.isActive ? 'Active' : 'Deactivated / Archived'}
                      </span>

                      {/* Dispense Status Badge */}
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          med.dispenseStatus === 'ready_for_pickup'
                            ? 'bg-blue-100 text-blue-800'
                            : med.dispenseStatus === 'out_of_stock'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {med.dispenseStatus ? med.dispenseStatus.replace(/_/g, ' ') : 'Dispensed'}
                      </span>

                      {/* Refill Countdown Badge */}
                      {refillBadge && med.isActive && (
                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${refillBadge.color}`}
                        >
                           {refillBadge.label}
                        </span>
                      )}

                      {/* Doctor vs Patient Source Tag */}
                      {isDoctorPrescribed && (
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                           Dr. Prescribed
                        </span>
                      )}
                    </div>

                    {/* Schedule info */}
                    <p className="text-xs text-gray-600 font-medium">
                      {FREQUENCY_OPTIONS.find((f) => f.value === med.frequency)?.label || med.frequency}
                      {med.times?.length > 0 && ` • Scheduled at: ${med.times.join(', ')}`}
                    </p>

                    {/* Metadata: Doctor, Pharmacy */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap pt-0.5">
                      {med.prescribedBy && (
                        <span>
                          Prescriber: <strong className="text-gray-800">{med.prescribedBy}</strong>
                        </span>
                      )}
                      {med.pharmacy && (
                        <span>
                          Pharmacy: <strong className="text-gray-800">{med.pharmacy}</strong>
                        </span>
                      )}
                      {med.startDate && (
                        <span>
                          Started: <strong className="text-gray-700">{new Date(med.startDate).toLocaleDateString()}</strong>
                        </span>
                      )}
                    </div>

                    {/* Clinical Instructions */}
                    {medInstructions && (
                      <div className="text-xs text-blue-900 bg-blue-50/70 border border-blue-100 p-2.5 rounded-xl mt-2 space-y-0.5">
                        <span className="font-bold text-[10px] uppercase tracking-wider text-blue-700 block">
                          Clinical Instructions
                        </span>
                        <p>{medInstructions}</p>
                      </div>
                    )}

                    {/* Side effects / notes */}
                    {medSideEffects && (
                      <div className="text-xs text-amber-900 bg-amber-50/70 border border-amber-200 p-2.5 rounded-xl mt-1 space-y-0.5">
                        <span className="font-bold text-[10px] uppercase tracking-wider text-amber-700 block">
                          Adverse Symptoms / Instructions
                        </span>
                        <p>{medSideEffects}</p>
                      </div>
                    )}

                    {/* INLINE DRUG INTERACTION ALERT BANNER */}
                    {conflictAlert && med.isActive && (
                      <div className="bg-amber-500/10 border-l-4 border-amber-500 p-3 rounded-r-xl text-xs text-amber-900 mt-2 space-y-1 animate-in fade-in duration-150">
                        <div className="flex items-center gap-1.5 font-extrabold text-amber-800">
                          
                          <span>Adverse Interaction Warning</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed">{conflictAlert.message}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-1">
                    {med.isActive && (
                      <button
                        type="button"
                        onClick={() => openRefillModal(med)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <span>Refresh</span> Request Refill
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEdit(med)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold p-1 hover:underline cursor-pointer"
                    >
                      Edit Regimen
                    </button>
                    {med.isActive ? (
                      confirmDeactivateId === med._id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeactivate(med._id)}
                            className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeactivateId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivateId(med._id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium p-1 hover:underline cursor-pointer"
                        >
                          Deactivate
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(med._id)}
                        className="text-xs text-emerald-600 hover:text-emerald-800 font-bold p-1 hover:underline cursor-pointer"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Refill Request Modal */}
      {refillModalOpen && selectedMedForRefill && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRefillSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                <span> Request Prescription Refill</span>
              </h3>
              <button
                type="button"
                onClick={() => setRefillModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {refillSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                {refillSuccess}
              </div>
            ) : (
              <>
                <div className="bg-blue-50 p-3 rounded-xl text-xs text-blue-900 space-y-1 border border-blue-100">
                  <p>
                    <strong>Medication:</strong> {selectedMedForRefill.name} ({selectedMedForRefill.dosage || 'Standard'})
                  </p>
                  <p>
                    <strong>Prescribed by:</strong> {selectedMedForRefill.prescribedBy || 'Attending Physician'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Fulfillment Pharmacy</label>
                  <input
                    type="text"
                    value={refillPharmacy}
                    onChange={(e) => setRefillPharmacy(e.target.value)}
                    placeholder="Pharmacy name or location"
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Refill Urgency</label>
                  <select
                    value={refillUrgency}
                    onChange={(e) => setRefillUrgency(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="routine">Routine (5-7 days supply left)</option>
                    <option value="urgent">Urgent (1-2 days supply left)</option>
                    <option value="emergency">Emergency (Out of medication)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Patient Instructions / Notes</label>
                  <textarea
                    rows="3"
                    value={refillNotes}
                    onChange={(e) => setRefillNotes(e.target.value)}
                    placeholder="e.g. Requesting 30 days supply. Pickup tomorrow morning."
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setRefillModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRefill}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {submittingRefill ? 'Submitting...' : 'Confirm Refill Request'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
