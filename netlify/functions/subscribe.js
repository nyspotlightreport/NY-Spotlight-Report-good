exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS"}, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}, body: JSON.stringify({error:"Method not allowed"}) };
  }

  const HEADERS = {"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type"};

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch(e) {}
  const email = (body.email || "").trim().toLowerCase();
  const name  = (body.name  || "").trim();

  if (!email || !email.includes("@")) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({error:"Invalid email"}) };
  }

  const results = {};

  // HubSpot CRM — add as contact
  const HS_KEY = process.env.HUBSPOT_API_KEY || "";
  if (HS_KEY) {
    try {
      const nameParts = name.split(" ");
      const hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${HS_KEY}`, 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          properties: {
            email,
            firstname: nameParts[0] || "",
            lastname:  nameParts.slice(1).join(" ") || "",
            lifecyclestage: "subscriber"
          }
        }),
        signal: AbortSignal.timeout(8000)
      });
      
      const hsBody = await hsRes.text();
      console.log(`HubSpot status: ${hsRes.status}`);
      console.log(`HubSpot body: ${hsBody.substring(0,200)}`);
      
      if (hsRes.status === 201 || hsRes.status === 200) {
        results.hubspot = "added";
      } else if (hsRes.status === 409) {
        results.hubspot = "already_exists";  // Contact already exists
      } else {
        results.hubspot = `http_${hsRes.status}`;
        // Try to extract error
        try {
          const err = JSON.parse(hsBody);
          results.hubspot_msg = err.message || err.error || hsBody.substring(0,80);
        } catch(e) { results.hubspot_msg = hsBody.substring(0,80); }
      }
    } catch(e) { 
      results.hubspot = "error";
      results.hubspot_msg = e.message;
    }
  } else {
    results.hubspot = "no_key";
  }

  console.log(`📧 SUBSCRIBE: ${email} | name: "${name}" | hs: ${results.hubspot}`);

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ success: true, email, results })
  };
};
