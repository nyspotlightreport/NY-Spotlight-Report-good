// netlify/functions/rep-portal-auth.js
// Server-side authentication for rep portal — DB credentials never exposed to frontend

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: '{}' }; }

  const { access_code } = body;
  if (!access_code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'access_code required' }) };

  try {
    // Look up access code (server-side — credentials never leave server)
    const r = await fetch(`${SUPA_URL}/rest/v1/rep_portal_access?access_code=eq.${access_code}&select=rep_id`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const accessData = await r.json();
    if (!accessData?.[0]) return { statusCode: 200, headers, body: JSON.stringify({ success: false }) };

    const repId = accessData[0].rep_id;
    const r2 = await fetch(`${SUPA_URL}/rest/v1/sales_reps?id=eq.${repId}&select=first_name,last_name,email,rep_code,unique_checkout_url,total_closes,active_clients,monthly_recurring,total_commission`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const reps = await r2.json();
    if (!reps?.[0]) return { statusCode: 200, headers, body: JSON.stringify({ success: false }) };

    // Update last login
    await fetch(`${SUPA_URL}/rest/v1/rep_portal_access?access_code=eq.${access_code}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_login: new Date().toISOString() })
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, rep: reps[0] }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
