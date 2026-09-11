import React, { useState, useEffect } from 'react';
import { pharmacistApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function PharmacistDashboard() {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('orders'); // 'orders' | 'prescriptions' | 'refills'
  const [prescriptions, setPrescriptions] = useState([]);
  const [refills, setRefills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refillStatusFilter, setRefillStatusFilter] = useState('pending');

  // Doctor Prescription Orders State (Phone Lookup - NO OTP NEEDED)
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [phoneSearchQuery, setPhoneSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [selectedOrderForDispense, setSelectedOrderForDispense] = useState(null);
  const [dispensePower, setDispensePower] = useState('');
  const [dispenseTimes, setDispenseTimes] = useState(['08:00']);
  const [dispenseFrequency, setDispenseFrequency] = useState('once_daily');
  const [dispenseAdvanceDays, setDispenseAdvanceDays] = useState(30);
  const [dispenseNotes, setDispenseNotes] = useState('');
  const [dispensingOrder, setDispensingOrder] = useState(false);
  const [dispenseSuccessMessage, setDispenseSuccessMessage] = useState('');
  const [dispenseError, setDispenseError] = useState('');

  // Safety Scanner State
  const [selectedPatientForSafety, setSelectedPatientForSafety] = useState(null);
  const [safetyReport, setSafetyReport] = useState(null);
  const [scanningSafety, setScanningSafety] = useState(false);

  // Notify Modal State
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState(null); // { patientId, patientName, medName }
  const [notifySubject, setNotifySubject] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [notificationSuccess, setNotificationSuccess] = useState('');

  // Refill Process Modal
  const [selectedRefill, setSelectedRefill] = useState(null);
  const [refillActionStatus, setRefillActionStatus] = useState('approved');
  const [pharmacistNotes, setPharmacistNotes] = useState('');
  const [advanceDays, setAdvanceDays] = useState(30);
  const [processingRefill, setProcessingRefill] = useState(false);

  // Pharmacy Inventory State (Amazon Seller Style - NO PRICES)
  const [inventory, setInventory] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('');
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    genericName: '',
    power: '',
    category: 'Tablet',
    manufacturer: '',
    quantity: 100,
    description: '',
    sideEffects: '',
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [productSuccessMsg, setProductSuccessMsg] = useState('');
  const [productErrorMsg, setProductErrorMsg] = useState('');

  // Load Prescriptions
  const fetchPrescriptions = async () => {
    try {
      setLoading(true);
      const res = await pharmacistApi.getPrescriptions({ q: searchQuery, status: statusFilter });
      setPrescriptions(res.prescriptions || []);
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load Refill Requests
  const fetchRefills = async () => {
    try {
      const res = await pharmacistApi.getRefillRequests(refillStatusFilter);
      setRefills(res.refillRequests || []);
    } catch (err) {
      console.error('Failed to load refills:', err);
    }
  };

  // Load Inventory Products (Amazon Seller Style - NO PRICES)
  const fetchInventory = async () => {
    try {
      setLoadingInventory(true);
      const res = await pharmacistApi.getInventory({
        q: inventorySearch,
        category: inventoryCategory,
      });
      setInventory(res.products || []);
    } catch (err) {
      console.error('Failed to load inventory products:', err);
    } finally {
      setLoadingInventory(false);
    }
  };

  const handleAddProductSubmit = async (e) => {
    e.preventDefault();
    setSavingProduct(true);
    setProductErrorMsg('');
    setProductSuccessMsg('');
    try {
      const res = await pharmacistApi.addInventoryItem({
        name: productForm.name.trim(),
        genericName: productForm.genericName.trim(),
        power: productForm.power.trim(),
        category: productForm.category,
        manufacturer: productForm.manufacturer.trim(),
        quantity: Number(productForm.quantity || 100),
        description: productForm.description.trim(),
        sideEffects: productForm.sideEffects.trim(),
      });
      setProductSuccessMsg(`"${res.product?.name}" (${res.product?.power}) added to pharmacy catalog!`);
      setProductForm({
        name: '',
        genericName: '',
        power: '',
        category: 'Tablet',
        manufacturer: '',
        quantity: 100,
        description: '',
        sideEffects: '',
      });
      await fetchInventory();
      setTimeout(() => {
        setShowAddProductModal(false);
        setProductSuccessMsg('');
      }, 1200);
    } catch (err) {
      setProductErrorMsg(err.message || 'Failed to add product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleStock = async (product) => {
    try {
      await pharmacistApi.updateInventoryItem(product._id, {
        inStock: !product.inStock,
      });
      fetchInventory();
    } catch (err) {
      alert(err.message || 'Failed to update stock status.');
    }
  };

  const handleQuickAdjustQty = async (product, delta) => {
    try {
      const newQty = Math.max(0, (product.quantity || 0) + delta);
      await pharmacistApi.updateInventoryItem(product._id, {
        quantity: newQty,
        inStock: newQty > 0,
      });
      fetchInventory();
    } catch (err) {
      alert(err.message || 'Failed to update quantity.');
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Are you sure you want to remove "${product.name} (${product.power})" from inventory?`)) return;
    try {
      await pharmacistApi.deleteInventoryItem(product._id);
      fetchInventory();
    } catch (err) {
      alert(err.message || 'Failed to delete product.');
    }
  };

  // Load Doctor Prescription Orders (Phone Lookup - No OTP Required)
  const fetchOrders = async (phone = phoneSearchQuery) => {
    try {
      setLoadingOrders(true);
      const res = await pharmacistApi.getOrders({
        phone: phone ? phone.trim() : undefined,
        status: orderStatusFilter || undefined,
      });
      setOrders(res.orders || []);
    } catch (err) {
      console.error('Failed to load prescription orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handlePhoneSearchSubmit = (e) => {
    e?.preventDefault();
    fetchOrders(phoneSearchQuery);
  };

  const openDispenseModal = (order) => {
    setSelectedOrderForDispense(order);
    setDispensePower(order.power || order.dosage || '');
    setDispenseTimes(order.suggestedTimes && order.suggestedTimes.length > 0 ? [...order.suggestedTimes] : ['08:00']);
    setDispenseFrequency(order.frequency || 'once_daily');
    setDispenseAdvanceDays(order.durationDays || 30);
    setDispenseNotes('');
    setDispenseError('');
    setDispenseSuccessMessage('');
  };

  const handleConfirmDispenseSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedOrderForDispense) return;
    setDispensingOrder(true);
    setDispenseError('');
    try {
      await pharmacistApi.dispenseOrder(selectedOrderForDispense._id, {
        power: dispensePower.trim(),
        dosage: dispensePower.trim(),
        times: dispenseTimes,
        frequency: dispenseFrequency,
        advanceDays: Number(dispenseAdvanceDays || 30),
        pharmacyNotes: dispenseNotes.trim(),
      });
      setDispenseSuccessMessage(`Medicine ${selectedOrderForDispense.medicationName} marked as provided and added to patient database!`);
      await fetchOrders();
      await fetchPrescriptions();
      setTimeout(() => {
        setSelectedOrderForDispense(null);
        setDispenseSuccessMessage('');
      }, 1400);
    } catch (err) {
      setDispenseError(err.message || 'Failed to dispense medication.');
    } finally {
      setDispensingOrder(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchInventory();
  }, [orderStatusFilter]);

  useEffect(() => {
    if (activeSubTab === 'orders') {
      fetchOrders();
    } else if (activeSubTab === 'inventory') {
      fetchInventory();
    } else if (activeSubTab === 'prescriptions') {
      fetchPrescriptions();
    } else if (activeSubTab === 'refills') {
      fetchRefills();
    }
  }, [activeSubTab, statusFilter, refillStatusFilter, inventoryCategory]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPrescriptions();
  };

  // Run Safety Scan
  const handleRunSafetyScan = async (patientId, patientName) => {
    setSelectedPatientForSafety({ id: patientId, name: patientName });
    setScanningSafety(true);
    setSafetyReport(null);
    try {
      const report = await pharmacistApi.checkSafety(patientId);
      setSafetyReport(report);
    } catch (err) {
      alert(err.message || 'Safety screening failed.');
    } finally {
      setScanningSafety(false);
    }
  };

  // Update Medication Dispense Status
  const handleUpdateDispenseStatus = async (medId, newStatus) => {
    try {
      await pharmacistApi.updateDispenseStatus(medId, newStatus);
      fetchPrescriptions();
    } catch (err) {
      alert(err.message || 'Failed to update dispense status.');
    }
  };

  // Open Notify Modal
  const openNotifyModal = (patientId, patientName, medName) => {
    setNotifyTarget({ patientId, patientName, medName });
    setNotifySubject(`Medication Ready for Pickup: ${medName}`);
    setNotifyMessage(
      `Hello ${patientName},\n\nYour prescription for ${medName} has been verified and is ready for pickup at the pharmacy counter. Please present your MedSafe mobile confirmation when collecting.`
    );
    setNotificationSuccess('');
    setNotifyModalOpen(true);
  };

  // Send Notification
  const handleSendNotification = async (e) => {
    e.preventDefault();
    setSendingNotification(true);
    try {
      await pharmacistApi.notify({
        patientId: notifyTarget.patientId,
        subject: notifySubject,
        message: notifyMessage,
      });
      setNotificationSuccess('Notification successfully dispatched to patient and care team!');
      setTimeout(() => {
        setNotifyModalOpen(false);
      }, 1800);
    } catch (err) {
      alert(err.message || 'Failed to dispatch notification.');
    } finally {
      setSendingNotification(false);
    }
  };

  // Confirm / Update Refill
  const handleProcessRefillSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRefill) return;
    setProcessingRefill(true);
    try {
      await pharmacistApi.updateRefill(selectedRefill._id, {
        status: refillActionStatus,
        pharmacistNotes,
        advanceDays: Number(advanceDays),
      });

      // Also trigger notification if ready for pickup
      if (refillActionStatus === 'ready_for_pickup') {
        await pharmacistApi.notify({
          patientId: selectedRefill.patientId._id,
          subject: `Refill Ready: ${selectedRefill.medicationId?.name}`,
          message: `Your refill request for ${selectedRefill.medicationId?.name} has been processed and is ready for pickup. Dispensed for ${advanceDays} days.`,
        });
      }

      setSelectedRefill(null);
      setPharmacistNotes('');
      fetchRefills();
    } catch (err) {
      alert(err.message || 'Failed to process refill.');
    } finally {
      setProcessingRefill(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-700 via-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-teal-500/30 text-teal-200 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-teal-400/30">
              Pharmacy & Dispensing Suite
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight">
            Clinical Pharmacist Portal
          </h1>
          <p className="text-teal-100 text-xs sm:text-sm mt-1 max-w-2xl">
            Prescription verification, automated conflict & duplicate screening, safe dispensing, and refill management.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setActiveSubTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'orders'
                ? 'bg-white text-teal-900 shadow'
                : 'bg-teal-800/60 text-white hover:bg-teal-800'
            }`}
          >
            <span> Doctor Rx Orders</span>
            {orders.filter((o) => o.status === 'sent_to_pharmacy').length > 0 && (
              <span className="bg-amber-400 text-teal-950 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                {orders.filter((o) => o.status === 'sent_to_pharmacy').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'inventory'
                ? 'bg-white text-teal-900 shadow'
                : 'bg-teal-800/60 text-white hover:bg-teal-800'
            }`}
          >
            <span>Pharmacy Inventory ({inventory.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('prescriptions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'prescriptions'
                ? 'bg-white text-teal-900 shadow'
                : 'bg-teal-800/60 text-white hover:bg-teal-800'
            }`}
          >
             Active Regimens ({prescriptions.length})
          </button>
          <button
            onClick={() => setActiveSubTab('refills')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all relative cursor-pointer ${
              activeSubTab === 'refills'
                ? 'bg-white text-teal-900 shadow'
                : 'bg-teal-800/60 text-white hover:bg-teal-800'
            }`}
          >
             Refill Queue
            {refills.filter((r) => r.status === 'pending').length > 0 && (
              <span className="ml-1.5 bg-amber-400 text-teal-950 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                {refills.filter((r) => r.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* SUB-TAB 0: DOCTOR PRESCRIPTION ORDERS (PHONE LOOKUP - NO OTP) */}
      {activeSubTab === 'orders' && (
        <div className="space-y-4">
          {/* Prominent Patient Phone / Order ID Lookup Bar */}
          <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 rounded-2xl border-2 border-teal-200 p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-teal-950">
                    Patient Prescription Pickup Lookup by Phone / Order ID
                  </span>
                  <span className="bg-teal-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                    Order ID = Phone Number
                  </span>
                </div>
                <p className="text-xs text-teal-800/80 mt-0.5">
                  When patient physically comes to the counter and quotes their phone number (Order ID), enter it below to pull up doctor-prescribed medications and dispense with automatic daily dose alerts.
                </p>
              </div>
              {phoneSearchQuery && (
                <button
                  onClick={() => {
                    setPhoneSearchQuery('');
                    fetchOrders('');
                  }}
                  className="text-xs text-teal-700 hover:text-teal-900 font-semibold underline cursor-pointer self-start sm:self-auto"
                >
                  Clear filter (Show all orders)
                </button>
              )}
            </div>

            <form onSubmit={handlePhoneSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={phoneSearchQuery}
                  onChange={(e) => setPhoneSearchQuery(e.target.value)}
                  placeholder="Enter Order ID or patient mobile phone (e.g. 6300157736)..."
                  className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-white border-2 border-teal-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono shadow-inner"
                />
                <span className="absolute left-3 top-2.5 text-teal-500 text-base"></span>
              </div>
              <button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Order by Phone
              </button>
            </form>
          </div>

          {/* Orders Filter Toolbar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-gray-700">Filter Queue:</span>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                {[
                  { value: '', label: 'All Orders' },
                  { value: 'sent_to_pharmacy', label: 'Pending Dispense' },
                  { value: 'dispensed', label: 'Dispensed' },
                ].map((btn) => (
                  <button
                    key={btn.value}
                    onClick={() => setOrderStatusFilter(btn.value)}
                    className={`text-xs px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      orderStatusFilter === btn.value
                        ? 'bg-white text-teal-800 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-gray-500">
              Showing <strong>{orders.length}</strong> prescription orders
            </span>
          </div>

          {/* Orders List */}
          {loadingOrders ? (
            <div className="p-12 text-center text-gray-500 text-xs">
              Loading doctor prescription orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-gray-200 text-center text-gray-500 text-xs space-y-2">
              <p className="font-semibold text-gray-700 text-sm">No prescription orders found matching query.</p>
              <p className="text-gray-400">
                Use the mobile phone search above to look up orders for a specific patient without needing OTP.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const isPending = order.status === 'sent_to_pharmacy';
                return (
                  <div
                    key={order._id}
                    className={`bg-white rounded-xl border p-5 shadow-xs transition-all space-y-3 ${
                      isPending ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200'
                    }`}
                  >
                    {/* Top Row: Med Name, Power, Frequency, Status Badge */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-extrabold text-gray-900">{order.medicationName}</span>
                        {order.power && (
                          <span className="bg-emerald-50 text-emerald-800 border-2 border-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-lg">
                            Power: {order.power}
                          </span>
                        )}
                        <span className="bg-blue-50 text-blue-900 border border-blue-200 text-[11px] font-bold px-2 py-0.5 rounded font-mono">
                          Order ID: {order.orderId || order.patientPhone}
                        </span>
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono capitalize">
                          {order.frequency?.replace(/_/g, ' ')}
                        </span>
                        {order.priority && order.priority !== 'routine' && (
                          <span className="text-[10px] font-black uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200">
                            {order.priority}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                            order.status === 'dispensed'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              order.status === 'dispensed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                            }`}
                          ></span>
                          {order.status === 'dispensed'
                            ? 'Medicine Provided & Dispensed'
                            : 'Ready for Dispensing'}
                        </span>
                      </div>
                    </div>

                    {/* Patient & Doctor Meta */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50/70 p-2.5 rounded-lg border border-gray-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-700">Patient Details:</span>
                          {order.patientId?.bloodGroup && (
                            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.2 rounded border border-red-200">
                              Blood: {order.patientId.bloodGroup}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-900">
                          {order.patientName || order.patientId?.name || 'Patient'}
                        </p>
                        <p className="text-gray-500 font-mono">Mobile: {order.patientPhone}</p>
                      </div>

                      <div className="bg-gray-50/70 p-2.5 rounded-lg border border-gray-100 space-y-1">
                        <span className="font-bold text-gray-700">Prescribing Physician:</span>
                        <p className="font-semibold text-gray-900">{order.doctorName || 'Doctor'}</p>
                        <p className="text-gray-500">
                          Routed on {new Date(order.createdAt).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Regimen Schedule & Clinical Directions */}
                    <div className="bg-teal-50/40 p-3 rounded-lg border border-teal-100 text-xs space-y-1.5">
                      <div className="flex flex-wrap items-center gap-4 text-gray-700">
                        <span>
                          Administration Times: <strong className="font-mono text-gray-900">{(order.suggestedTimes || []).join(', ')}</strong>
                        </span>
                        {order.duration && (
                          <span>Course Duration: <strong className="text-gray-900">{order.duration}</strong></span>
                        )}
                      </div>
                      {order.instructions && (
                        <p className="text-gray-700 italic">
                          <strong className="text-gray-900 not-italic">Clinical Directions:</strong> "{order.instructions}"
                        </p>
                      )}
                      {order.pharmacyNotes && (
                        <p className="text-emerald-900 font-medium">
                          <strong>Pharmacy Note:</strong> {order.pharmacyNotes}
                        </p>
                      )}

                      {/* Total units to dispense — auto-calculated from prescription */}
                      {order.totalUnits && (
                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-300 rounded-lg px-3 py-2 mt-1">
                          <span className="text-base"></span>
                          <div>
                            <p className="text-xs font-extrabold text-indigo-900">
                              Dispense: {order.totalUnits} {order.dosage?.toLowerCase().includes('ml') ? 'ml' : 'tablet(s)'} total
                            </p>
                            <p className="text-[10px] text-indigo-700">
                              {(order.suggestedTimes || []).length} dose(s)/day × {order.durationDays || '?'} day(s) = {order.totalUnits} units required
                            </p>
                          </div>
                        </div>
                      )}
                    </div>


                    {/* Dispensing Action Footer */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-gray-100">
                      <div>
                        {order.status === 'dispensed' && (
                          <span className="text-xs text-emerald-800 font-medium">
                            Medicine provided by {order.pharmacistName || 'Pharmacist'} on {new Date(order.dispensedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {isPending && (
                        <button
                          type="button"
                          onClick={() => openDispenseModal(order)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          Provide Medicine & Dispense to Patient DB
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: PHARMACY INVENTORY (AMAZON SELLER STYLE - NO PRICES) */}
      {activeSubTab === 'inventory' && (
        <div className="space-y-4">
          {/* Inventory Controls Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-gray-900">
                    Dispensary Medicine Catalog & Stock
                  </span>
                  <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-teal-200">
                    Seller Inventory • Zero Pricing
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage available pharmaceutical stock for doctors to search and allot directly into patient prescription carts.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProductErrorMsg('');
                  setProductSuccessMsg('');
                  setShowAddProductModal(true);
                }}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <span>+ Add Medicine to Catalog</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3 pt-2 border-t border-gray-100">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fetchInventory();
                  }}
                  placeholder="Search catalog by medicine name, generic name, power, or brand..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <button
                type="button"
                onClick={fetchInventory}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                Filter Catalog
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1">
                {['', 'Tablet', 'Capsule', 'Syrup', 'Injection', 'Other'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setInventoryCategory(cat)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      inventoryCategory === cat
                        ? 'bg-teal-100 text-teal-900 border border-teal-300 font-bold'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat || 'All Forms'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Product Grid */}
          {loadingInventory ? (
            <div className="p-12 text-center text-gray-500 text-xs">
              Loading pharmacy product catalog...
            </div>
          ) : inventory.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-gray-200 text-center text-gray-500 text-xs space-y-2">
              <p className="font-semibold text-gray-700 text-sm">No medicines found in catalog matching query.</p>
              <p className="text-gray-400">
                Click "+ Add Medicine to Catalog" to list products for doctors to prescribe.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inventory.map((item) => (
                <div
                  key={item._id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs hover:border-teal-300 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-gray-900 text-base leading-tight">
                          {item.name}
                        </h4>
                        {item.genericName && (
                          <p className="text-[11px] text-gray-500 italic mt-0.5">
                            {item.genericName}
                          </p>
                        )}
                      </div>
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-black px-2 py-0.5 rounded-lg">
                        {item.power}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[11px] font-medium">
                        {item.category}
                      </span>
                      {item.manufacturer && (
                        <span className="text-gray-500 text-[11px]">
                          by <strong>{item.manufacturer}</strong>
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          item.inStock && item.quantity > 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        }`}
                      >
                        {item.inStock && item.quantity > 0
                          ? `● In Stock (${item.quantity} units)`
                          : '&times; Out of Stock'}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-xs text-gray-600 line-clamp-2 bg-gray-50/70 p-2 rounded border border-gray-100">
                        {item.description}
                      </p>
                    )}

                    {item.sideEffects && (
                      <p className="text-[11px] text-amber-800 bg-amber-50/60 p-1.5 rounded border border-amber-200/50">
                         {item.sideEffects}
                      </p>
                    )}
                  </div>

                  {/* Quick Action Footer */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-500 font-semibold">Stock:</span>
                      <button
                        type="button"
                        onClick={() => handleQuickAdjustQty(item, -10)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs flex items-center justify-center cursor-pointer"
                        title="Reduce stock by 10"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-gray-800 px-1 text-xs">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickAdjustQty(item, 10)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs flex items-center justify-center cursor-pointer"
                        title="Add 10 to stock"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleStock(item)}
                        className={`text-[11px] font-bold px-2 py-1 rounded transition-colors cursor-pointer ${
                          item.inStock
                            ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        {item.inStock ? 'Set OOS' : 'Set Available'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(item)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                        title="Delete product from catalog"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 1: PRESCRIPTIONS & DISPENSING */}
      {activeSubTab === 'prescriptions' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-xs">
            <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by patient name, mobile phone, medication, or prescriber..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Search
              </button>
            </form>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Filter Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">All Statuses</option>
                <option value="pending_dispense">Pending Dispense</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                <option value="dispensed">Dispensed</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>

          {/* Prescriptions List */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              Loading active prescriptions...
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-gray-200 text-center text-gray-500 text-sm">
              No prescriptions found matching query.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {prescriptions.map((med) => {
                const patient = med.userId;
                return (
                  <div
                    key={med._id}
                    className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs hover:border-teal-300 transition-all flex flex-col md:flex-row justify-between gap-4"
                  >
                    {/* Left: Medication & Patient Info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-base font-bold text-gray-900">{med.name}</span>
                        <span className="bg-teal-50 text-teal-800 text-xs font-extrabold px-2 py-0.5 rounded border border-teal-200">
                          {med.dosage || 'Standard'}
                        </span>
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono">
                          {med.frequency ? med.frequency.replace(/_/g, ' ') : 'Once Daily'}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                            med.dispenseStatus === 'ready_for_pickup'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : med.dispenseStatus === 'dispensed'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : med.dispenseStatus === 'out_of_stock'
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {med.dispenseStatus ? med.dispenseStatus.replace(/_/g, ' ') : 'Dispensed'}
                        </span>
                      </div>

                      {/* Patient & Prescriber Badge */}
                      <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div>
                          <span className="text-gray-400">Patient:</span>{' '}
                          <strong className="text-gray-800">{patient?.name || 'Unknown Patient'}</strong>
                          {patient?.phone && (
                            <span className="font-mono text-gray-500 ml-1">({patient.phone})</span>
                          )}
                        </div>
                        <div>
                          <span className="text-gray-400">Prescriber:</span>{' '}
                          <span className="text-gray-700 font-medium">{med.prescribedBy || 'Prescribing Doctor'}</span>
                        </div>
                        {patient?.bloodGroup && (
                          <div className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold text-[11px]">
                            Blood: {patient.bloodGroup}
                          </div>
                        )}
                      </div>

                      {/* Schedule & Clinical Instructions */}
                      <div className="bg-gray-50 rounded-lg p-2.5 text-xs space-y-1 border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-700">
                          <span className="font-semibold text-gray-500">Administration Times:</span>
                          <span className="font-mono">{med.times && med.times.length > 0 ? med.times.join(', ') : 'As scheduled'}</span>
                        </div>
                        {med.instructions && (
                          <div className="text-gray-600 whitespace-pre-line">
                            <span className="font-semibold text-gray-500">Directions / Notes:</span> {med.instructions}
                          </div>
                        )}
                        {med.sideEffects && (
                          <div className="text-amber-800 bg-amber-50/70 p-1.5 rounded text-[11px] font-medium border border-amber-200/50">
                             Reported Side Effect Indications: {med.sideEffects}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions & Dispensing Controls */}
                    <div className="flex flex-col sm:flex-row md:flex-col justify-between items-start md:items-end gap-3 min-w-[200px]">
                      {/* Dispense Status Selector */}
                      <div className="w-full">
                        <label className="text-[11px] text-gray-500 font-semibold block mb-1">
                          Update Status:
                        </label>
                        <select
                          value={med.dispenseStatus || 'dispensed'}
                          onChange={(e) => handleUpdateDispenseStatus(med._id, e.target.value)}
                          className="w-full text-xs font-semibold border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                        >
                          <option value="pending_dispense">Pending Dispense</option>
                          <option value="ready_for_pickup">Ready for Pickup</option>
                          <option value="dispensed">Dispensed</option>
                          <option value="out_of_stock">Out of Stock</option>
                        </select>
                      </div>

                      {/* Safety Scan & Notification Buttons */}
                      <div className="flex items-center gap-2 w-full">
                        {patient && (
                          <button
                            type="button"
                            onClick={() => handleRunSafetyScan(patient._id, patient.name)}
                            className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                            title="Check for drug interactions and duplicate therapies"
                          >
                            <span> Safety Check</span>
                          </button>
                        )}
                        {patient && (
                          <button
                            type="button"
                            onClick={() => openNotifyModal(patient._id, patient.name, med.name)}
                            className="flex-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-bold py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                            title="Send pickup or refill notification to patient"
                          >
                            <span> Notify</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: REFILL QUEUE */}
      {activeSubTab === 'refills' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-xs">
            <div>
              <h3 className="font-bold text-gray-800 text-sm">Prescription Refill Requests</h3>
              <p className="text-xs text-gray-500">Review patient and caregiver requests for medication replenishment</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium">Status:</label>
              <select
                value={refillStatusFilter}
                onChange={(e) => setRefillStatusFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">All Refills</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                <option value="dispensed">Dispensed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {refills.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-gray-200 text-center text-gray-500 text-sm">
              No refill requests currently {refillStatusFilter ? `in "${refillStatusFilter}" status` : ''}.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {refills.map((refill) => (
                <div
                  key={refill._id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col md:flex-row justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold text-gray-900">
                        {refill.medicationId?.name || 'Prescription Refill'}
                      </span>
                      <span className="bg-teal-50 text-teal-800 text-xs font-extrabold px-2 py-0.5 rounded border border-teal-200">
                        {refill.medicationId?.dosage || ''}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                          refill.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : refill.status === 'ready_for_pickup'
                            ? 'bg-blue-100 text-blue-800'
                            : refill.status === 'dispensed' || refill.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {refill.status}
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                      <div>
                        <span className="text-gray-400">Patient:</span>{' '}
                        <strong>{refill.patientId?.name || 'Unknown'}</strong>{' '}
                        <span className="font-mono text-gray-500">({refill.patientId?.phone})</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Requested:</span>{' '}
                        <span>{new Date(refill.requestedAt).toLocaleString()}</span>
                      </div>
                      {refill.pharmacy && (
                        <div>
                          <span className="text-gray-400">Preferred Pharmacy:</span>{' '}
                          <span className="font-medium text-teal-800">{refill.pharmacy}</span>
                        </div>
                      )}
                    </div>

                    {refill.notes && (
                      <div className="bg-gray-50 p-2.5 rounded text-xs text-gray-700 border border-gray-100">
                        <span className="font-semibold text-gray-500">Patient Request Note:</span> {refill.notes}
                      </div>
                    )}

                    {refill.pharmacistNotes && (
                      <div className="bg-teal-50/60 p-2.5 rounded text-xs text-teal-900 border border-teal-100">
                        <span className="font-semibold text-teal-700">Pharmacist Verification Note:</span> {refill.pharmacistNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center items-end gap-2">
                    <button
                      onClick={() => {
                        setSelectedRefill(refill);
                        setRefillActionStatus(refill.status === 'pending' ? 'ready_for_pickup' : refill.status);
                        setPharmacistNotes(refill.pharmacistNotes || '');
                      }}
                      className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-xs"
                    >
                      Process / Confirm Refill
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SAFETY SCAN MODAL */}
      {selectedPatientForSafety && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                  <span> Clinical Safety & Duplicate Check</span>
                </h3>
                <p className="text-xs text-gray-500">
                  Patient: <strong className="text-gray-800">{selectedPatientForSafety.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedPatientForSafety(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
              >
                &times;
              </button>
            </div>

            {scanningSafety ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Running drug interaction matrix and duplicate therapy screening...
              </div>
            ) : safetyReport ? (
              <div className="space-y-4">
                {/* Safe Status Badge */}
                {safetyReport.isSafe ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3">
                    <span className="text-2xl"></span>
                    <div>
                      <h4 className="font-bold text-sm">No Conflicts or Duplicate Therapies Detected</h4>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Active prescriptions ({safetyReport.activeMedCount}) were screened against clinical adverse interaction rules and therapeutic classes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 flex items-center gap-3">
                    <span className="text-2xl"></span>
                    <div>
                      <h4 className="font-bold text-sm">Clinical Safety Flags Identified</h4>
                      <p className="text-xs text-red-700 mt-0.5">
                        Found {safetyReport.conflictCount} interaction warning(s) and {safetyReport.duplicateCount} duplicate therapy flag(s).
                      </p>
                    </div>
                  </div>
                )}

                {/* Drug-Drug Conflicts */}
                {safetyReport.conflicts && safetyReport.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-red-700">
                      Adverse Drug Interactions
                    </h5>
                    {safetyReport.conflicts.map((c, idx) => (
                      <div key={idx} className="p-3 bg-red-50/60 border border-red-200 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-red-200 text-red-900 text-[10px] font-black px-1.5 py-0.5 rounded uppercase">
                            {c.severity} Risk
                          </span>
                          <span className="font-bold text-gray-800">
                            {c.affectedMeds ? c.affectedMeds.join(' + ') : c.drugs.join(' + ')}
                          </span>
                        </div>
                        <p className="text-red-900">{c.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Duplicate Therapies */}
                {safetyReport.duplicates && safetyReport.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      Duplicate Active Therapies
                    </h5>
                    {safetyReport.duplicates.map((d, idx) => (
                      <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-200 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded uppercase">
                            {d.therapeuticClass}
                          </span>
                        </div>
                        <p className="text-amber-900 font-medium">{d.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="pt-2 border-t flex justify-end">
              <button
                onClick={() => setSelectedPatientForSafety(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2 rounded-lg"
              >
                Close Safety Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFILL PROCESSING MODAL */}
      {selectedRefill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleProcessRefillSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Confirm & Dispense Refill</h3>
              <button
                type="button"
                onClick={() => setSelectedRefill(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg">
              <p>
                <strong>Medication:</strong> {selectedRefill.medicationId?.name} ({selectedRefill.medicationId?.dosage})
              </p>
              <p>
                <strong>Patient:</strong> {selectedRefill.patientId?.name}
              </p>
              {selectedRefill.notes && (
                <p>
                  <strong>Patient Request Note:</strong> {selectedRefill.notes}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Update Status *</label>
              <select
                value={refillActionStatus}
                onChange={(e) => setRefillActionStatus(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-teal-500"
              >
                <option value="approved">Approved (Queue for Packaging)</option>
                <option value="ready_for_pickup">Ready for Pickup (Dispatches Notification)</option>
                <option value="dispensed">Dispensed & Handed Over</option>
                <option value="rejected">Rejected / Requires Doctor Follow-up</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Refill Quantity / Days Extension
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={advanceDays}
                onChange={(e) => setAdvanceDays(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-[11px] text-gray-400">Advances next refill target date by {advanceDays} days.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Pharmacist Verification Note</label>
              <textarea
                rows="2"
                value={pharmacistNotes}
                onChange={(e) => setPharmacistNotes(e.target.value)}
                placeholder="Enter pharmacist verification notes..."
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setSelectedRefill(null)}
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingRefill}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {processingRefill ? 'Updating...' : 'Save & Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NOTIFY CARE TEAM MODAL */}
      {notifyModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendNotification}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Send Pharmacy Notification</h3>
              <button
                type="button"
                onClick={() => setNotifyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {notificationSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                {notificationSuccess}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={notifySubject}
                    onChange={(e) => setNotifySubject(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Message Body</label>
                  <textarea
                    rows="4"
                    value={notifyMessage}
                    onChange={(e) => setNotifyMessage(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-teal-500 font-sans"
                    required
                  />
                  <span className="text-[11px] text-gray-400">
                    Dispatched securely to patient and authorized care team.
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setNotifyModalOpen(false)}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingNotification}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    {sendingNotification ? 'Sending...' : 'Dispatch Alert'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
      {/* MODAL: Provide & Dispense Medicine directly to Patient Database */}
      {selectedOrderForDispense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-50/50">
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                  Pharmacy Dispensing Suite
                </span>
                <h3 className="text-base font-extrabold text-gray-900 mt-1">
                  Provide Medicine & Dispense to Patient DB
                </h3>
                <p className="text-xs text-gray-500">
                  Patient: {selectedOrderForDispense.patientName} ({selectedOrderForDispense.patientPhone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForDispense(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {dispenseError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {dispenseError}
              </div>
            )}

            {dispenseSuccessMessage && (
              <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg text-center">
                {dispenseSuccessMessage}
              </div>
            )}

            <form onSubmit={handleConfirmDispenseSubmit} className="p-6 space-y-4 text-xs">
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950">
                    {selectedOrderForDispense.medicationName}
                  </span>
                  <span className="font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                    Prescribed Power: {selectedOrderForDispense.power || selectedOrderForDispense.dosage}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Prescribing Physician: <strong>{selectedOrderForDispense.doctorName}</strong>
                </p>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Dispensed Power / Dosage *
                </label>
                <input
                  type="text"
                  required
                  value={dispensePower}
                  onChange={(e) => setDispensePower(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Intake Frequency</label>
                  <select
                    value={dispenseFrequency}
                    onChange={(e) => setDispenseFrequency(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="once_daily">Once Daily</option>
                    <option value="twice_daily">Twice Daily</option>
                    <option value="thrice_daily">Thrice Daily</option>
                    <option value="four_times_daily">Four Times Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="as_needed">As Needed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Supply Days</label>
                  <input
                    type="number"
                    min="1"
                    value={dispenseAdvanceDays}
                    onChange={(e) => setDispenseAdvanceDays(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Scheduled Intake Times (Added directly to patient daily schedule)
                </label>
                <div className="flex flex-wrap gap-2">
                  {dispenseTimes.map((t, idx) => (
                    <input
                      key={idx}
                      type="time"
                      value={t}
                      onChange={(e) => {
                        const updated = [...dispenseTimes];
                        updated[idx] = e.target.value;
                        setDispenseTimes(updated);
                      }}
                      className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500"
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setDispenseTimes([...dispenseTimes, '12:00'])}
                    className="text-xs text-emerald-700 border border-emerald-300 px-2 py-1 rounded hover:bg-emerald-50 font-bold cursor-pointer"
                  >
                    + Add Time
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Pharmacist Dispensing Notes (Batch / Packaging instructions)
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter packaging, batch, or dispensing notes..."
                  value={dispenseNotes}
                  onChange={(e) => setDispenseNotes(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDispense(null)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispensingOrder || !dispensePower.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {dispensingOrder ? 'Dispensing to Patient DB...' : 'Confirm Dispense & Activate in Patient DB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Product to Pharmacy Catalog (Amazon Seller Style - NO PRICE) */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-teal-50/70">
              <div>
                <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider bg-teal-100 px-2 py-0.5 rounded-full border border-teal-200">
                  Seller Catalog Management
                </span>
                <h3 className="text-base font-extrabold text-gray-900 mt-1">
                  List Medicine / Product in Catalog
                </h3>
                <p className="text-xs text-gray-500">
                  Make medicines available for doctors to search and allot into patient carts (no prices).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {productErrorMsg && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {productErrorMsg}
              </div>
            )}

            {productSuccessMsg && (
              <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg text-center">
                {productSuccessMsg}
              </div>
            )}

            <form onSubmit={handleAddProductSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Medicine / Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dolo 650, Paracetamol"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Generic / Active Chemical
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paracetamol IP"
                    value={productForm.genericName}
                    onChange={(e) => setProductForm({ ...productForm, genericName: e.target.value })}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Power / Strength *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 650mg, 500mg, 40mg"
                    value={productForm.power}
                    onChange={(e) => setProductForm({ ...productForm, power: e.target.value })}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Dosage Form</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Injection">Injection</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Drops">Drops</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Initial Stock Units</label>
                  <input
                    type="number"
                    min="0"
                    value={productForm.quantity}
                    onChange={(e) => setProductForm({ ...productForm, quantity: e.target.value })}
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Manufacturer / Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Micro Labs Ltd, GSK, Cipla"
                  value={productForm.manufacturer}
                  onChange={(e) => setProductForm({ ...productForm, manufacturer: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Clinical Description / Indications</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Analgesic and antipyretic for acute fever, headache, body pain."
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Side Effects / Cautions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Take with food; avoid exceeding daily liver limit."
                  value={productForm.sideEffects}
                  onChange={(e) => setProductForm({ ...productForm, sideEffects: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-4 py-2 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct || !productForm.name.trim() || !productForm.power.trim()}
                  className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {savingProduct ? 'Saving to Catalog...' : '+ List Medicine in Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
