// Store Page — Dynamic Gumroad Integration
// Serves /store/ via Netlify redirect. Cannot be overwritten by sync workflow.
const GUMROAD_TOKEN = process.env.GUMROAD_ACCESS_TOKEN || 'iWDmua3jwn2oZDPa0nOUnvACE5lyeELc-uA3GwTxjmM';

function productCard(p) {
  const name = p.name || 'Digital Guide';
  const price = Math.round((p.price || 0) / 100);
  const url = p.short_url || 'https://spotlightny.gumroad.com';
  let desc = (p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 130);
  if (!desc) desc = 'A practical resource from S.C. Thomas and NY Spotlight Report.';
  return `<div style="background:white;border:1px solid #e8e0d4;border-radius:6px;padding:1.5rem;display:flex;flex-direction:column;gap:.75rem">
    <div style="font-size:.7rem;letter-spacing:.1em;color:#c9a84c;text-transform:uppercase;font-family:sans-serif;font-weight:700">Digital Resource</div>
    <h3 style="font-family:Georgia,serif;font-size:1.05rem;margin:0;color:#1a1a1a;line-height:1.35">${name}</h3>
    <p style="color:#666;font-size:.875rem;margin:0;line-height:1.6;flex:1">${desc}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem">
      <span style="font-size:1.4rem;font-weight:700;color:#1a1a1a;font-family:sans-serif">$${price}</span>
      <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:.6rem 1.25rem;background:#c9a84c;color:white;text-decoration:none;border-radius:4px;font-size:.875rem;font-weight:700;font-family:sans-serif">Get It Now</a>
    </div>
  </div>`;
}

exports.handler = async () => {
  let cards = '', count = 0;
  try {
    const res = await fetch(`https://api.gumroad.com/v2/products?access_token=${GUMROAD_TOKEN}`, {headers:{'User-Agent':'NYSR/1.0'}});
    if (res.ok) { const d = await res.json(); count = (d.products||[]).length; cards = (d.products||[]).map(productCard).join('\n'); }
  } catch(e) { console.error('Gumroad error:', e.message); }
  if (!cards) cards = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#888;font-family:sans-serif"><p>Browse our store at <a href="https://spotlightny.gumroad.com" style="color:#c9a84c">spotlightny.gumroad.com</a></p></div>';
  return {
    statusCode: 200,
    headers: {'Content-Type':'text/html;charset=utf-8','Cache-Control':'public,max-age=300'},
    body: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resource Library - NY Spotlight Report</title><meta name="description" content="Digital guides from S.C. Thomas."><meta property="og:image" content="https://nyspotlightreport.com/images/nysr-og-default.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="index,follow"></head><body style="margin:0;padding:0;background:#faf8f3;color:#1a1a1a"><div style="background:#1a1a1a;padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem"><a href="/" style="color:#c9a84c;text-decoration:none;font-weight:700;font-size:1.05rem;font-family:Georgia,serif">NY Spotlight Report</a><div style="display:flex;gap:1.5rem"><a href="/blog/" style="color:#ccc;text-decoration:none;font-size:.875rem;font-family:sans-serif">Articles</a><a href="/store/" style="color:#c9a84c;text-decoration:none;font-size:.875rem;font-family:sans-serif;font-weight:700">Store</a><a href="/advertise/" style="color:#ccc;text-decoration:none;font-size:.875rem;font-family:sans-serif">Advertise</a></div></div><div style="text-align:center;padding:3rem 1.5rem 2rem;max-width:700px;margin:0 auto"><div style="font-size:.75rem;letter-spacing:.15em;color:#c9a84c;text-transform:uppercase;margin-bottom:.75rem;font-family:sans-serif;font-weight:700">Resource Library</div><h1 style="font-size:2.2rem;font-weight:normal;margin:0 0 .75rem;font-family:Georgia,serif">Practical tools from S.C. Thomas</h1><p style="color:#666;font-size:1rem;margin:0;font-family:sans-serif">${count} digital guides and resources.</p></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.5rem;max-width:1100px;margin:0 auto;padding:0 1.5rem 3rem">${cards}</div><div style="background:#1a1a1a;color:#888;text-align:center;padding:2rem;font-size:.8rem;font-family:sans-serif"><p>© 2020-2026 NY Spotlight Report · <a href="/" style="color:#c9a84c;text-decoration:none">Home</a> · <a href="/blog/" style="color:#c9a84c;text-decoration:none">Articles</a></p><p style="margin-top:.5rem">editor-in-chief@nyspotlightreport.com · (631) 375-1097 · ISSN 2026-0147</p></div></body></html>`
  };
};
