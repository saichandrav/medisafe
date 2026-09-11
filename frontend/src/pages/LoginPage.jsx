import React, { useState, useRef, useEffect } from 'react';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import medsafeLogo from '../assets/medsafe-logo.png';

export default function LoginPage() {
  const { loginSuccess, sessionExpiredMessage, clearSessionMessage } = useAuth();
  const [stage, setStage] = useState('phone'); // phone | otp | register
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('patient');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [regToken, setRegToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [timer]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (phone.length !== 10) { setError('Enter a valid 10-digit number'); return; }
    setLoading(true); setError('');
    try {
      const res = await authApi.sendOtp(phone);
      if (res.success) {
        setNormalizedPhone(res.phone || `+91${phone}`);
        setStage('otp');
        setTimer(30);
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleOtpChange = (i, val) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[i] = d; setOtp(next); setError('');
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
    if (d && i === 5 && next.every(x => x)) verifyOtp(next.join(''));
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    const next = [...otp];
    paste.forEach((d, i) => { if (i < 6) next[i] = d; });
    setOtp(next);
    if (next.every(x => x)) verifyOtp(next.join(''));
  };

  const verifyOtp = async (code) => {
    const c = code || otp.join('');
    if (c.length !== 6) { setError('Enter all 6 digits'); return; }
    setLoading(true); setError('');
    try {
      const res = await authApi.verifyOtp(normalizedPhone, c);
      if (res.success) {
        if (res.isNewUser) {
          setRegToken(res.registrationToken);
          setStage('register');
        } else {
          loginSuccess(res);
        }
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true); setError('');
    try {
      const res = await authApi.completeRegistration(regToken, name.trim(), email.trim(), role);
      if (res.success) loginSuccess(res);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const resendOtp = async () => {
    if (timer > 0) return;
    setLoading(true); setError('');
    try {
      await authApi.sendOtp(phone);
      setTimer(30);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-6 flex flex-col items-center">
          <img src={medsafeLogo} alt="MedSafe" className="h-11 w-auto object-contain mb-1.5" />
          <p className="text-xs text-gray-500 font-medium">Medication Management & Adherence Platform</p>
        </div>

        {sessionExpiredMessage && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold p-3 rounded-xl mb-4 flex items-center justify-between">
            <span> {sessionExpiredMessage}</span>
            <button type="button" onClick={clearSessionMessage} className="text-amber-700 hover:text-amber-900 font-bold ml-2 cursor-pointer">
              &times;
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded mb-4">{error}</div>
        )}

        {/* Phone Stage */}
        {stage === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
            <div className="flex border border-gray-300 rounded overflow-hidden mb-4 focus-within:ring-2 focus-within:ring-blue-500">
              <span className="bg-gray-100 px-3 py-2.5 text-sm font-medium border-r border-gray-300">+91</span>
              <input
                type="tel" value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                placeholder="Enter 10-digit number" className="flex-1 px-3 py-2.5 text-sm focus:outline-none" autoFocus
              />
            </div>
            <button type="submit" disabled={loading || phone.length !== 10}
              className="w-full bg-blue-600 text-white py-2.5 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {/* OTP Stage */}
        {stage === 'otp' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm text-gray-700 font-medium">
                OTP sent to <strong>{normalizedPhone}</strong>
              </p>
              <button
                type="button"
                onClick={() => setStage('phone')}
                className="text-blue-600 hover:text-blue-700 text-xs font-semibold cursor-pointer"
              >
                Edit Number
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Please enter the 6-digit verification code sent to your phone via SMS.
            </p>
            <div className="flex gap-2 my-4 justify-center" onPaste={handleOtpPaste}>
              {otp.map((d, i) => (
                <input key={i} ref={el => otpRefs.current[i] = el}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-bold border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ))}
            </div>
            <button onClick={() => verifyOtp()} disabled={loading || otp.some(d => !d)}
              className="w-full bg-blue-600 text-white py-2.5 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <div className="text-center mt-3">
              {timer > 0
                ? <span className="text-xs text-gray-500">Resend in {timer}s</span>
                : <button onClick={resendOtp} className="text-xs text-blue-600 font-medium">Resend OTP</button>
              }
            </div>
          </div>
        )}

        {/* Register Stage */}
        {stage === 'register' && (
          <form onSubmit={handleRegister}>
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded mb-4">
              Phone verified! Complete your profile.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">I am a</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor</option>
                  <option value="caregiver">Caregiver</option>
                  <option value="pharmacist">Pharmacist</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={loading || !name.trim()}
              className="w-full bg-blue-600 text-white py-2.5 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50 mt-4">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
