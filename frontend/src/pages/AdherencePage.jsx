import React, { useState, useEffect } from 'react';
import { adherenceApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { sanitizeHealthText } from '../utils/sanitize';

export default function AdherencePage() {
  const { user } = useAuth();
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const fetchData = async (d = days) => {
    setLoading(true);
    setError('');
    try {
      // Consume the single unified endpoint
      const res = await adherenceApi.stats(d);
      if (res && res.success) {
        setData(res);
      } else {
        setError(res?.message || 'Failed to load adherence data');
      }
    } catch (err) {
      console.error('Adherence fetch error:', err);
      setError('Unable to load adherence analytics. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(days);
  }, [days]);

  const stats = data?.stats;
  const history = data?.history || data?.logs || [];
  const streak = data?.streak || { current: 0, longest: 0 };
  const perMedication = data?.perMedication || [];
  const trend = data?.trend || [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Medication Adherence & Analytics</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Monitor intake consistency, daily compliance patterns, and printable clinical reports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Print Assessment Report Button */}
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-xs cursor-pointer"
            title="Generate Printable Physician Assessment Report"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Report</span>
          </button>

          {/* Time Window Tabs */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  days === d
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

      {/* Loading Skeleton State */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="h-44 bg-gray-200 rounded-xl"></div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      )}

      {/* Error State with Retry Affordance */}
      {!loading && error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
          <p className="text-red-700 font-semibold text-sm">{error}</p>
          <button
            type="button"
            onClick={() => fetchData(days)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Retry Loading Adherence Data
          </button>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && (
        <>
          {/* Top KPI Cards & Streaks */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {/* Adherence Rate */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Adherence Rate</span>
              <p className="text-3xl font-extrabold text-blue-600 mt-1">{stats?.adherenceRate || 0}%</p>
              <span className="text-[11px] text-gray-400 mt-0.5 block">{days}-day window</span>
            </div>

            {/* Doses Taken */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Taken</span>
              <p className="text-3xl font-extrabold text-emerald-700 mt-1">{stats?.taken || 0}</p>
              <span className="text-[11px] text-gray-400 mt-0.5 block">On-time or logged</span>
            </div>

            {/* Doses Missed */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Missed</span>
              <p className="text-3xl font-extrabold text-rose-700 mt-1">{stats?.missed || 0}</p>
              <span className="text-[11px] text-gray-400 mt-0.5 block">Past schedule</span>
            </div>

            {/* Doses Skipped */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Skipped</span>
              <p className="text-3xl font-extrabold text-amber-700 mt-1">{stats?.skipped || 0}</p>
              <span className="text-[11px] text-gray-400 mt-0.5 block">Intentionally paused</span>
            </div>

            {/* Current Streak */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl border border-amber-200 shadow-xs">
              <div className="flex items-center gap-1 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                Current Streak
              </div>
              <p className="text-2xl font-extrabold text-amber-900 mt-1">
                {streak.current} <span className="text-xs font-semibold text-amber-700">Days</span>
              </p>
              <span className="text-[10px] text-amber-700 font-medium block">100% adherence days</span>
            </div>

            {/* Longest Streak */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-200 shadow-xs">
              <div className="flex items-center gap-1 text-purple-800 text-[10px] font-bold uppercase tracking-wider">
                Longest Streak
              </div>
              <p className="text-2xl font-extrabold text-purple-900 mt-1">
                {streak.longest} <span className="text-xs font-semibold text-purple-700">Days</span>
              </p>
              <span className="text-[10px] text-purple-700 font-medium block">All-time record</span>
            </div>
          </div>

          {/* Trend Chart (Daily Taken vs Missed Stacked/Bar Representation) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Daily Compliance Trend ({days} Days)</h3>
                <p className="text-xs text-gray-500">Visual breakdown of daily doses taken vs missed</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-gray-600 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Taken
                </span>
                <span className="flex items-center gap-1 text-gray-600 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Skipped
                </span>
                <span className="flex items-center gap-1 text-gray-600 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Missed
                </span>
              </div>
            </div>

            {trend.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No trend history available.</div>
            ) : (
              <div className="grid grid-flow-col auto-cols-fr gap-1.5 pt-3 items-end h-36 border-b pb-2">
                {trend.map((day, idx) => {
                  const dayTotal = day.total || 0;
                  const takenHeight = dayTotal > 0 ? (day.taken / dayTotal) * 100 : 0;
                  const skippedHeight = dayTotal > 0 ? (day.skipped / dayTotal) * 100 : 0;
                  const missedHeight = dayTotal > 0 ? (day.missed / dayTotal) * 100 : 0;

                  return (
                    <div key={idx} className="flex flex-col items-center h-full justify-end group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-10 hidden group-hover:flex flex-col items-center bg-gray-900 text-white text-[10px] py-1 px-2 rounded z-20 whitespace-nowrap shadow-lg">
                        <span className="font-bold">{day.label}</span>
                        <span>{day.taken}/{day.total} doses taken</span>
                      </div>

                      {/* Bar Column */}
                      <div className="w-full max-w-[28px] bg-gray-100 rounded-t-md h-full flex flex-col justify-end overflow-hidden">
                        {dayTotal === 0 ? (
                          <div className="h-1 bg-gray-200 w-full" title="No doses scheduled"></div>
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
                      <span className="text-[9px] text-gray-500 mt-1 truncate max-w-full font-medium">
                        {days <= 14 ? day.label.split(' ')[1] : idx % 3 === 0 ? day.label.split(' ')[1] : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-Medication Breakdown */}
          {perMedication.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-gray-900">Per-Medication Consistency Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {perMedication.map((med) => (
                  <div key={med.medicationId} className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">{sanitizeHealthText(med.name)}</h4>
                        <span className="text-[11px] text-gray-500">{med.dosage || 'Standard dose'}</span>
                      </div>
                      <span
                        className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                          med.adherenceRate >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : med.adherenceRate >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {med.adherenceRate}%
                      </span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${(med.taken / (med.total || 1)) * 100}%` }}
                      ></div>
                      <div
                        className="bg-rose-500 h-full"
                        style={{ width: `${(med.missed / (med.total || 1)) * 100}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{med.taken} taken</span>
                      <span>{med.missed} missed</span>
                      <span>{med.total} total</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dose Activity Log Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Dose Activity Log</h3>
                <p className="text-xs text-gray-500">Historical intake logs for the past {days} days</p>
              </div>
              <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                {history.length} Entries
              </span>
            </div>

            {history.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-gray-700">No dose logs recorded in the last {days} days</p>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Dose logs will appear here automatically as you confirm doses taken or skipped from your Dashboard.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Medication</th>
                      <th className="py-3 px-4">Scheduled For</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Logged Time</th>
                      <th className="py-3 px-4">Clinical Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {history.map((item, idx) => {
                      const medName = sanitizeHealthText(item.medicationId?.name || item.medicationName || 'Medication');
                      const medDosage = sanitizeHealthText(item.medicationId?.dosage || '');
                      const noteText = sanitizeHealthText(item.notes || '—');

                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-gray-900">
                            {medName}
                            {medDosage && <span className="text-[11px] text-gray-500 block font-normal">{medDosage}</span>}
                          </td>
                          <td className="py-3.5 px-4 text-gray-700">
                            {new Date(item.scheduledTime).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                item.status === 'taken'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'skipped'
                                  ? 'bg-amber-100 text-amber-800'
                                  : item.status === 'late'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-gray-500">
                            {item.takenAt
                              ? new Date(item.takenAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-gray-600 max-w-xs truncate">
                            {noteText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Printable Physician Assessment Report Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded">
                  Clinical Record
                </span>
                <h3 className="text-lg font-extrabold text-gray-900 mt-1">
                  Physician Adherence Assessment Report
                </h3>
                <p className="text-xs text-gray-500">
                  Exportable summary for clinical consultation & medical record transfer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Printable Area */}
            <div id="printable-assessment-area" className="space-y-4 text-xs text-gray-800 border p-4 rounded-xl bg-gray-50/50">
              <div className="flex justify-between border-b pb-3">
                <div>
                  <p className="font-bold text-sm text-gray-900">Patient: {user?.name || 'Authorized Patient'}</p>
                  <p className="text-gray-500">Phone: {user?.phone || '—'} | Blood Group: {sanitizeHealthText(user?.bloodGroup, 'Not Specified')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-700">Assessment Period: {days} Days</p>
                  <p className="text-gray-500">Generated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>

              {/* Summary Stats Table */}
              <div>
                <h4 className="font-bold text-gray-900 mb-2">Compliance Score</h4>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded border">
                    <p className="text-[10px] text-gray-500">Adherence</p>
                    <p className="text-base font-extrabold text-blue-700">{stats?.adherenceRate || 0}%</p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-[10px] text-gray-500">Taken</p>
                    <p className="text-base font-extrabold text-emerald-700">{stats?.taken || 0}</p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-[10px] text-gray-500">Missed</p>
                    <p className="text-base font-extrabold text-rose-700">{stats?.missed || 0}</p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-[10px] text-gray-500">Longest Streak</p>
                    <p className="text-base font-extrabold text-purple-700">{streak?.longest || 0} D</p>
                  </div>
                </div>
              </div>

              {/* Per-Medication Breakdown */}
              <div>
                <h4 className="font-bold text-gray-900 mb-1">Medications Intake Breakdown</h4>
                <div className="divide-y divide-gray-200 border rounded-lg bg-white overflow-hidden">
                  {perMedication.map((med) => (
                    <div key={med.medicationId} className="p-2.5 flex justify-between items-center text-[11px]">
                      <div>
                        <span className="font-bold text-gray-900">{sanitizeHealthText(med.name)}</span>{' '}
                        <span className="text-gray-500">({med.dosage || 'Standard'})</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-600">{med.taken}/{med.total} doses taken</span>
                        <span className="font-bold text-blue-700">{med.adherenceRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signature Block */}
              <div className="pt-6 border-t flex justify-between items-end text-[11px] text-gray-500">
                <div>
                  <p className="font-semibold text-gray-700">Platform: MedSafe Healthcare Infrastructure</p>
                  <p>Encrypted at rest (AES-256-GCM)</p>
                </div>
                <div className="text-right">
                  <div className="w-40 border-b border-gray-400 mb-1"></div>
                  <p className="font-semibold text-gray-700">Reviewing Physician Signature</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
