// facebook-callback.js — Netlify Function
// Receives Facebook OAuth code, exchanges for user token, then gets Page token

exports.handler = async (event) => {
  const { code, error, state } = event.queryStringParameters || {};
  const H = { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" };
  const html = (body) => ({ statusCode: 200, headers: H, body });

  if (error) return html(`<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px;text-align:center"><h2 style="color:#EF4444">Facebook Error: ${error}</h2><a href="/tokens/" style="color:#C9A84C">← Back</a></body>`);
  if (!code) return html(`<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px;text-align:center"><h2>No code received</h2><a href="/tokens/" style="color:#C9A84C">← Back</a></body>`);

  const APP_ID     = process.env.FACEBOOK_APP_ID     || "1319442660014439";
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
  const REDIRECT   = "https://nyspotlightreport.com/api/facebook-callback";

  if (!APP_SECRET) {
    // Show what we got and instructions to get secret
    return html(`<!DOCTYPE html><html><head><title>Facebook - NYSR</title></head>
<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px;max-width:600px;margin:0 auto;text-align:center">
<div style="font-size:48px">⚠️</div>
<h2 style="color:#F59E0B;margin:16px 0">App Secret Not Set Yet</h2>
<p style="color:#64748B;margin-bottom:24px">Code received (${code.slice(0,20)}...) but we need the App Secret to exchange it.</p>
<p style="font-size:13px;color:#94A3B8">Go to: <a href="https://developers.facebook.com/apps/1319442660014439/settings/basic/" target="_blank" style="color:#C9A84C">Facebook App Settings</a><br>
Click "Show" next to App Secret → enter Facebook password → copy the secret<br>
Then add it as <code style="background:#111;padding:2px 6px;border-radius:4px;color:#C9A84C">FACEBOOK_APP_SECRET</code> in GitHub Secrets</p>
<p style="margin-top:24px"><a href="/tokens/" style="color:#C9A84C">← Token Center</a></p>
</body></html>`);
  }

  // Exchange code for user access token
  let userToken;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_secret=${APP_SECRET}&code=${code}`);
    const data = await res.json();
    userToken = data.access_token;
    if (!userToken) throw new Error(JSON.stringify(data));
  } catch(e) {
    return html(`<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px"><h2 style="color:#EF4444">Token exchange failed: ${e.message}</h2></body>`);
  }

  // Get pages the user manages
  let pages = [];
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`);
    const data = await res.json();
    pages = data.data || [];
  } catch(e) {}

  // Build page selection UI
  const pageOptions = pages.map(p => 
    `<div style="background:#111827;border:1px solid #1a2d42;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer" 
      onclick="selectPage('${p.access_token}','${p.id}','${p.name?.replace(/'/g,'\\'')}')">
      <strong style="color:#E2E8F0">${p.name}</strong><br>
      <span style="font-size:11px;color:#64748B">ID: ${p.id}</span>
    </div>`
  ).join('');

  return html(`<!DOCTYPE html><html><head><title>Select Page - NYSR</title></head>
<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px;max-width:600px;margin:0 auto">
<div style="font-size:48px;text-align:center">✅</div>
<h2 style="color:#22D3A0;text-align:center;margin:12px 0">Facebook Connected!</h2>
${pages.length > 0 ? `<p style="color:#64748B;margin-bottom:16px;text-align:center">Select the Page to use for posting:</p>${pageOptions}` : 
  `<div style="background:#0A1525;border:1px solid rgba(201,168,76,.3);border-radius:10px;padding:16px;margin-top:12px">
    <p style="font-size:12px;color:#94A3B8;margin-bottom:8px">User Token (no pages found — use this for personal posts):</p>
    <div style="font-family:monospace;font-size:11px;color:#C9A84C;word-break:break-all">${userToken}</div>
    <button onclick="navigator.clipboard.writeText('${userToken}').then(()=>this.textContent='Copied ✓')" 
      style="background:#C9A84C;color:#020409;border:none;padding:8px 18px;border-radius:7px;font-weight:700;cursor:pointer;margin-top:10px">Copy Token</button>
  </div>`}
<p style="text-align:center;margin-top:20px"><a href="/tokens/" style="color:#C9A84C">← Token Center</a></p>
<script>
function selectPage(token, id, name) {
  navigator.clipboard.writeText(token);
  alert('Page "' + name + '" token copied!\\n\\nAdd to GitHub Secrets as:\\nFB_PAGE_TOKEN\\nINSTAGRAM_PAGE_TOKEN');
  window.location.href = '/tokens/?platform=fb&token=' + encodeURIComponent(token);
}
</script>
</body></html>`);
};
