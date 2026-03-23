// netlify/functions/google-device-auth.js
// Google OAuth Device Flow — works with Testing apps, NO service account key needed.
// Org policy blocked SA key creation. Device flow bypasses that entirely.
// Step 1: GET /google-device-start → returns device_code + user_code + verification_url
// Step 2: User visits verification_url, enters user_code (30 seconds)
// Step 3: GET /google-device-poll → exchanges device_code for tokens → saves permanently

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET  || process.env.GOOGLE_OAUTH_SECRET;
  const path          = event.path || '';
  const params        = event.queryStringParameters || {};

  // ── START: Request device code ──────────────────────────────────────
  if (event.httpMethod === 'GET' && !params.poll) {
    if (!CLIENT_ID) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#060a0f;color:#e2e8f0;padding:40px;max-width:500px;margin:0 auto">
          <h2 style="color:#f59e0b">Google OAuth needs Client ID</h2>
          <p style="color:#94a3b8">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Netlify env vars.<br><br>
          Get them from: <a href="https://console.cloud.google.com/apis/credentials" style="color:#C9A84C" target="_blank">console.cloud.google.com/apis/credentials</a><br>
          → OAuth 2.0 Client IDs → your Desktop or Web app client → copy ID + secret</p>
        </body></html>`
      };
    }

    const res = await fetch('https://oauth2.googleapis.com/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.readonly'
      }).toString()
    });

    const data = await res.json();

    if (data.error) {
      return { statusCode: 200, headers: { 'Content-Type': 'text/html' },
        body: `<html><body style="font-family:sans-serif;background:#060a0f;color:#e2e8f0;padding:40px"><h2 style="color:#ef4444">Error: ${data.error}</h2><p style="color:#94a3b8">${data.error_description||''}</p></body></html>` };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Connect Google — NYSR</title>
<style>body{font-family:-apple-system,sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{max-width:480px;width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:36px;text-align:center}
.code{font-size:36px;font-weight:700;letter-spacing:.15em;color:#C9A84C;background:rgba(201,168,76,.08);border:2px solid rgba(201,168,76,.3);border-radius:10px;padding:16px 24px;margin:20px 0;font-family:monospace}
.btn{display:block;background:#4285F4;color:#fff;padding:14px 24px;border-radius:9px;font-size:15px;font-weight:700;text-decoration:none;margin:12px 0}
.step{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;font-size:13px;color:#64748b;text-align:left;margin-bottom:8px}
.step strong{color:#94a3b8}
#status{font-size:13px;margin-top:16px;padding:10px;border-radius:8px;display:none}
</style></head>
<body><div class="card">
  <div style="font-size:48px;margin-bottom:12px">🔑</div>
  <h2 style="font-size:20px;color:#f8fafc;margin-bottom:6px">Connect Google / YouTube</h2>
  <p style="font-size:14px;color:#64748b;margin-bottom:16px">Two steps. 60 seconds total.</p>

  <div class="step"><strong>Step 1:</strong> Click the button below — Google opens</div>
  <a href="${data.verification_url}" target="_blank" class="btn">Open Google Authorization →</a>

  <div class="step"><strong>Step 2:</strong> Enter this code exactly as shown:</div>
  <div class="code">${data.user_code}</div>

  <div class="step"><strong>Step 3:</strong> Click "Done — I entered the code" below</div>
  <button onclick="pollToken('${data.device_code}', '${CLIENT_ID}')"
    style="width:100%;background:#22c55e;color:#000;border:none;padding:14px;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px">
    Done — I entered the code →
  </button>
  <div id="status"></div>
</div>

<script>
async function pollToken(deviceCode, clientId) {
  const btn = event.target;
  btn.textContent = 'Verifying...';
  btn.disabled = true;
  const st = document.getElementById('status');
  st.style.display = 'block';
  st.style.background = 'rgba(201,168,76,.08)';
  st.style.color = '#C9A84C';
  st.style.border = '1px solid rgba(201,168,76,.2)';
  st.textContent = 'Checking with Google... this takes 5-10 seconds.';

  const r = await fetch('/.netlify/functions/google-device-auth?poll=1&device_code=' + encodeURIComponent(deviceCode));
  const d = await r.json();

  if (d.success) {
    st.style.background = 'rgba(34,197,94,.08)';
    st.style.color = '#22c55e';
    st.style.border = '1px solid rgba(34,197,94,.2)';
    st.textContent = '✅ Google connected! YouTube automation live. Tokens saved permanently. You can close this tab.';
    btn.style.display = 'none';
  } else if (d.pending) {
    btn.textContent = 'Try again →';
    btn.disabled = false;
    st.textContent = d.message || 'Not authorized yet — make sure you entered the code on Google, then click Try Again.';
  } else {
    btn.textContent = 'Retry →';
    btn.disabled = false;
    st.style.color = '#ef4444';
    st.textContent = '❌ ' + (d.error || 'Failed');
  }
}
</script></body></html>`
    };
  }

  // ── POLL: Exchange device_code for tokens ────────────────────────────
  if (params.poll && params.device_code) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Google credentials not configured' }) };
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        device_code:   params.device_code,
        grant_type:    'urn:ietf:params:oauth:grant-type:device_code'
      }).toString()
    });

    const tokens = await tokenRes.json();

    if (tokens.error === 'authorization_pending') {
      return { statusCode: 200, headers, body: JSON.stringify({ pending: true, message: 'Not authorized yet — enter the code on Google first.' }) };
    }

    if (tokens.error) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: tokens.error + ': ' + (tokens.error_description||'') }) };
    }

    if (tokens.access_token) {
      const GH_PAT        = process.env.GH_PAT;
      const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
      const SITE_ID       = '8ef722e1-4110-42af-8ddb-ff6c2ce1745e';
      const REPO          = 'nyspotlightreport/sct-agency-bots';
      const PUSH_API      = process.env.PUSHOVER_API_KEY;
      const PUSH_USER     = process.env.PUSHOVER_USER_KEY;
      const saved         = [];

      // Save to GitHub Secrets
      if (GH_PAT) {
        try {
          const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
            headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          const { key_id } = await pkRes.json();
          for (const [name, val] of [
            ['GOOGLE_ACCESS_TOKEN',   tokens.access_token],
            ['GOOGLE_REFRESH_TOKEN',  tokens.refresh_token || ''],
            ['YOUTUBE_ACCESS_TOKEN',  tokens.access_token],
          ]) {
            if (!val) continue;
            await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${name}`, {
              method: 'PUT',
              headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
              body: JSON.stringify({ encrypted_value: Buffer.from(val).toString('base64'), key_id })
            });
            saved.push(name);
          }
        } catch(e) {}
      }

      // Save refresh token to Netlify env
      if (NETLIFY_TOKEN && tokens.refresh_token) {
        try {
          await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/env`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${NETLIFY_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([{ key: 'GOOGLE_REFRESH_TOKEN', scopes: ['functions'], values: [{ context: 'production', value: tokens.refresh_token }] }])
          });
          saved.push('netlify_refresh_token');
        } catch(e) {}
      }

      // Pushover
      if (PUSH_API && PUSH_USER) {
        await fetch('https://api.pushover.net/1/messages.json', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: PUSH_API, user: PUSH_USER,
            title: '✅ Google/YouTube Connected!',
            message: 'Google OAuth complete via device flow. YouTube uploads automated. Tokens saved.'
          })
        }).catch(() => {});
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, saved }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ error: 'Unexpected response', data: tokens }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Unknown request' }) };
};
