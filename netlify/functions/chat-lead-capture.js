// Chat Lead Capture — receives visitor data from Tawk.to webhook
// When a chat ends, pushes contact to Supabase + sends Pushover alert
// Zero cost. Captures leads that would have bounced.

exports.handler = async (event, context) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "Method not allowed" };

  async function supabase(method, table, data, query = "") {
    const url = `${process.env.SUPABASE_URL}/rest/v1/${table}${query}`;
    const resp = await fetch(url, {
      method,
      headers: {
        "apikey": process.env.SUPABASE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: data ? JSON.stringify(data) : undefined
    });
    return resp.ok ? resp.json().catch(() => ({})) : null;
  }

  async function pushover(title, message) {
    if (!process.env.PUSHOVER_API_KEY || !process.env.PUSHOVER_USER_KEY) return;
    const body = new URLSearchParams({ token: process.env.PUSHOVER_API_KEY, user: process.env.PUSHOVER_USER_KEY, title, message });
    await fetch("https://api.pushover.net/1/messages.json", { method: "POST", body }).catch(() => {});
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { name = "", email = "", message = "", page = "", timestamp = new Date().toISOString() } = body;

    if (!email && !name) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "No contact info" }) };

    // Save to Supabase contacts
    const contact = await supabase("POST", "contacts", {
      name:        name || "Chat Lead",
      email:       email || null,
      stage:       "LEAD",
      source:      "live_chat",
      notes:       `Chat message: ${message.slice(0,500)}\nPage: ${page}`,
      score:       45,
      grade:       "C",
      icp:         "unknown",
      created_at:  timestamp,
    });

    // Send immediate Pushover alert so Chairman can respond fast
    const contactId = contact?.[0]?.id || "";
    await pushover(
      "🔥 Live Chat Lead!",
      `New chat from: ${name || "anonymous"}\nEmail: ${email || "none"}\nPage: ${page}\nMessage: ${message.slice(0,200)}`
    );

    // Also log as CRM activity
    if (contactId) {
      await supabase("POST", "activities", {
        contact_id: contactId,
        type: "live_chat",
        subject: "Website live chat",
        body: message.slice(0,1000),
        created_at: timestamp,
      });
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, contact_id: contactId, message: "Lead captured!" })
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
