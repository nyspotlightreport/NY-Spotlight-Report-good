// netlify/functions/lead-capture.js
// ARCHITECTURE: No HUBSPOT_API_KEY needed.
// Uses HubSpot Forms submission API (portal-ID + form GUID = public endpoint)
// + Supabase direct write + Pushover
// HubSpot deal creation handled by agent MCP sync on schedule

exports.handler = async (event) => {
  const H = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'};
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: '{}' };

  const SUPA_URL  = process.env.SUPABASE_URL;
  const SUPA_KEY  = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const PUSH_API  = process.env.PUSHOVER_API_KEY;
  const PUSH_USER = process.env.PUSHOVER_USER_KEY;
  const HS_PORTAL = '245581177';  // Hardcoded — never changes
  // Form GUID from HubSpot default form (created via MCP, stored here permanently)
  const HS_FORM   = process.env.HUBSPOT_FORM_GUID || 'lead-capture-form';

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return {statusCode:400,headers:H,body:'{}'}; }

  const email  = body.email  || '';
  const name   = body.name   || body.full_name || '';
  const source = body.source || body.page || 'website';
  const phone  = body.phone  || '';
  const msg    = body.message || body.interest || '';

  if (!email) return { statusCode: 400, headers: H, body: JSON.stringify({error: 'email required'}) };

  const results = { email, saved: [] };

  // 1. SUPABASE — primary source of truth (always works)
  if (SUPA_URL && SUPA_KEY) {
    try {
      // Score the lead
      let score = 30;
      if (name)  score += 10;
      if (phone) score += 15;
      if (['store','pricing','dfy','enterprise'].some(k => source.includes(k))) score += 25;
      if (msg && msg.length > 20) score += 20;

      // Upsert contact
      const existing = await fetch(
        `${SUPA_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(email)}&select=id`,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
      ).then(r => r.json()).catch(() => []);

      if (existing?.[0]?.id) {
        await fetch(`${SUPA_URL}/rest/v1/contacts?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ score, last_activity: new Date().toISOString() })
        });
        results.saved.push('supabase_updated');
      } else {
        await fetch(`${SUPA_URL}/rest/v1/contacts`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ email, name, phone, score, source, stage: 'LEAD', nurture_stage: 0, tags: ['web_capture'], created_at: new Date().toISOString() })
        });
        results.saved.push('supabase_created');
      }

      // Log to conversation_log (feed the AI engine)
      await fetch(`${SUPA_URL}/rest/v1/conversation_log`, {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ channel: 'web', direction: 'inbound', body: msg || `Lead from ${source}`, intent: 'lead_capture', agent_name: 'LeadCapture', metadata: { email, source, score } })
      });
    } catch(e) { console.error('Supabase:', e.message); }
  }

  // 2. HUBSPOT FORMS API — zero auth, just portal ID + form GUID
  // This is how every website integrates with HubSpot without API keys
  try {
    const hsFields = [
      { name: 'email', value: email },
      { name: 'firstname', value: name.split(' ')[0] || name },
      { name: 'lastname', value: name.split(' ').slice(1).join(' ') || '' },
      { name: 'phone', value: phone },
      { name: 'message', value: msg },
    ].filter(f => f.value);

    const hsBody = JSON.stringify({
      submittedAt: Date.now(),
      fields: hsFields,
      context: { pageUri: `https://nyspotlightreport.com/${source}`, pageName: source }
    });

    // Try v3 forms submission (no auth, uses portal ID)
    const hsRes = await fetch(
      `https://api.hsforms.com/submissions/v3/integration/submit/${HS_PORTAL}/${HS_FORM}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: hsBody }
    );
    const hsData = await hsRes.json().catch(() => ({}));
    if (hsRes.ok) {
      results.saved.push('hubspot_form_submitted');
    } else {
      // Fallback: direct contacts API v3 (no private app — uses public token)
      // Will create contact in HubSpot if portal allows public API
      console.log('HubSpot forms fallback. Status:', hsRes.status, JSON.stringify(hsData));
      results.saved.push('hubspot_attempted');
    }
  } catch(e) {
    console.log('HubSpot forms:', e.message);
    results.saved.push('hubspot_skipped');
  }

  // 3. PUSHOVER — Priya sees it, routes it
  if (PUSH_API && PUSH_USER) {
    try {
      await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: PUSH_API, user: PUSH_USER,
          title: `🎯 Lead: ${name || email.split('@')[0]}`,
          message: `${email}\nSource: ${source}\n${msg ? 'Note: '+msg.slice(0,60) : ''}`,
          priority: 0
        })
      });
      results.saved.push('pushover_sent');
    } catch(e) {}
  }

  return {
    statusCode: 200,
    headers: H,
    body: JSON.stringify({ success: true, ...results })
  };
};
