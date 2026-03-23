// netlify/functions/meta-auth-start.js
// SERVER-SIDE Meta/Facebook OAuth initiation.
// APP_ID comes from env var — never in frontend JS.

exports.handler = async (event) => {
  const APP_ID      = process.env.META_APP_ID || process.env.FB_APP_ID;
  const REDIRECT    = 'https://nyspotlightreport.com/.netlify/functions/facebook-callback';

  if (!APP_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family:sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:500px;padding:40px">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2 style="color:#f59e0b;margin-bottom:12px">META_APP_ID not configured</h2>
          <p style="color:#94a3b8;font-size:14px;line-height:1.7">
            1. Go to <a href="https://developers.facebook.com/apps" target="_blank" style="color:#C9A84C">developers.facebook.com/apps</a><br>
            2. Create an app (type: Business) → copy the App ID<br>
            3. Add to GitHub Secrets as <strong>META_APP_ID</strong><br>
            4. Also add <strong>META_APP_SECRET</strong><br>
            5. Add redirect URI in Meta App settings: ${REDIRECT}<br>
            6. Then come back and click Connect again
          </p>
          <a href="/tokens/" style="display:inline-block;margin-top:20px;background:#C9A84C;color:#060a0f;padding:10px 24px;border-radius:8px;font-weight:700;text-decoration:none">← Back to Token Setup</a>
        </div></body></html>`
    };
  }

  const scope = 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,pages_show_list';

  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', APP_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', Math.random().toString(36).substr(2, 16));

  return {
    statusCode: 302,
    headers: { 'Location': authUrl.toString() },
    body: ''
  };
};
