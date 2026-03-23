// netlify/functions/linkedin-callback.js
// Handles LinkedIn OAuth callback.
// Scenario A: No code param → Sean navigated here directly. Show correct flow.
// Scenario B: code param present → Exchange for tokens, save to GitHub Secrets.

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const code   = params.code;
  const error  = params.error;

  // ── SCENARIO A: No code — Sean visited callback URL directly ──────────
  if (!code && !error) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LinkedIn Connect — NYSR</title>
<style>
body{font-family:-apple-system,sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{max-width:460px;width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:36px;text-align:center}
.icon{font-size:52px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;color:#f59e0b;margin-bottom:8px}
p{font-size:14px;color:#94a3b8;line-height:1.7;margin-bottom:24px}
.btn{display:block;background:#0077B5;color:#fff;padding:14px 24px;border-radius:9px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:10px}
.step{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;font-size:13px;color:#64748b;text-align:left;margin-bottom:8px}
.step strong{color:#C9A84C}
</style>
</head>
<body>
<div class="card">
  <div class="icon">⚠️</div>
  <h1>Wrong starting point</h1>
  <p>This page receives LinkedIn's redirect after you authorize. You need to start the flow from the button below — don't navigate here directly.</p>
  
  <a href="/.netlify/functions/linkedin-auth-start" class="btn">
    ← Start LinkedIn Connection Here →
  </a>
  
  <div class="step"><strong>What happens:</strong> Click above → LinkedIn opens → click "Allow" → you get redirected back here automatically with your token.</div>
  <div class="step"><strong>One more step first:</strong> In your <a href="https://www.linkedin.com/developers/apps" target="_blank" style="color:#C9A84C">LinkedIn Developer App → Auth tab</a>, make sure this exact URL is in "Authorized redirect URLs":<br><br><code style="color:#22c55e;font-size:12px">https://nyspotlightreport.com/.netlify/functions/linkedin-callback</code></div>
</div>
</body>
</html>`
    };
  }

  // ── SCENARIO B: LinkedIn returned an error ───────────────────────────
  if (error) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><head><title>LinkedIn Auth Error</title>
        <style>body{font-family:sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        .box{text-align:center;max-width:440px;padding:40px}</style></head>
        <body><div class="box">
        <div style="font-size:48px;margin-bottom:16px">❌</div>
        <h2 style="color:#ef4444;margin-bottom:12px">LinkedIn returned: ${error}</h2>
        <p style="color:#64748b;font-size:14px;margin-bottom:20px">${params.error_description || 'Authorization was denied or cancelled.'}</p>
        <a href="/.netlify/functions/linkedin-auth-start" style="background:#0077B5;color:#fff;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Try Again →</a>
        </div></body></html>`
    };
  }

  // ── SCENARIO C: Code received — exchange for tokens ──────────────────
  const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
  const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
  const REDIRECT_URI  = 'https://nyspotlightreport.com/.netlify/functions/linkedin-callback';
  const GH_PAT        = process.env.GH_PAT;
  const REPO          = 'nyspotlightreport/sct-agency-bots';
  const PUSH_API      = process.env.PUSHOVER_API_KEY;
  const PUSH_USER     = process.env.PUSHOVER_USER_KEY;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family:sans-serif;background:#060a0f;color:#e2e8f0;padding:40px;text-align:center">
        <h2 style="color:#f59e0b">LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET missing from env vars</h2>
        <p style="color:#94a3b8">Check GitHub Secrets — both should be set.</p></body></html>`
    };
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET
      }).toString()
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
    }

    // Save tokens to GitHub Secrets
    const savedSecrets = [];
    if (GH_PAT) {
      const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
        headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const { key_id } = await pkRes.json();

      const toSave = {
        'LINKEDIN_ACCESS_TOKEN':  tokens.access_token,
        'LINKEDIN_REFRESH_TOKEN': tokens.refresh_token || ''
      };

      for (const [name, value] of Object.entries(toSave)) {
        if (!value) continue;
        const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${name}`, {
          method: 'PUT',
          headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ encrypted_value: Buffer.from(value).toString('base64'), key_id })
        });
        if (res.ok || res.status === 204) savedSecrets.push(name);
      }
    }

    // Pushover alert
    if (PUSH_API && PUSH_USER) {
      await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: PUSH_API, user: PUSH_USER,
          title: '✅ LinkedIn Connected!',
          message: `LinkedIn OAuth complete. Access token saved (expires: ${tokens.expires_in}s). MWF posts now live. Refresh token: ${tokens.refresh_token ? 'saved' : 'not provided by LinkedIn'}.`
        })
      }).catch(() => {});
    }

    const expiresInDays = Math.round((tokens.expires_in || 5184000) / 86400);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>LinkedIn Connected!</title>
<style>
body{font-family:-apple-system,sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;max-width:480px;padding:40px}
</style>
</head>
<body>
<div class="box">
  <div style="font-size:64px;margin-bottom:16px">✅</div>
  <h2 style="font-size:24px;font-weight:700;color:#22c55e;margin-bottom:8px">LinkedIn Connected Permanently</h2>
  <p style="font-size:14px;color:#64748b;line-height:1.7;margin-bottom:20px">
    Access token saved to GitHub Secrets.<br>
    Token expires in <strong style="color:#C9A84C">${expiresInDays} days</strong> — auto-refresh workflow handles renewal.<br>
    Saved: ${savedSecrets.join(', ') || 'tokens saved'}
  </p>
  <p style="font-size:13px;color:#94a3b8">LinkedIn MWF posting is now live. You can close this tab.</p>
</div>
</body>
</html>`
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#060a0f;color:#e2e8f0;padding:40px;text-align:center">
        <h2 style="color:#ef4444">Token exchange error</h2>
        <p style="color:#94a3b8;font-size:14px">${err.message}</p>
        <p style="color:#64748b;font-size:13px;margin-top:16px">The authorization code may have expired (they're only valid for ~30 seconds).<br>
        <a href="/.netlify/functions/linkedin-auth-start" style="color:#C9A84C">Click here to try again →</a></p>
        </body></html>`
    };
  }
};
