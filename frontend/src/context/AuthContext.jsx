import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  useEffect(() => {
    const handleExpired = (event) => {
      setUser(null);
      setSessionExpiredMessage(event.detail?.message || 'Your session has expired. Please log in again.');
    };

    window.addEventListener('medsafe_session_expired', handleExpired);
    return () => window.removeEventListener('medsafe_session_expired', handleExpired);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // Authenticate via httpOnly cookie
        const res = await authApi.getMe();
        if (res.success && res.user) {
          setUser(res.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const loginSuccess = (data) => {
    setSessionExpiredMessage('');
    if (data.user) setUser(data.user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {}
    setUser(null);
    setSessionExpiredMessage('');
  };

  const updateUser = (data) => setUser(prev => ({ ...prev, ...data }));
  const clearSessionMessage = () => setSessionExpiredMessage('');

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        sessionExpiredMessage,
        clearSessionMessage,
        loginSuccess,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
};
