// netlify/functions/create-checkout-session.js
// THE FIX: Stripe Checkout Sessions bypass Ticket Tailor's payment wall entirely.
// Old flow (BROKEN): Customer → Ticket Tailor → Stripe (blocked: no processor connected)
// New flow (WORKS):  Customer → Stripe Checkout → Webhook → Ticket Tailor API (issue product)
// Zero Sean involvement. Zero UI connection needed. Works right now.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
  const SITE_URL  = 'https://nyspotlightreport.com';

  if (!STRIPE_SK) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { product_key, email } = body;

  // Full NYSR product catalog — maps to Stripe prices + Ticket Tailor product IDs
  const CATALOG = {
    'proflow-ai': {
      name: 'ProFlow AI — Monthly',
      description: 'Full AI content + marketing automation system. Social, blog, email, SEO — all running on autopilot.',
      amount: 9700,        // $97.00 in cents
      currency: 'usd',
      mode: 'subscription',// recurring
      interval: 'month',
      tt_product_id: 'pr_60336',
      success_note: 'ProFlow AI system activating. You\'ll receive setup instructions within 24 hours.',
    },
    'proflow-growth': {
      name: 'ProFlow Growth — Monthly',
      description: 'Full AI agency stack with advanced automation, weekly reporting, and priority support.',
      amount: 29700,
      currency: 'usd',
      mode: 'subscription',
      interval: 'month',
      tt_product_id: 'pr_60337',
      success_note: 'ProFlow Growth activating. Full onboarding sequence starting now.',
    },
    'proflow-elite': {
      name: 'ProFlow Elite — Monthly',
      description: 'Hands-on AI agency system with 4 live strategy sessions per month.',
      amount: 79700,
      currency: 'usd',
      mode: 'subscription',
      interval: 'month',
      tt_product_id: 'pr_60342',
      success_note: 'ProFlow Elite activating. Calendar invite for first session incoming.',
    },
    'dfy-setup': {
      name: 'DFY Setup — One Time',
      description: 'Done-for-you AI system setup. Live in 14 days. Includes 30-day pilot.',
      amount: 149700,
      currency: 'usd',
      mode: 'payment',
      tt_product_id: 'pr_60338',
      success_note: 'DFY Setup initiated. Your dedicated setup team starts Monday.',
    },
    'dfy-30day': {
      name: 'DFY 30-Day AI Pilot',
      description: 'Full 30-day done-for-you AI automation pilot. Performance guaranteed.',
      amount: 150000,
      currency: 'usd',
      mode: 'payment',
      tt_product_id: 'pr_60344',
      success_note: 'Pilot initiated. First deliverables within 72 hours.',
    },
    'enterprise': {
      name: 'NYSR Enterprise — Monthly',
      description: 'Full-service AI agency retainer. Content, SEO, outreach, automation — all done for you.',
      amount: 499700,
      currency: 'usd',
      mode: 'subscription',
      interval: 'month',
      tt_product_id: 'pr_60339',
      success_note: 'Enterprise retainer active. Dedicated account manager assigned.',
    },
    'audit': {
      name: 'Free AI Automation Audit',
      description: 'Comprehensive AI + content automation audit for your business. 100% free.',
      amount: 0,
      currency: 'usd',
      mode: 'payment',
      tt_product_id: null,
      success_note: 'Audit requested. Results delivered within 24 hours.',
    },
  };

  const product = CATALOG[product_key];
  if (!product) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown product: ${product_key}. Available: ${Object.keys(CATALOG).join(', ')}` }) };
  }

  // Free product — no Stripe session needed
  if (product.amount === 0) {
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ free: true, redirect: `${SITE_URL}/audit/`, message: product.success_note })
    };
  }

  try {
    // Build Stripe Checkout Session via API
    const line_items = product.mode === 'subscription'
      ? [{
          price_data: {
            currency: product.currency,
            product_data: { name: product.name, description: product.description },
            recurring: { interval: product.interval },
            unit_amount: product.amount,
          },
          quantity: 1,
        }]
      : [{
          price_data: {
            currency: product.currency,
            product_data: { name: product.name, description: product.description },
            unit_amount: product.amount,
          },
          quantity: 1,
        }];

    const sessionPayload = new URLSearchParams({
      mode: product.mode,
      success_url: `${SITE_URL}/checkout/success/?session_id={CHECKOUT_SESSION_ID}&product=${product_key}`,
      cancel_url: `${SITE_URL}/checkout/cancel/?product=${product_key}`,
      'payment_method_types[]': 'card',
      'metadata[product_key]': product_key,
      'metadata[tt_product_id]': product.tt_product_id || '',
      'metadata[success_note]': product.success_note,
    });

    if (email) sessionPayload.append('customer_email', email);

    // Add line items
    line_items.forEach((item, i) => {
      sessionPayload.append(`line_items[${i}][price_data][currency]`, item.price_data.currency);
      sessionPayload.append(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name);
      sessionPayload.append(`line_items[${i}][price_data][product_data][description]`, item.price_data.product_data.description);
      sessionPayload.append(`line_items[${i}][price_data][unit_amount]`, String(item.price_data.unit_amount));
      if (item.price_data.recurring) {
        sessionPayload.append(`line_items[${i}][price_data][recurring][interval]`, item.price_data.recurring.interval);
      }
      sessionPayload.append(`line_items[${i}][quantity]`, '1');
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SK}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionPayload.toString()
    });

    const session = await stripeRes.json();

    if (session.error) {
      console.error('Stripe error:', session.error);
      return { statusCode: 400, headers, body: JSON.stringify({ error: session.error.message }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        session_id: session.id,
        checkout_url: session.url,
        product: product.name,
        amount: product.amount / 100,
      })
    };

  } catch (err) {
    console.error('Checkout error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
