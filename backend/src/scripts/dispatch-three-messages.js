import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { dispatchMedicationSms, buildMedicationMessage } from '../services/smsReminderService.js';

const run = async () => {
  await connectDB();
  const phone = '+916300157736';
  const user = (await User.findOne({ phone })) || (await User.findOne());

  const medName = 'Dolo-650';
  const dosage = '650mg';
  const timeStr = '09:00';

  const types = ['1h_before', 'exact_time', '1h_after'];

  console.log(`\n======================================================`);
  console.log(` DISPATCHING ALL 3 MEDICATION SMS TO: ${phone}`);
  console.log(`======================================================\n`);

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const msg = buildMedicationMessage(type, { medName, dosage, timeStr });

    console.log(`[Message ${i + 1} (${type.toUpperCase()})]:`);
    console.log(`Body: "${msg}"`);

    const res = await dispatchMedicationSms({
      userId: user._id,
      phone,
      medicationName: medName,
      timeStr,
      type,
      customMessage: msg,
    });

    console.log(`Dispatch Status: ${res.status}`);
    if (res.twilioSid) console.log(`Twilio SID: ${res.twilioSid}`);
    if (res.error) console.log(`Gateway Response / Note: ${res.error}`);
    console.log('------------------------------------------------------\n');
  }

  process.exit(0);
};

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
