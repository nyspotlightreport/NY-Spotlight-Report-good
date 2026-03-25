// netlify/functions/stripe-webhook.js
// COMPLETE FULFILLMENT PIPELINE — Chairman Directive: Over-deliver
// Payment → Welcome Email (Resend) → Supabase Upsert → CRM → Alert
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ═══ PRICE ID → PLAN MAPPING ═══
const PRICE_TO_PLAN = {
  // Add your actual Stripe price IDs here as keys
  // Fallback logic also checks metadata.offer_key and amount
};

function resolvePlan(session) {
  const metadata = session.metadata || {};
  const priceId = session.line_items?.data?.[0]?.price?.id
    || metadata.price_id
    || '';
  const amount = (session.amount_total || 0) / 100;

  // 1. Check explicit price_id mapping
  if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];

  // 2. Check metadata.offer_key
  if (metadata.offer_key) {
    const byKey = {
      proflow_ai: 'starter',
      proflow_growth: 'growth',
      proflow_elite: 'agency',
      dfy_setup: 'dfy',
      dfy_agency: 'enterprise',
    };
    if (byKey[metadata.offer_key]) return byKey[metadata.offer_key];
  }

  // 3. Fallback: match by amount
  if (amount <= 97)   return 'starter';
  if (amount <= 297)  return 'growth';
  if (amount <= 497)  return 'agency';
  if (amount <= 4997) return 'enterprise';

  return 'starter'; // safe default
}

// ═══ OFFER DETAILS MAP ═══
const OFFERS = {
  starter:    { name:'ProFlow Starter',          price:'$97/mo',   offer_key:'proflow_ai',
    features: ['Daily SEO blog posts','Social media (3 platforms)','Digital product store','Affiliate link injection','Weekly KPI reports'],
    next_steps: 'Your AI content system is being configured now. Within 24 hours, daily blog posts will begin publishing to your WordPress site.',
    setup_link: 'https://nyspotlightreport.com/onboarding/' },
  growth:     { name:'ProFlow Growth',           price:'$297/mo',  offer_key:'proflow_growth',
    features: ['Everything in Starter','Beehiiv newsletter automation','YouTube Shorts daily','All 6 social platforms','Monthly strategy call'],
    next_steps: 'Your full Growth stack is being deployed. Newsletter, YouTube Shorts, and 6-platform social will be live within 48 hours.',
    setup_link: 'https://nyspotlightreport.com/onboarding/' },
  agency:     { name:'ProFlow Agency',           price:'$497/mo',  offer_key:'proflow_elite',
    features: ['Everything in Growth','KDP book factory','POD designs weekly','VPS passive income','White-label available','Priority support'],
    next_steps: 'Your Agency-tier automation is being built. KDP, Redbubble, and VPS income stacks deploy within 72 hours.',
    setup_link: 'https://nyspotlightreport.com/onboarding/' },
  dfy:        { name:'DFY Bot Setup',            price:'$1,497',   offer_key:'dfy_setup',
    features: ['Custom AI system built for you','All platforms connected','30 days of content loaded','Training session included'],
    next_steps: 'Sean will personally reach out within 4 hours to schedule your onboarding call.',
    setup_link: 'https://nyspotlightreport.com/onboarding/' },
  enterprise: { name:'DFY Agency Automation',    price:'$4,997',   offer_key:'dfy_agency',
    features: ['Full agency automation','Lead gen + content + delivery','Dedicated account manager','Monthly strategy calls','White-label ready'],
    next_steps: 'Your dedicated account manager will contact you within 2 hours. This is our premium service.',
    setup_link: 'https://nyspotlightreport.com/onboarding/' },
};

exports.handler = async (event) => {
  const WH_SECRET    = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPA_URL     = process.env.SUPABASE_URL;
  const SUPA_KEY     = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const GH_PAT       = process.env.GH_PAT;
  const PUSH_API     = process.env.PUSHOVER_API_KEY;
  const PUSH_USER    = process.env.PUSHOVER_USER_KEY;
  const HS_KEY       = process.env.HUBSPOT_API_KEY;
  const REPO         = 'nyspotlightreport/sct-agency-bots';

  // ═══ SIGNATURE VERIFICATION ═══
  let stripeEvent;
  if (WH_SECRET) {
    const sig = event.headers['stripe-signature'];
    if (!sig) return { statusCode: 400, body: 'Missing stripe-signature header' };
    try {
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, WH_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return { statusCode: 400, body: `Signature verification failed: ${err.message}` };
    }
  } else {
    try { stripeEvent = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: 'Invalid JSON' }; }
  }

  const eventType = stripeEvent.type || '';
  console.log(`Stripe webhook: ${eventType}`);

  if (!['checkout.session.completed','payment_intent.succeeded'].includes(eventType)) {
    return { statusCode: 200, body: JSON.stringify({ received: true, type: eventType }) };
  }

  const session = stripeEvent.data?.object || {};
  const email   = session.customer_details?.email || session.customer_email || session.receipt_email || '';
  const name    = session.customer_details?.name || '';
  const amount  = (session.amount_total || 0) / 100;
  const stripeSessionId = session.id || '';
  const metadata = session.metadata || {};

  // Resolve plan level dynamically (not hardcoded)
  const plan_level = resolvePlan(session);
  const offer = OFFERS[plan_level] || OFFERS.starter;
  const offer_key = offer.offer_key || metadata.offer_key || 'proflow_ai';
  const firstName = name ? name.split(' ')[0] : email.split('@')[0];
  const results = { email, plan_level, amount, processed: [] };

  // ═══ 1. SEND WELCOME EMAIL VIA RESEND (not Gmail SMTP) ═══
  if (RESEND_KEY && email) {
    try {
      const featureList = offer.features.map(f =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #1a1f2e"><span style="color:#22c55e;margin-right:8px">&#10003;</span> ${f}</td></tr>`
      ).join('');

      const htmlEmail = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#060a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="text-align:center;padding:30px 0">
    <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:2px">NY SPOTLIGHT REPORT</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;letter-spacing:1px">AI-POWERED CONTENT & GROWTH</div>
  </div>
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(34,197,94,0.3);border-radius:16px;padding:40px;margin-bottom:20px">
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#22c55e;font-size:24px;margin:0 0 8px">Welcome to ${offer.name}, ${firstName}!</h1>
      <p style="color:#94a3b8;font-size:15px;margin:0">Your payment of <strong style="color:#fff">$${amount}</strong> has been confirmed.</p>
    </div>
    <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:10px;padding:16px;margin:20px 0">
      <div style="font-size:13px;font-weight:600;color:#22c55e;margin-bottom:6px">WHAT HAPPENS NEXT</div>
      <div style="font-size:14px;color:#e2e8f0;line-height:1.6">${offer.next_steps}</div>
    </div>
    <div style="margin:20px 0"><div style="font-size:13px;font-weight:600;color:#C9A84C;margin-bottom:8px;letter-spacing:0.5px">YOUR ${offer.name.toUpperCase()} INCLUDES:</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#cbd5e1">${featureList}</table>
    </div>
    <div style="text-align:center;margin:28px 0">
      <a href="${offer.setup_link}" style="display:inline-block;background:#C9A84C;color:#060a0f;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">Complete Your Setup &rarr;</a>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px;margin-top:16px">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">NEED HELP?</div>
      <div style="font-size:13px;color:#94a3b8">Reply to this email or contact <a href="mailto:nyspotlightreport@gmail.com" style="color:#C9A84C">nyspotlightreport@gmail.com</a> &mdash; we respond within 4 hours.</div>
    </div>
  </div>
  <div style="text-align:center;padding:20px;font-size:11px;color:#475569">
    <div>NY Spotlight Report &middot; Coram, NY &middot; <a href="https://nyspotlightreport.com" style="color:#64748b">nyspotlightreport.com</a></div>
    <div style="margin-top:4px">You're receiving this because you purchased ${offer.name}.</div>
  </div>
</div></body></html>`;

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'NY Spotlight Report <onboarding@nyspotlightreport.com>',
          to: [email],
          subject: `Welcome to ProFlow ${plan_level.charAt(0).toUpperCase() + plan_level.slice(1)}!`,
          html: htmlEmail,
          reply_to: 'nyspotlightreport@gmail.com',
        }),
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        // If domain not verified, retry with resend.dev sender
        if (errBody.includes('not verified') || errBody.includes('domain')) {
          console.warn('Domain not verified, retrying with onboarding@resend.dev');
          const retryRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'NY Spotlight Report <onboarding@resend.dev>',
              to: [email],
              subject: `Welcome to ProFlow ${plan_level.charAt(0).toUpperCase() + plan_level.slice(1)}!`,
              html: htmlEmail,
              reply_to: 'nyspotlightreport@gmail.com',
            }),
          });
          if (retryRes.ok) {
            results.processed.push('welcome_email_sent_resend_dev');
            console.log(`Welcome email sent via resend.dev to ${email}`);
          } else {
            const retryErr = await retryRes.text();
            throw new Error(`Resend retry failed: ${retryErr}`);
          }
        } else {
          throw new Error(`Resend API error: ${errBody}`);
        }
      } else {
        results.processed.push('welcome_email_sent');
        console.log(`Welcome email sent via Resend to ${email}`);
      }
    } catch(e) {
      console.error('Email error:', e.message);
      results.email_error = e.message;
    }
  }

  // ═══ 2. SUPABASE — Upsert contact with plan_level, amount_paid, stripe_session_id ═══
  if (SUPA_URL && SUPA_KEY) {
    try {
      const contactPayload = {
        email,
        name: name || undefined,
        plan_level,
        amount_paid: amount,
        stripe_session_id: stripeSessionId,
        stage: 'CLOSED_WON',
        score: 100,
        source: `stripe_${offer_key}`,
        tags: ['paying_customer', offer_key, plan_level],
        last_activity: new Date().toISOString(),
      };

      // Upsert: use Supabase's on-conflict with email
      const upsertRes = await fetch(
        `${SUPA_URL}/rest/v1/contacts`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${SUPA_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({ ...contactPayload, created_at: new Date().toISOString() }),
        }
      );

      if (upsertRes.ok || upsertRes.status === 201 || upsertRes.status === 200) {
        results.processed.push('supabase_upserted');
      } else {
        // Fallback: try find-then-update/insert
        const findRes = await fetch(
          `${SUPA_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(email)}&select=id`,
          { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
        );
        const existing = await findRes.json();
        if (existing?.[0]?.id) {
          await fetch(`${SUPA_URL}/rest/v1/contacts?id=eq.${existing[0].id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_level, amount_paid: amount, stripe_session_id: stripeSessionId, stage:'CLOSED_WON', score:100, tags:['paying_customer',offer_key,plan_level], last_activity:new Date().toISOString() })
          });
          results.processed.push('supabase_updated');
        } else {
          await fetch(`${SUPA_URL}/rest/v1/contacts`, {
            method: 'POST',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(contactPayload)
          });
          results.processed.push('supabase_created');
        }
      }

      // Log payment
      await fetch(`${SUPA_URL}/rest/v1/conversation_log`, {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ channel:'stripe', direction:'inbound', body:`Payment $${amount} — ${plan_level} — ${email}`, intent:'payment_received', agent_name:'Stripe Webhook' })
      });
    } catch(e) { console.error('Supabase error:', e.message); }
  }

  // ═══ 3. HUBSPOT — Mark as customer ═══
  if (HS_KEY && email) {
    try {
      const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method:'POST', headers:{'Authorization':`Bearer ${HS_KEY}`,'Content-Type':'application/json'},
        body: JSON.stringify({filterGroups:[{filters:[{propertyName:'email',operator:'EQ',value:email}]}]})
      });
      const data = await res.json();
      const hsId = data.results?.[0]?.id;
      if (hsId) {
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${hsId}`, {
          method:'PATCH', headers:{'Authorization':`Bearer ${HS_KEY}`,'Content-Type':'application/json'},
          body: JSON.stringify({properties:{lifecyclestage:'customer',hs_lead_status:'IN_PROGRESS'}})
        });
        results.processed.push('hubspot_updated');
      }
    } catch(e) {}
  }

  // ═══ 4. TRIGGER ONBOARDING WORKFLOW ═══
  if (GH_PAT) {
    try {
      await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/master_sales_engine.yml/dispatches`, {
        method:'POST', headers:{'Authorization':`token ${GH_PAT}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},
        body: JSON.stringify({ref:'main'})
      });
      results.processed.push('onboarding_triggered');
    } catch(e) {}
  }

  // ═══ 5. PUSHOVER — Instant alert to Chairman ═══
  if (PUSH_API && PUSH_USER) {
    try {
      await fetch('https://api.pushover.net/1/messages.json', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          token: PUSH_API,
          user: PUSH_USER,
          priority: 1,
          sound: 'cashregister',
          title: `NEW SALE: ${plan_level.toUpperCase()}`,
          message: `\u{1F4B0} NEW SALE: ${plan_level} $${amount} from ${email}\nPlan: ${offer.name} (${offer.price})\nEmail sent: ${results.processed.some(p => p.startsWith('welcome_email')) ? 'YES' : 'FAILED'}\nProcessed: ${results.processed.join(', ')}`
        })
      });
      results.processed.push('pushover_sent');
    } catch(e) {}
  }

  console.log('Fulfillment complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ received: true, ...results }) };
};
