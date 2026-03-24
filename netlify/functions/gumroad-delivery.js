// gumroad-delivery.js — Zero-dependency version (uses Node built-ins only)
const https = require("https");

function sendEmail(to, subject, htmlBody) {
  // Use Gmail SMTP via fetch-style call — no nodemailer needed
  // For now, log the delivery (email sending requires SMTP credentials in env)
  console.log("Email queued:", { to, subject });
  return Promise.resolve({ success: true });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { email, product_name, download_url, buyer_name } = payload;

  if (!email) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "email required" }) };
  }

  // Log purchase (email delivery handled by Gumroad natively)
  console.log("Gumroad delivery:", { email, product_name, buyer_name });

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      success: true,
      message: "Purchase recorded",
      email,
      product: product_name
    })
  };
};
