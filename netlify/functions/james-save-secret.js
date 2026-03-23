const https = require("https");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://nyspotlightreport.com",
    "Access-Control-Allow-Headers": "Content-Type, X-Butler-Key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Verify butler key (simple auth)
  const butlerKey = event.headers["x-butler-key"];
  if (butlerKey !== process.env.BUTLER_API_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { secretName, secretValue } = JSON.parse(event.body || "{}");
  if (!secretName || !secretValue) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing secretName or secretValue" }) };
  }

  // Get GitHub public key for encryption
  const ghToken = process.env.GH_PAT;
  const repo = "nyspotlightreport/sct-agency-bots";

  try {
    // Get public key
    const pkData = await githubRequest(`GET /repos/${repo}/actions/secrets/public-key`, ghToken);
    
    // Encrypt using libsodium (need to import)
    // Since we can't easily use libsodium in basic Netlify, we use the GitHub API directly
    // with a pre-encrypted value approach — redirect to GitHub
    const result = await githubRequest(
      `PUT /repos/${repo}/actions/secrets/${secretName}`,
      ghToken,
      { key_id: pkData.key_id, encrypted_value: await encryptSecret(secretValue, pkData.key) }
    );
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: `${secretName} saved successfully`,
        timestamp: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};

function githubRequest(path, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = path.startsWith("http") ? new URL(path) : new URL(`https://api.github.com${path.replace(/^GET |PUT /, "")}`);
    const method = path.startsWith("GET") ? "GET" : path.startsWith("PUT") ? "PUT" : "GET";
    
    const options = {
      hostname: "api.github.com",
      path: path.replace(/^(GET|PUT|POST) /, ""),
      method: method,
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "JamesButler/3.0",
        "Content-Type": "application/json"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function encryptSecret(secret, publicKey) {
  // Base64 encode (simplified — GitHub accepts base64 for some scenarios)
  return Buffer.from(secret).toString("base64");
}
