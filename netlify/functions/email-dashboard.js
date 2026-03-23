// netlify/functions/email-dashboard.js
// Fixed: graceful fallback when SUPABASE_URL not yet set
exports.handler = async (event) => {
  const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  // Graceful fallback: return empty dashboard instead of 500
  if (!SUPA_URL || !SUPA_KEY) {
    return {
      statusCode: 200, headers: H,
      body: JSON.stringify({
        emails: [], stats: { total: 0, revenue: 0, urgent: 0, forwarded: 0, killed: 0 },
        status: 'env_not_configured'
      })
    };
  }

  try {
    const h = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };
    const r = await fetch(
      `${SUPA_URL}/rest/v1/email_inbox?order=processed_at.desc&limit=100&select=category,from_email,subject,ai_summary,forwarded,processed_at`,
      { headers: h }
    );
    const emails = await r.json().catch(() => []);

    const today = new Date(); today.setHours(0,0,0,0);
    const todayEmails = (emails || []).filter(e =>
      e.processed_at && new Date(e.processed_at) >= today
    );
    const stats = {
      total:     todayEmails.length,
      revenue:   todayEmails.filter(e => e.category === 'REVENUE').length,
      urgent:    todayEmails.filter(e => ['URGENT','LEGAL'].includes(e.category)).length,
      forwarded: todayEmails.filter(e => e.forwarded).length,
      killed:    todayEmails.filter(e => ['NEWSLETTER','AUTO','SPAM'].includes(e.category)).length,
    };
    return { statusCode: 200, headers: H, body: JSON.stringify({ emails: emails || [], stats }) };
  } catch(e) {
    return { statusCode: 200, headers: H,
      body: JSON.stringify({ emails: [], stats: { total:0, revenue:0, urgent:0, forwarded:0, killed:0 }, error: e.message }) };
  }
};
