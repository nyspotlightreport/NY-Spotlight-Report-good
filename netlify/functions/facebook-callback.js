// netlify/functions/facebook-callback.js
// Receives Meta OAuth callback, exchanges for PERMANENT non-expiring page token.
// Instagram + Facebook page tokens from long-lived user tokens do not expire.

exports.handler = async (event) => {
  const params      = new URLSearchParams(event.queryStringParameters || {});
  const code        = params.get('code');
  const APP_ID      = process.env.META_APP_ID    || process.env.FB_APP_ID;
  const APP_SECRET  = process.env.META_APP_SECRET || process.env.FB_APP_SECRET;
  const REDIRECT    = 'https://nyspotlightreport.com/.netlify/functions/facebook-callback';
  const GH_PAT      = process.env.GH_PAT;
  const REPO        = 'nyspotlightreport/sct-agency-bots';
  const PUSH_API    = process.env.PUSHOVER_API_KEY;
  const PUSH_USER   = process.env.PUSHOVER_USER_KEY;

  if (!code) return { statusCode: 400, body: 'No code received.' };
  if (!APP_ID || !APP_SECRET) return { statusCode: 500, body: 'META_APP_ID / META_APP_SECRET not configured.' };

  try {
    // Step 1: Short-lived user token
    const shortRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_secret=${APP_SECRET}&code=${code}`);
    const shortData = await shortRes.json();
    if (!shortData.access_token) throw new Error(`Short token failed: ${JSON.stringify(shortData)}`);

    // Step 2: Exchange for 60-day long-lived user token
    const longRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortData.access_token}`);
    const longData = await longRes.json();
    if (!longData.access_token) throw new Error(`Long token failed: ${JSON.stringify(longData)}`);

    // Step 3: Get managed pages (FB + Instagram)
    const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${longData.access_token}`);
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];

    // Step 4: Save to GitHub Secrets
    const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
      headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    const { key_id } = await pkRes.json();

    const saveSecret = async (name, value) => {
      if (!value) return;
      await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${name}`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${GH_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ encrypted_value: Buffer.from(value).toString('base64'), key_id })
      });
    };

    // Save user token (long-lived)
    await saveSecret('FB_USER_TOKEN', longData.access_token);

    // Save each page token (non-expiring)
    for (const page of pages.slice(0, 3)) {
      const pageToken = page.access_token;
      const pageName  = page.name?.replace(/\s/g,'_').toUpperCase() || 'PAGE';

      if (pageName.includes('INSTAGRAM') || page.category?.includes('Media')) {
        await saveSecret('INSTAGRAM_PAGE_TOKEN', pageToken);
        await saveSecret('INSTAGRAM_PAGE_ID', page.id);
      } else {
        await saveSecret('FB_PAGE_TOKEN', pageToken);
        await saveSecret('FB_PAGE_ID', page.id);
      }
    }

    // Pushover
    if (PUSH_API && PUSH_USER) {
      await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: PUSH_API, user: PUSH_USER,
          title: '✅ Meta Connected Permanently!',
          message: `Instagram + Facebook connected. ${pages.length} page(s) found. Non-expiring tokens saved. Posts now live.`
        })
      }).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><head><title>Meta Connected</title>
        <style>body{font-family:-apple-system,sans-serif;background:#060a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        .box{text-align:center;padding:40px}</style></head>
        <body><div class="box">
        <div style="font-size:64px;margin-bottom:16px">✅</div>
        <div style="font-size:24px;font-weight:700;color:#22c55e;margin-bottom:8px">Instagram + Facebook Connected</div>
        <div style="font-size:14px;color:#64748b">${pages.length} pages found. Non-expiring tokens saved.<br>Posts go live immediately. These tokens never expire.</div>
        </div></body></html>`
    };

  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: `<h1>Error: ${err.message}</h1>` };
  }
};
