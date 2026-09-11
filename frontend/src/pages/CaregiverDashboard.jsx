import React, { useState, useEffect } from 'react';
import { caregiverApi, communicationApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CaregiverDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRelationship, setInviteRelationship] = useState('Parent');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Communicate with Doctor / Care team modal
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageTargetPatient, setMessageTargetPatient] = useState(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageCategory, setMessageCategory] = useState('missed_dose_concern');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSuccess, setMessageSuccess] = useState('');

  // Consent & Permissions Modal
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [targetLink, setTargetLink] = useState(null);
  const [canViewMeds, setCanViewMeds] = useState(true);
  const [canViewAdh, setCanViewAdh] = useState(true);
  const [canManageConsentState, setCanManageConsentState] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await caregiverApi.dashboardSummary();
      setSummary(res);
      if (res.patients && res.patients.length > 0 && !selectedPatientId) {
        setSelectedPatientId(res.patients[0].patient._id);
      }
    } catch (err) {
      console.error('Failed to fetch caregiver summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviting(true);
    try {
      await caregiverApi.invite(invitePhone, inviteRelationship);
      setShowInviteModal(false);
      setInvitePhone('');
      fetchSummary();
    } catch (err) {
      setInviteError(err.message || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageTargetPatient) return;
    setSendingMessage(true);
    try {
      await communicationApi.sendMessage({
        patientId: messageTargetPatient.id,
        recipientRole: 'doctor',
        category: messageCategory,
        subject: messageSubject,
        message: messageBody,
      });
      setMessageSuccess('Clinical message sent directly to attending healthcare team!');
      setTimeout(() => {
        setMessageModalOpen(false);
        setMessageSuccess('');
      }, 1600);
    } catch (err) {
      alert(err.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSavePermissions = async (e) => {
    e.preventDefault();
    if (!targetLink) return;
    setSavingPermissions(true);
    try {
      await caregiverApi.updatePermissions(targetLink.linkId, {
        canViewMedications: canViewMeds,
        canViewAdherence: canViewAdh,
        canManageConsent: canManageConsentState,
      });
      setPermissionModalOpen(false);
      fetchSummary();
    } catch (err) {
      alert(err.message || 'Failed to update permissions.');
    } finally {
      setSavingPermissions(false);
    }
  };

  const openMessageModal = (patientId, patientName, initialCategory = 'general') => {
    setMessageTargetPatient({ id: patientId, name: patientName });
    setMessageCategory(initialCategory);
    setMessageSubject(
      initialCategory === 'missed_dose_concern'
        ? `Missed Dose Alert for ${patientName}`
        : `Caregiver Observation for ${patientName}`
    );
    setMessageBody('');
    setMessageSuccess('');
    setMessageModalOpen(true);
  };

  const openPermissionModal = (link) => {
    setTargetLink(link);
    setCanViewMeds(link.canViewMedications);
    setCanViewAdh(link.canViewAdherence);
    setCanManageConsentState(link.canManageConsent);
    setPermissionModalOpen(true);
  };

  const currentPatientData = summary?.patients?.find((p) => p.patient._id === selectedPatientId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-950 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="bg-emerald-500/30 text-emerald-200 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-emerald-400/30">
            Caregiver Network & Family Portal
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight">
            Patient Support & Adherence Monitoring
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1 max-w-2xl">
            Real-time compliance oversight, missed dose alerts, adverse symptom detection, and clinical care team communication.
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-white text-emerald-900 hover:bg-emerald-50 font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all self-start md:self-auto"
        >
          + Link Another Patient
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading caregiver monitoring data...</div>
      ) : !summary || summary.patientCount === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-gray-800 text-base">No Authorized Patients Linked</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            You are not currently authorized to monitor any patients. Ask your family member or patient to link your mobile phone ({user?.phone}) or send an authorization invite.
          </p>
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
          >
            Invite Patient by Mobile
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Missed Doses Alert Strip */}
          {summary.missedAlerts && summary.missedAlerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-900 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h4 className="font-extrabold text-sm">
                    {summary.missedAlerts.length} Missed Dose Alert(s) Recorded Today
                  </h4>
                </div>
                <span className="text-xs bg-amber-200/80 px-2 py-0.5 rounded-full font-bold">Requires Attention</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {summary.missedAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className="bg-white/90 p-2.5 rounded-xl border border-amber-200 text-xs flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-gray-800">{alert.patientName}</p>
                      <p className="text-[11px] text-gray-600">
                        {alert.medicationName} ({alert.dosage || 'dose'})
                      </p>
                      <p className="text-[10px] text-amber-700 font-mono">
                        Scheduled: {new Date(alert.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => openMessageModal(alert.patientId, alert.patientName, 'missed_dose_concern')}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-2 py-1 rounded"
                    >
                      Alert Doctor
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patients Selection Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {summary.patients.map((p) => {
              const isSelected = p.patient._id === selectedPatientId;
              return (
                <button
                  key={p.patient._id}
                  onClick={() => setSelectedPatientId(p.patient._id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-left cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-200 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                    {(p.patient.name || 'P').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-xs leading-tight">{p.patient.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                      <span>{p.relationship || 'Patient'}</span>
                      <span className="font-bold text-emerald-700">{p.adherenceRate}% Adherence</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Patient Details Hub */}
          {currentPatientData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Patient Profile & Adherence Gauge */}
              <div className="space-y-6">
                {/* Identity Card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-black flex items-center justify-center text-sm shadow">
                        {(currentPatientData.patient.name || 'P').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">{currentPatientData.patient.name}</h3>
                        <p className="text-xs text-gray-500 font-mono">{currentPatientData.patient.phone}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => openPermissionModal(currentPatientData)}
                      className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold p-1 hover:underline"
                    >
                      Permissions
                    </button>
                  </div>

                  {(currentPatientData.patient.bloodGroup || currentPatientData.patient.emergencyContact) && (
                    <div className="text-xs space-y-1.5 text-gray-600">
                      {currentPatientData.patient.bloodGroup && (
                        <p>
                          <strong>Blood Group:</strong>{' '}
                          <span className="text-red-700 font-bold">{currentPatientData.patient.bloodGroup}</span>
                        </p>
                      )}
                      {currentPatientData.patient.emergencyContact && (
                        <p>
                          <strong>Emergency Contact:</strong> {currentPatientData.patient.emergencyContact}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Adherence Stats Gauge */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-xs">
                  <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">
                    7-Day Medication Compliance
                  </h4>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-black text-emerald-700">
                      {currentPatientData.adherenceRate}%
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-2.5 rounded-full"
                          style={{ width: `${currentPatientData.adherenceRate}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-500">
                        <span>Taken: {currentPatientData.takenDoses}</span>
                        <span>Missed: {currentPatientData.missedDoses}</span>
                        <span>Total: {currentPatientData.totalDoses}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column (2 cols): Active Medications & Concerns */}
              <div className="lg:col-span-2 space-y-6">
                {/* Active Regimen */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="font-bold text-gray-900 text-sm">
                      Active Medications ({currentPatientData.activeMedCount})
                    </h3>
                    <span className="text-[11px] text-gray-400 font-mono">Real-time prescription view</span>
                  </div>

                  {currentPatientData.medications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500">No active medications registered.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {currentPatientData.medications.map((med) => (
                        <div key={med._id} className="py-3 flex flex-col sm:flex-row justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-800 text-sm">{med.name}</span>
                              <span className="bg-emerald-50 text-emerald-800 text-xs px-2 py-0.5 rounded font-bold border border-emerald-200">
                                {med.dosage}
                              </span>
                              <span className="text-xs text-gray-500">({med.frequency.replace(/_/g, ' ')})</span>
                            </div>
                            <p className="text-xs text-gray-600">
                              <span className="font-semibold text-gray-400">Times:</span>{' '}
                              {(med.times || []).join(', ')} | Prescribed by:{' '}
                              <strong>{med.prescribedBy || 'Physician'}</strong>
                            </p>
                            {med.instructions && (
                              <p className="text-xs text-gray-500 italic">Instructions: {med.instructions}</p>
                            )}
                            {med.sideEffects && (
                              <p className="text-xs text-amber-800 bg-amber-50 p-1.5 rounded font-medium border border-amber-200">
                                Reported Concern: {med.sideEffects}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex sm:flex-col justify-between items-end">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                med.dispenseStatus === 'ready_for_pickup'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {med.dispenseStatus || 'Active'}
                            </span>
                            {med.refillDate && (
                              <span className="text-[10px] text-gray-400">
                                Refill: {new Date(med.refillDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Care Team Communications for this patient */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-bold text-gray-900 text-sm">Care Team Message Feed</h3>
                    <button
                      onClick={() => openMessageModal(currentPatientData.patient._id, currentPatientData.patient.name, 'general')}
                      className="text-xs text-emerald-700 hover:text-emerald-900 font-bold"
                    >
                      + Write Note
                    </button>
                  </div>

                  {summary.recentCommunications && summary.recentCommunications.length > 0 ? (
                    <div className="space-y-2">
                      {summary.recentCommunications.map((msg) => (
                        <div key={msg._id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded uppercase text-[10px]">
                                {msg.senderRole}
                              </span>
                              <strong className="text-gray-800">{msg.senderId?.name || 'Healthcare Member'}</strong>
                            </div>
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="font-semibold text-gray-800">{msg.subject}</p>
                          <p className="text-gray-600 whitespace-pre-line">{msg.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400">No clinical messages exchanged yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* INVITE MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendInvite}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Link New Patient Under Care</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {inviteError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {inviteError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Patient Mobile Phone *</label>
              <input
                type="tel"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 font-mono"
                required
              />
              <span className="text-[11px] text-gray-400">
                Enter patient’s registered mobile number including country code.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Relationship</label>
              <select
                value={inviteRelationship}
                onChange={(e) => setInviteRelationship(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Parent">Parent</option>
                <option value="Spouse">Spouse</option>
                <option value="Child">Child</option>
                <option value="Sibling">Sibling</option>
                <option value="Home Caregiver">Home Caregiver</option>
                <option value="Nurse">Nurse / Healthcare Assistant</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {inviting ? 'Sending Invite...' : 'Send Link Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MESSAGE DOCTOR / CARE TEAM MODAL */}
      {messageModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendMessage}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Contact Healthcare Team</h3>
              <button
                type="button"
                onClick={() => setMessageModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {messageSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                {messageSuccess}
              </div>
            ) : (
              <>
                <div className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg">
                  Patient: <strong className="text-gray-800">{messageTargetPatient?.name}</strong> | Role: Caregiver
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                  <select
                    value={messageCategory}
                    onChange={(e) => setMessageCategory(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="missed_dose_concern">Missed Dose Concern</option>
                    <option value="side_effect_alert">Side Effect / Adverse Symptom Alert</option>
                    <option value="dosage_query">Dosage Query</option>
                    <option value="general">General Clinical Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Clinical Observation / Message</label>
                  <textarea
                    rows="4"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Describe patient observations, symptoms, or reason for missed doses..."
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setMessageModalOpen(false)}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingMessage}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    {sendingMessage ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* PERMISSION & CONSENT MODAL */}
      {permissionModalOpen && targetLink && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePermissions}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Manage Caregiver Consent</h3>
              <button
                type="button"
                onClick={() => setPermissionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg">
              Patient: <strong>{targetLink.patient.name}</strong> ({targetLink.relationship})
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canViewMeds}
                  onChange={(e) => setCanViewMeds(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div>
                  <p className="text-xs font-bold text-gray-800">View Active Medications & Directions</p>
                  <p className="text-[11px] text-gray-500">Allows caregiver to inspect prescriptions and schedules</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canViewAdh}
                  onChange={(e) => setCanViewAdh(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div>
                  <p className="text-xs font-bold text-gray-800">View Adherence Logs & Streaks</p>
                  <p className="text-[11px] text-gray-500">Allows caregiver to monitor doses taken, missed, or late</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canManageConsentState}
                  onChange={(e) => setCanManageConsentState(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div>
                  <p className="text-xs font-bold text-gray-800">Manage Consent & Authorizations</p>
                  <p className="text-[11px] text-gray-500">Allows caregiver to authorize clinical reviews on patient's behalf</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setPermissionModalOpen(false)}
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPermissions}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {savingPermissions ? 'Saving...' : 'Update Permissions'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
