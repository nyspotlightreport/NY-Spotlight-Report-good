// Google Analytics + conversion tracking
// Netlify function for first-party analytics

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode:405};
  let data;
  try { data = JSON.parse(event.body); } catch { return {statusCode:400}; }
  
  const { event: evtName, page, source, email } = data;
  
  // Log to console for analysis
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: evtName,
    page, source, email: email ? email.split('@')[1] : null,
    ip_hash: require('crypto').createHash('md5').update(event.headers['x-forwarded-for']||'').digest('hex').slice(0,8)
  }));

  return {
    statusCode: 200,
    headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({ok:true})
  };
};