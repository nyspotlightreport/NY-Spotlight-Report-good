exports.handler = async (event) => {
  const KEY = process.env.ANTHROPIC_API_KEY || "";
  if (!KEY) return { statusCode:200, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"},
    body: JSON.stringify({error:"No key"}) };

  // Try ONE call and get full response
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"x-api-key":KEY,"anthropic-version":"2023-06-01","Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:10,messages:[{role:"user",content:"Hi"}]}),
    signal:AbortSignal.timeout(10000)
  });
  const body = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(body); } catch {}
  
  return {
    statusCode:200,
    headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"},
    body: JSON.stringify({
      http_status: res.status,
      full_error: parsed?.error || null,
      full_body: body.substring(0,400),
      key_prefix: KEY.substring(0,12)+"...",
      key_length: KEY.length
    })
  };
};
