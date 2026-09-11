import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';

const parseEmergency = (ec) => {
  if (!ec) return { name: '', phone: '', relation: '' };
  if (typeof ec === 'object') {
    return {
      name: ec.name || '',
      phone: ec.phone || '',
      relation: ec.relationship || ec.relation || '',
    };
  }
  const parts = String(ec).split('|').map((s) => s.trim());
  return {
    name: parts[0] || '',
    phone: parts[1] || '',
    relation: parts[2] || '',
  };
};

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();

  const initialEmergency = parseEmergency(user?.emergencyContact);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    gender: user?.gender || '',
    bloodGroup: user?.bloodGroup || '',
    emergencyContactName: initialEmergency.name,
    emergencyContactPhone: initialEmergency.phone,
    emergencyContactRelation: initialEmergency.relation,
  });

  const [isEditing, setIsEditing] = useState(!user?.name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const ec = parseEmergency(user?.emergencyContact);
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
      gender: user?.gender || '',
      bloodGroup: user?.bloodGroup || '',
      emergencyContactName: ec.name,
      emergencyContactPhone: ec.phone,
      emergencyContactRelation: ec.relation,
    });
  }, [user]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        gender: formData.gender,
        bloodGroup: formData.bloodGroup,
        emergencyContact: {
          name: formData.emergencyContactName.trim(),
          phone: formData.emergencyContactPhone.trim(),
          relationship: formData.emergencyContactRelation.trim(),
        },
      };

      const res = await authApi.updateProfile(payload);
      if (res.success && res.user) {
        updateUser(res.user);
        setMessage({ type: 'success', text: 'Profile details saved successfully!' });
        setIsEditing(false); // Switch to saved view mode with pencil icon
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' });
    }
    setSaving(false);
  };

  const emergencyData = parseEmergency(user?.emergencyContact);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Account & Profile Settings</h2>
          <p className="text-sm text-gray-500">
            Manage your personal profile, clinical identity, and emergency contacts.
          </p>
        </div>
        <button
          onClick={logout}
          className="px-3.5 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-100 self-start sm:self-auto transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Notification Banner */}
      {message.text && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage({ type: '', text: '' })}
            className="text-gray-400 hover:text-gray-600 font-bold ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card Header with User Avatar & Edit (Pencil) Button on the Right Corner */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center text-xl shadow-sm ring-4 ring-blue-50">
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                {user?.name || 'User Profile'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{user?.phone}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-blue-100 text-blue-800">
                  {user?.role || 'Patient'}
                </span>
                {user?.bloodGroup && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                    Blood Group: {user.bloodGroup}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Corner Pencil Icon Action */}
          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setMessage({ type: '', text: '' });
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-xs self-start sm:self-auto cursor-pointer"
              title="Edit Profile"
            >
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <span>Edit Details</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setMessage({ type: '', text: '' });
              }}
              className="text-xs text-gray-500 hover:text-gray-700 font-semibold px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 self-start sm:self-auto"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {/* View Mode (Saved Details Display) */}
        {!isEditing ? (
          <div className="p-6 space-y-6 divide-y divide-gray-100">
            {/* Account Information */}
            <div className="pt-0">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Account Credentials
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Full Name</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{user?.name || '—'}</p>
                </div>
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Mobile Number (Verified)</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{user?.phone || '—'}</p>
                </div>
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Email Address</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{user?.email || 'None provided'}</p>
                </div>
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Platform Role</p>
                  <p className="text-sm font-bold text-blue-700 uppercase mt-0.5">{user?.role || 'Patient'}</p>
                </div>
              </div>
            </div>

            {/* Health & Clinical Details */}
            <div className="pt-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Health & Clinical Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Blood Group</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{user?.bloodGroup || 'Not specified'}</p>
                </div>
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Gender</p>
                  <p className="text-sm font-bold text-gray-800 capitalize mt-0.5">{user?.gender || 'Not specified'}</p>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="pt-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Emergency Contact Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Contact Name</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{emergencyData.name || 'Not provided'}</p>
                </div>
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Contact Phone</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{emergencyData.phone || 'Not provided'}</p>
                </div>
                <div className="bg-gray-50/70 p-3 rounded-lg border border-gray-100">
                  <p className="text-gray-500 font-medium">Relationship</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{emergencyData.relation || 'Not provided'}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Edit Mode (Form Input) */
          <form onSubmit={handleSave} className="p-6 space-y-6">
            {/* Account Credentials */}
            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b">
                Account Credentials
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number (Verified)</label>
                  <input
                    type="text"
                    disabled
                    value={user?.phone || ''}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Platform Role</label>
                  <input
                    type="text"
                    disabled
                    value={user?.role || 'patient'}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed uppercase font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Health & Clinical Details */}
            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b">
                Health & Clinical Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Blood Group</label>
                  <select
                    name="bloodGroup"
                    value={formData.bloodGroup}
                    onChange={handleChange}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select Blood Group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Gender</label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b">
                Emergency Contact Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    name="emergencyContactName"
                    value={formData.emergencyContactName}
                    onChange={handleChange}
                    placeholder="e.g. John Doe"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    name="emergencyContactPhone"
                    value={formData.emergencyContactPhone}
                    onChange={handleChange}
                    placeholder="e.g. +919876543210"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Relationship</label>
                  <input
                    type="text"
                    name="emergencyContactRelation"
                    value={formData.emergencyContactRelation}
                    onChange={handleChange}
                    placeholder="e.g. Spouse / Sibling"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !formData.name.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-xs"
              >
                {saving ? 'Saving changes...' : 'Save Profile Details'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
