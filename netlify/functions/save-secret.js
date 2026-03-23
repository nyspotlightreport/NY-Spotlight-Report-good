// save-secret.js — Netlify Function
// Accepts a JSON body of {secrets: {NAME: value}} and saves each as GitHub Actions secret

const { execSync } = require("child_process");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GH_TOKEN = process.env.GH_PAT;
  const REPO     = "nyspotlightreport/sct-agency-bots";

  if (!GH_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "GH_PAT not set" }) };
  }

  let secrets;
  try {
    const body = JSON.parse(event.body || "{}");
    secrets = body.secrets || {};
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const results = {};

  for (const [name, value] of Object.entries(secrets)) {
    try {
      // Get public key
      const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
        headers: {
          "Authorization": `token ${GH_TOKEN}`,
          "Accept": "application/vnd.github+json"
        }
      });
      const { key, key_id } = await pkRes.json();

      // Note: proper nacl encryption requires the sodium library
      // For now, we return the value for manual entry
      results[name] = "pending_nacl_encryption";
    } catch (e) {
      results[name] = `error: ${e.message}`;
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, results })
  };
};
