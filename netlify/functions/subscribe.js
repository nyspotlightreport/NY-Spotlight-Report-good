const { cors, success, error } = require("./_shared/response");
const { isValidEmail, sanitizeString, parseBody } = require("./_shared/utils");
const { checkRateLimit, getClientIP } = require("./_shared/rate-limit");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  const ip = getClientIP(event);
  const { allowed, retryAfterMs } = checkRateLimit(`subscribe:${ip}`, 5, 60000);
  if (!allowed) {
    return {
      statusCode: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      body: JSON.stringify({ error: "Too many requests. Please try again later." }),
    };
  }

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const email = (body.email || "").trim().toLowerCase();
  const source = sanitizeString(body.source || "website", 200);

  if (!isValidEmail(email)) {
    return error("Invalid email", 400);
  }

  const results = {};

  // 1. Store subscriber in Supabase sweepstakes_entries table
  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/sweepstakes_entries`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          email,
          source,
          created_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (sbRes.ok) {
        results.supabase = "stored";
      } else if (sbRes.status === 409) {
        results.supabase = "already_exists";
      } else {
        const sbBody = await sbRes.text();
        console.warn("Supabase error " + sbRes.status + ": " + sbBody.substring(0, 200));
        results.supabase = "http_" + sbRes.status;
      }
    } catch (e) {
      console.error("Supabase request failed:", e.message);
      results.supabase = "error";
    }
  } else {
    results.supabase = "no_key";
  }

  // 2. Send immediate welcome email via Resend
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_dHFXQFGG_Gky3WhtFnqPyCYybRPdekmid";

  if (RESEND_API_KEY) {
    try {
      const welcomeHTML = buildWelcomeEmail();
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "S.C. Thomas <outreach@mail.nyspotlightreport.com>",
          to: [email],
          subject: "Welcome to NY Spotlight Report \u2014 your NYC guide is here",
          html: welcomeHTML,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (emailRes.ok) {
        results.welcome_email = "sent";
      } else {
        const emailBody = await emailRes.text();
        console.warn("Resend error " + emailRes.status + ": " + emailBody.substring(0, 200));
        results.welcome_email = "http_" + emailRes.status;
      }
    } catch (e) {
      console.error("Resend request failed:", e.message);
      results.welcome_email = "error";
    }
  } else {
    results.welcome_email = "no_key";
  }

  console.log(
    JSON.stringify({
      event: "subscribe",
      email,
      source,
      supabase: results.supabase,
      welcome_email: results.welcome_email,
      timestamp: new Date().toISOString(),
    })
  );

  return success({ success: true, email, results });
};

function buildWelcomeEmail() {
  var h = [];
  h.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>');
  h.push('<body style="margin:0;padding:0;background:#f5f3ee;font-family:Georgia,serif;">');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;">');
  h.push('<tr><td align="center" style="padding:2rem 1rem;">');
  h.push('<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">');

  // Header
  h.push('<tr><td style="background:#1a1a1a;padding:1.5rem 2rem;text-align:center;">');
  h.push('<a href="https://nyspotlightreport.com" style="color:#c9a84c;text-decoration:none;font-size:1.4rem;font-weight:bold;letter-spacing:0.5px;">NY Spotlight Report</a>');
  h.push('</td></tr>');

  // Welcome message
  h.push('<tr><td style="padding:2.5rem 2rem 1rem;">');
  h.push('<h1 style="font-size:1.6rem;color:#1a1a1a;margin:0 0 1rem;font-weight:normal;">Welcome to the Spotlight</h1>');
  h.push('<p style="font-size:1rem;color:#333;line-height:1.7;margin:0 0 1rem;">You just joined a growing community of New Yorkers who want the real story &#8212; the culture, the nightlife, the deals, and the trends shaping this city right now.</p>');
  h.push('<p style="font-size:1rem;color:#333;line-height:1.7;margin:0 0 1.5rem;">I started NY Spotlight Report because New York deserves coverage that&#8217;s honest, local, and useful. Every issue is written to help you live smarter in the city that never stops moving.</p>');
  h.push('<p style="font-size:0.95rem;color:#555;margin:0;">&#8212; S.C. Thomas, Editor-in-Chief</p>');
  h.push('</td></tr>');

  // Divider
  h.push('<tr><td style="padding:0 2rem;"><hr style="border:none;border-top:1px solid #e5e1d8;margin:1.5rem 0;"></td></tr>');

  // Top Articles
  h.push('<tr><td style="padding:0 2rem 1.5rem;">');
  h.push('<h2 style="font-size:1.15rem;color:#1a1a1a;margin:0 0 1rem;font-weight:bold;">Start Here &#8212; Top Reads</h2>');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0">');

  h.push('<tr><td style="padding:0.6rem 0;border-bottom:1px solid #f0ece3;">');
  h.push('<a href="https://nyspotlightreport.com/nightlife/" style="color:#1a56db;text-decoration:none;font-size:0.95rem;font-weight:bold;">Hell&#8217;s Kitchen After Dark: NYC Nightlife Guide</a>');
  h.push('<p style="font-size:0.85rem;color:#777;margin:0.25rem 0 0;">The bars, clubs, and late-night spots locals actually go to.</p>');
  h.push('</td></tr>');

  h.push('<tr><td style="padding:0.6rem 0;border-bottom:1px solid #f0ece3;">');
  h.push('<a href="https://nyspotlightreport.com/entertainment/" style="color:#1a56db;text-decoration:none;font-size:0.95rem;font-weight:bold;">Oscars 2026: NYC&#8217;s Award Season Coverage</a>');
  h.push('<p style="font-size:0.85rem;color:#777;margin:0.25rem 0 0;">Our picks, predictions, and local screening events.</p>');
  h.push('</td></tr>');

  h.push('<tr><td style="padding:0.6rem 0;">');
  h.push('<a href="https://nyspotlightreport.com/culture/" style="color:#1a56db;text-decoration:none;font-size:0.95rem;font-weight:bold;">Tony Awards 2026 Preview: Broadway&#8217;s Biggest Night</a>');
  h.push('<p style="font-size:0.85rem;color:#777;margin:0.25rem 0 0;">What to watch and which shows are leading the race.</p>');
  h.push('</td></tr>');

  h.push('</table></td></tr>');

  // Free Guide CTA
  h.push('<tr><td style="padding:0 2rem 1.5rem;">');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3;border-radius:8px;border:1px solid #e5e1d8;">');
  h.push('<tr><td style="padding:1.5rem;text-align:center;">');
  h.push('<p style="font-size:1rem;color:#1a1a1a;font-weight:bold;margin:0 0 0.5rem;">Your Free NYC Insider Guide</p>');
  h.push('<p style="font-size:0.9rem;color:#555;margin:0 0 1rem;">Download your complimentary guide to living smarter in New York.</p>');
  h.push('<a href="https://nyspotlightreport.com/free-guide/" style="display:inline-block;background:#c9a84c;color:#fff;text-decoration:none;padding:0.65rem 1.75rem;border-radius:6px;font-size:0.9rem;font-weight:bold;">Download Now</a>');
  h.push('</td></tr></table></td></tr>');

  // Tip Submission CTA
  h.push('<tr><td style="padding:0 2rem 2rem;">');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;">');
  h.push('<tr><td style="padding:1.25rem 1.5rem;text-align:center;">');
  h.push('<p style="font-size:0.95rem;color:#c9a84c;font-weight:bold;margin:0 0 0.4rem;">Got a story tip?</p>');
  h.push('<p style="font-size:0.85rem;color:#ccc;margin:0;">Send it to <a href="mailto:tips@nyspotlightreport.com" style="color:#c9a84c;text-decoration:underline;">tips@nyspotlightreport.com</a> &#8212; we read everything.</p>');
  h.push('</td></tr></table></td></tr>');

  // Footer
  h.push('<tr><td style="background:#f5f3ee;padding:1.5rem 2rem;text-align:center;border-top:1px solid #e5e1d8;">');
  h.push('<p style="font-size:0.8rem;color:#999;margin:0 0 0.25rem;">&#169; 2026 NY Spotlight Report &#8226; ISSN 2026-0147</p>');
  h.push('<p style="font-size:0.8rem;color:#999;margin:0 0 0.25rem;"><a href="mailto:tips@nyspotlightreport.com" style="color:#999;text-decoration:none;">tips@nyspotlightreport.com</a> &#8226; (929) 488-4295</p>');
  h.push('<p style="font-size:0.75rem;color:#bbb;margin:0.5rem 0 0;">You received this because you subscribed at nyspotlightreport.com</p>');
  h.push('</td></tr>');

  h.push('</table></td></tr></table></body></html>');
  return h.join("\n");
}
