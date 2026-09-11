import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import MedicationsPage from './pages/MedicationsPage';
import AdherencePage from './pages/AdherencePage';
import CaregiversPage from './pages/CaregiversPage';
import ProfilePage from './pages/ProfilePage';
import DoctorDashboard from './pages/DoctorDashboard';
import CaregiverDashboard from './pages/CaregiverDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import medsafeLogo from './assets/medsafe-logo.png';

function MainApp() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const role = user?.role || 'patient';
  const isDoctor = role === 'doctor';
  const isCaregiver = role === 'caregiver';
  const isPharmacist = role === 'pharmacist';

  // Determine initial default tab per role
  const getDefaultTab = (r) => {
    if (r === 'doctor') return 'doctor';
    if (r === 'caregiver') return 'caregiver';
    if (r === 'pharmacist') return 'pharmacist';
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getDefaultTab(role));
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    // If current tab is not allowed for the user's role and not profile, reset to their role's home
    const allowedTabs = {
      doctor: ['doctor', 'profile'],
      caregiver: ['caregiver', 'caregivers', 'profile'],
      pharmacist: ['pharmacist', 'profile'],
      patient: ['dashboard', 'medications', 'adherence', 'caregivers', 'profile']
    };
    const valid = allowedTabs[role] || allowedTabs.patient;
    if (!valid.includes(activeTab)) {
      setActiveTab(getDefaultTab(role));
    }
  }, [role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600 font-medium">
        Loading MedSafe Platform...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Define tab navigation based on role
  let tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'medications', label: 'Medications' },
    { id: 'adherence', label: 'Adherence' },
    { id: 'caregivers', label: 'Caregivers' },
  ];

  if (isDoctor) {
    tabs = [{ id: 'doctor', label: 'Doctor Portal' }];
  } else if (isCaregiver) {
    tabs = [
      { id: 'caregiver', label: 'Caregiver Portal' },
      { id: 'caregivers', label: 'Family Links' },
    ];
  } else if (isPharmacist) {
    tabs = [{ id: 'pharmacist', label: 'Pharmacy Portal' }];
  }

  // Dynamic theme colors for role badges & accents
  const roleTheme = {
    doctor: {
      bg: 'bg-purple-600',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-800',
      activeText: 'text-purple-700',
      activeBg: 'bg-purple-50',
      border: 'border-purple-200',
    },
    caregiver: {
      bg: 'bg-emerald-600',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      activeText: 'text-emerald-700',
      activeBg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    pharmacist: {
      bg: 'bg-teal-600',
      badgeBg: 'bg-teal-100',
      badgeText: 'text-teal-800',
      activeText: 'text-teal-700',
      activeBg: 'bg-teal-50',
      border: 'border-teal-200',
    },
    patient: {
      bg: 'bg-blue-600',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-800',
      activeText: 'text-blue-700',
      activeBg: 'bg-blue-50',
      border: 'border-blue-200',
    }
  }[role] || {
    bg: 'bg-blue-600',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    activeText: 'text-blue-700',
    activeBg: 'bg-blue-50',
    border: 'border-blue-200',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Top Navigation */}
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <div
              className="flex items-center cursor-pointer py-1"
              onClick={() => setActiveTab(getDefaultTab(role))}
            >
              <img
                src={medsafeLogo}
                alt="MedSafe Logo"
                className="h-9 sm:h-10 w-auto object-contain hover:opacity-95 transition-opacity"
              />
            </div>

            {/* Navigation links */}
            <nav className="hidden md:flex items-center space-x-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? `${roleTheme.activeBg} ${roleTheme.activeText} font-semibold`
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* User Profile Dropdown Menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setProfileDropdownOpen((prev) => !prev)}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                profileDropdownOpen || activeTab === 'profile'
                  ? `${roleTheme.activeBg} border-gray-300 shadow-xs ring-2 ring-blue-100`
                  : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'
              }`}
              title="Open profile menu"
            >
              {/* Profile Icon Avatar */}
              <div className={`w-7 h-7 rounded-full ${roleTheme.bg} text-white font-bold flex items-center justify-center text-xs shadow-xs`}>
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold leading-tight line-clamp-1">{user?.name || 'User'}</p>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${roleTheme.badgeText}`}>
                  {user?.role || 'Patient'}
                </span>
              </div>
              {/* Chevron icon */}
              <svg
                className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-150 ${
                  profileDropdownOpen ? 'rotate-180 text-blue-600' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                {/* User info snippet */}
                <div className="px-3.5 py-2.5 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-1">
                    {user?.name || 'User Account'}
                  </p>
                  <p className="text-[11px] text-gray-500 font-mono mt-0.5">{user?.phone || user?.email}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`inline-block ${roleTheme.badgeBg} ${roleTheme.badgeText} text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider`}>
                      {user?.role || 'Patient'}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Encrypted FLE
                    </span>
                  </div>
                </div>

                {/* Profile Navigation */}
                <div className="p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('profile');
                      setProfileDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                      activeTab === 'profile'
                        ? `${roleTheme.activeBg} ${roleTheme.activeText} font-semibold`
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span>Profile & Settings</span>
                  </button>

                  {/* Primary Portal Navigation based on role */}
                  {isDoctor && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('doctor');
                        setProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                        activeTab === 'doctor'
                          ? 'bg-purple-50 text-purple-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <span>Doctor Portal</span>
                    </button>
                  )}

                  {isCaregiver && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('caregiver');
                        setProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                        activeTab === 'caregiver'
                          ? 'bg-emerald-50 text-emerald-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Caregiver Portal</span>
                    </button>
                  )}

                  {isPharmacist && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('pharmacist');
                        setProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                        activeTab === 'pharmacist'
                          ? 'bg-teal-50 text-teal-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <span>Pharmacy Portal</span>
                    </button>
                  )}

                  {!isDoctor && !isCaregiver && !isPharmacist && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('dashboard');
                        setProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-left ${
                        activeTab === 'dashboard'
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <span>Dashboard</span>
                    </button>
                  )}
                </div>

                {/* Logout Option in Dropdown */}
                <div className="p-1 border-t border-gray-100 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex border-t overflow-x-auto bg-gray-50 px-2 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[70px] py-1.5 text-xs text-center font-medium rounded ${
                activeTab === tab.id
                  ? `bg-white ${roleTheme.activeText} font-bold shadow-sm`
                  : 'text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'doctor' && <DoctorDashboard />}
        {activeTab === 'caregiver' && <CaregiverDashboard />}
        {activeTab === 'pharmacist' && <PharmacistDashboard />}
        {activeTab === 'dashboard' && <Dashboard onNavigate={(tab) => setActiveTab(tab)} />}
        {activeTab === 'medications' && <MedicationsPage />}
        {activeTab === 'adherence' && <AdherencePage />}
        {activeTab === 'caregivers' && <CaregiversPage />}
        {activeTab === 'profile' && <ProfilePage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
