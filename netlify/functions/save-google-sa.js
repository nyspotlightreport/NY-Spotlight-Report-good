// netlify/functions/save-google-sa.js
// Receives Google Service Account JSON from /tokens/ page
// Saves to: GitHub Secrets + Netlify env vars
// After this: YouTube uploads use service account, tokens never expire

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const GH_PAT        = process.env.GH_PAT;
  const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
  const SITE_ID       = '8ef722e1-4110-42af-8ddb-ff6c2ce1745e';
  const REPO          = 'nyspotlightreport/sct-agency-bots';
  const PUSH_API      = process.env.PUSHOVER_API_KEY;
  const PUSH_USER     = process.env.PUSHOVER_USER_KEY;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const saJson = body.service_account_json || body.value || '';
  if (!saJson) return { statusCode: 400, headers, body: JSON.stringify({ error: 'service_account_json required' }) };

  // Validate it looks like a real service account key
  let saData;
  try {
    saData = JSON.parse(saJson);
    if (saData.type !== 'service_account') throw new Error('Not a service account key');
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid service account JSON: ' + e.message }) };
  }

  const saved = [];

  // 1. Save to GitHub Secrets
  if (GH_PAT) {
    try {
      const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
        headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const { key_id } = await pkRes.json();
      const encoded = Buffer.from(saJson).toString('base64');
      const putRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/GOOGLE_SERVICE_ACCOUNT_JSON`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ encrypted_value: encoded, key_id })
      });
      if (putRes.ok || putRes.status === 204) saved.push('github_secrets');
    } catch(e) { console.error('GH error:', e.message); }
  }

  // 2. Save to Netlify env vars
  if (NETLIFY_TOKEN) {
    try {
      const netRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/env`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${NETLIFY_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
          scopes: ['functions', 'builds'],
          values: [{ context: 'production', value: saJson }]
        }])
      });
      if (netRes.ok) {
        saved.push('netlify_env');
      } else {
        // Try update
        const putRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/env/GOOGLE_SERVICE_ACCOUNT_JSON`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${NETLIFY_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ scopes: ['functions','builds'], values: [{ context: 'production', value: saJson }] })
        });
        if (putRes.ok) saved.push('netlify_env_updated');
      }
    } catch(e) { console.error('Netlify error:', e.message); }
  }

  // 3. Pushover
  if (PUSH_API && PUSH_USER) {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: PUSH_API, user: PUSH_USER,
        title: '✅ Google Service Account Saved!',
        message: `SA email: ${saData.client_email}\nProject: ${saData.project_id}\nYouTube automation: bypasses consent screen forever.`
      })
    }).catch(() => {});
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: saved.length > 0,
      saved,
      service_account_email: saData.client_email,
      project_id: saData.project_id,
      note: 'Share YouTube channel with the service_account_email in YouTube Studio → Settings → Permissions'
    })
  };
};
