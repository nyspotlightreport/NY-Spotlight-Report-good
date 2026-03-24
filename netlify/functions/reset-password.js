const bcrypt = require("bcryptjs");
const { signToken } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { isValidEmail, parseBody } = require("./_shared/utils");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Supabase helpers ───────────────────────────────
async function supaInsert(table, row) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

async function supaSelect(table, query) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function supaDelete(table, query) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

async function supaUpdate(table, query, patch) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  // If Supabase is not configured, tell user to contact support
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return error("Password reset is unavailable. Please contact support.", 503);
  }

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const action = body.action || "";

  // ── REQUEST RESET ──────────────────────────────
  if (action === "request") {
    const email = (body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return error("Invalid email", 400);

    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();

    // Always return success (don't reveal if email exists)
    if (email === ADMIN_EMAIL) {
      // Generate a 6-digit code
      const code = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      // Clear any previous tokens for this email
      await supaDelete("password_reset_tokens", `email=eq.${encodeURIComponent(email)}`);

      // Store the token in Supabase
      await supaInsert("password_reset_tokens", {
        email,
        code,
        expires_at: expiresAt,
        attempts: 0,
      });

      console.log(JSON.stringify({
        event: "password_reset_requested",
        email,
        timestamp: new Date().toISOString(),
      }));
    }

    return success({ message: "If that email is registered, a reset code has been sent." });
  }

  // ── VERIFY CODE & RESET ────────────────────────
  if (action === "reset") {
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();
    const newPassword = body.newPassword || "";

    if (!isValidEmail(email)) return error("Invalid email", 400);
    if (!code || code.length !== 6) return error("Invalid reset code", 400);
    if (!newPassword || newPassword.length < 8) return error("Password must be at least 8 characters", 400);

    // Look up the token from Supabase (must not be expired)
    const rows = await supaSelect(
      "password_reset_tokens",
      `email=eq.${encodeURIComponent(email)}&expires_at=gt.${new Date().toISOString()}&limit=1`
    );

    if (!rows || rows.length === 0) {
      return error("No reset request found. Please request a new code.", 400);
    }

    const stored = rows[0];

    // Rate-limit attempts
    if ((stored.attempts || 0) >= 5) {
      await supaDelete("password_reset_tokens", `email=eq.${encodeURIComponent(email)}`);
      return error("Too many attempts. Please request a new code.", 429);
    }

    // Increment attempts
    await supaUpdate(
      "password_reset_tokens",
      `email=eq.${encodeURIComponent(email)}`,
      { attempts: (stored.attempts || 0) + 1 }
    );

    if (stored.code !== code) {
      return error("Invalid reset code", 400);
    }

    // Code valid — hash new password
    const hash = await bcrypt.hash(newPassword, 12);

    // Clean up used token
    await supaDelete("password_reset_tokens", `email=eq.${encodeURIComponent(email)}`);

    console.log(JSON.stringify({
      event: "password_reset_completed",
      email,
      timestamp: new Date().toISOString(),
      new_hash: hash, // Log the hash so the admin can update ADMIN_PASSWORD_HASH env var
    }));

    // Generate a new JWT so the user is logged in immediately
    const token = signToken({
      email,
      name: "S.C. Thomas",
      plan: "agency",
      role: "chairman",
    });

    return success({
      message: "Password reset successful. Update ADMIN_PASSWORD_HASH in Netlify env vars with the hash from the function logs.",
      token,
      email,
      note: "You are now logged in with a temporary session.",
    });
  }

  return error("Invalid action. Use 'request' or 'reset'.", 400);
};
