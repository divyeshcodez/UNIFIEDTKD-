const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { Resend } = require('resend');

admin.initializeApp();
const db = admin.firestore();
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const EMAIL_FROM = defineSecret('EMAIL_FROM');
const ADMIN_EMAIL = defineSecret('ADMIN_EMAIL');

const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateApplication(input) {
  const application = {
    fullName: clean(input.fullName, 100),
    age: Number(input.age),
    heightCm: Number(input.heightCm),
    phone: clean(input.phone, 25),
    email: clean(input.email, 254).toLowerCase(),
    parentGuardianName: clean(input.parentGuardianName, 100),
    branchBatch: clean(input.branchBatch, 180),
    notes: clean(input.notes, 1500),
  };
  if (application.fullName.length < 2) throw new HttpsError('invalid-argument', 'Please enter your full name.');
  if (!Number.isInteger(application.age) || application.age < 4 || application.age > 100) throw new HttpsError('invalid-argument', 'Age must be between 4 and 100.');
  if (!Number.isFinite(application.heightCm) || application.heightCm < 50 || application.heightCm > 250) throw new HttpsError('invalid-argument', 'Please enter a valid height in centimetres.');
  if (application.phone.replace(/\D/g, '').length < 10) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!emailRegex.test(application.email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  if (!['Navjeevan Vidyamandir and Junior College (Mon/Wed/Fri)', 'Br. Nath Pai Vidyalaya (Tue/Thu/Sat)'].includes(application.branchBatch)) throw new HttpsError('invalid-argument', 'Please choose a valid branch and batch.');
  return application;
}

function mailClient() { return new Resend(RESEND_API_KEY.value()); }
async function sendEmail({ to, subject, html, text }) {
  if (!to || !emailRegex.test(to)) throw new Error('Invalid recipient email.');
  const result = await mailClient().emails.send({ from: EMAIL_FROM.value(), to, subject, html, text });
  if (result.error) throw new Error(result.error.message || 'Email provider rejected the message.');
  return result;
}

exports.submitApplication = onCall({ region: 'asia-south1', secrets: [RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL], cors: true, enforceAppCheck: false }, async (request) => {
  const application = validateApplication(request.data || {});
  // Basic per-IP throttle is not reliable for callable requests; enable App Check and/or add a durable rate-limit service before public launch.
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc = await db.collection('applications').add({
    ...application,
    status: 'Pending',
    submittedAt: now,
    updatedAt: now,
    emailStatus: 'queued',
  });
  try {
    await sendEmail({
      to: application.email,
      subject: 'UNIFIEDTKD — Application received',
      text: `Hi ${application.fullName},\n\nYour application is sent, thank you for applying and you will get a confirmation email.\n\nYour application status is Pending. Our team will contact you with the next steps.\n\nUNIFIEDTKD\nDISCIPLINE • STRENGTH • RESPECT`,
      html: `<p>Hi ${escapeHtml(application.fullName)},</p><p>Your application is sent, thank you for applying and you will get a confirmation email.</p><p>Your application status is <strong>Pending</strong>. Our team will contact you with the next steps.</p><p>UNIFIEDTKD<br>DISCIPLINE • STRENGTH • RESPECT</p>`,
    });
    await doc.update({ emailStatus: 'sent' });
  } catch (error) {
    logger.error('Application confirmation email failed', { applicationId: doc.id, error: String(error) });
    await doc.update({ emailStatus: 'failed' });
    // The application is still safely saved; don't make the student submit it twice.
  }
  try {
    await sendEmail({
      to: ADMIN_EMAIL.value(),
      subject: `UNIFIEDTKD — New application: ${application.fullName}`,
      text: `New admission application\nName: ${application.fullName}\nAge: ${application.age}\nPhone: ${application.phone}\nEmail: ${application.email}\nBranch/batch: ${application.branchBatch}\nApplication ID: ${doc.id}`,
      html: `<h2>New admission application</h2><p><b>Name:</b> ${escapeHtml(application.fullName)}<br><b>Age:</b> ${application.age}<br><b>Phone:</b> ${escapeHtml(application.phone)}<br><b>Email:</b> ${escapeHtml(application.email)}<br><b>Branch/batch:</b> ${escapeHtml(application.branchBatch)}<br><b>Application ID:</b> ${doc.id}</p>`,
    });
  } catch (error) { logger.error('Admin notification email failed', { applicationId: doc.id, error: String(error) }); }
  return { ok: true, applicationId: doc.id, status: 'Pending', message: 'Application submitted.' };
});

// Callable admin operation: Firebase Auth custom claim `admin: true` is required.
exports.setApplicationStatus = onCall({ region: 'asia-south1', secrets: [RESEND_API_KEY, EMAIL_FROM] }, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin access required.');
  const applicationId = clean(request.data?.applicationId, 150);
  const status = clean(request.data?.status, 20);
  if (!applicationId || !['Approved', 'Rejected', 'Pending'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid application ID or status.');
  const ref = db.collection('applications').doc(applicationId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Application not found.');
  const app = snap.data();
  if (app.status === status) return { ok: true, status };
  await ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp(), reviewedBy: request.auth.uid });
  if (status === 'Approved') {
    await sendEmail({
      to: app.email,
      subject: 'UNIFIEDTKD — Your application is approved',
      text: 'Your application is approved. You can join our academy by completing payments at your selected branch. Thank you 🙏🏻',
      html: '<p>Your application is approved. You can join our academy by completing payments at your selected branch. Thank you 🙏🏻</p><p>UNIFIEDTKD</p>',
    });
  } else if (status === 'Rejected') {
    await sendEmail({ to: app.email, subject: 'UNIFIEDTKD — Application update', text: 'Thank you for applying to UNIFIEDTKD. We are unable to approve your application at this time. Please contact the academy if you would like more information.', html: '<p>Thank you for applying to UNIFIEDTKD. We are unable to approve your application at this time. Please contact the academy if you would like more information.</p>' });
  }
  return { ok: true, status };
});

// Admin-only paginated listing. Never expose a public list endpoint.
exports.listApplications = onCall({ region: 'asia-south1' }, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin access required.');
  const limit = Math.min(Math.max(Number(request.data?.limit) || 25, 1), 100);
  let query = db.collection('applications').orderBy('submittedAt', 'desc').limit(limit);
  if (request.data?.status && ['Pending', 'Approved', 'Rejected'].includes(request.data.status)) query = query.where('status', '==', request.data.status);
  if (request.data?.startAfterId) {
    const cursor = await db.collection('applications').doc(clean(request.data.startAfterId, 150)).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snap = await query.get();
  return { applications: snap.docs.map(d => ({ id: d.id, ...d.data(), submittedAt: d.data().submittedAt?.toDate?.().toISOString() || null, updatedAt: d.data().updatedAt?.toDate?.().toISOString() || null })) };
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
