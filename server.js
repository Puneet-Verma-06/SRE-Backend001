import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'GET'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend static files in production
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from backend/public/dist
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, 'dist');
  app.use(express.static(distPath));
  // Catch-all: serve index.html for all non-API routes (React Router support)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Email address
    pass: process.env.EMAIL_PASSWORD // App password from Google
  }
});

// Verify transporter connection
transporter.verify((error, success) => {
  if (error) {
    console.log('Email configuration error:', error);
  } else {
    console.log('✅ Email service is ready to send messages');
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const {
      salutation,
      firstName,
      lastName,
      email,
      company,
      companyAddress,
      jobTitle,
      phone,
      message,
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Required fields missing: firstName, lastName, email, phone, message',
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    const fullName = `${salutation ? salutation + ' ' : ''}${escapeHtml(firstName)} ${escapeHtml(lastName)}`;

    // Email to company (sregroupin@gmail.com)
    const mailOptions = {
      from: `"SRE Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVE_EMAIL,
      subject: `New Contact Enquiry from ${fullName}`,
      replyTo: email,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
          <h2 style="color:#1a1a2e;border-bottom:2px solid #d4af37;padding-bottom:8px;">New Contact Form Submission — SRE</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr><td style="padding:8px;font-weight:bold;color:#555;width:160px;">Name</td><td style="padding:8px;">${fullName}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#555;">Email</td><td style="padding:8px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555;">Phone</td><td style="padding:8px;">${escapeHtml(phone)}</td></tr>
            ${company ? `<tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#555;">Company</td><td style="padding:8px;">${escapeHtml(company)}</td></tr>` : ''}
            ${companyAddress ? `<tr><td style="padding:8px;font-weight:bold;color:#555;">Company Address</td><td style="padding:8px;">${escapeHtml(companyAddress)}</td></tr>` : ''}
            ${jobTitle ? `<tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#555;">Job Title</td><td style="padding:8px;">${escapeHtml(jobTitle)}</td></tr>` : ''}
          </table>
          <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-radius:6px;">
            <p style="font-weight:bold;color:#555;margin:0 0 8px;">Message:</p>
            <p style="margin:0;line-height:1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    // Confirmation email to the sender
    const userMailOptions = {
      from: `"SRE" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'We received your enquiry — SRE',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
          <h2 style="color:#1a1a2e;border-bottom:2px solid #d4af37;padding-bottom:8px;">Thank you for reaching out!</h2>
          <p>Dear ${escapeHtml(firstName)},</p>
          <p>We have received your enquiry and our team will get back to you as soon as possible.</p>
          <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-radius:6px;">
            <p style="font-weight:bold;color:#555;margin:0 0 8px;">Your message:</p>
            <p style="margin:0;line-height:1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          </div>
          <p style="margin-top:24px;">Best regards,<br><strong>SRE Team</strong></p>
        </div>
      `,
    };

    await transporter.sendMail(userMailOptions);

    res.status(200).json({ success: true, message: 'Email sent successfully' });

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Helper function to escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
