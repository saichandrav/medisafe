import React, { useState, useEffect } from 'react';
import { medApi, adherenceApi, reportApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { sanitizeHealthText } from '../utils/sanitize';

export default function Dashboard({ onNavigate, activeSection = 'overview' }) {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState([]);
  const [stats, setStats] = useState(null);
  const [statsWindow, setStatsWindow] = useState(14);
  const [trendData, setTrendData] = useState([]);
  const [perMedData, setPerMedData] = useState([]);
  const [streakData, setStreakData] = useState({ current: 0, longest: 0 });
  const [allMedications, setAllMedications] = useState([]);
  const [selectedMedFilter, setSelectedMedFilter] = useState('all');
  const [graphMode, setGraphMode] = useState('curve'); // 'curve' | 'bars'
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [refillRequests, setRefillRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Doctor Uploaded Reports & Clinical Dossier State
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReportFilter, setSelectedReportFilter] = useState('all');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Medication Intake Alerts & Reminders State
  const [alerts, setAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [browserNotifEnabled, setBrowserNotifEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission === 'granted' : false
  );

  // Refill Modal state
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillMedId, setRefillMedId] = useState('');
  const [refillUrgency, setRefillUrgency] = useState('routine');
  const [refillNotes, setRefillNotes] = useState('');
  const [submittingRefill, setSubmittingRefill] = useState(false);
  const [refillSuccessMsg, setRefillSuccessMsg] = useState('');

  // Open reports modal if navigated via direct reports tab
  useEffect(() => {
    if (activeSection === 'reports') {
      setShowReportsModal(true);
    }
  }, [activeSection]);

  const fetchData = async (d = statsWindow, medId = selectedMedFilter) => {
    setError('');
    try {
      const [schedRes, statsRes, conflictsRes, refillRes, medsRes, reportsRes] = await Promise.all([
        medApi.todaySchedule(),
        adherenceApi.stats(d, medId === 'all' ? '' : medId),
        medApi.conflicts(),
        medApi.myRefillRequests().catch(() => ({ refillRequests: [] })),
        medApi.getAll(true).catch(() => ({ medications: [] })),
        reportApi.getMyReports().catch(() => ({ reports: [] })),
      ]);
      setSchedule(schedRes.schedule || []);
      setAlerts(schedRes.alerts || []);
      setStats(statsRes.stats || null);
      setTrendData(statsRes.trend || []);
      setPerMedData(statsRes.perMedication || []);
      setStreakData(statsRes.streak || { current: 0, longest: 0 });
      setConflicts(conflictsRes.conflicts || []);
      setRefillRequests(refillRes.refillRequests || []);
      setAllMedications(medsRes.medications || []);
      setReports(reportsRes.reports || []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Unable to load your live medication schedule. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(statsWindow, selectedMedFilter);
  }, [statsWindow, selectedMedFilter]);

  // Live auto-refresh timer (every 30 seconds) to keep timing rules & reminders live
  useEffect(() => {
    const timer = setInterval(() => {
      fetchData(statsWindow, selectedMedFilter);
    }, 30000);
    return () => clearInterval(timer);
  }, [statsWindow, selectedMedFilter]);

  // Request browser desktop notification permissions
  const handleEnableNotifications = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      setBrowserNotifEnabled(perm === 'granted');
    }
  };

  // Trigger browser desktop notifications for active reminders/alerts
  useEffect(() => {
    if (alerts && alerts.length > 0 && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        alerts.forEach((a) => {
          const notifKey = `medsafe_notif_${a.id}_${new Date().toDateString()}`;
          if (!sessionStorage.getItem(notifKey)) {
            sessionStorage.setItem(notifKey, '1');
            try {
              new Notification(a.title, {
                body: a.message,
              });
            } catch (e) {
              // Notification blocked or restricted
            }
          }
        });
      }
    }
  }, [alerts]);

  // Optimistic Dose Logging with Rollback
  const markDoseOptimistic = async (item, status) => {
    setActionError('');
    const previousSchedule = [...schedule];

    // Optimistic local state update
    setSchedule((prev) =>
      prev.map((s) => {
        if (s.medicationId === item.medicationId && s.timeStr === item.timeStr) {
          return { ...s, status, takenAt: status === 'taken' || status === 'late' ? new Date().toISOString() : null };
        }
        return s;
      })
    );

    try {
      await adherenceApi.log({
        medicationId: item.medicationId,
        scheduledTime: item.scheduledTime,
        status,
        notes: status === 'late' ? 'Taken past scheduled time' : '',
      });
      // Refresh stats quietly in background
      adherenceApi.stats(statsWindow, selectedMedFilter === 'all' ? '' : selectedMedFilter).then((res) => {
        setStats(res.stats || null);
        setTrendData(res.trend || []);
        setPerMedData(res.perMedication || []);
        setStreakData(res.streak || { current: 0, longest: 0 });
      });
    } catch (err) {
      console.error('Dose action failed, rolling back:', err);
      // Rollback to previous state
      setSchedule(previousSchedule);
      setActionError(`Failed to update dose for ${item.medicationName}. Please try again.`);
    }
  };

  const handleOpenRefill = (medicationId = '') => {
    setRefillMedId(medicationId);
    setRefillUrgency('routine');
    setRefillNotes('');
    setRefillSuccessMsg('');
    setShowRefillModal(true);
  };

  const handleSubmitRefill = async (e) => {
    e.preventDefault();
    if (!refillMedId) return;
    setSubmittingRefill(true);
    try {
      const res = await medApi.requestRefill(refillMedId, {
        urgency: refillUrgency,
        patientNotes: refillNotes,
      });
      if (res && res.success) {
        setRefillSuccessMsg('Refill request submitted to your dispensary successfully!');
        setTimeout(() => {
          setShowRefillModal(false);
          fetchData(statsWindow);
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit refill request.');
    } finally {
      setSubmittingRefill(false);
    }
  };

  // Helper to compute time difference for upcoming, due, late, and auto-skipped items
  const getTimeBadge = (scheduledTimeStr, status, autoSkipped = false) => {
    if (status === 'taken') {
      return { label: 'Taken', isTaken: true, color: 'emerald' };
    }
    if (status === 'skipped') {
      return {
        label: autoSkipped ? 'Auto-Skipped (>3h)' : 'Skipped',
        isSkipped: true,
        color: 'rose',
      };
    }

    const schedTime = new Date(scheduledTimeStr);
    const now = new Date();
    const diffMs = now - schedTime;
    const diffMins = Math.floor(diffMs / (60 * 1000));

    // Rule: If person is late by 3 hours, mark medication automatically skipped
    if (diffMins >= 180 || autoSkipped) {
      return {
        isAutoSkipped: true,
        isOverdue: true,
        label: 'Auto-Skipped (>3h Late)',
        color: 'rose',
      };
    }

    // Rule: If time crosses above 10 min, medication marked as late
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

    // Exact time window (0 to 10 minutes past scheduled time)
    if (diffMins >= 0 && diffMins <= 10) {
      return {
        isDueNow: true,
        label: 'Due Now',
        color: 'emerald',
      };
    }

    // 1-Hour before reminder window (-60 min to -1 min)
    if (diffMins < 0 && diffMins >= -60) {
      const minsRemaining = Math.abs(diffMins);
      return {
        isUpcoming1h: true,
        label: `Due in ${minsRemaining}m (1h Reminder)`,
        color: 'blue',
      };
    }

    // Future dose (> 1 hour ahead)
    const futureMins = Math.abs(diffMins);
    const futureHours = Math.floor(futureMins / 60);
    return {
      isFuture: true,
      label: futureHours > 0 ? `In ${futureHours}h ${futureMins % 60}m` : `In ${futureMins}m`,
      color: 'gray',
    };
  };

  // Next imminent or pending/late dose awaiting action
  const nextPendingDose = schedule.find((s) => s.status !== 'taken' && s.status !== 'skipped');

  // Consolidated unique medications list (from active DB medications and today's schedule)
  const uniqueMedsList = Array.from(
    new Map([
      ...allMedications.map((m) => [
        m._id?.toString(),
        {
          id: m._id?.toString(),
          name: m.name,
          dosage: m.dosage || m.power || '',
          power: m.power || m.dosage || '',
          frequency: m.frequency || 'once_daily',
          times: m.times || [],
          instructions: m.instructions || '',
          prescribedBy: m.prescribedBy || '',
          durationDays: m.durationDays,
          startDate: m.startDate,
          endDate: m.endDate,
          dispenseStatus: m.dispenseStatus,
        },
      ]),
      ...schedule.map((s) => [
        s.medicationId?.toString(),
        {
          id: s.medicationId?.toString(),
          name: s.medicationName,
          dosage: s.dosage || s.power || '',
          power: s.power || s.dosage || '',
          frequency: s.frequency || '',
          times: [s.timeStr],
          instructions: s.instructions || '',
          prescribedBy: s.prescribedBy || '',
        },
      ]),
    ]).values()
  ).filter((m) => m.id);

  const uniqueMedsInSchedule = Array.from(
    new Map(schedule.map((s) => [s.medicationId, { id: s.medicationId, name: s.medicationName }])).values()
  );

  // Graph Coordinate Calculations
  const graphWidth = 740;
  const graphHeight = 220;
  const padL = 48;
  const padR = 25;
  const padT = 25;
  const padB = 40;
  const plotWidth = graphWidth - padL - padR;
  const plotHeight = graphHeight - padT - padB;

  const points = (trendData || []).map((day, idx) => {
    const totalDays = trendData.length;
    const x = totalDays > 1 ? padL + (idx / (totalDays - 1)) * plotWidth : padL + plotWidth / 2;
    const hasDoses = day.total > 0;
    const adherenceRate = hasDoses ? Math.round((day.taken / day.total) * 100) : null;
    const y = adherenceRate !== null ? padT + plotHeight - (adherenceRate / 100) * plotHeight : padT + plotHeight;
    return {
      x,
      y,
      adherenceRate,
      hasDoses,
      day,
      idx,
    };
  });

  // Calculate smooth SVG cubic bezier path
  let curvePath = '';
  let fillPath = '';
  const daysWithDoses = points.filter((p) => p.hasDoses);

  if (daysWithDoses.length === 1) {
    const p = daysWithDoses[0];
    curvePath = `M ${padL} ${p.y} L ${padL + plotWidth} ${p.y}`;
    fillPath = `${curvePath} L ${padL + plotWidth} ${padT + plotHeight} L ${padL} ${padT + plotHeight} Z`;
  } else if (daysWithDoses.length > 1) {
    curvePath = `M ${daysWithDoses[0].x} ${daysWithDoses[0].y}`;
    for (let i = 0; i < daysWithDoses.length - 1; i++) {
      const p0 = daysWithDoses[i];
      const p1 = daysWithDoses[i + 1];
      const cx = (p0.x + p1.x) / 2;
      curvePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    fillPath = `${curvePath} L ${daysWithDoses[daysWithDoses.length - 1].x} ${padT + plotHeight} L ${daysWithDoses[0].x} ${padT + plotHeight} Z`;
  }

  const gridLevels = [100, 75, 50, 25, 0].map((pct) => ({
    pct,
    y: padT + plotHeight - (pct / 100) * plotHeight,
  }));

  return (
    <div className="space-y-6">
      {/* Top Header with Quick Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            Welcome back, {user?.name || 'Patient'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Your personalized medication schedule and adherence dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReportsModal(true)}
            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold px-3 py-1.5 rounded-lg border border-blue-300 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="View medical reports, BP tests, blood sugar tests & attachments uploaded by your doctor"
          >
            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Doctor Reports</span>
            {reports.length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {reports.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleOpenRefill(schedule[0]?.medicationId || '')}
            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-3 py-1.5 rounded-lg border border-amber-300 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            Request Refill
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('caregivers')}
              className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg border border-emerald-300 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              Caregiver Access
            </button>
          )}
        </div>
      </div>

      {/* Action Error Alert with Dismiss */}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in duration-150">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-28 bg-gray-200 rounded-2xl"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="h-48 bg-gray-200 rounded-2xl"></div>
        </div>
      )}

      {/* Error State with Retry */}
      {!loading && error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
          <p className="text-red-700 font-semibold text-xs sm:text-sm">{error}</p>
          <button
            type="button"
            onClick={() => fetchData(statsWindow)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Retry Loading Dashboard
          </button>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && (
        <>
          {/* Active Alerts & Reminders Hub (1h Before, Due Now, 1h Overdue, 3h Auto-Skipped) */}
          {alerts && alerts.filter((a) => !dismissedAlerts.includes(a.id)).length > 0 && (
            <div className="space-y-2.5">
              {alerts
                .filter((a) => !dismissedAlerts.includes(a.id))
                .map((alert) => {
                  const is1hBefore = alert.type === '1h_before';
                  const isDueNow = alert.type === 'exact_time';
                  const is1hAfter = alert.type === '1h_after';
                  const is3hSkipped = alert.type === '3h_skipped';

                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs transition-all animate-in fade-in duration-150 ${
                        is3hSkipped
                          ? 'bg-rose-50/90 border-rose-300 text-rose-950'
                          : is1hAfter
                          ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                          : isDueNow
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                          : 'bg-blue-50/90 border-blue-300 text-blue-950'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                            is3hSkipped
                              ? 'bg-rose-600 text-white'
                              : is1hAfter
                              ? 'bg-amber-500 text-white'
                              : isDueNow
                              ? 'bg-emerald-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs">{alert.title}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                              {alert.timeStr}
                            </span>
                            {is3hSkipped && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">
                                Auto-Skipped
                              </span>
                            )}
                            {is1hAfter && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 animate-pulse">
                                Overdue 1h
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5 font-medium">{alert.message}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {!is3hSkipped && (
                          <button
                            type="button"
                            onClick={() => {
                              const item = schedule.find(
                                (s) => s.medicationId === alert.medicationId && s.timeStr === alert.timeStr
                              );
                              if (item) markDoseOptimistic(item, is1hAfter ? 'late' : 'taken');
                            }}
                            className={`text-xs font-extrabold px-3.5 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer ${
                              is1hAfter
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : isDueNow
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {is1hAfter ? 'Take Dose (Late)' : 'Take Dose'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDismissedAlerts((prev) => [...prev, alert.id])}
                          className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-black/5 cursor-pointer font-bold"
                          title="Dismiss notice"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Active Dose Reminder Prompt Banner */}
          {nextPendingDose && (
            <div
              className={`text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200 ${
                nextPendingDose.status === 'late'
                  ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 shadow-inner">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
                      {nextPendingDose.status === 'late' ? 'Late Dose (>10m)' : 'Next Scheduled Dose'}
                    </span>
                    {(() => {
                      const badge = getTimeBadge(nextPendingDose.scheduledTime, nextPendingDose.status, nextPendingDose.autoSkipped);
                      if (!badge) return null;
                      return (
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            badge.isOverdue ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/20 text-blue-100'
                          }`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                  <h4 className="font-extrabold text-base mt-1">
                    {sanitizeHealthText(nextPendingDose.medicationName)} {nextPendingDose.dosage ? `(${nextPendingDose.dosage})` : ''} at {nextPendingDose.timeStr}
                  </h4>
                  {nextPendingDose.instructions && (
                    <p className="text-xs text-blue-100 italic mt-0.5">
                      {sanitizeHealthText(nextPendingDose.instructions)}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => markDoseOptimistic(nextPendingDose, nextPendingDose.status === 'late' ? 'late' : 'taken')}
                  className={`text-xs font-extrabold px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                    nextPendingDose.status === 'late'
                      ? 'bg-white text-amber-800 hover:bg-amber-50'
                      : 'bg-white text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  {nextPendingDose.status === 'late' ? 'Take Dose (Late)' : 'Take Dose'}
                </button>
                <button
                  type="button"
                  onClick={() => markDoseOptimistic(nextPendingDose, 'skipped')}
                  className="bg-black/20 hover:bg-black/30 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Comprehensive Medication Progress & Adherence Analytics Hub */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden space-y-5 p-5">
            {/* Header & Controls Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-gray-900 text-base tracking-tight">
                    Medication Progress & Intake Trend
                  </h3>
                  <span className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                    Live Analytics
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Visual compliance curves, daily dosage milestones, and treatment regimen progress.
                </p>
              </div>

              {/* Filter & View Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Medication Filter */}
                {uniqueMedsList.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-gray-500">Filter:</span>
                    <select
                      value={selectedMedFilter}
                      onChange={(e) => setSelectedMedFilter(e.target.value)}
                      className="text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800 cursor-pointer"
                    >
                      <option value="all">All Medications ({uniqueMedsList.length})</option>
                      {uniqueMedsList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.dosage ? `(${m.dosage})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Graph Style Toggle */}
                <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setGraphMode('curve')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      graphMode === 'curve'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="Continuous Compliance Curve"
                  >
                    Curve
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphMode('bars')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      graphMode === 'bars'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="Daily Dose Breakdown Bars"
                  >
                    Bars
                  </button>
                </div>

                {/* Time Window Selector */}
                <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setStatsWindow(d)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        statsWindow === d
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {d}D
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Adherence Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-indigo-50/40">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Overall Adherence</span>
                <p className="text-2xl font-black text-blue-700 mt-1">{stats?.adherenceRate || 0}%</p>
                <span className="text-[10px] text-blue-600/80 font-medium block mt-0.5">Past {statsWindow} days compliance</span>
              </div>
              <div className="p-3.5 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-teal-50/40">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Taken Doses</span>
                <p className="text-2xl font-black text-emerald-700 mt-1">{stats?.taken || 0}</p>
                <span className="text-[10px] text-emerald-600/80 font-medium block mt-0.5">Doses verified on schedule</span>
              </div>
              <div className="p-3.5 rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/60 to-pink-50/40">
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Missed / Overdue</span>
                <p className="text-2xl font-black text-rose-700 mt-1">{stats?.missed || 0}</p>
                <span className="text-[10px] text-rose-600/80 font-medium block mt-0.5">Doses skipped or forgotten</span>
              </div>
              <div className="p-3.5 rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/60 to-yellow-50/40">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Current Streak</span>
                <p className="text-2xl font-black text-amber-800 mt-1">
                  {streakData?.current || (stats?.taken > 0 ? 1 : 0)} <span className="text-xs font-bold text-amber-700">Days</span>
                </p>
                <span className="text-[10px] text-amber-700/90 font-medium block mt-0.5">
                  Continuous intake streak
                </span>
              </div>
            </div>

            {/* Interactive Graph Canvas */}
            <div className="relative bg-gradient-to-b from-gray-50/70 to-white rounded-xl border border-gray-200/90 p-4">
              {/* Graph Legend & Status Indicator */}
              <div className="flex flex-wrap items-center justify-between text-xs mb-3 text-gray-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs"></span> 100% Taken
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-amber-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs"></span> Partial / Late
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-rose-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs"></span> Missed
                  </span>
                  <span className="flex items-center gap-1 text-gray-400 font-medium">
                    <span className="w-2 h-2 rounded-full border border-gray-300 bg-gray-100"></span> Off-Schedule
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-400">
                  {selectedMedFilter === 'all'
                    ? 'Showing all active medications'
                    : `Filtered: ${uniqueMedsList.find((m) => m.id === selectedMedFilter)?.name || 'Medicine'}`}
                </span>
              </div>

              {trendData.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  No adherence progress recorded yet in this time window.
                </div>
              ) : graphMode === 'curve' ? (
                /* MODE A: Continuous Smooth Area/Curve Chart */
                <div className="relative w-full">
                  <svg
                    viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                    className="w-full h-auto overflow-visible select-none"
                  >
                    <defs>
                      <linearGradient id="medAdherenceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                      </linearGradient>
                      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10b981" floodOpacity="0.4" />
                      </filter>
                    </defs>

                    {/* Y-Axis Grid Lines & Percentage Markers */}
                    {gridLevels.map(({ pct, y }) => (
                      <g key={pct}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={padL + plotWidth}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray={pct === 0 || pct === 100 ? '0' : '4 4'}
                          strokeWidth="1"
                        />
                        <text
                          x={padL - 8}
                          y={y + 3}
                          textAnchor="end"
                          fontSize="9"
                          fill="#94a3b8"
                          fontWeight="700"
                        >
                          {pct}%
                        </text>
                      </g>
                    ))}

                    {/* Shaded Area Under Curve */}
                    {fillPath && (
                      <path
                        d={fillPath}
                        fill="url(#medAdherenceGrad)"
                        className="transition-all duration-700 ease-out"
                      />
                    )}

                    {/* Glowing Stroke Curve */}
                    {curvePath && (
                      <path
                        d={curvePath}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#glow)"
                        className="transition-all duration-500"
                      />
                    )}

                    {/* Interactive Data Points & Date Columns */}
                    {points.map((p, i) => {
                      const isHovered = hoveredPointIndex === i;
                      const hasData = p.hasDoses;
                      const isPerfect = hasData && p.adherenceRate === 100;
                      const isPartial = hasData && p.adherenceRate > 0 && p.adherenceRate < 100;
                      const isMissed = hasData && p.adherenceRate === 0;

                      let nodeColor = '#94a3b8';
                      if (isPerfect) nodeColor = '#10b981';
                      else if (isPartial) nodeColor = '#f59e0b';
                      else if (isMissed) nodeColor = '#ef4444';

                      return (
                        <g
                          key={i}
                          className="cursor-pointer group"
                          onMouseEnter={() => setHoveredPointIndex(i)}
                          onMouseLeave={() => setHoveredPointIndex(null)}
                          onClick={() => setHoveredPointIndex(isHovered ? null : i)}
                        >
                          {/* Invisible Wider Hover Hitbox */}
                          <rect
                            x={p.x - plotWidth / (points.length * 2)}
                            y={padT}
                            width={plotWidth / points.length}
                            height={plotHeight}
                            fill="transparent"
                          />

                          {/* Vertical Guide Line on Hover */}
                          {isHovered && (
                            <line
                              x1={p.x}
                              y1={padT}
                              x2={p.x}
                              y2={padT + plotHeight}
                              stroke="#60a5fa"
                              strokeWidth="1.5"
                              strokeDasharray="2 2"
                            />
                          )}

                          {/* Outer Pulsing Ring for Active Nodes */}
                          {hasData && (
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 8 : 6}
                              fill={nodeColor}
                              fillOpacity={isHovered ? 0.35 : 0.2}
                              className="transition-all duration-200"
                            />
                          )}

                          {/* Core Data Dot */}
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={hasData ? (isHovered ? 5.5 : 4) : 2.5}
                            fill={hasData ? '#ffffff' : '#e2e8f0'}
                            stroke={hasData ? nodeColor : '#cbd5e1'}
                            strokeWidth={hasData ? 2.5 : 1.5}
                            className="transition-all duration-200"
                          />

                          {/* X-Axis Date Labels */}
                          <text
                            x={p.x}
                            y={padT + plotHeight + 16}
                            textAnchor="middle"
                            fontSize="9"
                            fill={isHovered ? '#1e293b' : '#64748b'}
                            fontWeight={isHovered ? '800' : '600'}
                          >
                            {p.day.label?.split(' ')[1] || ''}
                          </text>
                          <text
                            x={p.x}
                            y={padT + plotHeight + 28}
                            textAnchor="middle"
                            fontSize="8"
                            fill={isHovered ? '#3b82f6' : '#94a3b8'}
                            fontWeight="600"
                          >
                            {p.day.dayOfWeek || ''}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Floating Interactive Tooltip Card */}
                  {hoveredPointIndex !== null && points[hoveredPointIndex] && (
                    <div
                      className="absolute z-30 pointer-events-none bg-gray-900/95 backdrop-blur-xs text-white text-xs p-3 rounded-xl shadow-2xl border border-gray-700/80 -translate-x-1/2 -translate-y-full mb-2 animate-in fade-in zoom-in-95 duration-150 min-w-[170px]"
                      style={{
                        left: `${(points[hoveredPointIndex].x / graphWidth) * 100}%`,
                        top: `${(points[hoveredPointIndex].y / graphHeight) * 100}%`,
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-gray-700 pb-1.5 mb-1.5">
                        <span className="font-extrabold text-white text-[11px]">
                          {points[hoveredPointIndex].day.label} ({points[hoveredPointIndex].day.dayOfWeek})
                        </span>
                        {points[hoveredPointIndex].hasDoses ? (
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                              points[hoveredPointIndex].adherenceRate === 100
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : points[hoveredPointIndex].adherenceRate > 0
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {points[hoveredPointIndex].adherenceRate}% Adherence
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-400">Off-Schedule</span>
                        )}
                      </div>

                      {points[hoveredPointIndex].hasDoses ? (
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-300">Doses Taken:</span>
                            <span className="font-bold text-emerald-400">
                              {points[hoveredPointIndex].day.taken} / {points[hoveredPointIndex].day.total} doses
                            </span>
                          </div>
                          {points[hoveredPointIndex].day.missed > 0 && (
                            <div className="flex items-center justify-between text-rose-400">
                              <span>Missed / Skipped:</span>
                              <span className="font-bold">{points[hoveredPointIndex].day.missed}</span>
                            </div>
                          )}
                          <div className="pt-1 text-[10px] text-gray-400 border-t border-gray-800">
                            Status:{' '}
                            <span className="text-white font-medium">
                              {points[hoveredPointIndex].adherenceRate === 100
                                ? 'Perfect intake consistency'
                                : 'Incomplete dosage logged'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">No prescription doses scheduled on this day.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* MODE B: Daily Dose Breakdown Stacked Bars */
                <div className="pt-2">
                  <div className="grid grid-flow-col auto-cols-fr gap-1.5 items-end h-40 border-b border-gray-200 pb-2">
                    {trendData.map((day, idx) => {
                      const dayTotal = day.total || 0;
                      const takenHeight = dayTotal > 0 ? (day.taken / dayTotal) * 100 : 0;
                      const skippedHeight = dayTotal > 0 ? (day.skipped / dayTotal) * 100 : 0;
                      const missedHeight = dayTotal > 0 ? (day.missed / dayTotal) * 100 : 0;
                      const isHovered = hoveredPointIndex === idx;

                      return (
                        <div
                          key={idx}
                          className="flex flex-col items-center h-full justify-end group relative cursor-pointer"
                          onMouseEnter={() => setHoveredPointIndex(idx)}
                          onMouseLeave={() => setHoveredPointIndex(null)}
                        >
                          {/* Tooltip on hover */}
                          {isHovered && (
                            <div className="absolute -top-12 z-20 flex flex-col items-center bg-gray-900 text-white text-[10px] py-1.5 px-2.5 rounded-lg whitespace-nowrap shadow-xl border border-gray-700">
                              <span className="font-bold">{day.label} ({day.dayOfWeek})</span>
                              <span>
                                {day.total > 0 ? `${day.taken}/${day.total} Doses Taken` : 'No doses scheduled'}
                              </span>
                            </div>
                          )}

                          {/* Bar Column */}
                          <div className="w-full max-w-[28px] bg-gray-100 rounded-t-md h-full flex flex-col justify-end overflow-hidden border border-gray-200/50">
                            {dayTotal === 0 ? (
                              <div className="h-1 bg-gray-200 w-full" title="No doses"></div>
                            ) : (
                              <>
                                {missedHeight > 0 && (
                                  <div
                                    style={{ height: `${missedHeight}%` }}
                                    className="bg-rose-500 w-full transition-all duration-300"
                                  ></div>
                                )}
                                {skippedHeight > 0 && (
                                  <div
                                    style={{ height: `${skippedHeight}%` }}
                                    className="bg-amber-400 w-full transition-all duration-300"
                                  ></div>
                                )}
                                {takenHeight > 0 && (
                                  <div
                                    style={{ height: `${takenHeight}%` }}
                                    className="bg-emerald-500 w-full transition-all duration-300"
                                  ></div>
                                )}
                              </>
                            )}
                          </div>
                          <span className="text-[9px] text-gray-500 mt-1 truncate max-w-full font-bold">
                            {day.label?.split(' ')[1] || ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Per-Medication Progress & Course Milestones */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                    Active Prescriptions & Course Milestones
                  </h4>
                  <p className="text-xs text-gray-500">
                    Individual dosage completion progress, timing milestones, and therapy adherence
                  </p>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('medications')}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                  >
                    Manage Prescriptions →
                  </button>
                )}
              </div>

              {uniqueMedsList.length === 0 ? (
                <div className="p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-500">
                  No active prescriptions to display.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {uniqueMedsList.map((med) => {
                    const medSchedule = schedule.filter((s) => s.medicationId === med.id);
                    const takenCount = medSchedule.filter((s) => s.status === 'taken' || s.status === 'late').length;
                    const totalCount = medSchedule.length;
                    const todayPercent = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 100;
                    const medStat = perMedData.find((pm) => pm.medicationId === med.id);
                    const overallRate = medStat ? medStat.adherenceRate : (totalCount > 0 && takenCount === totalCount ? 100 : 100);

                    // Course duration computation
                    let courseLabel = 'Active Maintenance Regimen';
                    let coursePct = 100;
                    if (med.durationDays || med.endDate) {
                      const start = new Date(med.startDate || Date.now());
                      const totalDays = med.durationDays || Math.max(1, Math.round((new Date(med.endDate) - start) / (1000 * 60 * 60 * 24)));
                      const daysElapsed = Math.max(1, Math.round((Date.now() - start) / (1000 * 60 * 60 * 24)));
                      coursePct = Math.min(100, Math.round((daysElapsed / totalDays) * 100));
                      courseLabel = `Day ${Math.min(daysElapsed, totalDays)} of ${totalDays} (${coursePct}% course completed)`;
                    }

                    return (
                      <div
                        key={med.id}
                        className="bg-gradient-to-br from-white to-gray-50/50 p-4 rounded-xl border border-gray-200/90 shadow-xs space-y-3 hover:border-blue-300 transition-all"
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="font-extrabold text-gray-900 text-sm">
                                {sanitizeHealthText(med.name)}
                              </h5>
                              {(med.power || med.dosage) && (
                                <span className="bg-indigo-50 text-indigo-700 font-black text-[10px] px-2 py-0.5 rounded-full border border-indigo-200">
                                  {sanitizeHealthText(med.power || med.dosage)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {med.frequency ? med.frequency.replace(/_/g, ' ') : 'Scheduled doses'}
                              {med.prescribedBy ? ` • ${med.prescribedBy}` : ''}
                            </p>
                          </div>

                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider ${
                              todayPercent === 100
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : todayPercent > 0
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {totalCount > 0 ? `${todayPercent}% Today` : 'Active'}
                          </span>
                        </div>

                        {/* Today's Intake Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-gray-700">Today's Intake Progress</span>
                            <span className="font-extrabold text-blue-700">
                              {totalCount > 0 ? `${takenCount} of ${totalCount} Doses Taken` : 'No doses today'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              style={{ width: `${totalCount > 0 ? todayPercent : 100}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                todayPercent === 100
                                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
                                  : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                              }`}
                            ></div>
                          </div>
                        </div>

                        {/* Intake Dose Slots Timeline */}
                        {medSchedule.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {medSchedule.map((slot, sIdx) => {
                              const isTaken = slot.status === 'taken' || slot.status === 'late';
                              return (
                                <div
                                  key={sIdx}
                                  className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-semibold ${
                                    isTaken
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : 'bg-gray-50 border-gray-200 text-gray-600'
                                  }`}
                                >
                                  <span className="font-bold">
                                    {isTaken ? 'Taken' : 'Pending'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Clinical Directions & Course Footer */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                          <span className="truncate max-w-[200px]" title={med.instructions}>
                            {med.instructions ? `• ${sanitizeHealthText(med.instructions)}` : courseLabel}
                          </span>
                          <span className="font-bold text-gray-700 shrink-0">
                            Adherence: <span className="text-emerald-700">{overallRate}%</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Doctor Clinical Reports & Diagnostic Records Section */}
            <div id="doctor-reports-section" className="space-y-4 pt-4 border-t">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Doctor Clinical Reports & Diagnostic Records</span>
                    {reports.length > 0 && (
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200">
                        {reports.length} Filed
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-500">
                    Diagnostic summaries, blood pressure exams, glucose logs & document attachments uploaded by your doctor
                  </p>
                </div>

                {reports.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReportsModal(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Open Full Dossier Modal</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Filters & Search Toolbar */}
              {reports.length > 0 && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'all', label: `All (${reports.length})` },
                      { id: 'bp_report', label: `Blood Pressure (${reports.filter((r) => r.reportType === 'bp_report').length})` },
                      { id: 'sugar_report', label: `Blood Sugar (${reports.filter((r) => r.reportType === 'sugar_report').length})` },
                      { id: 'lab_report', label: `Lab (${reports.filter((r) => r.reportType === 'lab_report').length})` },
                      { id: 'radiology', label: `Scans (${reports.filter((r) => r.reportType === 'radiology').length})` },
                      { id: 'consultation', label: `Consultations (${reports.filter((r) => r.reportType === 'consultation' || r.reportType === 'diagnosis').length})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedReportFilter(tab.id)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          selectedReportFilter === tab.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-56">
                    <input
                      type="text"
                      placeholder="Search reports or doctor..."
                      value={reportSearchQuery}
                      onChange={(e) => setReportSearchQuery(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Reports List */}
              {reports.length === 0 ? (
                <div className="p-6 bg-gradient-to-r from-blue-50/40 to-indigo-50/30 rounded-2xl border border-dashed border-blue-200 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h5 className="font-bold text-xs text-gray-800">No medical reports uploaded by your doctor yet</h5>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    When your healthcare provider records blood pressure measurements, blood sugar test results, or uploads medical PDFs and diagnostic photos, they will appear here.
                  </p>
                </div>
              ) : (() => {
                const filtered = reports.filter((r) => {
                  if (selectedReportFilter !== 'all' && r.reportType !== selectedReportFilter) {
                    if (selectedReportFilter === 'consultation' && r.reportType === 'diagnosis') return true;
                    return false;
                  }
                  if (reportSearchQuery.trim()) {
                    const q = reportSearchQuery.toLowerCase();
                    const matchTitle = r.title?.toLowerCase().includes(q);
                    const matchDoc = r.doctorName?.toLowerCase().includes(q);
                    const matchDiag = r.diagnosis?.toLowerCase().includes(q);
                    const matchNotes = r.clinicalNotes?.toLowerCase().includes(q);
                    const matchRec = r.recommendations?.toLowerCase().includes(q);
                    const matchFile = r.attachment?.fileName?.toLowerCase().includes(q);
                    return matchTitle || matchDoc || matchDiag || matchNotes || matchRec || matchFile;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-500 border">
                      No reports match your search query or selected filter.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filtered.map((report) => {
                      const isBp = report.reportType === 'bp_report';
                      const isSugar = report.reportType === 'sugar_report';
                      const isLab = report.reportType === 'lab_report';
                      const isRadiology = report.reportType === 'radiology';

                      const badgeStyle = isBp
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : isSugar
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : isLab
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : isRadiology
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200';

                      const isImageAttachment = report.attachment?.fileType?.startsWith('image/') || report.attachment?.fileData?.startsWith('data:image/');
                      const isPdfAttachment = report.attachment?.fileType === 'application/pdf' || report.attachment?.fileData?.startsWith('data:application/pdf') || report.attachment?.fileName?.toLowerCase()?.endsWith('.pdf');

                      return (
                        <div
                          key={report._id}
                          className="bg-white p-4 rounded-xl border border-gray-200/90 shadow-xs space-y-3 hover:border-blue-300 transition-all flex flex-col justify-between"
                        >
                          <div className="space-y-2.5">
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2.5">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h5 className="font-extrabold text-gray-900 text-sm">
                                    {report.title}
                                  </h5>
                                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                                    {report.reportType?.replace(/_/g, ' ') || 'REPORT'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  {report.testDate && (
                                    <>
                                      Test Date: <strong className="text-gray-700">{new Date(report.testDate).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</strong> •{' '}
                                    </>
                                  )}
                                  Doctor: <strong className="text-gray-800">{report.doctorName || 'Physician'}</strong>
                                </p>
                              </div>

                              {report.attachment && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 shrink-0">
                                  {isPdfAttachment ? 'PDF Attached' : isImageAttachment ? 'Photo Attached' : 'File Attached'}
                                </span>
                              )}
                            </div>

                            {/* Diagnosis Banner */}
                            {report.diagnosis && (
                              <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-950 flex items-start gap-1.5">
                                <span className="font-bold text-amber-800 shrink-0">Diagnosis:</span>
                                <span>{report.diagnosis}</span>
                              </div>
                            )}

                            {/* Vitals Highlights */}
                            {report.vitals && (
                              <div className="flex flex-wrap gap-2 text-xs">
                                {(report.vitals.bloodPressure || (report.vitals.systolic && report.vitals.diastolic)) && (
                                  <div className="bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg text-rose-900 flex items-center gap-1 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                                    BP:{' '}
                                    <strong className="font-bold text-rose-950">
                                      {report.vitals.systolic && report.vitals.diastolic
                                        ? `${report.vitals.systolic}/${report.vitals.diastolic} mmHg`
                                        : report.vitals.bloodPressure}
                                    </strong>
                                  </div>
                                )}

                                {report.vitals.heartRate && (
                                  <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                                    Pulse: <strong className="text-gray-900">{report.vitals.heartRate} bpm</strong>
                                  </span>
                                )}

                                {(report.vitals.bloodSugar || report.vitals.fastingSugar || report.vitals.postPrandialSugar || report.vitals.hba1c) && (
                                  <div className="bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-amber-900 flex items-center gap-1 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                    Glucose:{' '}
                                    <strong className="font-bold text-amber-950">
                                      {report.vitals.fastingSugar && `Fasting: ${report.vitals.fastingSugar} mg/dL `}
                                      {report.vitals.postPrandialSugar && `| PP: ${report.vitals.postPrandialSugar} mg/dL `}
                                      {report.vitals.hba1c && `| HbA1c: ${report.vitals.hba1c}% `}
                                      {!report.vitals.fastingSugar && !report.vitals.postPrandialSugar && !report.vitals.hba1c && report.vitals.bloodSugar}
                                    </strong>
                                  </div>
                                )}

                                {report.vitals.temperature && (
                                  <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                                    Temp: <strong className="text-gray-900">{report.vitals.temperature}</strong>
                                  </span>
                                )}

                                {report.vitals.weight && (
                                  <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                                    Weight: <strong className="text-gray-900">{report.vitals.weight}</strong>
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Clinical Observations */}
                            {report.clinicalNotes && (
                              <div className="text-xs text-gray-700 space-y-1">
                                <span className="font-semibold text-gray-500">Doctor's Observations:</span>
                                <p className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 whitespace-pre-line text-xs">
                                  {report.clinicalNotes}
                                </p>
                              </div>
                            )}

                            {/* Recommendations */}
                            {report.recommendations && (
                              <div className="text-xs text-emerald-950 space-y-1">
                                <span className="font-semibold text-emerald-700">Follow-Up & Instructions:</span>
                                <p className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200 whitespace-pre-line text-xs font-medium">
                                  {report.recommendations}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* File / Document Attachment Row */}
                          {report.attachment && report.attachment.fileData && (
                            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 bg-slate-50/70 p-2.5 rounded-lg">
                              <div className="flex items-center gap-2 overflow-hidden">
                                {isImageAttachment ? (
                                  <div
                                    onClick={() => setPreviewAttachment(report.attachment)}
                                    className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-white shrink-0 cursor-pointer shadow-2xs hover:opacity-90 transition-opacity"
                                    title="Click to view photo"
                                  >
                                    <img
                                      src={report.attachment.fileData}
                                      alt={report.attachment.fileName}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 border border-red-200 flex flex-col items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-[7px] font-black uppercase">PDF</span>
                                  </div>
                                )}
                                <div className="truncate">
                                  <p className="text-[11px] font-bold text-gray-800 truncate">
                                    {report.attachment.fileName || 'Report Attachment'}
                                  </p>
                                  <p className="text-[9px] text-gray-500">
                                    {report.attachment.fileSize ? `${(report.attachment.fileSize / 1024).toFixed(1)} KB` : 'File ready'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isImageAttachment && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachment(report.attachment)}
                                    className="text-[11px] font-bold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                                  >
                                    View
                                  </button>
                                )}

                                {isPdfAttachment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newWindow = window.open();
                                      if (newWindow) {
                                        newWindow.document.write(
                                          `<iframe src="${report.attachment.fileData}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
                                        );
                                      }
                                    }}
                                    className="text-[11px] font-bold px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Open PDF
                                  </button>
                                )}

                                <a
                                  href={report.attachment.fileData}
                                  download={report.attachment.fileName || 'medical-report'}
                                  className="text-[11px] font-bold px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Safety Alerts / Drug Conflicts */}
          {conflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Active Prescription Safety Alerts</span>
              </div>
              {conflicts.map((c, i) => (
                <p key={i} className="text-xs text-rose-700 bg-white/60 p-2.5 rounded-lg border border-rose-100">
                  {c.message}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {/* Refill Request Modal */}
      {showRefillModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitRefill}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Request Medication Refill</h3>
                <p className="text-xs text-gray-500">Send an authorized refill dispatch order to your pharmacy</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRefillModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {refillSuccessMsg ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                {refillSuccessMsg}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Medication</label>
                  <select
                    value={refillMedId}
                    onChange={(e) => setRefillMedId(e.target.value)}
                    required
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Choose Medication --</option>
                    {uniqueMedsInSchedule.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Urgency</label>
                  <select
                    value={refillUrgency}
                    onChange={(e) => setRefillUrgency(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="routine">Routine (5-7 days supply remaining)</option>
                    <option value="urgent">Urgent (1-2 days supply remaining)</option>
                    <option value="emergency">Emergency (Out of medication)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes for Pharmacist</label>
                  <textarea
                    rows="3"
                    value={refillNotes}
                    onChange={(e) => setRefillNotes(e.target.value)}
                    placeholder="e.g., Please refill 30-day bottle. Pickup on Friday afternoon."
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowRefillModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRefill || !refillMedId}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submittingRefill ? 'Submitting...' : 'Submit Refill Request'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* MODAL: Doctor Clinical Reports & Diagnostic Dossier */}
      {showReportsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-200 max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in zoom-in-95 duration-100">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 to-indigo-50/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                    Doctor Clinical Reports & Diagnostic Records
                    {reports.length > 0 && (
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200">
                        {reports.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Verified clinical observations, BP examinations, blood sugar tests & attachments uploaded by your doctor
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowReportsModal(false)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 rounded-lg hover:bg-white transition-colors cursor-pointer"
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Modal Search & Filter Bar */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'all', label: `All (${reports.length})` },
                  { id: 'bp_report', label: `Blood Pressure (${reports.filter((r) => r.reportType === 'bp_report').length})` },
                  { id: 'sugar_report', label: `Blood Sugar (${reports.filter((r) => r.reportType === 'sugar_report').length})` },
                  { id: 'lab_report', label: `Lab (${reports.filter((r) => r.reportType === 'lab_report').length})` },
                  { id: 'radiology', label: `Scans (${reports.filter((r) => r.reportType === 'radiology').length})` },
                  { id: 'consultation', label: `Consultations (${reports.filter((r) => r.reportType === 'consultation' || r.reportType === 'diagnosis').length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedReportFilter(tab.id)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      selectedReportFilter === tab.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-60 shrink-0">
                <input
                  type="text"
                  placeholder="Filter by diagnosis or doctor..."
                  value={reportSearchQuery}
                  onChange={(e) => setReportSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Modal Body: Reports Grid */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 max-h-[60vh]">
              {reports.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 border border-dashed rounded-xl bg-gray-50/50 space-y-2">
                  <p className="font-bold text-gray-700">No clinical reports filed in your medical profile yet.</p>
                  <p className="text-gray-400 max-w-sm mx-auto">
                    When your consulting physician adds BP tests, blood sugar readings, or attaches diagnostic documents, they will appear here.
                  </p>
                </div>
              ) : (() => {
                const filtered = reports.filter((r) => {
                  if (selectedReportFilter !== 'all' && r.reportType !== selectedReportFilter) {
                    if (selectedReportFilter === 'consultation' && r.reportType === 'diagnosis') return true;
                    return false;
                  }
                  if (reportSearchQuery.trim()) {
                    const q = reportSearchQuery.toLowerCase();
                    const matchTitle = r.title?.toLowerCase().includes(q);
                    const matchDoc = r.doctorName?.toLowerCase().includes(q);
                    const matchDiag = r.diagnosis?.toLowerCase().includes(q);
                    const matchNotes = r.clinicalNotes?.toLowerCase().includes(q);
                    const matchRec = r.recommendations?.toLowerCase().includes(q);
                    const matchFile = r.attachment?.fileName?.toLowerCase().includes(q);
                    return matchTitle || matchDoc || matchDiag || matchNotes || matchRec || matchFile;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-6 text-center text-xs text-gray-500 border rounded-xl bg-gray-50">
                      No reports match your search query or selected filter.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {filtered.map((report) => {
                      const isBp = report.reportType === 'bp_report';
                      const isSugar = report.reportType === 'sugar_report';
                      const isLab = report.reportType === 'lab_report';
                      const isRadiology = report.reportType === 'radiology';

                      const badgeStyle = isBp
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : isSugar
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : isLab
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : isRadiology
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200';

                      const isImageAttachment = report.attachment?.fileType?.startsWith('image/') || report.attachment?.fileData?.startsWith('data:image/');
                      const isPdfAttachment = report.attachment?.fileType === 'application/pdf' || report.attachment?.fileData?.startsWith('data:application/pdf') || report.attachment?.fileName?.toLowerCase()?.endsWith('.pdf');

                      return (
                        <div
                          key={report._id}
                          className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3 hover:border-blue-300 transition-all"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="font-extrabold text-sm text-gray-900">{report.title}</h5>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                                  {report.reportType?.replace(/_/g, ' ') || 'REPORT'}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                {report.testDate && (
                                  <>
                                    Test Date: <strong className="text-gray-700">{new Date(report.testDate).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</strong> •{' '}
                                  </>
                                )}
                                Consulting Doctor: <strong className="text-gray-800">{report.doctorName || 'Physician'}</strong> • Filed: {new Date(report.createdAt).toLocaleDateString([], {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            </div>

                            {report.attachment && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                                {isPdfAttachment ? 'PDF Document' : isImageAttachment ? 'Photo / Scan' : 'Attached File'}
                              </span>
                            )}
                          </div>

                          {/* Primary Diagnosis */}
                          {report.diagnosis && (
                            <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-950 flex items-start gap-1.5">
                              <span className="font-bold text-amber-800 shrink-0">Diagnosis:</span>
                              <span>{report.diagnosis}</span>
                            </div>
                          )}

                          {/* Vitals Highlights */}
                          {report.vitals && (
                            <div className="flex flex-wrap gap-2 text-xs">
                              {(report.vitals.bloodPressure || (report.vitals.systolic && report.vitals.diastolic)) && (
                                <div className="bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg text-rose-900 flex items-center gap-1 font-medium">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                                  BP:{' '}
                                  <strong className="font-bold text-rose-950">
                                    {report.vitals.systolic && report.vitals.diastolic
                                      ? `${report.vitals.systolic}/${report.vitals.diastolic} mmHg`
                                      : report.vitals.bloodPressure}
                                  </strong>
                                </div>
                              )}

                              {report.vitals.heartRate && (
                                <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                                  Pulse: <strong className="text-gray-900">{report.vitals.heartRate} bpm</strong>
                                </span>
                              )}

                              {(report.vitals.bloodSugar || report.vitals.fastingSugar || report.vitals.postPrandialSugar || report.vitals.hba1c) && (
                                <div className="bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-amber-900 flex items-center gap-1 font-medium">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                  Glucose:{' '}
                                  <strong className="font-bold text-amber-950">
                                    {report.vitals.fastingSugar && `Fasting: ${report.vitals.fastingSugar} mg/dL `}
                                    {report.vitals.postPrandialSugar && `| PP: ${report.vitals.postPrandialSugar} mg/dL `}
                                    {report.vitals.hba1c && `| HbA1c: ${report.vitals.hba1c}% `}
                                    {!report.vitals.fastingSugar && !report.vitals.postPrandialSugar && !report.vitals.hba1c && report.vitals.bloodSugar}
                                  </strong>
                                </div>
                              )}

                              {report.vitals.temperature && (
                                <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                                  Temp: <strong className="text-gray-900">{report.vitals.temperature}</strong>
                                </span>
                              )}

                              {report.vitals.weight && (
                                <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                                  Weight: <strong className="text-gray-900">{report.vitals.weight}</strong>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Clinical Observations */}
                          {report.clinicalNotes && (
                            <div className="text-xs text-gray-700 space-y-1">
                              <span className="font-semibold text-gray-500">Observations & Findings:</span>
                              <p className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 whitespace-pre-line text-xs">
                                {report.clinicalNotes}
                              </p>
                            </div>
                          )}

                          {/* Recommendations */}
                          {report.recommendations && (
                            <div className="text-xs text-emerald-950 space-y-1">
                              <span className="font-semibold text-emerald-700">Doctor's Recommendations:</span>
                              <p className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200 whitespace-pre-line text-xs font-medium">
                                {report.recommendations}
                              </p>
                            </div>
                          )}

                          {/* Attachment Row */}
                          {report.attachment && report.attachment.fileData && (
                            <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl">
                              <div className="flex items-center gap-3">
                                {isImageAttachment ? (
                                  <div
                                    onClick={() => setPreviewAttachment(report.attachment)}
                                    className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-white shrink-0 cursor-pointer shadow-xs hover:opacity-90 transition-opacity"
                                    title="Click to view photo"
                                  >
                                    <img
                                      src={report.attachment.fileData}
                                      alt={report.attachment.fileName}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-red-100 text-red-700 border border-red-200 flex flex-col items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-[8px] font-black uppercase">PDF</span>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-bold text-gray-900 break-all">
                                    {report.attachment.fileName || 'Diagnostic Report File'}
                                  </p>
                                  <p className="text-[10px] text-gray-500">
                                    {report.attachment.fileSize ? `${(report.attachment.fileSize / 1024).toFixed(1)} KB` : 'Attached'} • {isPdfAttachment ? 'PDF Document' : 'Photo Attachment'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                {isImageAttachment && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachment(report.attachment)}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    Preview Photo
                                  </button>
                                )}

                                {isPdfAttachment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newWindow = window.open();
                                      if (newWindow) {
                                        newWindow.document.write(
                                          `<iframe src="${report.attachment.fileData}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
                                        );
                                      }
                                    }}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    Open PDF
                                  </button>
                                )}

                                <a
                                  href={report.attachment.fileData}
                                  download={report.attachment.fileName || 'medical-report'}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowReportsModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal: Full Resolution Preview of Report Image / Photo / Lab Scan */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-gray-900 text-white flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-bold text-gray-100 truncate max-w-md">
                  {previewAttachment.fileName || 'Diagnostic Report Photo'}
                </span>
                {previewAttachment.fileSize && (
                  <span className="text-[10px] text-gray-400">
                    ({(previewAttachment.fileSize / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAttachment.fileData}
                  download={previewAttachment.fileName || 'diagnostic-photo'}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="text-gray-400 hover:text-white text-xl font-bold p-1 rounded-lg hover:bg-gray-800 cursor-pointer"
                  title="Close preview"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-4 bg-gray-950 flex items-center justify-center overflow-auto max-h-[calc(90vh-60px)]">
              <img
                src={previewAttachment.fileData}
                alt={previewAttachment.fileName || 'Diagnostic Attachment'}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
