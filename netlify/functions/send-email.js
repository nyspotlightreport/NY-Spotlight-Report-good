// netlify/functions/send-email.js
// Email relay — GitHub Actions agents call this to send email via Gmail SMTP
// Because Gmail blocks GitHub IPs but allows Netlify IPs
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const H = {'Access-Control-Allow-Origin':'https://nyspotlightreport.com','Content-Type':'application/json'};
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: '{"error":"POST only"}' };

  // Auth check — requires a shared secret
  const AUTH_KEY = process.env.PUSHOVER_API_KEY; // reuse as shared secret
  const authHeader = event.headers['x-auth-key'] || '';
  if (authHeader !== AUTH_KEY) return { statusCode: 401, headers: H, body: '{"error":"unauthorized"}' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: '{"error":"bad json"}' }; }

  const { to, subject, html, text } = body;
  if (!to || !subject) return { statusCode: 400, headers: H, body: '{"error":"to and subject required"}' };

  const SMTP_USER = process.env.GMAIL_USER || process.env.SMTP_USER || 'nyspotlightreport@gmail.com';
  const SMTP_PASS = process.env.GMAIL_APP_PASS;
  if (!SMTP_PASS) return { statusCode: 500, headers: H, body: '{"error":"SMTP not configured"}' };

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail', auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    await transporter.sendMail({
      from: `"NY Spotlight Report" <${SMTP_USER}>`,
      to, subject, html: html || undefined, text: text || subject
    });
    return { statusCode: 200, headers: H, body: JSON.stringify({ sent: true, to }) };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
