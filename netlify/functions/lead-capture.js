const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode:405,body:'Method not allowed'};
  
  let data;
  try { data = JSON.parse(event.body); } catch(e) { return {statusCode:400,body:'Invalid JSON'}; }
  
  const { name, email, niche, goal, source } = data;
  if (!email) return {statusCode:400,body:'Email required'};

  const BH_KEY = process.env.BEEHIIV_API_KEY;
  const BH_PUB = process.env.BEEHIIV_PUB_ID;
  const results = {email, subscribed:false, tagged:false};

  // Add to Beehiiv
  if (BH_KEY && BH_PUB) {
    try {
      const subPayload = JSON.stringify({
        email, reactivate_existing: true,
        send_welcome_email: true,
        utm_source: source || 'free-plan',
        custom_fields: [
          {name:'niche',value:niche||''},
          {name:'goal',value:goal||''},
          {name:'first_name',value:name||''},
        ]
      });
      await fetch(`https://api.beehiiv.com/v2/publications/${BH_PUB}/subscriptions`, {
        method:'POST',
        headers:{'Authorization':`Bearer ${BH_KEY}`,'Content-Type':'application/json'},
        body: subPayload
      });
      results.subscribed = true;
    } catch(e) { console.error('Beehiiv error:', e.message); }
  }

  // Send plan email via Gmail SMTP (use existing creds)
  // Log to console for GitHub Actions to pick up
  console.log(JSON.stringify({
    event:'lead_captured', name, email, niche, goal, source,
    timestamp: new Date().toISOString()
  }));

  return {
    statusCode:200,
    headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({success:true, message:'Lead captured', email})
  };
};