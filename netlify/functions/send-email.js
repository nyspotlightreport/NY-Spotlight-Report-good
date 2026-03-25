// netlify/functions/send-email.js
// Email relay — Uses Resend API (no Gmail ban risk)
// Resend free tier: 3,000 emails/month, built for transactional + marketing

exports.handler = async (event) => {
  const H = {'Access-Control-Allow-Origin':'https://nyspotlightreport.com','Content-Type':'application/json'};
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: '{"error":"POST only"}' };

  const AUTH_KEY = process.env.PUSHOVER_API_KEY;
  const authHeader = event.headers['x-auth-key'] || '';
  if (authHeader !== AUTH_KEY) return { statusCode: 401, headers: H, body: '{"error":"unauthorized"}' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: H, body: '{"error":"bad json"}' }; }

  const { to, subject, html, text } = body;
  if (!to || !subject) return { statusCode: 400, headers: H, body: '{"error":"to and subject required"}' };

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return { statusCode: 500, headers: H, body: '{"error":"RESEND_API_KEY not configured"}' };

  const FROM = process.env.RESEND_FROM || 'NY Spotlight Report <onboarding@resend.dev>';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: html || undefined, text: text || subject })
    });
    const data = await resp.json();
    if (resp.ok) return { statusCode: 200, headers: H, body: JSON.stringify({ sent: true, to, id: data.id }) };
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: data.message || 'Resend error' }) };
  } catch (err) {
    console.error('Resend send failed:', err.message);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
