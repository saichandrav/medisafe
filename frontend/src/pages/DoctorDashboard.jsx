import React, { useState, useEffect, useRef } from 'react';
import { doctorApi, communicationApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

const FREQUENCY_OPTIONS = [
  { value: 'once_daily', label: 'Once Daily', times: ['08:00'] },
  { value: 'twice_daily', label: 'Twice Daily', times: ['08:00', '20:00'] },
  { value: 'thrice_daily', label: 'Thrice Daily', times: ['08:00', '14:00', '20:00'] },
  { value: 'four_times_daily', label: 'Four Times Daily', times: ['08:00', '12:00', '16:00', '20:00'] },
  { value: 'weekly', label: 'Weekly', times: ['08:00'] },
  { value: 'as_needed', label: 'As Needed', times: [] },
];

const emptyMedForm = {
  name: '',
  dosage: '',
  frequency: 'once_daily',
  times: ['08:00'],
  durationDays: '',
  duration: '',
  instructions: '',
  pharmacy: '',
  sideEffects: '',
};

const emptyPharmacyForm = {
  name: '',
  power: '',
  dosage: '',
  frequency: 'once_daily',
  times: ['08:00'],
  durationDays: '7',
  instructions: '',
  priority: 'routine',
};

const emptyReportForm = {
  title: 'Blood Pressure Examination Report',
  reportType: 'bp_report',
  testDate: new Date().toISOString().split('T')[0],
  diagnosis: '',
  clinicalNotes: '',
  systolic: '',
  diastolic: '',
  bloodPressure: '',
  heartRate: '',
  fastingSugar: '',
  postPrandialSugar: '',
  randomSugar: '',
  hba1c: '',
  bloodSugar: '',
  temperature: '',
  weight: '',
  recommendations: '',
  attachment: null, // { fileName, fileType, fileData, fileSize }
};

const CATALOG_CATEGORIES = [
  { id: 'all', label: 'All Formulations' },
  { id: 'Analgesic & Antipyretic', label: 'Fever & Pain (Dolo, Paracetamol)' },
  { id: 'Antibiotic', label: 'Antibiotics' },
  { id: 'Gastrointestinal', label: 'Gastro / Antacid' },
  { id: 'Antihistamine & Allergy', label: 'Allergy / Cold' },
  { id: 'Antidiabetic', label: 'Antidiabetic' },
  { id: 'Oral Rehydration', label: 'Electrolytes & ORS' },
];

export default function DoctorDashboard() {
  const { user } = useAuth();

  // Patients Roster State
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientSearchFilter, setPatientSearchFilter] = useState('');

  // Selected Patient Clinical Data
  const [clinicalData, setClinicalData] = useState(null);
  const [loadingClinical, setLoadingClinical] = useState(false);
  const [reportDays, setReportDays] = useState(7);
  const [activeTab, setActiveTab] = useState('medications'); // medications | adherence | report

  // Clinical Communication Modal State
  const [showDoctorMsgModal, setShowDoctorMsgModal] = useState(false);
  const [docMsgSubject, setDocMsgSubject] = useState('');
  const [docMsgBody, setDocMsgBody] = useState('');
  const [docMsgRecipient, setDocMsgRecipient] = useState('all');
  const [sendingDocMsg, setSendingDocMsg] = useState(false);
  const [docMsgSuccess, setDocMsgSuccess] = useState('');

  // Search & Link Patient Modal
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState('');

  // Add Medication & OTP Modal State
  const [showMedModal, setShowMedModal] = useState(false);
  const [prescribeMode, setPrescribeMode] = useState('pharmacy'); // 'pharmacy' | 'direct'
  const [pharmacyForm, setPharmacyForm] = useState({ ...emptyPharmacyForm });
  const [sendingToPharmacy, setSendingToPharmacy] = useState(false);
  const [pharmacyFeedback, setPharmacyFeedback] = useState('');
  const [patientOrders, setPatientOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Top-Level Portal Navigation State: 'patients' | 'orders_db' | 'catalog'
  const [doctorView, setDoctorView] = useState('patients');

  // Pharmacy Inventory / Amazon-Seller Catalog State
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef(null);

  // Patient Prescription Cart State (Doctor allots medications)
  const [patientCart, setPatientCart] = useState([]);
  const [submittingCart, setSubmittingCart] = useState(false);
  const [cartSuccess, setCartSuccess] = useState('');
  const [cartError, setCartError] = useState('');

  // Doctor Ordering Database State
  const [allOrders, setAllOrders] = useState([]);
  const [loadingAllOrders, setLoadingAllOrders] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('all');

  // Add Clinical Report State
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [reportForm, setReportForm] = useState({ ...emptyReportForm });
  const [savingReport, setSavingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);

  const [medStep, setMedStep] = useState(1); // 1 = Details, 2 = OTP Verification
  const [medForm, setMedForm] = useState({ ...emptyMedForm });
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [debugOtp, setDebugOtp] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [medError, setMedError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef([]);

  // Adjust / Increase Dosage Modal State
  const [showAdjustDosageModal, setShowAdjustDosageModal] = useState(false);
  const [dosageMed, setDosageMed] = useState(null);
  const [newDosage, setNewDosage] = useState('');
  const [dosageReason, setDosageReason] = useState('');
  const [adjustingDosage, setAdjustingDosage] = useState(false);
  const [dosageError, setDosageError] = useState('');

  // Edit Medication Modal State
  const [showEditMedModal, setShowEditMedModal] = useState(false);
  const [editingMedId, setEditingMedId] = useState(null);
  const [editMedForm, setEditMedForm] = useState({ ...emptyMedForm, isActive: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // 1-Hour Access State & Countdown
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Report Access OTP Modal State
  const [showAccessOtpModal, setShowAccessOtpModal] = useState(false);
  const [accessOtpDigits, setAccessOtpDigits] = useState(['', '', '', '', '', '']);
  const [accessMaskedPhone, setAccessMaskedPhone] = useState('');
  const [accessDebugOtp, setAccessDebugOtp] = useState('');
  const [accessResendTimer, setAccessResendTimer] = useState(0);
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  const [accessError, setAccessError] = useState('');
  const accessOtpRefs = useRef([]);

  // Timer for OTP resend (Prescription)
  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  // Timer for Report Access OTP resend
  useEffect(() => {
    if (accessResendTimer > 0) {
      const t = setTimeout(() => setAccessResendTimer(accessResendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [accessResendTimer]);

  // Live countdown timer for active 1-hour report access window
  useEffect(() => {
    if (!clinicalData?.accessExpiresAt || clinicalData?.isAccessExpired) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(clinicalData.accessExpiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(diff);
      if (diff <= 0) {
        // Time expired! Lock reports view and refresh roster
        setClinicalData((prev) => (prev ? { ...prev, isAccessExpired: true } : prev));
        fetchMyPatients();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [clinicalData?.accessExpiresAt, clinicalData?.isAccessExpired]);

  // Close category dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatCountdown = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleOpenReportAccessModal = async () => {
    setAccessError('');
    setAccessOtpDigits(['', '', '', '', '', '']);
    setAccessDebugOtp('');
    setShowAccessOtpModal(true);
    await handleRequestReportAccessOtp();
  };

  const handleRequestReportAccessOtp = async () => {
    if (!selectedPatientId) return;
    setAccessError('');
    setAccessSubmitting(true);
    try {
      const res = await doctorApi.requestAccessOtp(selectedPatientId);
      setAccessMaskedPhone(res.maskedPhone || 'registered mobile');
      if (res.debugOtp) setAccessDebugOtp(res.debugOtp);
      setAccessResendTimer(30);
      setTimeout(() => accessOtpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setAccessError(err.message || 'Failed to dispatch report access OTP.');
    }
    setAccessSubmitting(false);
  };

  const handleAccessOtpChange = (index, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...accessOtpDigits];
    next[index] = digit;
    setAccessOtpDigits(next);
    setAccessError('');
    if (digit && index < 5) accessOtpRefs.current[index + 1]?.focus();
    if (digit && index === 5 && next.every((d) => d)) {
      handleConfirmReportAccess(next.join(''));
    }
  };

  const handleAccessOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !accessOtpDigits[index] && index > 0) {
      accessOtpRefs.current[index - 1]?.focus();
    }
  };

  const handleAccessOtpPaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    const next = [...accessOtpDigits];
    paste.forEach((d, i) => {
      if (i < 6) next[i] = d;
    });
    setAccessOtpDigits(next);
    if (next.every((d) => d)) {
      handleConfirmReportAccess(next.join(''));
    }
  };

  const handleConfirmReportAccess = async (codeToUse) => {
    const otp = codeToUse || accessOtpDigits.join('');
    if (otp.length !== 6) {
      setAccessError('Please enter all 6 digits of the authorization code.');
      return;
    }
    setAccessError('');
    setAccessSubmitting(true);
    try {
      await doctorApi.grantAccess(selectedPatientId, otp);
      setShowAccessOtpModal(false);
      setAccessOtpDigits(['', '', '', '', '', '']);
      await fetchClinicalData(selectedPatientId, reportDays);
      await fetchMyPatients();
    } catch (err) {
      setAccessError(err.message || 'Verification failed. Please check the code.');
    }
    setAccessSubmitting(false);
  };

  const openAdjustDosageModal = (med) => {
    setDosageMed(med);
    setNewDosage(med.dosage || '');
    setDosageReason('');
    setDosageError('');
    setShowAdjustDosageModal(true);
  };

  const handleSaveDosage = async (e) => {
    e.preventDefault();
    if (!newDosage.trim()) {
      setDosageError('Please enter a valid new dosage');
      return;
    }
    setDosageError('');
    setAdjustingDosage(true);
    try {
      await doctorApi.adjustDosage(dosageMed._id, newDosage.trim(), dosageReason.trim());
      setShowAdjustDosageModal(false);
      setDosageMed(null);
      fetchClinicalData(selectedPatientId, reportDays);
    } catch (err) {
      setDosageError(err.message || 'Failed to adjust dosage');
    }
    setAdjustingDosage(false);
  };

  const openEditMedModal = (med) => {
    setEditingMedId(med._id);
    setEditMedForm({
      name: med.name || '',
      dosage: med.dosage || '',
      frequency: med.frequency || 'once_daily',
      times: med.times && med.times.length > 0 ? [...med.times] : ['08:00'],
      durationDays: med.durationDays ?? (med.endDate && med.startDate ? Math.round((new Date(med.endDate) - new Date(med.startDate)) / (1000 * 60 * 60 * 24)) : ''),
      duration: med.duration || '',
      instructions: med.instructions || '',
      pharmacy: med.pharmacy || '',
      sideEffects: med.sideEffects || '',
      isActive: med.isActive !== false,
    });
    setEditError('');
    setShowEditMedModal(true);
  };

  const handleSaveEditMed = async (e) => {
    e.preventDefault();
    if (!editMedForm.name.trim()) {
      setEditError('Medication name is required');
      return;
    }
    setEditError('');
    setSavingEdit(true);
    try {
      await doctorApi.updateMedication(editingMedId, editMedForm);
      setShowEditMedModal(false);
      setEditingMedId(null);
      fetchClinicalData(selectedPatientId, reportDays);
    } catch (err) {
      setEditError(err.message || 'Failed to update medication');
    }
    setSavingEdit(false);
  };

  // Load Doctor's Patient Roster
  const fetchMyPatients = async () => {
    setLoadingPatients(true);
    try {
      const res = await doctorApi.getMyPatients();
      const list = res.patients || [];
      setPatients(list);
      if (list.length > 0 && !selectedPatientId) {
        setSelectedPatientId(list[0].patient._id);
      }
    } catch (err) {
      console.error('Failed to load doctor roster:', err);
    }
    setLoadingPatients(false);
  };

  useEffect(() => {
    fetchMyPatients();
  }, []);

  // Load Selected Patient's Clinical Dossier & Reports
  const fetchClinicalData = async (patientId, days = reportDays) => {
    if (!patientId) return;
    setLoadingClinical(true);
    try {
      const res = await doctorApi.getPatientReports(patientId, days);
      setClinicalData(res);
    } catch (err) {
      console.error('Failed to load patient report:', err);
    }
    setLoadingClinical(false);
  };

  const fetchPatientOrders = async (patientId) => {
    if (!patientId) return;
    setLoadingOrders(true);
    try {
      const res = await doctorApi.getPatientOrders(patientId);
      setPatientOrders(res.orders || []);
    } catch (err) {
      console.error('Failed to load patient pharmacy orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      fetchClinicalData(selectedPatientId, reportDays);
      fetchPatientOrders(selectedPatientId);
    }
  }, [selectedPatientId, reportDays]);

  // Handle Search for Existing Patients
  const handleSearchPatients = async (e) => {
    e?.preventDefault();
    setSearching(true);
    setSearchFeedback('');
    try {
      const res = await doctorApi.searchPatients(searchQuery);
      setSearchResults(res.patients || []);
      if ((res.patients || []).length === 0) {
        setSearchFeedback('No registered patient accounts found matching that search term.');
      }
    } catch (err) {
      setSearchFeedback(err.message || 'Error searching patient records.');
    }
    setSearching(false);
  };

  // Add Patient to Doctor's Roster
  const handleAddPatientToRoster = async (patient) => {
    try {
      await doctorApi.addPatient(patient._id);
      await fetchMyPatients();
      setSelectedPatientId(patient._id);
      setShowSearchModal(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      alert(err.message || 'Failed to add patient.');
    }
  };

  // Step 1: Doctor requests Medication OTP to patient mobile
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!medForm.name.trim()) {
      setMedError('Medication name is required');
      return;
    }
    setMedError('');
    setOtpSubmitting(true);
    try {
      const res = await doctorApi.requestMedicationOtp(selectedPatientId, {
        name: medForm.name.trim(),
        dosage: medForm.dosage.trim(),
      });
      setMaskedPhone(res.maskedPhone || 'registered phone');
      setDebugOtp(res.debugOtp || '');
      setMedStep(2);
      setResendTimer(30);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setMedError(err.message || 'Failed to dispatch consent OTP to patient.');
    }
    setOtpSubmitting(false);
  };

  // OTP Input Handlers
  const handleOtpChange = (index, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setMedError('');
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (digit && index === 5 && next.every((d) => d)) {
      handleConfirmPrescription(next.join(''));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    const next = [...otpDigits];
    paste.forEach((d, i) => {
      if (i < 6) next[i] = d;
    });
    setOtpDigits(next);
    if (next.every((d) => d)) {
      handleConfirmPrescription(next.join(''));
    }
  };

  // Step 2: Confirm Prescription with OTP
  const handleConfirmPrescription = async (codeToUse) => {
    const otp = codeToUse || otpDigits.join('');
    if (otp.length !== 6) {
      setMedError('Please enter all 6 digits of the patient authorization code.');
      return;
    }
    setMedError('');
    setOtpSubmitting(true);
    try {
      await doctorApi.confirmMedication(selectedPatientId, otp, medForm);
      // Success!
      setShowMedModal(false);
      setMedStep(1);
      setMedForm({ ...emptyMedForm });
      setOtpDigits(['', '', '', '', '', '']);
      // Refresh clinical data and roster
      fetchClinicalData(selectedPatientId, reportDays);
      fetchPatientOrders(selectedPatientId);
      fetchMyPatients();
    } catch (err) {
      setMedError(err.message || 'Authorization failed. Please check the OTP.');
    }
    setOtpSubmitting(false);
  };

  const handleSendToPharmacist = async (e) => {
    e?.preventDefault();
    if (!pharmacyForm.name.trim()) {
      setMedError('Medication name is required.');
      return;
    }
    if (!pharmacyForm.power.trim()) {
      setMedError('Power / dosage (e.g. 500mg, 650mg, 10mg) is required.');
      return;
    }
    setMedError('');
    setSendingToPharmacy(true);
    try {
      await doctorApi.sendToPharmacist(selectedPatientId, {
        medicationName: pharmacyForm.name.trim(),
        power: pharmacyForm.power.trim(),
        dosage: pharmacyForm.power.trim(),
        frequency: pharmacyForm.frequency,
        suggestedTimes: pharmacyForm.times,
        durationDays: pharmacyForm.durationDays ? Number(pharmacyForm.durationDays) : null,
        duration: pharmacyForm.durationDays ? `${pharmacyForm.durationDays} days` : '',
        instructions: pharmacyForm.instructions.trim(),
        priority: pharmacyForm.priority,
      });
      setPharmacyFeedback(`Prescription for ${pharmacyForm.name} (${pharmacyForm.power}) routed to hospital pharmacy!`);
      await fetchPatientOrders(selectedPatientId);
      setTimeout(() => {
        setShowMedModal(false);
        setPharmacyForm({ ...emptyPharmacyForm });
        setPharmacyFeedback('');
        setActiveTab('pharmacy');
      }, 1200);
    } catch (err) {
      setMedError(err.message || 'Failed to route prescription to pharmacist.');
    } finally {
      setSendingToPharmacy(false);
    }
  };

  // Fetch Pharmacy Inventory Catalog (Amazon-Seller style, strictly no prices)
  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const params = {};
      if (catalogSearch.trim()) params.q = catalogSearch.trim();
      if (catalogCategory !== 'all') params.category = catalogCategory;
      const res = await doctorApi.getCatalog(params);
      setCatalog(res.products || []);
    } catch (err) {
      console.error('Failed to load pharmacy catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Fetch All Prescription Orders in Doctor Ordering Database
  const fetchAllOrders = async () => {
    setLoadingAllOrders(true);
    try {
      const params = {};
      if (ordersSearch.trim()) params.q = ordersSearch.trim();
      if (ordersStatusFilter !== 'all') params.status = ordersStatusFilter;
      const res = await doctorApi.getAllOrders(params);
      setAllOrders(res.orders || []);
    } catch (err) {
      console.error('Failed to load all prescription orders:', err);
    } finally {
      setLoadingAllOrders(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
    fetchAllOrders();
  }, [catalogCategory, ordersStatusFilter]);

  // Handle Add Product to Patient Prescription Cart
  const handleAddToCart = (product) => {
    if (!selectedPatientId) {
      alert('Please select a patient from the roster first before adding medications to cart.');
      setDoctorView('patients');
      return;
    }
    const alreadyInCart = patientCart.some((i) => i.productId === product._id);
    if (alreadyInCart) {
      alert(`${product.name} is already in the prescription cart. You can configure schedule times in the cart.`);
      setActiveTab('pharmacy');
      setDoctorView('patients');
      return;
    }

    const newItem = {
      productId: product._id,
      medicationName: product.name,
      power: product.power || '',
      dosage: '1 tablet',
      frequency: 'twice_daily',
      suggestedTimes: ['08:00', '20:00'],
      durationDays: '5',
      instructions: 'Take after meals with water',
      priority: 'routine',
      productInfo: product,
    };

    setPatientCart((prev) => [...prev, newItem]);
    setCartSuccess(`${product.name} (${product.power}) added to patient prescription cart!`);
    setTimeout(() => setCartSuccess(''), 3000);
    setActiveTab('pharmacy');
    setDoctorView('patients');
  };

  const handleUpdateCartItem = (index, field, value) => {
    setPatientCart((prev) => {
      const next = [...prev];
      if (field === 'frequency') {
        const freq = FREQUENCY_OPTIONS.find((f) => f.value === value);
        next[index] = {
          ...next[index],
          frequency: value,
          suggestedTimes: freq ? [...freq.times] : next[index].suggestedTimes,
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };


  const handleRemoveFromCart = (index) => {
    setPatientCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Auto-calculate total units: dosage count × doses/day × duration days
  const calcTotalUnits = (item) => {
    const dosageStr = (item.dosage || '1').replace(/[^0-9.]/g, '');
    const dosageCount = parseFloat(dosageStr) || 1;
    const dosesPerDay = Array.isArray(item.suggestedTimes) ? item.suggestedTimes.length : 1;
    const days = parseInt(item.durationDays) || 1;
    return Math.ceil(dosageCount * dosesPerDay * days);
  };

  const handleSubmitPrescriptionCart = async () => {
    if (!selectedPatientId) {
      alert('Please select a patient first.');
      return;
    }
    if (patientCart.length === 0) {
      alert('Your prescription cart is empty. Please add medications from the catalog.');
      return;
    }

    setSubmittingCart(true);
    setCartError('');
    setCartSuccess('');

    try {
      const payloadItems = patientCart.map((item) => ({
        productId: item.productId,
        medicationName: item.medicationName,
        power: item.power,
        dosage: item.dosage || item.power,
        frequency: item.frequency,
        suggestedTimes: item.suggestedTimes,
        durationDays: item.durationDays ? Number(item.durationDays) : 5,
        duration: item.durationDays ? `${item.durationDays} days` : '',
        instructions: item.instructions || 'Take as directed',
        priority: item.priority || 'routine',
        totalUnits: calcTotalUnits(item), // auto-calculated for pharmacist dispensing
      }));

      const res = await doctorApi.submitPrescriptionCart(selectedPatientId, payloadItems);
      setCartSuccess(
        `${res.createdCount} medication(s) dispatched to pharmacy! Order ID: ${res.orderId}. Patient can physically collect at the counter by quoting this phone number.`
      );
      setPatientCart([]);
      fetchPatientOrders(selectedPatientId);
      fetchAllOrders();
    } catch (err) {
      setCartError(err.message || 'Failed to submit prescription cart.');
    } finally {
      setSubmittingCart(false);
    }
  };

  // Map medicine names to their product images in /public/medicines/
  const getMedImage = (name = '') => {
    const n = name.toLowerCase();
    if (n.includes('dolo')) return '/medicines/dolo-650.jpg';
    if (n.includes('paracetamol') || n.includes('acetaminophen')) return '/medicines/paracetamol-500.jpg';
    if (n.includes('amoxicillin')) return '/medicines/amoxicillin-500.jpg';
    if (n.includes('azithromycin')) return '/medicines/azithromycin-500.jpg';
    if (n.includes('cetirizine')) return '/medicines/cetirizine-10.jpg';
    if (n.includes('pantoprazole')) return '/medicines/pantoprazole-40.jpg';
    if (n.includes('metformin')) return '/medicines/metformin-500.jpg';
    if (n.includes('ors') || n.includes('electrolyte') || n.includes('rehydration')) return '/medicines/ors-sachet.jpg';
    return null;
  };

  const filteredCatalog = catalog.filter((prod) => {
    const term = (catalogSearch || '').trim().toLowerCase();
    const matchesCat = catalogCategory === 'all' || prod.category === catalogCategory;
    if (!term) return matchesCat;
    const name = (prod.name || '').toLowerCase();
    const genericName = (prod.genericName || '').toLowerCase();
    const power = (prod.power || '').toLowerCase();
    const manufacturer = (prod.manufacturer || '').toLowerCase();
    return matchesCat && (name.includes(term) || genericName.includes(term) || power.includes(term) || manufacturer.includes(term));
  });

  const filteredAllOrders = allOrders.filter((order) => {
    const term = (ordersSearch || '').trim().toLowerCase();
    const matchesStatus = ordersStatusFilter === 'all' || order.status === ordersStatusFilter;
    if (!term) return matchesStatus;
    const orderId = (order.orderId || '').toLowerCase();
    const phone = (order.patientPhone || '').toLowerCase();
    const patientName = (order.patientName || '').toLowerCase();
    const medName = (order.medicationName || '').toLowerCase();
    const power = (order.power || '').toLowerCase();
    return matchesStatus && (orderId.includes(term) || phone.includes(term) || patientName.includes(term) || medName.includes(term) || power.includes(term));
  });

  const handleOpenAddReport = () => {
    if (clinicalData?.isAccessExpired) {
      handleOpenReportAccessModal();
      return;
    }
    setReportForm({
      ...emptyReportForm,
      testDate: new Date().toISOString().split('T')[0],
      attachment: null,
    });
    setReportError('');
    setReportSuccess('');
    setShowAddReportModal(true);
  };

  const handleReportFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setReportError('File size exceeds 25MB limit. Please upload a smaller image or PDF.');
      return;
    }

    setReportError('');
    const reader = new FileReader();
    reader.onload = () => {
      setReportForm((prev) => ({
        ...prev,
        attachment: {
          fileName: file.name,
          fileType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          fileData: reader.result,
          fileSize: file.size,
        },
      }));
    };
    reader.onerror = () => {
      setReportError('Failed to read file attachment. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveReportAttachment = () => {
    setReportForm((prev) => ({
      ...prev,
      attachment: null,
    }));
  };

  const handleSaveClinicalReport = async (e) => {
    e?.preventDefault();
    if (!reportForm.title.trim()) {
      setReportError('Report title is required.');
      return;
    }
    setReportError('');
    setSavingReport(true);
    try {
      const bpVal = reportForm.systolic && reportForm.diastolic
        ? `${reportForm.systolic}/${reportForm.diastolic} mmHg`
        : (reportForm.bloodPressure ? reportForm.bloodPressure.trim() : '');

      const sugarParts = [];
      if (reportForm.fastingSugar) sugarParts.push(`Fasting: ${reportForm.fastingSugar} mg/dL`);
      if (reportForm.postPrandialSugar) sugarParts.push(`PP: ${reportForm.postPrandialSugar} mg/dL`);
      if (reportForm.randomSugar) sugarParts.push(`Random: ${reportForm.randomSugar} mg/dL`);
      if (reportForm.hba1c) sugarParts.push(`HbA1c: ${reportForm.hba1c}%`);
      const sugarVal = sugarParts.length > 0 ? sugarParts.join(' | ') : (reportForm.bloodSugar ? reportForm.bloodSugar.trim() : '');

      await doctorApi.addReport(selectedPatientId, {
        title: reportForm.title.trim(),
        reportType: reportForm.reportType,
        testDate: reportForm.testDate || new Date().toISOString().split('T')[0],
        diagnosis: reportForm.diagnosis.trim(),
        clinicalNotes: reportForm.clinicalNotes.trim(),
        vitals: {
          bloodPressure: bpVal,
          systolic: reportForm.systolic?.trim() || '',
          diastolic: reportForm.diastolic?.trim() || '',
          heartRate: reportForm.heartRate?.trim() || '',
          temperature: reportForm.temperature?.trim() || '',
          bloodSugar: sugarVal,
          fastingSugar: reportForm.fastingSugar?.trim() || '',
          postPrandialSugar: reportForm.postPrandialSugar?.trim() || '',
          hba1c: reportForm.hba1c?.trim() || '',
          weight: reportForm.weight?.trim() || '',
        },
        recommendations: reportForm.recommendations.trim(),
        attachment: reportForm.attachment || null,
      });

      setReportSuccess('Diagnostic report & attachment successfully saved to patient records!');
      await fetchClinicalData(selectedPatientId, reportDays);
      setTimeout(() => {
        setShowAddReportModal(false);
        setReportSuccess('');
        setActiveTab('report');
      }, 1000);
    } catch (err) {
      setReportError(err.message || 'Failed to save report to patient database.');
    } finally {
      setSavingReport(false);
    }
  };

  const filteredPatients = patients.filter((p) => {
    const term = patientSearchFilter.toLowerCase();
    const name = (p.patient?.name || '').toLowerCase();
    const phone = (p.patient?.phone || '').toLowerCase();
    return name.includes(term) || phone.includes(term);
  });

  const selectedPatientObj = patients.find((p) => p.patient?._id === selectedPatientId)?.patient;

  const handleSendDoctorMessage = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    setSendingDocMsg(true);
    try {
      await communicationApi.sendMessage({
        patientId: selectedPatientId,
        recipientRole: docMsgRecipient,
        category: 'dosage_query',
        subject: docMsgSubject || `Clinical Instructions from Dr. ${user?.name || 'Physician'}`,
        message: docMsgBody,
      });
      setDocMsgSuccess('Clinical message sent directly to patient and care team!');
      setTimeout(() => {
        setShowDoctorMsgModal(false);
        setDocMsgSuccess('');
        setDocMsgBody('');
      }, 1600);
    } catch (err) {
      alert(err.message || 'Failed to send clinical message.');
    } finally {
      setSendingDocMsg(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ... main dashboard ... */}
      {/* Top Banner / Clinical Header */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-500/30 text-blue-100 text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-blue-400/30">
              Doctor Clinical Portal
            </span>
            <span className="text-xs text-blue-200">Patient Verification & Oversight</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {user?.name?.startsWith('Dr.') ? user?.name : `Dr. ${user?.name || 'Practitioner'}`}
          </h1>
          <p className="text-sm text-blue-100/80 mt-0.5">
            Prescribe medications with patient OTP consent, review adherence logs, and monitor clinical safety.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowSearchModal(true);
              setSearchQuery('');
              setSearchResults([]);
              setSearchFeedback('');
            }}
            className="bg-white hover:bg-blue-50 text-blue-800 font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Search & Add Patient
          </button>
        </div>
      </div>

      {/* Top Portal Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-gray-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDoctorView('patients')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              doctorView === 'patients'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>Patient Consultations & Roster</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${doctorView === 'patients' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700 font-semibold'}`}>
              {patients.length}
            </span>
          </button>

          <button
            onClick={() => {
              setDoctorView('orders_db');
              fetchAllOrders();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              doctorView === 'orders_db'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>Prescription Orders Database</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${doctorView === 'orders_db' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800 font-semibold'}`}>
              {allOrders.length}
            </span>
          </button>

          <button
            onClick={() => {
              setDoctorView('catalog');
              fetchCatalog();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              doctorView === 'catalog'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>Pharmacy Medicine Catalog</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${doctorView === 'catalog' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 font-semibold'}`}>
              {catalog.length}
            </span>
          </button>
        </div>

        {patientCart.length > 0 && selectedPatientObj && (
          <button
            onClick={() => {
              setDoctorView('patients');
              setActiveTab('pharmacy');
            }}
            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 animate-pulse"
          >
            <span>Patient Cart:</span>
            <span className="bg-emerald-600 text-white rounded-full px-2 py-0.2 text-[11px]">
              {patientCart.length} {patientCart.length === 1 ? 'med' : 'meds'}
            </span>
            <span className="text-emerald-700">({selectedPatientObj.name})</span>
          </button>
        )}
      </div>

      {/* Main Two-Column Layout */}
      {doctorView === 'patients' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient Roster List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-800 text-base">My Patients</h2>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  {patients.length}
                </span>
              </div>
              <button
                onClick={() => setShowSearchModal(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                + Find Patient
              </button>
            </div>

            {/* Local filter input */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Filter by name or phone..."
                value={patientSearchFilter}
                onChange={(e) => setPatientSearchFilter(e.target.value)}
                className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              />
            </div>

            {/* Patients List */}
            {loadingPatients ? (
              <div className="py-8 text-center text-xs text-gray-500">Loading patients roster...</div>
            ) : filteredPatients.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-500 space-y-2">
                <p>No patients found in your roster.</p>
                <button
                  onClick={() => setShowSearchModal(true)}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Search existing patient records →
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                {filteredPatients.map((item) => {
                  const p = item.patient;
                  const isSelected = p._id === selectedPatientId;
                  const adherenceRate = item.adherenceRate ?? 100;

                  return (
                    <div
                      key={item.linkId || p._id}
                      onClick={() => setSelectedPatientId(p._id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/70'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm text-gray-900 leading-tight">
                            {p.name || 'Unnamed Patient'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.phone}</p>
                        </div>
                        {item.isAccessActive && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Active 1h
                          </span>
                        )}
                      </div>

                      {p.bloodGroup && (
                        <div className="mt-2 text-[11px] text-gray-500">
                          <span>Blood: {p.bloodGroup}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Patient Clinical Dossier (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {!selectedPatientId ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto text-xl font-bold">
                
              </div>
              <h3 className="text-base font-bold text-gray-800">No Patient Selected</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Select a patient from the roster on the left or search existing patient records to add them.
              </p>
              <button
                onClick={() => setShowSearchModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
              >
                Search Existing Records
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Patient Header Card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
                      {(selectedPatientObj?.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">
                          {selectedPatientObj?.name || 'Patient'}
                        </h2>
                        {!clinicalData?.isAccessExpired && remainingSeconds > 0 ? (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            {formatCountdown(remainingSeconds)} remaining
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                          {selectedPatientObj?.phone}
                        </span>
                        {selectedPatientObj?.email && <span>· {selectedPatientObj?.email}</span>}
                        {selectedPatientObj?.bloodGroup && (
                          <span className="bg-red-50 text-red-700 font-semibold px-1.5 py-0.2 rounded border border-red-200">
                            Blood Group: {selectedPatientObj.bloodGroup}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions in Header */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handleOpenAddReport}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      + Add Report
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMedForm({ ...emptyMedForm });
                        setMedStep(1);
                        setMedError('');
                        setShowMedModal(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      + Medicate
                    </button>
                  </div>
                </div>

                {/* Sub-Tabs */}
                <div className="flex items-center gap-2 pt-3">
                    <button
                      onClick={() => setActiveTab('medications')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeTab === 'medications'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Prescriptions & Medications ({clinicalData?.medications?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab('pharmacy')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        activeTab === 'pharmacy'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>Prescription Cart</span>
                      {patientCart.length > 0 ? (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 animate-pulse">
                          {patientCart.length} in cart
                        </span>
                      ) : null}
                    </button>
                    <button
                      onClick={() => setActiveTab('epharmacy')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        activeTab === 'epharmacy'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>ePharmacy Orders</span>
                      {patientOrders.length > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          activeTab === 'epharmacy' ? 'bg-white text-indigo-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {patientOrders.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('adherence')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeTab === 'adherence'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Adherence Tracking & History
                    </button>
                    <button
                      onClick={() => setActiveTab('report')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        activeTab === 'report'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>Clinical Dossier & Reports</span>
                      {clinicalData?.reports?.length > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${activeTab === 'report' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-800'}`}>
                          {clinicalData.reports.length}
                        </span>
                      )}
                    </button>
                  </div>
              </div>

              {/* Safety Alerts / Drug-Drug Interactions */}
              {clinicalData?.conflicts && clinicalData.conflicts.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900">
                  <div className="flex items-center gap-2 font-bold text-sm mb-1 text-amber-800">
                    <span>Potential Drug-Drug Interaction Detected:</span>
                  </div>
                  {clinicalData.conflicts.map((c, i) => (
                    <p key={i} className="text-xs text-amber-800 leading-relaxed">
                      • {c.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Tab 1: Prescriptions & Medications */}
              {activeTab === 'medications' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-800 text-sm">Active Medications</h3>
                    <span className="text-xs text-gray-500">
                      Prescribed through verified patient authorization
                    </span>
                  </div>

                  {loadingClinical ? (
                    <div className="py-8 text-center text-xs text-gray-500">Loading prescriptions...</div>
                  ) : !clinicalData?.medications || clinicalData.medications.length === 0 ? (
                    <div className="py-10 text-center text-gray-500 border border-dashed rounded-lg p-6 space-y-2">
                      <p className="text-sm font-medium">No medications currently prescribed for this patient.</p>
                      <button
                        onClick={() => {
                          setMedForm({ ...emptyMedForm });
                          setMedStep(1);
                          setShowMedModal(true);
                        }}
                        className="text-xs bg-blue-600 text-white font-semibold px-3.5 py-1.5 rounded hover:bg-blue-700"
                      >
                        Prescribe First Medication
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clinicalData.medications.map((med) => (
                        <div
                          key={med._id}
                          className="p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-gray-900">{med.name}</span>
                              {med.dosage && (
                                <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                  {med.dosage}
                                </span>
                              )}
                              {(med.duration || med.durationDays) && (
                                <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                                  {med.duration || `${med.durationDays} days course`}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                  med.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {med.isActive ? 'Active' : 'Archived'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              <span className="font-medium text-gray-700 capitalize">
                                {med.frequency?.replace(/_/g, ' ')}
                              </span>
                              {med.times && med.times.length > 0 && ` • Scheduled: ${med.times.join(', ')}`}
                            </p>
                            {med.instructions && (
                              <p className="text-xs text-gray-600 italic">
                                "{med.instructions}"
                              </p>
                            )}
                            <p className="text-[11px] text-gray-400">
                              Prescribed by: {med.prescribedBy || 'Physician'}
                            </p>
                          </div>

                          {/* Action Buttons: Adjust Dosage & Edit Medication */}
                          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                            <button
                              type="button"
                              onClick={() => openAdjustDosageModal(med)}
                              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 shadow-xs"
                              title="Increase or adjust dosage"
                            >
                              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                              Increase Dosage
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditMedModal(med)}
                              className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold px-3 py-1.5 rounded-lg border border-gray-300 transition-colors flex items-center gap-1.5 shadow-xs"
                              title="Edit medication details"
                            >
                              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit Medication
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Adherence Tracking & Timeline */}
              {activeTab === 'adherence' && (
                <div className="space-y-4">
                  {/* Time Window Switcher & Summary Metrics */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-800 text-sm">Adherence Performance</h3>
                      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                        {[7, 14, 30].map((d) => (
                          <button
                            key={d}
                            onClick={() => setReportDays(d)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                              reportDays === d
                                ? 'bg-white text-blue-700 shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            {d} Days
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-700 font-semibold">Adherence Rate</p>
                        <p className="text-2xl font-extrabold text-blue-900 mt-0.5">
                          {clinicalData?.stats?.adherenceRate ?? 100}%
                        </p>
                      </div>
                      <div className="p-3.5 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs text-green-700 font-semibold">Doses Taken</p>
                        <p className="text-2xl font-extrabold text-green-900 mt-0.5">
                          {clinicalData?.stats?.taken ?? 0}
                        </p>
                      </div>
                      <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-700 font-semibold">Doses Missed</p>
                        <p className="text-2xl font-extrabold text-red-900 mt-0.5">
                          {clinicalData?.stats?.missed ?? 0}
                        </p>
                      </div>
                      <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-600 font-semibold">Total Scheduled</p>
                        <p className="text-2xl font-extrabold text-gray-800 mt-0.5">
                          {clinicalData?.stats?.total ?? 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dose Timeline Logs Table */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm">Chronological Dose History</h4>
                    {clinicalData?.history?.length === 0 ? (
                      <p className="text-xs text-gray-500 py-4 text-center">
                        No dose logs recorded in the selected {reportDays}-day window.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50 text-gray-600 uppercase font-semibold border-b">
                            <tr>
                              <th className="py-2.5 px-3">Date & Time</th>
                              <th className="py-2.5 px-3">Medication</th>
                              <th className="py-2.5 px-3">Scheduled</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {clinicalData?.history?.map((log) => (
                              <tr key={log._id} className="hover:bg-gray-50">
                                <td className="py-2.5 px-3 text-gray-700">
                                  {new Date(log.scheduledTime).toLocaleDateString()}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-gray-900">
                                  {log.medicationId?.name || 'Medication'}
                                </td>
                                <td className="py-2.5 px-3 text-gray-500">
                                  {new Date(log.scheduledTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                      log.status === 'taken' || log.status === 'late'
                                        ? 'bg-green-100 text-green-800'
                                        : log.status === 'skipped'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {log.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-gray-500 italic">
                                  {log.notes || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Clinical Adherence Report & Summary */}
              {activeTab === 'report' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">
                        Physician Adherence Assessment Report
                      </h3>
                      <p className="text-xs text-gray-500">
                        Generated for Patient: {selectedPatientObj?.name} (Mobile: {selectedPatientObj?.phone})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenAddReport}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        + Add Clinical Report
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                          />
                        </svg>
                        Print Report
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <p className="text-gray-500 font-semibold">Evaluation Window</p>
                      <p className="font-bold text-gray-800 text-sm mt-0.5">Last {reportDays} Days</p>
                    </div>
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <p className="text-gray-500 font-semibold">Compliance Rating</p>
                      <p
                        className={`font-bold text-sm mt-0.5 ${
                          (clinicalData?.stats?.adherenceRate ?? 100) >= 80
                            ? 'text-green-700'
                            : (clinicalData?.stats?.adherenceRate ?? 100) >= 50
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {(clinicalData?.stats?.adherenceRate ?? 100) >= 80
                          ? 'Satisfactory (High Compliance)'
                          : (clinicalData?.stats?.adherenceRate ?? 100) >= 50
                          ? 'Moderate (Intermittent Missed Doses)'
                          : 'High Risk (Critical Non-Adherence)'}
                      </p>
                    </div>
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <p className="text-gray-500 font-semibold">Prescribing Physician</p>
                      <p className="font-bold text-gray-800 text-sm mt-0.5">
                        {user?.name?.startsWith('Dr.') ? user?.name : `Dr. ${user?.name || 'Physician'}`}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-gray-800 uppercase tracking-wider">
                        Patient Health Records DB — Clinical Reports ({clinicalData?.reports?.length || 0})
                      </h4>
                    </div>

                    {!clinicalData?.reports || clinicalData.reports.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-500 border border-dashed rounded-xl p-4 space-y-2 bg-gray-50/50">
                        <p className="font-medium text-gray-600">No clinical consultation reports filed in patient database yet.</p>
                        <p className="text-gray-400">
                          Click "+ Add Clinical Report" above to file an assessment with diagnosis and vitals.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {clinicalData.reports.map((report) => {
                          const isBpReport = report.reportType === 'bp_report';
                          const isSugarReport = report.reportType === 'sugar_report';
                          const isLabReport = report.reportType === 'lab_report';
                          const isRadiology = report.reportType === 'radiology';

                          const badgeStyle = isBpReport
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : isSugarReport
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : isLabReport
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : isRadiology
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200';

                          const isImageAttachment = report.attachment?.fileType?.startsWith('image/') || report.attachment?.fileData?.startsWith('data:image/');
                          const isPdfAttachment = report.attachment?.fileType === 'application/pdf' || report.attachment?.fileData?.startsWith('data:application/pdf') || report.attachment?.fileName?.toLowerCase()?.endsWith('.pdf');

                          return (
                            <div
                              key={report._id}
                              className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3 hover:border-blue-300 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-bold text-sm text-gray-900">{report.title}</h5>
                                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                                      {report.reportType?.replace(/_/g, ' ') || 'CLINICAL REPORT'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-500 mt-0.5">
                                    {report.testDate && (
                                      <>
                                        Test Date: <strong className="text-gray-700">{new Date(report.testDate).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</strong> •{' '}
                                      </>
                                    )}
                                    Consulting Doctor: <strong className="text-gray-700">{report.doctorName || 'Physician'}</strong> • Filed: {new Date(report.createdAt).toLocaleDateString([], {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </p>
                                </div>

                                {report.attachment && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1">
                                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                      </svg>
                                      Attached: {isPdfAttachment ? 'PDF Document' : isImageAttachment ? 'Photo / Scan' : 'Report File'}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {report.diagnosis && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
                                  <span className="font-bold text-amber-800">Primary Diagnosis / Indication: </span>
                                  <span>{report.diagnosis}</span>
                                </div>
                              )}

                              {/* Vitals Strip */}
                              {report.vitals && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {(report.vitals.bloodPressure || (report.vitals.systolic && report.vitals.diastolic)) && (
                                    <div className="bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg text-rose-900 flex items-center gap-1 font-medium">
                                      <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                                      BP: <strong className="font-bold text-rose-950">
                                        {report.vitals.systolic && report.vitals.diastolic 
                                          ? `${report.vitals.systolic}/${report.vitals.diastolic} mmHg`
                                          : report.vitals.bloodPressure}
                                      </strong>
                                    </div>
                                  )}
                                  {report.vitals.heartRate && (
                                    <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-700">
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
                                    <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-700">
                                      Temp: <strong className="text-gray-900">{report.vitals.temperature}</strong>
                                    </span>
                                  )}
                                  {report.vitals.weight && (
                                    <span className="bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-700">
                                      Weight: <strong className="text-gray-900">{report.vitals.weight}</strong>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Attachment Box / Viewer */}
                              {report.attachment && report.attachment.fileData && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    {isImageAttachment ? (
                                      <div
                                        onClick={() => setPreviewAttachment(report.attachment)}
                                        className="relative group cursor-pointer w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white shrink-0 shadow-xs"
                                        title="Click to expand full image"
                                      >
                                        <img
                                          src={report.attachment.fileData}
                                          alt={report.attachment.fileName || 'Report attachment'}
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                          </svg>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="w-14 h-14 rounded-lg bg-red-100 text-red-700 border border-red-200 flex flex-col items-center justify-center shrink-0">
                                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="text-[9px] font-black tracking-wider uppercase mt-0.5">PDF</span>
                                      </div>
                                    )}

                                    <div>
                                      <p className="text-xs font-bold text-gray-800 break-all">
                                        {report.attachment.fileName || 'Diagnostic Report File'}
                                      </p>
                                      <p className="text-[10px] text-gray-500 mt-0.5">
                                        {report.attachment.fileSize
                                          ? `${(report.attachment.fileSize / 1024).toFixed(1)} KB`
                                          : 'Attachment Available'}{' '}
                                        • {isPdfAttachment ? 'Adobe Acrobat PDF' : isImageAttachment ? 'High-Res Photo' : 'Clinical Document'}
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
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
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
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Open PDF
                                      </button>
                                    )}

                                    <a
                                      href={report.attachment.fileData}
                                      download={report.attachment.fileName || 'patient-report'}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                      </svg>
                                      Download
                                    </a>
                                  </div>
                                </div>
                              )}

                              {report.clinicalNotes && (
                                <div className="text-xs text-gray-700 space-y-1">
                                  <span className="font-semibold text-gray-600">Clinical Observations & Findings:</span>
                                  <p className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 whitespace-pre-line">
                                    {report.clinicalNotes}
                                  </p>
                                </div>
                              )}

                              {report.recommendations && (
                                <div className="text-xs text-emerald-900 space-y-1">
                                  <span className="font-semibold text-emerald-800">Recommendations & Follow-Up:</span>
                                  <p className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200 whitespace-pre-line">
                                    {report.recommendations}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-bold text-xs text-gray-800 uppercase tracking-wider">
                      Current Regimen Summary
                    </h4>
                    <div className="border rounded-lg divide-y text-xs">
                      {clinicalData?.medications?.map((m) => (
                        <div key={m._id} className="p-3 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-gray-900">{m.name}</span>
                            {m.dosage && <span className="ml-2 text-gray-600 font-mono">({m.dosage})</span>}
                            <span className="ml-2 text-gray-500 capitalize">· {m.frequency?.replace(/_/g, ' ')}</span>
                          </div>
                          <span className="text-gray-500">{m.times?.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Pharmacy Prescription Routing & Patient Cart (Amazon-Seller Flow) */}
              {activeTab === 'pharmacy' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  {/* Tab Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">
                          Hospital Pharmacy Prescription Cart
                        </h3>
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-300">
                          Prescription Staging
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Review staged medications, verify dosage and alert schedule, and submit prescription order to the pharmacy counter.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 px-3.5 py-2 rounded-xl text-right">
                        <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                          Pickup Order ID = Patient Phone
                        </span>
                        <span className="text-sm font-mono font-extrabold text-emerald-900">
                          {selectedPatientObj?.phone || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cart Feedback Alerts */}
                  {cartSuccess && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base"></span>
                        <span>{cartSuccess}</span>
                      </div>
                      <button onClick={() => setCartSuccess('')} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">&times;</button>
                    </div>
                  )}

                  {cartError && (
                    <div className="p-3.5 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-2">
                        
                        <span>{cartError}</span>
                      </div>
                      <button onClick={() => setCartError('')} className="text-red-700 hover:text-red-900 font-bold ml-2">&times;</button>
                    </div>
                  )}

                  {/* SECTION 1: Patient Prescription Cart */}
                  <div className="bg-gradient-to-b from-blue-50/50 to-slate-50 border-2 border-blue-200 rounded-xl p-5 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        
                        <div>
                          <h4 className="font-extrabold text-sm text-gray-900">
                            Patient Prescription Cart
                          </h4>
                          <span className="text-[11px] text-blue-700 font-medium">
                            {patientCart.length} {patientCart.length === 1 ? 'medication' : 'medications'} staged for {selectedPatientObj?.name}
                          </span>
                        </div>
                      </div>

                      {patientCart.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPatientCart([])}
                          className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded hover:bg-red-50"
                        >
                          Clear Cart
                        </button>
                      )}
                    </div>

                    {patientCart.length === 0 ? (
                      <div className="py-8 text-center text-gray-500 border border-dashed border-gray-300 rounded-xl bg-white/70 space-y-2.5">
                        <p className="text-xs font-bold text-gray-700">The patient prescription cart is currently empty.</p>
                        <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                          Stage medications from the dedicated <strong>Pharmacy Medicine Catalog</strong> or prescribe new medications for this patient.
                        </p>
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setDoctorView('catalog')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                          >
                            Browse Pharmacy Medicine Catalog
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {patientCart.map((item, idx) => (
                          <div key={idx} className="p-4 bg-white rounded-xl border border-blue-200 shadow-xs space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-gray-900">{item.medicationName}</span>
                                  {item.power && (
                                    <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-md">
                                      Power: {item.power}
                                    </span>
                                  )}
                                  {item.productInfo?.category && (
                                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                      {item.productInfo.category}
                                    </span>
                                  )}
                                </div>
                                {item.productInfo?.genericName && (
                                  <p className="text-[11px] text-gray-500 mt-0.5">Generic: {item.productInfo.genericName}</p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveFromCart(idx)}
                                className="text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>

                            {/* Schedule & Intake Configuration */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100 text-xs">
                              <div>
                                <label className="block font-semibold text-gray-700 mb-1">Dosage / Unit</label>
                                <input
                                  type="text"
                                  value={item.dosage}
                                  onChange={(e) => handleUpdateCartItem(idx, 'dosage', e.target.value)}
                                  placeholder="e.g. 1 tablet, 650mg"
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              <div>
                                <label className="block font-semibold text-gray-700 mb-1">Frequency</label>
                                <select
                                  value={item.frequency}
                                  onChange={(e) => handleUpdateCartItem(idx, 'frequency', e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-blue-500"
                                >
                                  {FREQUENCY_OPTIONS.map((f) => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block font-semibold text-gray-700 mb-1">Alert Times (Intake Schedule)</label>
                                <input
                                  type="text"
                                  value={(item.suggestedTimes || []).join(', ')}
                                  onChange={(e) => {
                                    const times = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                                    handleUpdateCartItem(idx, 'suggestedTimes', times);
                                  }}
                                  placeholder="e.g. 09:00, 20:00"
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 font-mono"
                                />
                              </div>

                              <div>
                                <label className="block font-semibold text-gray-700 mb-1">Duration (Days)</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={item.durationDays}
                                  onChange={(e) => handleUpdateCartItem(idx, 'durationDays', e.target.value)}
                                  placeholder="e.g. 5"
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Intake Instructions & Advice</label>
                              <input
                                type="text"
                                value={item.instructions}
                                onChange={(e) => handleUpdateCartItem(idx, 'instructions', e.target.value)}
                                placeholder="e.g. Take after lunch and dinner with warm water"
                                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Auto-calculated total units for pharmacist */}
                            {(() => {
                              const calcTotalUnits = (i) => {
                                const dosesPerDay = Array.isArray(i.suggestedTimes) ? i.suggestedTimes.length : 1;
                                const days = parseInt(i.durationDays) || 1;
                                return dosesPerDay * days;
                              };
                              const total = calcTotalUnits(item);
                              const dosesPerDay = Array.isArray(item.suggestedTimes) ? item.suggestedTimes.length : 1;
                              const days = parseInt(item.durationDays) || 1;
                              return (
                                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                                  <span className="text-base"></span>
                                  <div>
                                    <p className="text-xs font-extrabold text-indigo-900">
                                      {total} {item.dosage?.toLowerCase().includes('ml') ? 'ml' : 'tablet(s)'} total — pharmacist will dispense this quantity
                                    </p>
                                    <p className="text-[10px] text-indigo-700 mt-0.5">
                                      {dosesPerDay} dose(s)/day × {days} day(s) = {total} units
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ))}

                        {/* Submit Cart Action Bar */}
                        <div className="bg-white p-4 rounded-xl border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                          <div>
                            <p className="text-xs font-bold text-gray-900">
                              Ready to Dispatch Order to Hospital Pharmacist
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Order ID: <strong className="font-mono text-emerald-800">{selectedPatientObj?.phone}</strong>. Patient receives intake schedule alerts once dispensed.
                            </p>
                          </div>
                          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                            <button
                              type="button"
                              onClick={() => setDoctorView('catalog')}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer mr-auto"
                            >
                              <span>+ Add More Medicines from Catalog</span>
                            </button>
                            <button
                              type="button"
                              disabled={submittingCart}
                              onClick={handleSubmitPrescriptionCart}
                              className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                              {submittingCart ? (
                                <span>Dispatching Order...</span>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                  Submit Prescription Order ({patientCart.length} {patientCart.length === 1 ? 'item' : 'items'})
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ePharmacy Tab — Dispatched Prescription Orders */}
              {activeTab === 'epharmacy' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-base text-gray-900 flex items-center gap-2">
                        ePharmacy Orders
                        <span className="text-xs font-normal text-gray-500">for {selectedPatientObj?.name}</span>
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Prescriptions dispatched to the hospital pharmacy. Patient collects by quoting their phone number at the counter.
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-3 py-1 rounded-full">
                      Order ID = {selectedPatientObj?.phone}
                    </span>
                  </div>

                  {loadingOrders ? (
                    <div className="py-8 text-center text-xs text-gray-500">Loading orders...</div>
                  ) : patientOrders.length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-gray-200 rounded-xl">
                      
                      <p className="text-sm font-semibold text-gray-600">No pharmacy orders yet</p>
                      <p className="text-xs text-gray-400 mt-1">Add medicines from the Pharmacy Catalog tab and submit a prescription order.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {patientOrders.map((order) => (
                        <div
                          key={order._id}
                          className="p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 transition-all shadow-xs space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-extrabold bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200">
                                Order ID: {order.orderId || order.patientPhone}
                              </span>
                              <span className="font-bold text-sm text-gray-900">{order.medicationName}</span>
                              {order.power && (
                                <span className="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-md">
                                  {order.power}
                                </span>
                              )}
                              {order.totalUnits && (
                                <span className="text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full">
                                  {order.totalUnits} units
                                </span>
                              )}
                              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono capitalize">
                                {order.frequency?.replace(/_/g, ' ')}
                              </span>
                            </div>

                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                                order.status === 'dispensed'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : order.status === 'cancelled'
                                  ? 'bg-gray-100 text-gray-700 border border-gray-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${
                                order.status === 'dispensed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                              }`}></span>
                              {order.status === 'dispensed'
                                ? 'Dispensed & Active in Patient Regimen'
                                : 'Sent to Pharmacy (Pending Counter Pickup)'}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>Schedule: <strong className="text-gray-700 font-mono">{(order.suggestedTimes || []).join(', ')}</strong></span>
                            {order.duration && <span>Duration: <strong className="text-gray-700">{order.duration}</strong></span>}
                            <span>Sent: {new Date(order.createdAt).toLocaleDateString()}</span>
                            {order.dispensedAt && (
                              <span className="text-emerald-700 font-medium">
                                Dispensed by {order.pharmacistName || 'Pharmacist'} on {new Date(order.dispensedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {order.instructions && (
                            <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100 italic">
                              "{order.instructions}"
                            </p>
                          )}
                          {order.pharmacyNotes && (
                            <p className="text-xs text-emerald-800 bg-emerald-50/70 p-2 rounded-lg border border-emerald-200">
                              <strong>Pharmacy Dispense Note:</strong> {order.pharmacyNotes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
        </div>
      )}
    </div>
  </div>
  )}

      {/* VIEW 2: Doctor Prescription Orders Database */}
      {doctorView === 'orders_db' && (
        <div className="space-y-6">
          {/* Header & Controls Bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    Hospital Prescription Orders Database
                  </h2>
                  <span className="bg-blue-100 text-blue-800 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-blue-200">
                    {allOrders.length} Total Orders
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Ordering database for doctors and pharmacists with Order ID set as the patient's phone number. Patients physically claim medications at the counter by quoting this phone number.
                </p>
              </div>

              <button
                onClick={fetchAllOrders}
                disabled={loadingAllOrders}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
              >
                <span>Refresh</span>
                <span>{loadingAllOrders ? 'Refreshing...' : 'Refresh Orders DB'}</span>
              </button>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Total Prescriptions</p>
                  <p className="text-2xl font-black text-blue-900 mt-0.5">{allOrders.length}</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">Recorded in hospital database</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-200/60 text-blue-800 flex items-center justify-center text-lg font-bold">
                  
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Pending Counter Pickup</p>
                  <p className="text-2xl font-black text-amber-900 mt-0.5">
                    {allOrders.filter((o) => o.status === 'sent_to_pharmacy').length}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5">Patient quotes phone at counter</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-200/60 text-amber-800 flex items-center justify-center text-lg font-bold">
                  </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Dispensed & Regimen Active</p>
                  <p className="text-2xl font-black text-emerald-900 mt-0.5">
                    {allOrders.filter((o) => o.status === 'dispensed').length}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Intake alerts active in patient db</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-200/60 text-emerald-800 flex items-center justify-center text-lg font-bold">
                  </div>
              </div>
            </div>

            {/* Search Bar and Status Filters */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search orders by Order ID / Phone Number (e.g. 6300157736), Patient Name, or Medicine..."
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: `All Orders (${allOrders.length})` },
                  { id: 'sent_to_pharmacy', label: `Pending Counter Pickup (${allOrders.filter((o) => o.status === 'sent_to_pharmacy').length})` },
                  { id: 'dispensed', label: `Dispensed & Active (${allOrders.filter((o) => o.status === 'dispensed').length})` },
                  { id: 'cancelled', label: `Cancelled (${allOrders.filter((o) => o.status === 'cancelled').length})` },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setOrdersStatusFilter(st.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      ordersStatusFilter === st.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Orders Cards List */}
          {loadingAllOrders ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-xs text-gray-500">
              Loading prescription orders database...
            </div>
          ) : filteredAllOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl font-bold">
                
              </div>
              <h3 className="text-base font-bold text-gray-800">No Orders Found</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {ordersSearch
                  ? `No orders matching "${ordersSearch}" with status "${ordersStatusFilter}".`
                  : 'No prescription orders recorded in the system yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAllOrders.map((order) => {
                const isDispensed = order.status === 'dispensed';
                const isPending = order.status === 'sent_to_pharmacy';

                return (
                  <div
                    key={order._id}
                    className={`bg-white rounded-xl border p-5 shadow-xs space-y-4 transition-all ${
                      isDispensed
                        ? 'border-emerald-200 hover:border-emerald-300'
                        : isPending
                        ? 'border-amber-200 hover:border-amber-300'
                        : 'border-gray-200'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 px-3 py-1 rounded-lg">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                            Order ID (Patient Phone)
                          </span>
                          <span className="font-mono font-black text-sm text-blue-950">
                            {order.orderId || order.patientPhone}
                          </span>
                        </div>

                        <div>
                          <p className="font-extrabold text-sm text-gray-900">
                            {order.patientName || 'Registered Patient'}
                          </p>
                          <p className="text-xs text-gray-500">{order.patientPhone}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                            isDispensed
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isPending
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isDispensed ? 'bg-emerald-500' : isPending ? 'bg-amber-500 animate-pulse' : 'bg-gray-400'
                            }`}
                          ></span>
                          {isDispensed
                            ? 'Dispensed & Intake Alerts Active'
                            : isPending
                            ? 'Pending Pharmacy Pickup'
                            : order.status}
                        </span>

                        <span className="text-xs text-gray-400 font-mono">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Medication & Schedule Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-gray-400 block mb-0.5">Prescribed Medicine</span>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-sm text-gray-900">{order.medicationName}</strong>
                          {order.power && (
                            <span className="bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 px-1.5 py-0.2 rounded text-[11px]">
                              {order.power}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-400 block mb-0.5">Frequency & Times</span>
                        <span className="font-semibold text-gray-800 capitalize">
                          {order.frequency?.replace(/_/g, ' ') || 'Daily'}
                        </span>
                        <span className="text-gray-500 block font-mono mt-0.5">
                          Alerts: {(order.suggestedTimes || []).join(', ') || 'N/A'}
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-400 block mb-0.5">Duration</span>
                        <span className="font-semibold text-gray-800">
                          {order.duration || (order.durationDays ? `${order.durationDays} days` : 'Ongoing')}
                        </span>
                      </div>

                      <div>
                        <span className="text-gray-400 block mb-0.5">Prescribing Practitioner</span>
                        <span className="font-semibold text-indigo-900">
                          Dr. {order.doctorName || 'Attending Physician'}
                        </span>
                      </div>
                    </div>

                    {/* Instructions */}
                    {order.instructions && (
                      <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                        <strong className="text-gray-900">Doctor Instructions:</strong> "{order.instructions}"
                      </p>
                    )}

                    {/* Dispense Details (if completed) */}
                    {isDispensed && (
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 font-bold">Dispensed at Counter:</span>
                          <span>by {order.pharmacistName || 'Hospital Pharmacist'} on {new Date(order.dispensedAt).toLocaleString()}</span>
                        </div>
                        {order.pharmacyNotes && (
                          <span className="italic text-emerald-800">Note: "{order.pharmacyNotes}"</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Pharmacy Medicine Catalog (Stocked by Pharmacists) */}
      {doctorView === 'catalog' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Hospital Pharmacy Inventory
              </h2>
            </div>

            {/* Search and Category Filter Dropdown */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-gray-100">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search pharmacy inventory by medicine name, power, or brand (e.g. Dolo, Paracetamol, Amoxicillin)..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Filter Icon Dropdown Menu */}
              <div className="relative" ref={categoryDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCategoryDropdown((prev) => !prev)}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between sm:justify-start gap-2.5 transition-all shadow-xs cursor-pointer ${
                    catalogCategory !== 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-800 font-bold'
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                  }`}
                  aria-haspopup="true"
                  aria-expanded={showCategoryDropdown}
                >
                  <div className="flex items-center gap-2">
                    <svg className={`w-4 h-4 ${catalogCategory !== 'all' ? 'text-blue-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span>
                      {catalogCategory === 'all'
                        ? `All Formulations (${catalog.length})`
                        : (CATALOG_CATEGORIES.find((c) => c.id === catalogCategory)?.label || 'Filtered')}
                    </span>
                  </div>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showCategoryDropdown ? 'rotate-180 text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showCategoryDropdown && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1.5 overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <span>Category Filter</span>
                      {catalogCategory !== 'all' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCatalogCategory('all');
                            setShowCategoryDropdown(false);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-[10px] font-bold cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {CATALOG_CATEGORIES.map((cat) => {
                        const isSelected = catalogCategory === cat.id;
                        const displayLabel = cat.id === 'all' ? `All Formulations (${catalog.length})` : cat.label;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setCatalogCategory(cat.id);
                              setShowCategoryDropdown(false);
                            }}
                            className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 text-blue-700 font-bold'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span>{displayLabel}</span>
                            {isSelected && (
                              <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Catalog Grid */}
          {loadingCatalog ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-xs text-gray-500">
              Loading pharmacy formulations...
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              No medications found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCatalog.map((prod) => {
                const inCart = patientCart.some((i) => i.productId === prod._id);

                return (
                  <div
                    key={prod._id}
                    className="bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-sm hover:border-blue-300 transition-all flex flex-col justify-between overflow-hidden"
                  >
                    {/* Medicine product image */}
                    <div className="w-full h-40 bg-gray-50 flex items-center justify-center overflow-hidden relative">
                      {getMedImage(prod.name) ? (
                        <img
                          src={getMedImage(prod.name)}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
                        />
                      ) : null}
                      <div className="hidden w-full h-full items-center justify-center text-5xl bg-gradient-to-br from-blue-50 to-indigo-100">
                        
                      </div>
                      {/* Category pill overlay */}
                      <span className="absolute top-2 left-2 text-[10px] bg-white/90 backdrop-blur-sm text-gray-700 px-2 py-0.5 rounded-full font-medium border border-gray-200 shadow-xs">
                        {prod.category}
                      </span>
                      {/* Stock badge overlay */}
                      <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-xs ${
                        prod.quantity > 10 ? 'bg-emerald-100/90 text-emerald-800 border-emerald-300'
                        : prod.quantity > 0 ? 'bg-amber-100/90 text-amber-800 border-amber-300'
                        : 'bg-red-100/90 text-red-800 border-red-300'
                      }`}>
                        {prod.quantity > 0 ? `Stock: ${prod.quantity}` : 'Out of Stock'}
                      </span>
                    </div>
                    <div className="p-5 space-y-2 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                            {prod.name}
                          </h3>
                          {prod.genericName && (
                            <p className="text-xs text-gray-500 mt-0.5">Generic: {prod.genericName}</p>
                          )}
                        </div>

                        {prod.power && (
                          <span className="bg-emerald-50 text-emerald-800 text-xs font-extrabold px-2.5 py-1 rounded-md border border-emerald-200">
                            {prod.power}
                          </span>
                        )}
                      </div>

                      {prod.description && (
                        <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed pt-1">
                          {prod.description}
                        </p>
                      )}

                      {prod.sideEffects && (
                        <p className="text-[11px] text-amber-800 bg-amber-50/70 p-2 rounded-lg border border-amber-200">
                          <strong>Advisory:</strong> {prod.sideEffects}
                        </p>
                      )}

                      <div className="pt-3 mt-auto border-t border-gray-100 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-gray-400 truncate">
                          {prod.manufacturer ? `Mfr: ${prod.manufacturer}` : 'Hospital Pharmacy'}
                        </div>

                        <button
                          type="button"
                          disabled={prod.quantity <= 0 || inCart}
                          onClick={() => handleAddToCart(prod)}
                          className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                            inCart
                              ? 'bg-blue-100 text-blue-800 cursor-default'
                              : prod.quantity <= 0
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
                          }`}
                        >
                          {inCart ? 'In Cart' : '+ Prescribe to Patient'}
                        </button>
                      </div>
                    </div>
                  </div>

                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Search & Link Existing Patients */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Search Patients by Phone Number or Name</h3>
                <p className="text-xs text-gray-500">
                  Search MedSafe database by patient phone number (e.g. 9876543220), name, or email.
                </p>
              </div>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleSearchPatients} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter patient phone (e.g. 9876543220) or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </form>

              {searchFeedback && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  {searchFeedback}
                </p>
              )}

              {/* Search Results List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {searchResults.map((patient) => {
                  const isAlreadyInRoster = patients.some((p) => p.patient?._id === patient._id);

                  return (
                    <div
                      key={patient._id}
                      className="p-3 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{patient.name || 'Patient'}</p>
                        <p className="text-xs text-gray-500">{patient.phone}</p>
                        {patient.bloodGroup && (
                          <span className="text-[10px] text-red-700 font-semibold">
                            Blood Group: {patient.bloodGroup}
                          </span>
                        )}
                      </div>

                      {isAlreadyInRoster ? (
                        <span className="text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded font-semibold border border-green-200">
                          In Your Roster
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddPatientToRoster(patient)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                        >
                          + Add to Roster
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Medication with Patient OTP Authorization Flow */}
      {showMedModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  {medStep === 1
                    ? 'Prescribe Medication for Patient'
                    : 'Patient Consent Authorization (OTP)'}
                </h3>
                <p className="text-xs text-gray-500">
                  {medStep === 1
                    ? `Patient: ${selectedPatientObj?.name || 'Selected Patient'}`
                    : `Authorization code sent to patient's mobile`}
                </p>
              </div>
              <button
                onClick={() => setShowMedModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Prescribing Mode Switcher */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  setPrescribeMode('pharmacy');
                  setMedError('');
                }}
                className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-2 cursor-pointer ${
                  prescribeMode === 'pharmacy'
                    ? 'border-emerald-600 text-emerald-800 bg-white shadow-xs'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                
                <span>Send to Pharmacist</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  With Power
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrescribeMode('direct');
                  setMedError('');
                }}
                className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-2 cursor-pointer ${
                  prescribeMode === 'direct'
                    ? 'border-blue-600 text-blue-800 bg-white shadow-xs'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                
                <span>Direct Prescribe</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                  Patient OTP
                </span>
              </button>
            </div>

            {/* Error Message */}
            {medError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {medError}
              </div>
            )}

            {/* Pharmacy Success Message */}
            {pharmacyFeedback && (
              <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded text-center">
                {pharmacyFeedback}
              </div>
            )}

            {/* MODE 1: SEND TO PHARMACIST (WITH POWER) */}
            {prescribeMode === 'pharmacy' && (
              <form onSubmit={handleSendToPharmacist} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Medication Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Paracetamol, Metformin, Amoxicillin, Lisinopril..."
                    value={pharmacyForm.name}
                    onChange={(e) => setPharmacyForm({ ...pharmacyForm, name: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Power / Strength / Dosage *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 650mg, 500mg, 10mg, 250mg/5ml, 2 puffs"
                    value={pharmacyForm.power}
                    onChange={(e) => setPharmacyForm({ ...pharmacyForm, power: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  {/* Quick Power Presets */}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {['500mg', '650mg', '1000mg', '250mg', '10mg', '20mg', '5mg', '250mg/5ml'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPharmacyForm({ ...pharmacyForm, power: preset })}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          pharmacyForm.power.toLowerCase() === preset.toLowerCase()
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Frequency</label>
                    <select
                      value={pharmacyForm.frequency}
                      onChange={(e) => {
                        const opt = FREQUENCY_OPTIONS.find((f) => f.value === e.target.value);
                        setPharmacyForm({
                          ...pharmacyForm,
                          frequency: e.target.value,
                          times: opt ? [...opt.times] : pharmacyForm.times,
                        });
                      }}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      {FREQUENCY_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Course Duration (Days)</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 5, 7, 10, 30"
                      value={pharmacyForm.durationDays}
                      onChange={(e) => setPharmacyForm({ ...pharmacyForm, durationDays: e.target.value })}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Suggested Administration Times
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {pharmacyForm.times.map((t, idx) => (
                      <input
                        key={idx}
                        type="time"
                        value={t}
                        onChange={(e) => {
                          const updated = [...pharmacyForm.times];
                          updated[idx] = e.target.value;
                          setPharmacyForm({ ...pharmacyForm, times: updated });
                        }}
                        className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500"
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Clinical Instructions & Dispensing Advice
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Take after breakfast and dinner with warm water. Complete full course."
                    value={pharmacyForm.instructions}
                    onChange={(e) => setPharmacyForm({ ...pharmacyForm, instructions: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowMedModal(false)}
                    className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingToPharmacy || !pharmacyForm.name.trim() || !pharmacyForm.power.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                  >
                    {sendingToPharmacy ? 'Routing to Pharmacy...' : 'Send Medication to Pharmacist →'}
                  </button>
                </div>
              </form>
            )}

            {/* MODE 2: DIRECT DOCTOR PRESCRIPTION (INSTANT OTP) */}
            {prescribeMode === 'direct' && (
              <>
                {/* STEP 1: Medication Details Form */}
                {medStep === 1 && (
                  <form onSubmit={handleRequestOtp} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Medication Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Amlodipine, Metformin, Lisinopril..."
                        value={medForm.name}
                        onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Dosage / Power *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 5 mg, 500 mg, 1 puff"
                          value={medForm.dosage}
                          onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Frequency</label>
                        <select
                          value={medForm.frequency}
                          onChange={(e) => {
                            const opt = FREQUENCY_OPTIONS.find((f) => f.value === e.target.value);
                            setMedForm({
                              ...medForm,
                              frequency: e.target.value,
                              times: opt ? [...opt.times] : medForm.times,
                            });
                          }}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                          {FREQUENCY_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Scheduled Administration Times
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {medForm.times.map((t, idx) => (
                          <input
                            key={idx}
                            type="time"
                            value={t}
                            onChange={(e) => {
                              const updated = [...medForm.times];
                              updated[idx] = e.target.value;
                              setMedForm({ ...medForm, times: updated });
                            }}
                            className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-blue-500"
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Duration (Days)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          placeholder="Enter duration in days (e.g. 10)"
                          value={medForm.durationDays || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMedForm({
                              ...medForm,
                              durationDays: val,
                              duration: val ? `${val} days` : '',
                            });
                          }}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <span className="text-xs font-semibold text-gray-500">Days</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Clinical Instructions / Advice
                      </label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Take after breakfast with water. Avoid skipping doses."
                        value={medForm.instructions}
                        onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => setShowMedModal(false)}
                        className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={otpSubmitting || !medForm.name.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                      >
                        {otpSubmitting ? 'Sending OTP...' : 'Request Patient Consent OTP →'}
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP 2: Patient OTP Consent Verification */}
                {medStep === 2 && (
                  <div className="p-6 space-y-5">
                    <div className="text-center space-y-1">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto text-lg">
                        
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm">
                        Enter Patient Authorization Code
                      </h4>
                      <p className="text-xs text-gray-500">
                        A 6-digit OTP code was sent to <strong>{maskedPhone}</strong>{selectedPatientObj?.email ? <> and email <strong>{selectedPatientObj.email}</strong></> : null} for prescription consent.
                      </p>
                    </div>

                    {debugOtp && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-950 shadow-xs">
                        <div>
                          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Patient Authorization Code:</div>
                          <div className="font-mono font-black text-lg tracking-widest text-blue-900 mt-0.5">{debugOtp}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const digits = debugOtp.split('').slice(0, 6);
                            setOtpDigits(digits);
                            handleConfirmPrescription(debugOtp);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                        >
                          Auto-Fill & Confirm
                        </button>
                      </div>
                    )}

                    {/* 6-Digit OTP Inputs */}
                    <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                      {otpDigits.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => (otpRefs.current[i] = el)}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={d}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          className="w-10 h-12 text-center text-lg font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                      <button
                        type="button"
                        onClick={() => setMedStep(1)}
                        className="text-blue-600 hover:underline font-medium cursor-pointer"
                      >
                        ← Edit Prescription Details
                      </button>

                      <div>
                        {resendTimer > 0 ? (
                          <span>Resend OTP in {resendTimer}s</span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRequestOtp}
                            className="text-blue-600 hover:underline font-semibold cursor-pointer"
                          >
                            Resend Code
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmPrescription()}
                        disabled={otpSubmitting || otpDigits.some((d) => !d)}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-3 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {otpSubmitting
                          ? 'Verifying Authorization...'
                          : 'Confirm Authorization & Activate Prescription'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Add Clinical / Diagnostic Report with File, PDF, Photo upload to Patient DB */}
      {showAddReportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/30 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-100/80 px-2 py-0.5 rounded-full border border-blue-200">
                    Patient Medical Dossier
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500">
                    ID: {selectedPatientId?.slice(-6)?.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-gray-900 mt-1 flex items-center gap-2">
                  Add Patient Diagnostic & Clinical Report
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Patient: <strong className="text-gray-900">{selectedPatientObj?.name}</strong> • Phone: {selectedPatientObj?.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddReportModal(false)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 rounded-lg hover:bg-white transition-colors cursor-pointer"
                title="Close"
              >
                &times;
              </button>
            </div>

            {reportError && (
              <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{reportError}</span>
              </div>
            )}

            {reportSuccess && (
              <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{reportSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveClinicalReport} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Report Classification Quick Tabs */}
              <div>
                <label className="block font-bold text-gray-700 mb-1.5">
                  Select Diagnostic Report Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'bp_report', label: 'Blood Pressure (BP)', defaultTitle: 'Blood Pressure Examination Report', color: 'rose' },
                    { id: 'sugar_report', label: 'Blood Sugar / Glucose', defaultTitle: 'Blood Sugar & Glucose Test Report', color: 'amber' },
                    { id: 'lab_report', label: 'Lab / Pathology', defaultTitle: 'Pathology & Lab Diagnostics Report', color: 'blue' },
                    { id: 'radiology', label: 'Radiology / Scan', defaultTitle: 'Radiology & Imaging Report', color: 'purple' },
                    { id: 'consultation', label: 'Clinical Consultation', defaultTitle: 'Clinical Consultation & Physical Examination', color: 'indigo' },
                  ].map((cat) => {
                    const active = reportForm.reportType === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          const currentIsDefault = [
                            'Blood Pressure Examination Report',
                            'Blood Sugar & Glucose Test Report',
                            'Pathology & Lab Diagnostics Report',
                            'Radiology & Imaging Report',
                            'Clinical Consultation & Physical Examination',
                            '',
                          ].includes(reportForm.title);

                          setReportForm((prev) => ({
                            ...prev,
                            reportType: cat.id,
                            title: currentIsDefault ? cat.defaultTitle : prev.title,
                          }));
                        }}
                        className={`px-3 py-2 text-xs font-bold rounded-lg border text-center transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title and Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">
                    Report Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Blood Pressure Examination Report"
                    value={reportForm.title}
                    onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                    className="w-full text-xs sm:text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Test / Observation Date
                  </label>
                  <input
                    type="date"
                    value={reportForm.testDate}
                    onChange={(e) => setReportForm({ ...reportForm, testDate: e.target.value })}
                    className="w-full text-xs sm:text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* DEDICATED SECTION 1: BLOOD PRESSURE METRICS */}
              {(reportForm.reportType === 'bp_report' || reportForm.systolic || reportForm.diastolic) && (
                <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-900 text-xs flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                      Blood Pressure (BP) Test Readings
                    </span>
                    {/* Live BP Classification */}
                    {(() => {
                      const s = parseInt(reportForm.systolic, 10);
                      const d = parseInt(reportForm.diastolic, 10);
                      if (!s || !d) return null;
                      if (s < 120 && d < 80) {
                        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">Normal (&lt;120/80)</span>;
                      } else if (s >= 120 && s <= 129 && d < 80) {
                        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-300">Elevated (120-129/&lt;80)</span>;
                      } else if ((s >= 130 && s <= 139) || (d >= 80 && d <= 89)) {
                        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">Stage 1 HTN (130-139/80-89)</span>;
                      } else if (s >= 140 || d >= 90) {
                        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-900 border border-rose-300">Stage 2 HTN (&ge;140/90)</span>;
                      }
                      return null;
                    })()}
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        Systolic (mmHg) *
                      </span>
                      <input
                        type="number"
                        placeholder="120"
                        value={reportForm.systolic}
                        onChange={(e) => setReportForm({ ...reportForm, systolic: e.target.value })}
                        className="w-full border border-rose-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        Diastolic (mmHg) *
                      </span>
                      <input
                        type="number"
                        placeholder="80"
                        value={reportForm.diastolic}
                        onChange={(e) => setReportForm({ ...reportForm, diastolic: e.target.value })}
                        className="w-full border border-rose-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        Pulse / Heart Rate (bpm)
                      </span>
                      <input
                        type="number"
                        placeholder="72"
                        value={reportForm.heartRate}
                        onChange={(e) => setReportForm({ ...reportForm, heartRate: e.target.value })}
                        className="w-full border border-rose-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* DEDICATED SECTION 2: BLOOD SUGAR / GLUCOSE METRICS */}
              {(reportForm.reportType === 'sugar_report' || reportForm.fastingSugar || reportForm.postPrandialSugar || reportForm.hba1c) && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                      Blood Glucose / Diabetes Profile
                    </span>
                    <span className="text-[10px] text-amber-700 font-medium">Standard Reference Values Included</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        Fasting Sugar (mg/dL)
                      </span>
                      <input
                        type="number"
                        placeholder="95 (Norm: 70-99)"
                        value={reportForm.fastingSugar}
                        onChange={(e) => setReportForm({ ...reportForm, fastingSugar: e.target.value })}
                        className="w-full border border-amber-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        Post-Prandial / PP (mg/dL)
                      </span>
                      <input
                        type="number"
                        placeholder="130 (Norm: <140)"
                        value={reportForm.postPrandialSugar}
                        onChange={(e) => setReportForm({ ...reportForm, postPrandialSugar: e.target.value })}
                        className="w-full border border-amber-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        Random Glucose (mg/dL)
                      </span>
                      <input
                        type="number"
                        placeholder="110"
                        value={reportForm.randomSugar}
                        onChange={(e) => setReportForm({ ...reportForm, randomSugar: e.target.value })}
                        className="w-full border border-amber-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-gray-700 block mb-0.5">
                        HbA1c Glycated (%)
                      </span>
                      <input
                        type="text"
                        placeholder="5.6 (Norm: <5.7%)"
                        value={reportForm.hba1c}
                        onChange={(e) => setReportForm({ ...reportForm, hba1c: e.target.value })}
                        className="w-full border border-amber-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* General Vitals (for other report types) */}
              {reportForm.reportType !== 'bp_report' && reportForm.reportType !== 'sugar_report' && (
                <div className="space-y-1.5">
                  <label className="block font-bold text-gray-700">Patient Vital Signs (Optional)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-[11px] text-gray-500">Blood Pressure</span>
                      <input
                        type="text"
                        placeholder="120/80 mmHg"
                        value={reportForm.bloodPressure}
                        onChange={(e) => setReportForm({ ...reportForm, bloodPressure: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500">Pulse / Heart Rate</span>
                      <input
                        type="text"
                        placeholder="72 bpm"
                        value={reportForm.heartRate}
                        onChange={(e) => setReportForm({ ...reportForm, heartRate: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500">Body Temperature</span>
                      <input
                        type="text"
                        placeholder="98.6 °F"
                        value={reportForm.temperature}
                        onChange={(e) => setReportForm({ ...reportForm, temperature: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-500">Weight (kg)</span>
                      <input
                        type="text"
                        placeholder="70 kg"
                        value={reportForm.weight}
                        onChange={(e) => setReportForm({ ...reportForm, weight: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Diagnosis Input */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Clinical Diagnosis / Primary Finding
                </label>
                <input
                  type="text"
                  placeholder={
                    reportForm.reportType === 'bp_report'
                      ? 'e.g. Essential Hypertension, Well-Controlled BP'
                      : reportForm.reportType === 'sugar_report'
                      ? 'e.g. Type 2 Diabetes Mellitus, Good Glycemic Control'
                      : 'e.g. Clinical Assessment findings...'
                  }
                  value={reportForm.diagnosis}
                  onChange={(e) => setReportForm({ ...reportForm, diagnosis: e.target.value })}
                  className="w-full text-xs sm:text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* ATTACHMENT UPLOAD SECTION: FILE, PDF, PHOTO */}
              <div className="space-y-1.5">
                <label className="block font-bold text-gray-700">
                  Attach Diagnostic File / PDF / Test Photo (Optional)
                </label>

                {!reportForm.attachment ? (
                  <label className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 bg-gray-50/60 hover:bg-blue-50/30 transition-colors cursor-pointer block">
                    <input
                      type="file"
                      accept=".pdf,image/*,.png,.jpg,.jpeg,.webp"
                      onChange={handleReportFileUpload}
                      className="hidden"
                    />
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-gray-800">
                      Click to upload or drag and drop report file
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Supports PDF documents, Lab scans, or Photo attachments (Max 25MB)
                    </p>
                  </label>
                ) : (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {reportForm.attachment.fileType?.startsWith('image/') ? (
                        <img
                          src={reportForm.attachment.fileData}
                          alt="Report preview"
                          className="w-12 h-12 rounded-lg object-cover border border-blue-200 shadow-2xs"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-red-100 text-red-700 border border-red-200 flex flex-col items-center justify-center">
                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-[8px] font-black uppercase">PDF</span>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-gray-900 break-all">
                          {reportForm.attachment.fileName}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {(reportForm.attachment.fileSize / 1024).toFixed(1)} KB • Ready to attach
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveReportAttachment}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                    >
                      Remove File
                    </button>
                  </div>
                )}
              </div>

              {/* Clinical Observations */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Clinical Observations & Diagnostic Remarks
                </label>
                <textarea
                  rows={3}
                  placeholder="Document patient symptoms, exam remarks, lab trends, and findings..."
                  value={reportForm.clinicalNotes}
                  onChange={(e) => setReportForm({ ...reportForm, clinicalNotes: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Recommendations */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Recommendations & Follow-Up Plan
                </label>
                <textarea
                  rows={2}
                  placeholder="Dosage adjustments, dietary recommendations, scheduled repeat tests..."
                  value={reportForm.recommendations}
                  onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddReportModal(false)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2.5 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReport || !reportForm.title.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  {savingReport ? (
                    'Saving to Database...'
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Save Report to Patient DB
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Adjust / Increase Dosage Modal */}
      {showAdjustDosageModal && dosageMed && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Adjust / Increase Dosage</h3>
                <p className="text-xs text-gray-500">
                  {dosageMed.name} • Current: <span className="font-semibold text-gray-800">{dosageMed.dosage || 'None'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustDosageModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {dosageError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {dosageError}
              </div>
            )}

            <form onSubmit={handleSaveDosage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  New Prescribed Dosage *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1000mg, 10mg, 2 puffs..."
                  value={newDosage}
                  onChange={(e) => setNewDosage(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Quick Increase Chips */}
              <div>
                <span className="text-[11px] font-semibold text-gray-500 block mb-1.5">
                  Quick Dosage Presets:
                </span>
                <div className="flex flex-wrap gap-2">
                  {['650mg', '1000mg', '1300mg', '500mg', '250mg', '5mg', '10mg', '20mg'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewDosage(preset)}
                      className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${
                        newDosage.toLowerCase() === preset.toLowerCase()
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Clinical Reason / Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Increased dosage due to persistent symptoms/fever."
                  value={dosageReason}
                  onChange={(e) => setDosageReason(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustDosageModal(false)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustingDosage || !newDosage.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {adjustingDosage ? 'Updating Dosage...' : 'Save New Dosage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Edit Medication Modal */}
      {showEditMedModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Edit Medication Details</h3>
                <p className="text-xs text-gray-500">
                  Update prescription schedule, administration times, or instructions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditMedModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {editError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEditMed} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Medication Name *
                </label>
                <input
                  type="text"
                  required
                  value={editMedForm.name}
                  onChange={(e) => setEditMedForm({ ...editMedForm, name: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Dosage</label>
                  <input
                    type="text"
                    placeholder="e.g. 650mg, 500mg"
                    value={editMedForm.dosage}
                    onChange={(e) => setEditMedForm({ ...editMedForm, dosage: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Frequency</label>
                  <select
                    value={editMedForm.frequency}
                    onChange={(e) => {
                      const opt = FREQUENCY_OPTIONS.find((f) => f.value === e.target.value);
                      setEditMedForm({
                        ...editMedForm,
                        frequency: e.target.value,
                        times: opt ? [...opt.times] : editMedForm.times,
                      });
                    }}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {FREQUENCY_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Scheduled Administration Times
                </label>
                <div className="flex flex-wrap gap-2">
                  {editMedForm.times.map((t, idx) => (
                    <input
                      key={idx}
                      type="time"
                      value={t}
                      onChange={(e) => {
                        const updated = [...editMedForm.times];
                        updated[idx] = e.target.value;
                        setEditMedForm({ ...editMedForm, times: updated });
                      }}
                      className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-blue-500"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Duration (Days)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter duration in days (e.g. 10)"
                    value={editMedForm.durationDays || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditMedForm({
                        ...editMedForm,
                        durationDays: val,
                        duration: val ? `${val} days` : '',
                      });
                    }}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-gray-500">Days</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Clinical Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Take after lunch with water"
                  value={editMedForm.instructions}
                  onChange={(e) => setEditMedForm({ ...editMedForm, instructions: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Prescription Status
                </label>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="isActiveStatus"
                      checked={editMedForm.isActive === true}
                      onChange={() => setEditMedForm({ ...editMedForm, isActive: true })}
                    />
                    <span className="font-semibold text-green-700">Active</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="isActiveStatus"
                      checked={editMedForm.isActive === false}
                      onChange={() => setEditMedForm({ ...editMedForm, isActive: false })}
                    />
                    <span className="font-semibold text-gray-600">Archived / Discontinued</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditMedModal(false)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editMedForm.name.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {savingEdit ? 'Saving Changes...' : 'Save Medication Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Report Access OTP Verification Modal (1-Hour Temporary Access) */}
      {showAccessOtpModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  Patient Consent Authorization
                </span>
                <h3 className="text-base font-extrabold text-gray-900 mt-1">
                  Authorize Report Access (1 Hour)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Verification code sent to {accessMaskedPhone || 'patient registered mobile'}{selectedPatientObj?.email ? ` & email ${selectedPatientObj.email}` : ''}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAccessOtpModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {accessError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
                <span>{accessError}</span>
              </div>
            )}

            <div className="space-y-4">
              {accessDebugOtp && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-950 shadow-xs">
                  <div>
                    <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Patient Authorization Code:</div>
                    <div className="font-mono font-black text-lg tracking-widest text-blue-900 mt-0.5">{accessDebugOtp}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const digits = accessDebugOtp.split('').slice(0, 6);
                      setAccessOtpDigits(digits);
                      handleConfirmReportAccess(accessDebugOtp);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                  >
                    Auto-Fill & Unlock
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 text-center mb-2">
                  Enter 6-Digit Patient Authorization Code
                </label>
                <div className="flex justify-center gap-2">
                  {accessOtpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (accessOtpRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleAccessOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleAccessOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleAccessOtpPaste : undefined}
                      className="w-11 h-12 text-center text-lg font-extrabold border-2 border-gray-200 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>Didn't receive code?</span>
                <button
                  type="button"
                  disabled={accessResendTimer > 0 || accessSubmitting}
                  onClick={handleRequestReportAccessOtp}
                  className="text-blue-600 hover:text-blue-800 font-semibold disabled:text-gray-400 cursor-pointer"
                >
                  {accessResendTimer > 0 ? `Resend code in ${accessResendTimer}s` : 'Resend Code'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAccessOtpModal(false)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={accessSubmitting || accessOtpDigits.join('').length !== 6}
                  onClick={() => handleConfirmReportAccess()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {accessSubmitting ? 'Verifying...' : 'Verify & Unlock (1 Hour)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clinical Care Team Communication Modal */}
      {showDoctorMsgModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendDoctorMessage}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Direct Clinical Message</h3>
                <p className="text-xs text-gray-500">
                  To: <strong className="text-gray-800">{activePatient?.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDoctorMsgModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {docMsgSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                {docMsgSuccess}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Recipients</label>
                  <select
                    value={docMsgRecipient}
                    onChange={(e) => setDocMsgRecipient(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Patient & Authorized Caregivers</option>
                    <option value="patient">Patient Only</option>
                    <option value="caregiver">Caregiver Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={docMsgSubject}
                    onChange={(e) => setDocMsgSubject(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Clinical Instructions & Notes</label>
                  <textarea
                    rows="4"
                    value={docMsgBody}
                    onChange={(e) => setDocMsgBody(e.target.value)}
                    placeholder="Enter medical directions, lifestyle adjustments, or follow-up guidance..."
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowDoctorMsgModal(false)}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingDocMsg}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    {sendingDocMsg ? 'Sending...' : 'Send Clinical Note'}
                  </button>
                </div>
              </>
            )}
          </form>
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
