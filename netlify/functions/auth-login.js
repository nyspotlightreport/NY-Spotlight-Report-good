const bcrypt = require("bcryptjs");
const { signToken } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { isValidEmail, parseBody } = require("./_shared/utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!isValidEmail(email)) return error("Invalid email", 400);
  if (!password || password.length < 4) return error("Password required", 400);

  // Admin login: compare against hashed password in env
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || "";

  if (!ADMIN_EMAIL || !ADMIN_HASH) {
    console.error("Auth config missing: ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set");
    return error("Server configuration error", 500);
  }

  if (email === ADMIN_EMAIL) {
    const valid = await bcrypt.compare(password, ADMIN_HASH);
    if (!valid) return error("Invalid credentials", 401);

    const token = signToken({
      email,
      name: "S.C. Thomas",
      plan: "agency",
      role: "chairman",
    });

    return success({ token, email, name: "S.C. Thomas", plan: "agency", role: "chairman" });
  }

  // Non-admin: reject unknown users (no open registration)
  return error("Invalid credentials", 401);
};
