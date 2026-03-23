// netlify/functions/captcha-status.js
exports.handler = async () => {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const TC_KEY   = process.env.TWOCAPTCHA_API_KEY;

  let balance = 0, has_key = !!TC_KEY, total_entered = 0;

  // Check balance
  if (TC_KEY) {
    try {
      const r = await fetch(`https://2captcha.com/res.php?key=${TC_KEY}&action=getbalance&json=1`);
      const d = await r.json();
      if (d.status === 1) balance = parseFloat(d.request);
    } catch(e) {}
  }

  // Get sweepstakes count
  if (SUPA_URL) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/sweepstakes_entries?select=id&result=in.(entered,submitted)`,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }});
      const d = await r.json();
      total_entered = Array.isArray(d) ? d.length : 0;
    } catch(e) {}
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ has_key, balance, total_entered, active: balance > 0.01 })
  };
};
