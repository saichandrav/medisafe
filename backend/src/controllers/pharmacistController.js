import { Medication } from '../models/Medication.js';
import { User } from '../models/User.js';
import { RefillRequest } from '../models/RefillRequest.js';
import { Communication } from '../models/Communication.js';
import { PrescriptionOrder } from '../models/PrescriptionOrder.js';
import { PharmacyProduct } from '../models/PharmacyProduct.js';

// Standard Adverse Interaction Rules
const KNOWN_INTERACTIONS = [
  { drugs: ['aspirin', 'warfarin'], severity: 'high', message: 'Severe bleeding risk: Combining anticoagulant (Warfarin) and antiplatelet (Aspirin).' },
  { drugs: ['lisinopril', 'spironolactone'], severity: 'high', message: 'Hyperkalemia risk: ACE inhibitor combined with potassium-sparing diuretic can elevate potassium to dangerous levels.' },
  { drugs: ['ibuprofen', 'lisinopril'], severity: 'medium', message: 'Reduced efficacy & nephrotoxicity: NSAIDs blunt antihypertensive effect of ACE inhibitors.' },
  { drugs: ['metformin', 'furosemide'], severity: 'medium', message: 'Elevated blood concentration: Loop diuretics increase plasma levels of Metformin.' },
  { drugs: ['atorvastatin', 'clarithromycin'], severity: 'high', message: 'Myopathy/Rhabdomyolysis risk: Macrolide antibiotics markedly increase statin exposure.' },
  { drugs: ['ciprofloxacin', 'theophylline'], severity: 'high', message: 'Theophylline toxicity risk: Fluoroquinolones inhibit theophylline metabolism.' },
];

// Common Therapeutic Drug Classes for Duplicate Therapy Detection
const DRUG_CLASSES = {
  nsaids: ['ibuprofen', 'naproxen', 'diclofenac', 'meloxicam', 'celecoxib'],
  statins: ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin'],
  ace_inhibitors: ['lisinopril', 'enalapril', 'ramipril', 'captopril'],
  arbs: ['losartan', 'valsartan', 'telmisartan', 'candesartan'],
  beta_blockers: ['metoprolol', 'atenolol', 'bisoprolol', 'propranolol'],
  ppi: ['omeprazole', 'pantoprazole', 'esomeprazole', 'rabeprazole'],
};

/**
 * 1. GET /api/pharmacist/prescriptions
 * View all active prescriptions with populated patient info, optionally filtered by patient or search query
 */
export const getPrescriptions = async (req, res) => {
  try {
    const { q, patientId, status } = req.query;
    const query = { isActive: true };

    if (patientId) {
      query.userId = patientId;
    }
    if (status) {
      query.dispenseStatus = status;
    }

    let medications = await Medication.find(query)
      .populate('userId', 'name phone email bloodGroup dateOfBirth gender emergencyContact')
      .sort({ createdAt: -1 });

    if (q && q.trim()) {
      const lower = q.toLowerCase().trim();
      medications = medications.filter(
        (m) =>
          m.name.toLowerCase().includes(lower) ||
          m.userId?.name?.toLowerCase().includes(lower) ||
          m.userId?.phone?.includes(lower) ||
          m.prescribedBy?.toLowerCase().includes(lower) ||
          m.pharmacy?.toLowerCase().includes(lower)
      );
    }

    return res.json({
      success: true,
      count: medications.length,
      prescriptions: medications,
    });
  } catch (err) {
    console.error('[getPrescriptions]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch prescriptions.' });
  }
};

/**
 * 2. GET /api/pharmacist/safety-check/:patientId
 * Performs automated clinical safety screening:
 * - Adverse drug-drug interactions
 * - Duplicate therapeutic class therapy
 */
export const checkSafetyForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await User.findById(patientId).select('name phone email bloodGroup dateOfBirth gender');
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const activeMeds = await Medication.find({ userId: patientId, isActive: true });
    const activeNames = activeMeds.map((m) => m.name.toLowerCase());

    // 1. Detect known drug-drug interactions
    const detectedConflicts = [];
    for (const rule of KNOWN_INTERACTIONS) {
      const matchedDrugs = rule.drugs.filter((d) => activeNames.some((n) => n.includes(d)));
      if (matchedDrugs.length >= 2) {
        detectedConflicts.push({
          drugs: rule.drugs,
          severity: rule.severity,
          message: rule.message,
          affectedMeds: activeMeds.filter((m) => rule.drugs.some((d) => m.name.toLowerCase().includes(d))).map((m) => m.name),
        });
      }
    }

    // 2. Detect duplicate therapy (same therapeutic class or duplicate active names)
    const detectedDuplicates = [];
    for (const [className, drugList] of Object.entries(DRUG_CLASSES)) {
      const matchesInClass = activeMeds.filter((m) => drugList.some((d) => m.name.toLowerCase().includes(d)));
      if (matchesInClass.length > 1) {
        detectedDuplicates.push({
          therapeuticClass: className.toUpperCase(),
          message: `Multiple active medications found in the same therapeutic class (${className.toUpperCase()}): ${matchesInClass.map((m) => m.name).join(', ')}. Increased risk of adverse cumulative toxicity.`,
          medications: matchesInClass.map((m) => ({ id: m._id, name: m.name, dosage: m.dosage })),
        });
      }
    }

    // Exact duplicate name check
    const nameCounts = {};
    activeMeds.forEach((m) => {
      const lower = m.name.toLowerCase().trim();
      nameCounts[lower] = (nameCounts[lower] || 0) + 1;
    });
    for (const [name, count] of Object.entries(nameCounts)) {
      if (count > 1) {
        detectedDuplicates.push({
          therapeuticClass: 'EXACT_DUPLICATE',
          message: `Patient has ${count} active prescriptions for "${name.toUpperCase()}". Verify with prescriber to avoid accidental double dosing.`,
          medications: activeMeds.filter((m) => m.name.toLowerCase().trim() === name).map((m) => ({ id: m._id, name: m.name, dosage: m.dosage })),
        });
      }
    }

    const isSafe = detectedConflicts.length === 0 && detectedDuplicates.length === 0;

    return res.json({
      success: true,
      patient,
      activeMedCount: activeMeds.length,
      medicationCount: activeMeds.length,
      isSafe,
      status: isSafe ? 'SAFE' : 'ATTENTION_REQUIRED',
      conflictCount: detectedConflicts.length,
      duplicateCount: detectedDuplicates.length,
      conflicts: detectedConflicts,
      duplicates: detectedDuplicates,
    });
  } catch (err) {
    console.error('[checkSafetyForPatient]', err);
    return res.status(500).json({ success: false, message: 'Failed to run clinical safety screening.' });
  }
};

/**
 * 3. GET /api/pharmacist/refills
 * Fetch list of refill requests (pending, ready, approved, etc.)
 */
export const getRefillRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) {
      query.status = status;
    }

    const requests = await RefillRequest.find(query)
      .populate('patientId', 'name phone email bloodGroup')
      .populate('medicationId', 'name dosage frequency times prescribedBy pharmacy refillDate dispenseStatus')
      .populate('pharmacistId', 'name phone')
      .sort({ requestedAt: -1 });

    return res.json({
      success: true,
      count: requests.length,
      refillRequests: requests,
      refills: requests,
    });
  } catch (err) {
    console.error('[getRefillRequests]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch refill requests.' });
  }
};

/**
 * 4. PATCH /api/pharmacist/refills/:id
 * Confirm, approve, dispense, or reject a refill request
 */
export const updateRefillRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, pharmacistNotes, advanceDays = 30 } = req.body;

    if (!['pending', 'approved', 'ready_for_pickup', 'dispensed', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid refill status.' });
    }

    const request = await RefillRequest.findById(id).populate('medicationId');
    if (!request) {
      return res.status(404).json({ success: false, message: 'Refill request not found.' });
    }

    request.status = status;
    request.pharmacistId = req.user._id;
    request.processedAt = new Date();
    if (pharmacistNotes !== undefined) {
      request.pharmacistNotes = pharmacistNotes;
    }
    await request.save();

    // If approved or dispensed, advance medication refill date and update dispenseStatus
    if (request.medicationId && (status === 'approved' || status === 'ready_for_pickup' || status === 'dispensed')) {
      const med = await Medication.findById(request.medicationId._id);
      if (med) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + Number(advanceDays || 30));
        med.refillDate = nextDate;
        med.lastDispensedAt = new Date();
        med.dispenseStatus = status === 'ready_for_pickup' ? 'ready_for_pickup' : 'dispensed';
        await med.save();
      }
    }

    return res.json({
      success: true,
      message: `Refill request updated to "${status}".`,
      refillRequest: request,
    });
  } catch (err) {
    console.error('[updateRefillRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to update refill request.' });
  }
};

/**
 * 5. PATCH /api/pharmacist/medications/:id/dispense-status
 * Update medication dispensing status
 */
export const updateMedicationDispenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { dispenseStatus } = req.body;

    if (!['pending_dispense', 'ready_for_pickup', 'dispensed', 'out_of_stock'].includes(dispenseStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid dispensing status.' });
    }

    const med = await Medication.findById(id);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medication not found.' });
    }

    med.dispenseStatus = dispenseStatus;
    if (dispenseStatus === 'dispensed') {
      med.lastDispensedAt = new Date();
    }
    await med.save();

    return res.json({
      success: true,
      message: `Medication dispense status updated to ${dispenseStatus}.`,
      medication: med,
    });
  } catch (err) {
    console.error('[updateMedicationDispenseStatus]', err);
    return res.status(500).json({ success: false, message: 'Failed to update medication status.' });
  }
};

/**
 * 6. POST /api/pharmacist/notify
 * Send dispensing / pharmacy notification to patient and care team
 */
export const notifyPatientAndCareTeam = async (req, res) => {
  try {
    const { patientId, medicationId, subject, message } = req.body;

    if (!patientId || !message) {
      return res.status(400).json({ success: false, message: 'patientId and message are required.' });
    }

    const comm = await Communication.create({
      patientId,
      senderId: req.user._id,
      senderRole: 'pharmacist',
      recipientRole: 'all',
      category: 'refill_notification',
      subject: subject || 'Pharmacy Dispensing Notice',
      message,
    });

    return res.status(201).json({
      success: true,
      message: 'Notification dispatched to patient and care team.',
      communication: comm,
    });
  } catch (err) {
    console.error('[notifyPatientAndCareTeam]', err);
    return res.status(500).json({ success: false, message: 'Failed to dispatch pharmacy notice.' });
  }
};

/**
 * 7. GET /api/pharmacist/orders
 * Look up doctor prescription orders using Order ID or patient phone number
 * NO OTP REQUIRED for pharmacist lookup!
 */
export const searchOrdersByPhone = async (req, res) => {
  try {
    const { phone, orderId, q, status } = req.query;
    const query = {};

    if (orderId && orderId.trim()) {
      const cleanOrderId = orderId.trim();
      const digitsOnly = cleanOrderId.replace(/\D/g, '');
      query.$or = [
        { orderId: cleanOrderId },
        { patientPhone: new RegExp(digitsOnly.length >= 4 ? digitsOnly : cleanOrderId, 'i') },
      ];
    } else if (phone && phone.trim()) {
      const cleanPhone = phone.trim();
      const digitsOnly = cleanPhone.replace(/\D/g, '');
      query.$or = [
        { patientPhone: new RegExp(digitsOnly.length >= 4 ? digitsOnly : cleanPhone, 'i') },
        { orderId: cleanPhone },
      ];
    } else if (q && q.trim()) {
      const cleanQ = q.trim();
      const digits = cleanQ.replace(/\D/g, '');
      const regex = new RegExp(cleanQ, 'i');
      const conditions = [
        { orderId: regex },
        { patientName: regex },
        { medicationName: regex },
        { doctorName: regex },
        { patientPhone: regex },
      ];
      if (digits.length >= 4) {
        conditions.push({ patientPhone: new RegExp(digits, 'i') });
        conditions.push({ orderId: new RegExp(digits, 'i') });
      }
      query.$or = conditions;
    }

    if (status && status.trim()) {
      query.status = status.trim();
    }

    const orders = await PrescriptionOrder.find(query)
      .populate('patientId', 'name phone email bloodGroup dateOfBirth gender emergencyContact')
      .populate('doctorId', 'name phone email')
      .populate('productId')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (err) {
    console.error('[searchOrdersByPhone]', err);
    return res.status(500).json({ success: false, message: 'Failed to look up prescription orders.' });
  }
};

/**
 * 8. POST /api/pharmacist/orders/:orderId/dispense
 * Pharmacist marks medicine provided & dispenses it
 * Adds the medication directly into the patient's database with dosage, power, scheduled times, and instructions
 * Generates automated patient adherence alerts and decrements inventory
 */
export const dispensePrescriptionOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { dosage, power, times, frequency, advanceDays, pharmacyNotes, instructions } = req.body;

    const order = await PrescriptionOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Prescription order not found.' });
    }

    if (order.status === 'dispensed') {
      return res.status(400).json({ success: false, message: 'This prescription order has already been dispensed.' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This prescription order was cancelled.' });
    }

    const effectivePower = (power || dosage || order.power || order.dosage || '').trim();
    const effectiveDosage = (dosage || power || order.dosage || order.power || '').trim();
    const effectiveFrequency = frequency || order.frequency || 'once_daily';
    const effectiveTimes = Array.isArray(times) && times.length > 0 ? times : (order.suggestedTimes && order.suggestedTimes.length > 0 ? order.suggestedTimes : ['08:00']);
    const effectiveInstructions = instructions !== undefined ? instructions : (order.instructions || '');

    const daysCount = advanceDays !== undefined ? Number(advanceDays) : (order.durationDays || 30);
    const startDate = new Date();
    let endDate = null;
    let duration = order.duration || '';
    if (daysCount > 0) {
      endDate = new Date(startDate.getTime() + daysCount * 24 * 60 * 60 * 1000);
      if (!duration) duration = `${daysCount} days`;
    }

    const pharmacistName = req.user.name || 'Hospital Pharmacist';
    const pharmacyDisplay = `${pharmacistName} (MedSafe Dispensary)`;

    // Decrement stock in PharmacyProduct if available
    try {
      let product = null;
      if (order.productId) {
        product = await PharmacyProduct.findById(order.productId);
      }
      if (!product && order.medicationName) {
        product = await PharmacyProduct.findOne({
          name: new RegExp(`^${order.medicationName.trim()}$`, 'i'),
        });
      }
      if (product && product.quantity > 0) {
        product.quantity = Math.max(0, product.quantity - 1);
        if (product.quantity === 0) {
          product.inStock = false;
        }
        await product.save();
      }
    } catch (stockErr) {
      console.warn('[Pharmacy Stock Decrement Notice]:', stockErr.message);
    }

    // Add medication directly to patient's database
    const medication = await Medication.create({
      userId: order.patientId,
      name: order.medicationName.trim(),
      dosage: effectiveDosage,
      power: effectivePower,
      frequency: effectiveFrequency,
      times: effectiveTimes,
      prescribedBy: order.doctorName || 'Doctor Prescription',
      pharmacy: pharmacyDisplay,
      startDate,
      endDate,
      duration,
      durationDays: daysCount > 0 ? daysCount : null,
      instructions: effectiveInstructions,
      dispenseStatus: 'dispensed',
      isActive: true,
      lastDispensedAt: new Date(),
    });

    // Update prescription order record
    order.status = 'dispensed';
    order.pharmacistId = req.user._id;
    order.pharmacistName = pharmacistName;
    order.dispensedAt = new Date();
    if (pharmacyNotes) {
      order.pharmacyNotes = pharmacyNotes.trim();
    }
    await order.save();

    // Notify patient and care team with automated intake schedule alert
    try {
      await Communication.create({
        patientId: order.patientId,
        senderId: req.user._id,
        senderRole: 'pharmacist',
        recipientRole: 'all',
        category: 'dispense_confirmation',
        subject: `Medication Dispensed: ${order.medicationName}`,
        message: `Your prescription for ${order.medicationName}${effectivePower ? ` (${effectivePower})` : ''} has been dispensed by ${pharmacistName}. Daily dose alerts scheduled at [${effectiveTimes.join(', ')}] based on Dr. ${order.doctorName || 'Doctor'}'s prescription. ${effectiveInstructions ? `Directions: "${effectiveInstructions}"` : ''}`,
      });
    } catch (commErr) {
      console.warn('[Communication Notice Warning]:', commErr.message);
    }

    return res.json({
      success: true,
      message: `Medicine ${order.medicationName} (${effectivePower || 'standard'}) marked as provided and successfully added to patient database with active adherence alerts!`,
      order,
      medication,
    });
  } catch (err) {
    console.error('[dispensePrescriptionOrder]', err);
    return res.status(500).json({ success: false, message: 'Failed to dispense prescription order.' });
  }
};

/**
 * 9. GET /api/pharmacist/inventory
 * Fetch catalog products with search, category, and stock filters (NO PRICES)
 */
export const getInventory = async (req, res) => {
  try {
    const { q, category, inStock } = req.query;
    const query = {};

    if (inStock !== undefined && inStock !== '') {
      query.inStock = inStock === 'true';
    }

    if (category && category.trim()) {
      query.category = category.trim();
    }

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { name: regex },
        { genericName: regex },
        { power: regex },
        { manufacturer: regex },
        { description: regex },
      ];
    }

    const products = await PharmacyProduct.find(query).sort({ name: 1 });

    return res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (err) {
    console.error('[getInventory]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pharmacy inventory.' });
  }
};

/**
 * 10. POST /api/pharmacist/inventory
 * Pharmacist adds a new product to inventory (Amazon seller style, NO PRICE)
 */
export const addInventoryProduct = async (req, res) => {
  try {
    const { name, genericName, power, category, manufacturer, quantity, inStock, description, sideEffects } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Medicine name is required.' });
    }

    if (!power || !power.trim()) {
      return res.status(400).json({ success: false, message: 'Power / strength is required (e.g. 650mg, 500mg).' });
    }

    const pharmacistName = req.user.name || 'Hospital Dispensary';

    const product = await PharmacyProduct.create({
      name: name.trim(),
      genericName: (genericName || '').trim(),
      power: power.trim(),
      category: category || 'Tablet',
      manufacturer: (manufacturer || '').trim(),
      quantity: quantity !== undefined ? Math.max(0, Number(quantity)) : 100,
      inStock: inStock !== undefined ? Boolean(inStock) : true,
      description: (description || '').trim(),
      sideEffects: (sideEffects || '').trim(),
      pharmacistId: req.user._id,
      pharmacistName,
    });

    return res.status(201).json({
      success: true,
      message: `Medicine "${product.name}" (${product.power}) added to pharmacy catalog!`,
      product,
    });
  } catch (err) {
    console.error('[addInventoryProduct]', err);
    return res.status(500).json({ success: false, message: 'Failed to add product to pharmacy catalog.' });
  }
};

/**
 * 11. PATCH /api/pharmacist/inventory/:id
 * Pharmacist updates stock, quantity, or details of a product (NO PRICE)
 */
export const updateInventoryProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['name', 'genericName', 'power', 'category', 'manufacturer', 'quantity', 'inStock', 'description', 'sideEffects'];

    const product = await PharmacyProduct.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'quantity') {
          product.quantity = Math.max(0, Number(req.body.quantity));
          if (product.quantity === 0) product.inStock = false;
        } else {
          product[key] = req.body[key];
        }
      }
    }

    await product.save();

    return res.json({
      success: true,
      message: `Product "${product.name}" updated successfully!`,
      product,
    });
  } catch (err) {
    console.error('[updateInventoryProduct]', err);
    return res.status(500).json({ success: false, message: 'Failed to update pharmacy product.' });
  }
};

/**
 * 12. DELETE /api/pharmacist/inventory/:id
 * Pharmacist removes a product from inventory catalog
 */
export const deleteInventoryProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await PharmacyProduct.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({
      success: true,
      message: `Product "${product.name}" removed from pharmacy catalog.`,
    });
  } catch (err) {
    console.error('[deleteInventoryProduct]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete product from catalog.' });
  }
};


