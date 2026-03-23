// netlify/functions/stripe-webhook.js
// COMPLETE FULFILLMENT PIPELINE — Chairman Directive: Over-deliver
// Payment → Welcome Email → Onboarding Sequence → Access → CRM → Alert
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const STRIPE_SK  = process.env.STRIPE_SECRET_KEY;
  const SUPA_URL   = process.env.SUPABASE_URL;
  const SUPA_KEY   = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const GH_PAT     = process.env.GH_PAT;
  const PUSH_API   = process.env.PUSHOVER_API_KEY;
  const PUSH_USER  = process.env.PUSHOVER_USER_KEY;
  const HS_KEY     = process.env.HUBSPOT_API_KEY;
  const SMTP_USER  = process.env.SMTP_USER || 'nyspotlightreport@gmail.com';
  const SMTP_PASS  = process.env.GMAIL_APP_PASS;
  const REPO       = 'nyspotlightreport/sct-agency-bots';

  let stripeEvent;
  try { stripeEvent = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const eventType = stripeEvent.type || '';
  console.log(`Stripe webhook: ${eventType}`);

  if (!['checkout.session.completed','payment_intent.succeeded'].includes(eventType)) {
    return { statusCode: 200, body: JSON.stringify({ received: true, type: eventType }) };
  }

  const session = stripeEvent.data?.object || {};
  const email = session.customer_details?.email || session.receipt_email || '';
  const name  = session.customer_details?.name || '';
  const amount = (session.amount_total || 0) / 100;
  const metadata = session.metadata || {};
  const offer_key = metadata.offer_key || 'proflow_ai';
  const firstName = name ? name.split(' ')[0] : email.split('@')[0];
  const results = { email, offer_key, amount, processed: [] };

  // ═══ OFFER DETAILS MAP ═══
  const OFFERS = {
    proflow_ai: { name:'ProFlow AI Starter', price:'$97/mo', tier:'starter',
      features: ['Daily SEO blog posts','Social media (3 platforms)','Digital product store','Affiliate link injection','Weekly KPI reports'],
      next_steps: 'Your AI content system is being configured now. Within 24 hours, daily blog posts will begin publishing to your WordPress site.',
      setup_link: 'https://nyspotlightreport.com/activate/' },
    proflow_growth: { name:'ProFlow AI Growth', price:'$297/mo', tier:'growth',
      features: ['Everything in Starter','Beehiiv newsletter automation','YouTube Shorts daily','All 6 social platforms','Monthly strategy call'],
      next_steps: 'Your full Growth stack is being deployed. Newsletter, YouTube Shorts, and 6-platform social will be live within 48 hours.',
      setup_link: 'https://nyspotlightreport.com/activate/' },
    proflow_elite: { name:'ProFlow AI Agency', price:'$497/mo', tier:'agency',
      features: ['Everything in Growth','KDP book factory','POD designs weekly','VPS passive income','White-label available','Priority support'],
      next_steps: 'Your Agency-tier automation is being built. KDP, Redbubble, and VPS income stacks deploy within 72 hours.',
      setup_link: 'https://nyspotlightreport.com/activate/' },
    dfy_setup: { name:'DFY Bot Setup', price:'$1,497', tier:'dfy',
      features: ['Custom AI system built for you','All platforms connected','30 days of content loaded','Training session included'],
      next_steps: 'Sean will personally reach out within 4 hours to schedule your onboarding call.',
      setup_link: 'https://nyspotlightreport.com/activate/' },
    dfy_agency: { name:'DFY Agency Automation', price:'$4,997', tier:'enterprise',
      features: ['Full agency automation','Lead gen + content + delivery','Dedicated account manager','Monthly strategy calls','White-label ready'],
      next_steps: 'Your dedicated account manager will contact you within 2 hours. This is our premium service.',
      setup_link: 'https://nyspotlightreport.com/activate/' },
  };
  const offer = OFFERS[offer_key] || OFFERS.proflow_ai;

  // ═══ 1. SEND WELCOME EMAIL (CRITICAL — THIS WAS MISSING) ═══
  if (SMTP_PASS && email) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      });
      const featureList = offer.features.map(f => `<tr><td style="padding:8px 12px;border-bottom:1px solid #1a1f2e"><span style="color:#22c55e;margin-right:8px">✓</span> ${f}</td></tr>`).join('');
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
      <div style="font-size:48px;margin-bottom:12px">🎉</div>
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
      <a href="${offer.setup_link}" style="display:inline-block;background:#C9A84C;color:#060a0f;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">Complete Your Setup →</a>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px;margin-top:16px">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">NEED HELP?</div>
      <div style="font-size:13px;color:#94a3b8">Reply to this email or contact <a href="mailto:nyspotlightreport@gmail.com" style="color:#C9A84C">nyspotlightreport@gmail.com</a> — we respond within 4 hours.</div>
    </div>
  </div>
  <div style="text-align:center;padding:20px;font-size:11px;color:#475569">
    <div>NY Spotlight Report · Coram, NY · <a href="https://nyspotlightreport.com" style="color:#64748b">nyspotlightreport.com</a></div>
    <div style="margin-top:4px">You're receiving this because you purchased ${offer.name}.</div>
  </div>
</div></body></html>`;
      await transporter.sendMail({
        from: '"NY Spotlight Report" <nyspotlightreport@gmail.com>',
        to: email,
        subject: `Welcome to ${offer.name}! Your setup is underway 🚀`,
        html: htmlEmail,
        replyTo: 'nyspotlightreport@gmail.com'
      });
      results.processed.push('welcome_email_sent');
      console.log(`Welcome email sent to ${email}`);
    } catch(e) {
      console.error('Email error:', e.message);
      results.email_error = e.message;
    }
  }

  // ═══ 2. SUPABASE — Create/update contact as CLOSED_WON ═══
  if (SUPA_URL && SUPA_KEY) {
    try {
      const findRes = await fetch(
        `${SUPA_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(email)}&select=id`,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
      const existing = await findRes.json();
      if (existing?.[0]?.id) {
        await fetch(`${SUPA_URL}/rest/v1/contacts?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage:'CLOSED_WON', score:100, tags:['paying_customer',offer_key], last_activity:new Date().toISOString() })
        });
        results.processed.push('supabase_updated');
      } else {
        await fetch(`${SUPA_URL}/rest/v1/contacts`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ email, name, stage:'CLOSED_WON', score:100, source:`stripe_${offer_key}`, tags:['paying_customer',offer_key], created_at:new Date().toISOString() })
        });
        results.processed.push('supabase_created');
      }
      // Log payment
      await fetch(`${SUPA_URL}/rest/v1/conversation_log`, {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ channel:'stripe', direction:'inbound', body:`Payment $${amount} — ${offer_key} — ${email}`, intent:'payment_received', agent_name:'Stripe Webhook' })
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
      const labels = { proflow_ai:'ProFlow AI $97/mo', proflow_growth:'Growth $297/mo',
        proflow_elite:'Agency $497/mo', dfy_setup:'DFY Setup $1,497', dfy_agency:'DFY Agency $4,997' };
      await fetch('https://api.pushover.net/1/messages.json', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          token:PUSH_API, user:PUSH_USER, priority:1, sound:'cashregister',
          title: `💰 SALE: $${amount}`,
          message: `${name || email}\n${labels[offer_key]||offer_key}\nAmount: $${amount}\nEmail sent: ${results.processed.includes('welcome_email_sent')?'YES':'FAILED'}\nProcessed: ${results.processed.join(', ')}`
        })
      });
      results.processed.push('pushover_sent');
    } catch(e) {}
  }

  console.log('Fulfillment complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ received: true, ...results }) };
};
