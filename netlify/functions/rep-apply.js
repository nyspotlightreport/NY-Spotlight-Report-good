// netlify/functions/rep-apply.js
// Server-side rep application handler — saves to Supabase without exposing DB creds to frontend

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
  const PUSH_API = process.env.PUSHOVER_API_KEY;
  const PUSH_USR = process.env.PUSHOVER_USER_KEY;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: '{}' }; }

  if (!body.email || !body.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name and email required' }) };

  try {
    await fetch(`${SUPA_URL}/rest/v1/rep_applications`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...body, status: 'new', created_at: new Date().toISOString() })
    });

    if (PUSH_API && PUSH_USR) {
      await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: PUSH_API, user: PUSH_USR,
          title: '🤝 New Rep Application!',
          message: `${body.name}\n${body.email}\nType: ${body.rep_type||'?'}\nSource: ${body.source||'?'}` })
      }).catch(() => {});
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
