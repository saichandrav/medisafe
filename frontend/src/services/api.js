const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const request = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Transmit and store httpOnly, Secure, SameSite=strict session cookies
  });
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 && !endpoint.startsWith('/auth/me') && !endpoint.startsWith('/auth/send-otp') && !endpoint.startsWith('/auth/verify-otp')) {
      window.dispatchEvent(
        new CustomEvent('medsafe_session_expired', {
          detail: { message: data.message || 'Your session has expired. Please log in again to continue.' },
        })
      );
    }
    const error = new Error(data.message || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
};

export const authApi = {
  sendOtp: (phone) => request('/auth/send-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone, otp) => request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) }),
  completeRegistration: (registrationToken, name, email, role) =>
    request('/auth/complete-registration', { method: 'POST', body: JSON.stringify({ registrationToken, name, email, role }) }),
  getMe: () => request('/auth/me'),
  updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const medApi = {
  getAll: (active) => request(`/medications${active !== undefined ? `?active=${active}` : ''}`),
  getById: (id) => request(`/medications/${id}`),
  add: (data) => request('/medications', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/medications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  todaySchedule: (date) => request(`/medications/today-schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  conflicts: () => request('/medications/conflicts'),
  requestRefill: (id, data = {}) => request(`/medications/${id}/request-refill`, { method: 'POST', body: JSON.stringify(data) }),
  myRefillRequests: () => request('/medications/refills/my-requests'),
  getSmsLogs: () => request('/medications/sms-logs'),
  sendTestSms: (data) => request('/medications/send-test-sms', { method: 'POST', body: JSON.stringify(data) }),
  getEmailLogs: () => request('/medications/email-logs'),
  sendTestEmail: (data) => request('/medications/send-test-email', { method: 'POST', body: JSON.stringify(data) }),
};

export const adherenceApi = {
  log: (data) => request('/adherence', { method: 'POST', body: JSON.stringify(data) }),
  today: () => request('/adherence/today'),
  history: (days = 7, medicationId = '') => request(`/adherence/history?days=${days}${medicationId ? `&medicationId=${encodeURIComponent(medicationId)}` : ''}`),
  stats: (days = 7, medicationId = '') => request(`/adherence/stats?days=${days}${medicationId ? `&medicationId=${encodeURIComponent(medicationId)}` : ''}`),
};

export const caregiverApi = {
  invite: (phone, relationship) => request('/caregivers/invite', { method: 'POST', body: JSON.stringify({ phone, relationship }) }),
  respond: (linkId, status) => request(`/caregivers/${linkId}/respond`, { method: 'PUT', body: JSON.stringify({ status }) }),
  myLinks: () => request('/caregivers/my-links'),
  patientData: (patientId) => request(`/caregivers/patient/${patientId}/data`),
  removeLink: (linkId) => request(`/caregivers/${linkId}`, { method: 'DELETE' }),
  dashboardSummary: () => request('/caregivers/dashboard-summary'),
  updatePermissions: (linkId, data) => request(`/caregivers/links/${linkId}/permissions`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const doctorApi = {
  searchPatients: (q = '') => request(`/doctor/search-patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addPatient: (patientId, notes = '') => request('/doctor/add-patient', { method: 'POST', body: JSON.stringify({ patientId, notes }) }),
  getMyPatients: () => request('/doctor/patients'),
  requestMedicationOtp: (patientId, data) => request(`/doctor/patients/${patientId}/request-medication-otp`, { method: 'POST', body: JSON.stringify(data) }),
  confirmMedication: (patientId, otp, medicationData) =>
    request(`/doctor/patients/${patientId}/confirm-medication`, {
      method: 'POST',
      body: JSON.stringify({ otp, medicationData }),
    }),
  requestAccessOtp: (patientId) =>
    request(`/doctor/patients/${patientId}/request-access-otp`, {
      method: 'POST',
    }),
  grantAccess: (patientId, otp) =>
    request(`/doctor/patients/${patientId}/grant-access`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
  getPatientReports: (patientId, days = 7) => request(`/doctor/patients/${patientId}/reports?days=${days}`),
  addReport: (patientId, reportData) =>
    request(`/doctor/patients/${patientId}/reports`, {
      method: 'POST',
      body: JSON.stringify(reportData),
    }),
  sendToPharmacist: (patientId, orderData) =>
    request(`/doctor/patients/${patientId}/send-to-pharmacist`, {
      method: 'POST',
      body: JSON.stringify(orderData),
    }),
  submitPrescriptionCart: (patientId, items) =>
    request(`/doctor/patients/${patientId}/prescription-cart`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  getCatalog: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.append('q', params.q);
    if (params.category) searchParams.append('category', params.category);
    if (params.inStock !== undefined) searchParams.append('inStock', params.inStock);
    const qs = searchParams.toString();
    return request(`/doctor/catalog${qs ? `?${qs}` : ''}`);
  },
  getAllOrders: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.append('q', params.q);
    if (params.phone) searchParams.append('phone', params.phone);
    if (params.orderId) searchParams.append('orderId', params.orderId);
    if (params.status) searchParams.append('status', params.status);
    const qs = searchParams.toString();
    return request(`/doctor/prescription-orders${qs ? `?${qs}` : ''}`);
  },
  getPatientOrders: (patientId) => request(`/doctor/patients/${patientId}/prescription-orders`),
  updateMedication: (medicationId, data) =>
    request(`/doctor/medications/${medicationId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  adjustDosage: (medicationId, newDosage, reason = '') =>
    request(`/doctor/medications/${medicationId}/dosage`, {
      method: 'PATCH',
      body: JSON.stringify({ newDosage, reason }),
    }),
};

export const pharmacistApi = {
  getOrders: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.phone) searchParams.append('phone', params.phone);
    if (params.orderId) searchParams.append('orderId', params.orderId);
    if (params.q) searchParams.append('q', params.q);
    if (params.status) searchParams.append('status', params.status);
    const qs = searchParams.toString();
    return request(`/pharmacist/orders${qs ? `?${qs}` : ''}`);
  },
  dispenseOrder: (orderId, data = {}) =>
    request(`/pharmacist/orders/${orderId}/dispense`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getInventory: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.append('q', params.q);
    if (params.category) searchParams.append('category', params.category);
    if (params.inStock !== undefined) searchParams.append('inStock', params.inStock);
    const qs = searchParams.toString();
    return request(`/pharmacist/inventory${qs ? `?${qs}` : ''}`);
  },
  addInventoryItem: (data) =>
    request('/pharmacist/inventory', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateInventoryItem: (id, data) =>
    request(`/pharmacist/inventory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteInventoryItem: (id) =>
    request(`/pharmacist/inventory/${id}`, {
      method: 'DELETE',
    }),
  getPrescriptions: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.append('q', params.q);
    if (params.patientId) searchParams.append('patientId', params.patientId);
    if (params.status) searchParams.append('status', params.status);
    const qs = searchParams.toString();
    return request(`/pharmacist/prescriptions${qs ? `?${qs}` : ''}`);
  },
  checkSafety: (patientId) => request(`/pharmacist/safety-check/${patientId}`),
  getRefillRequests: (status) => request(`/pharmacist/refills${status ? `?status=${status}` : ''}`),
  updateRefill: (id, data) => request(`/pharmacist/refills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateDispenseStatus: (id, dispenseStatus) =>
    request(`/pharmacist/medications/${id}/dispense-status`, {
      method: 'PATCH',
      body: JSON.stringify({ dispenseStatus }),
    }),
  notify: (data) => request('/pharmacist/notify', { method: 'POST', body: JSON.stringify(data) }),
};

export const communicationApi = {
  sendMessage: (data) => request('/communications', { method: 'POST', body: JSON.stringify(data) }),
  getInbox: () => request('/communications/inbox'),
  getThread: (patientId) => request(`/communications/patient/${patientId}`),
  markRead: (id) => request(`/communications/${id}/read`, { method: 'PATCH' }),
};

export const reportApi = {
  getMyReports: (patientId = '') => request(`/reports/my-reports${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`),
  getReportById: (id) => request(`/reports/${id}`),
};



