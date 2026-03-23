// netlify/functions/linkedin-auth-start.js
// SERVER-SIDE LinkedIn OAuth initiation.
// Fix: client_id comes from env var, never hardcoded in frontend JS.
// Redirect user to LinkedIn auth page with correct params.

exports.handler = async (event) => {
  const CLIENT_ID    = process.env.LINKEDIN_CLIENT_ID;
  const REDIRECT_URI = 'https://nyspotlightreport.com/.netlify/functions/linkedin-callback';

  if (!CLIENT_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family:sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:500px;padding:40px">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2 style="color:#f59e0b;margin-bottom:12px">LINKEDIN_CLIENT_ID not configured</h2>
          <p style="color:#94a3b8;font-size:14px;line-height:1.7">
            1. Go to <a href="https://www.linkedin.com/developers/apps" target="_blank" style="color:#C9A84C">linkedin.com/developers/apps</a><br>
            2. Create or open your app → Auth tab → copy the Client ID<br>
            3. Add to GitHub Secrets as <strong>LINKEDIN_CLIENT_ID</strong><br>
            4. Also add <strong>LINKEDIN_CLIENT_SECRET</strong><br>
            5. Then come back here and click Connect again
          </p>
          <a href="/tokens/" style="display:inline-block;margin-top:20px;background:#C9A84C;color:#060a0f;padding:10px 24px;border-radius:8px;font-weight:700;text-decoration:none">← Back to Token Setup</a>
        </div></body></html>`
    };
  }

  // Generate state for CSRF protection
  const state = Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
  const scope = 'openid profile email w_member_social';

  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);

  // Redirect directly — no popup needed
  return {
    statusCode: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': `li_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    },
    body: ''
  };
};
