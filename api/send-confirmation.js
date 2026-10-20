const nodemailer = require('nodemailer');

// Create reusable transporter using SMTP (Gmail default)
function getTransporter() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error('SMTP credentials missing. Please set SMTP_USER and SMTP_PASS in .env');
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: user.trim(),
      pass: pass.trim().replace(/\s+/g, '') // remove any spaces in Google app passwords
    }
  });
}

module.exports = async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body safely
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { fullName, email, phone, branch } = body || {};

  if (!email || !fullName) {
    return res.status(400).json({ error: 'Missing required student details (fullName, email)' });
  }

  try {
    const transporter = getTransporter();
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const adminEmail = process.env.ADMIN_EMAIL || 'Officialunifiedtkd@gmail.com';

    const senderEmail = (process.env.SMTP_FROM || 'officialunifiedtkd@gmail.com').replace(/[<>]/g, '').trim();
    const fromSender = {
      name: 'UNIFIEDTKD Academy',
      address: senderEmail
    };

    // 1. Send confirmation email directly to the student
    const studentMail = await transporter.sendMail({
      from: fromSender,
      replyTo: `"UNIFIEDTKD Academy" <Officialunifiedtkd@gmail.com>`,
      to: email,
      subject: 'UNIFIEDTKD — Admission Application Received',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="border-bottom: 2px solid #ff3030; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #111; margin: 0; font-size: 24px; font-weight: 900;">UNIFIED<span style="color: #ff3030;">TKD</span></h2>
            <p style="color: #666; margin: 4px 0 0; font-size: 13px; letter-spacing: 1px;">DISCIPLINE • STRENGTH • RESPECT</p>
          </div>
          
          <p style="font-size: 16px; color: #1f2937;">Dear <strong>${escapeHtml(fullName)}</strong>,</p>
          
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">
            Your application is sent, thank you for applying and you will get a confirmation email.
          </p>
          
          <div style="background: #f9fafb; border-left: 4px solid #ff3030; padding: 14px 18px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0; font-size: 14px; color: #4b5563;"><strong>Selected Branch:</strong> ${escapeHtml(branch || 'Standard Branch')}</p>
            <p style="margin: 4px 0; font-size: 14px; color: #4b5563;"><strong>Contact Phone:</strong> ${escapeHtml(phone || '-')}</p>
            <p style="margin: 4px 0; font-size: 14px; color: #4b5563;"><strong>Application Status:</strong> <span style="color: #d97706; font-weight: bold;">Pending Review</span></p>
          </div>
          
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
            Our academy instructor will review your admission details. Once reviewed, you will be notified regarding batch timings and payment procedures.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            📍 Academy Address: Bhandup(W), Mumbai-400078<br>
            📞 Phone: 8010309474 | ✉️ Email: Officialunifiedtkd@gmail.com
          </p>
        </div>
      `,
      text: `Dear ${fullName},\n\nYour application is sent, thank you for applying and you will get a confirmation email.\n\nSelected Branch: ${branch || 'Standard Branch'}\nStatus: Pending Review\n\nUNIFIEDTKD Academy\nBhandup(W), Mumbai-400078 | Phone: 8010309474 | Email: Officialunifiedtkd@gmail.com`
    });

    console.log(`✅ SMTP confirmation email sent to: ${email} (MessageId: ${studentMail.messageId})`);

    // 2. Send alert notification to admin
    if (adminEmail && adminEmail.toLowerCase() !== email.toLowerCase()) {
      try {
        await transporter.sendMail({
          from: fromSender,
          to: adminEmail,
          subject: `🥋 New Admission Application: ${fullName}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 16px;">
              <h3 style="color: #ff3030;">New Student Admission Submitted</h3>
              <p><strong>Student Name:</strong> ${escapeHtml(fullName)}</p>
              <p><strong>Email:</strong> ${escapeHtml(email)}</p>
              <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
              <p><strong>Branch / Batch:</strong> ${escapeHtml(branch)}</p>
              <p>Sign in to your <a href="https://taekwondokanishka.web.app/admin.html">Admin Dashboard</a> to review and approve/reject.</p>
            </div>
          `,
          text: `New Student Admission Submitted\n\nStudent: ${fullName}\nEmail: ${email}\nPhone: ${phone}\nBranch: ${branch}\n\nReview at: https://taekwondokanishka.web.app/admin.html`
        });
      } catch (adminErr) {
        console.warn('Admin notification warning:', adminErr.message);
      }
    }

    return res.status(200).json({ success: true, messageId: studentMail.messageId });
  } catch (error) {
    console.error('❌ SMTP delivery error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to dispatch email via SMTP' });
  }
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
