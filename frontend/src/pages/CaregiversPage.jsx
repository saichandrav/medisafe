import React, { useState, useEffect } from 'react';
import { caregiverApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { sanitizeHealthText } from '../utils/sanitize';

export default function CaregiversPage() {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('my-caregivers'); // 'my-caregivers' | 'patients-i-monitor'
  const [links, setLinks] = useState({ asPatient: [], asCaregiver: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite Caregiver Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('Family Member');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Patient Inspection (for when monitoring others)
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [loadingPatientData, setLoadingPatientData] = useState(false);

  // Revoke modal
  const [revokingLinkId, setRevokingLinkId] = useState(null);

  const fetchLinks = async () => {
    setError('');
    try {
      const res = await caregiverApi.myLinks();
      setLinks({
        asPatient: res.asPatient || [],
        asCaregiver: res.asCaregiver || [],
      });
    } catch (err) {
      console.error('Failed to load caregiver links:', err);
      setError('Unable to load caregiver connections. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setSubmittingInvite(true);
    try {
      const res = await caregiverApi.invite(phone, relationship);
      setInviteSuccess(res.message || 'Invitation sent successfully!');
      setTimeout(() => {
        setShowInviteModal(false);
        setPhone('');
        setInviteSuccess('');
        fetchLinks();
      }, 1400);
    } catch (err) {
      setInviteError(err.message || 'Failed to send invite.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRespond = async (linkId, status) => {
    try {
      await caregiverApi.respond(linkId, status);
      fetchLinks();
    } catch (err) {
      alert(err.message || 'Failed to respond to invitation.');
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingLinkId) return;
    try {
      await caregiverApi.removeLink(revokingLinkId);
      if (selectedPatient && selectedPatient.linkId === revokingLinkId) {
        setSelectedPatient(null);
        setPatientData(null);
      }
      setRevokingLinkId(null);
      fetchLinks();
    } catch (err) {
      alert(err.message || 'Failed to revoke access.');
    }
  };

  const viewPatientDetails = async (link) => {
    setSelectedPatient(link);
    setLoadingPatientData(true);
    try {
      const pId = link.patientId?._id || link.patientId;
      const res = await caregiverApi.patientData(pId);
      setPatientData(res.data || res);
    } catch (err) {
      alert(err.message || 'Failed to load patient medications');
    } finally {
      setLoadingPatientData(false);
    }
  };

  // Check if there are incoming invites to accept/decline
  const pendingIncomingInvites = links.asCaregiver.filter((l) => l.status === 'pending');

  return (
    <div className="space-y-5">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Caregiver & Family Network</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Authorize trusted family members to monitor adherence, receive missed dose alerts, and manage emergency proxies.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setInviteError('');
            setInviteSuccess('');
            setShowInviteModal(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-xs self-start sm:self-auto flex items-center gap-1.5"
        >
          <span>+</span> Invite Trusted Caregiver
        </button>
      </div>

      {/* Incoming Invitations Notice (if anyone invited this user to be their caregiver) */}
      {pendingIncomingInvites.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-4 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center gap-2 font-extrabold text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span>Caregiver Invitations Pending Your Confirmation ({pendingIncomingInvites.length})</span>
          </div>
          <div className="space-y-2">
            {pendingIncomingInvites.map((inv) => (
              <div
                key={inv._id}
                className="bg-white/15 backdrop-blur-xs p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-bold">
                    {inv.patientId?.name || 'Authorized Patient'}{' '}
                    <span className="font-normal opacity-85">({inv.relationship || 'Family Proxy'})</span>
                  </p>
                  <p className="text-[11px] opacity-80">
                    Phone: {inv.patientId?.phone || '—'} • Requests adherence tracking access
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleRespond(inv._id, 'accepted')}
                    className="bg-white text-emerald-800 hover:bg-emerald-50 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(inv._id, 'rejected')}
                    className="bg-black/20 hover:bg-black/30 text-white font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dual-Role Clarity Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSubTab('my-caregivers')}
          className={`py-2.5 px-4 font-bold text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'my-caregivers'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>My Caregivers</span>
          <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-bold">
            {links.asPatient.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('patients-i-monitor')}
          className={`py-2.5 px-4 font-bold text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'patients-i-monitor'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>Patients I Monitor</span>
          <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-bold">
            {links.asCaregiver.length}
          </span>
        </button>
      </div>

      {/* Onboarding / Dual-Role Info Banner */}
      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
        <svg className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="space-y-0.5">
          <p className="font-bold">Family Health Network Security</p>
          <p className="text-[11px] text-blue-800">
            Caregivers can view dose adherence in real-time and receive missed-dose alerts, but cannot alter or delete physician prescriptions.
            You can revoke caregiver permissions at any time.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-gray-400 animate-pulse">
          Loading authorized caregiver connections...
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-2">
          <p className="text-red-700 text-xs font-bold">{error}</p>
          <button
            type="button"
            onClick={fetchLinks}
            className="px-4 py-2 bg-red-600 text-white font-bold text-xs rounded-lg cursor-pointer"
          >
            Retry Loading Connections
          </button>
        </div>
      ) : (
        <>
          {/* TAB 1: MY CAREGIVERS (Watching Me) */}
          {activeSubTab === 'my-caregivers' && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Authorized Caregivers Watching My Health</h3>
                  <p className="text-xs text-gray-500">
                    Trusted individuals authorized to track your intake and receive safety notifications
                  </p>
                </div>
                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                  {links.asPatient.length} Linked
                </span>
              </div>

              {links.asPatient.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-gray-800">No Caregivers Linked Yet</h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Invite a spouse, adult child, or healthcare proxy. They'll receive alerts if you miss critical doses.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    + Invite Your First Caregiver
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {links.asPatient.map((link) => {
                    const isAccepted = link.status === 'accepted';
                    const cName = link.caregiverId?.name || 'Invited Family Member';
                    const cPhone = link.caregiverId?.phone || '—';

                    return (
                      <div
                        key={link._id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900 text-sm">{cName}</h4>
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                              {link.relationship || 'Caregiver Proxy'}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isAccepted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : link.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {link.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Registered Mobile: <strong className="text-gray-700">{cPhone}</strong> • Connected on{' '}
                            {new Date(link.createdAt).toLocaleDateString()}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-0.5">
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              Adherence Monitoring Active
                            </span>
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              Missed Dose Notifications
                            </span>
                          </div>
                        </div>

                        {/* Revoke Access Button */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => setRevokingLinkId(link._id)}
                            className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs"
                          >
                            Revoke Access
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PATIENTS UNDER MY CARE (Dual-Role Caregiver Hub) */}
          {activeSubTab === 'patients-i-monitor' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Patients Who Authorized You as Caregiver</h3>
                    <p className="text-xs text-gray-500">
                      Family members who granted you read-only visibility into their prescriptions
                    </p>
                  </div>
                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                    {links.asCaregiver.length} Patients
                  </span>
                </div>

                {links.asCaregiver.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-gray-800">You Are Not Currently Monitoring Any Patients</h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      When a family member or dependent invites your phone number ({user?.phone}), their profile and daily intake compliance will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {links.asCaregiver.map((link) => {
                      const p = link.patientId;
                      const isAccepted = link.status === 'accepted';

                      return (
                        <div
                          key={link._id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-gray-900 text-sm">{p?.name || 'Patient'}</h4>
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                Role: {link.relationship || 'Dependent'}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  isAccepted
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {link.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Phone: <strong className="text-gray-700">{p?.phone || '—'}</strong>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {isAccepted ? (
                              <button
                                type="button"
                                onClick={() => viewPatientDetails(link)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs"
                              >
                                View Regimen & Logs
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRespond(link._id, 'accepted')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                              >
                                Accept Authorization
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setRevokingLinkId(link._id)}
                              className="text-xs text-gray-500 hover:text-rose-600 font-medium px-2 py-1.5 cursor-pointer"
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Patient Live Inspection Drawer (if selected) */}
              {selectedPatient && (
                <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-md space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded">
                        Caregiver Inspection
                      </span>
                      <h3 className="font-extrabold text-gray-900 text-base mt-1">
                        {selectedPatient.patientId?.name || 'Patient'} — Prescriptions & Compliance
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientData(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 text-base font-bold cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>

                  {loadingPatientData ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Loading patient medical records...</p>
                  ) : patientData ? (
                    <div className="space-y-4 text-xs">
                      {/* Prescriptions List */}
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs mb-2">
                          Active Prescriptions ({patientData.medications?.length || 0})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(patientData.medications || []).map((med) => (
                            <div key={med._id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                              <p className="font-bold text-gray-900 text-xs">
                                {sanitizeHealthText(med.name)} {med.dosage && `(${med.dosage})`}
                              </p>
                              <p className="text-gray-500 text-[11px]">
                                {med.frequency?.replace(/_/g, ' ')} • Prescribed by {med.prescribedBy || 'Physician'}
                              </p>
                              {med.instructions && (
                                <p className="text-blue-900 italic text-[11px] bg-blue-50/70 p-1 rounded">
                                  {sanitizeHealthText(med.instructions)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recent Dose Logs */}
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs mb-2">
                          Recent Adherence Activity ({patientData.adherenceLogs?.length || 0})
                        </h4>
                        <div className="divide-y divide-gray-100 border rounded-xl overflow-hidden bg-white">
                          {(patientData.adherenceLogs || []).slice(0, 5).map((log, i) => (
                            <div key={i} className="p-2.5 flex items-center justify-between text-[11px]">
                              <div>
                                <span className="font-semibold text-gray-800">
                                  {sanitizeHealthText(log.medicationId?.name || 'Medication')}
                                </span>{' '}
                                <span className="text-gray-400">
                                  at {new Date(log.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <span
                                className={`font-bold px-2 py-0.5 rounded uppercase text-[10px] ${
                                  log.status === 'taken'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : log.status === 'missed'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Invite Caregiver Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendInvite}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Invite Trusted Caregiver</h3>
                <p className="text-xs text-gray-500">Authorize a family member to monitor your doses</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {inviteSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                {inviteSuccess}
              </div>
            ) : (
              <>
                {inviteError && (
                  <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold">
                    {inviteError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Caregiver Mobile Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 font-mono"
                    required
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Include country code (e.g., +91 for India)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Relationship / Role</label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Spouse">Spouse / Partner</option>
                    <option value="Child">Son / Daughter</option>
                    <option value="Parent">Father / Mother</option>
                    <option value="Sibling">Brother / Sister</option>
                    <option value="Nurse">Home Nurse / Professional Caregiver</option>
                    <option value="Friend">Friend / Healthcare Proxy</option>
                  </select>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-[11px] text-gray-600 space-y-1">
                  <p className="font-bold text-gray-700">Permissions Granted:</p>
                  <p>• View medication intake schedule and adherence history</p>
                  <p>• Receive real-time missed dose alerts</p>
                  <p className="text-gray-400 italic">• Read-only: Caregivers cannot edit or remove prescriptions</p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {submittingInvite ? 'Sending Invitation...' : 'Send Authorization Invite'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Revoke Access Confirmation Dialog Modal */}
      {revokingLinkId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-100 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Revoke Caregiver Access?</h3>
              <p className="text-xs text-gray-500 mt-1">
                This person will immediately lose visibility into your medication schedules, adherence logs, and alerts.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setRevokingLinkId(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Yes, Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
