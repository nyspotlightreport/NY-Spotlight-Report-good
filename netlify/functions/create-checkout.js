// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session when customer clicks "Start Now"
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  starter: {
    name: 'ProFlow Starter',
    price: 9700, // cents
    interval: 'month',
    description: 'Daily blog posts, 3-platform social, HD images, SEO optimization',
  },
  growth: {
    name: 'ProFlow Growth',
    price: 29700,
    interval: 'month',
    description: 'Everything in Starter + 6-platform social, newsletter, AI receptionist, weekly reports',
  },
  agency: {
    name: 'ProFlow Agency',
    price: 49700,
    interval: 'month',
    description: 'Everything in Growth + white-label, ad creative, video, dedicated account manager',
  },
  dfy_setup: {
    name: 'DFY Content Engine Setup',
    price: 149700,
    interval: null, // one-time
    description: 'Complete done-for-you content engine setup and configuration',
  },
  dfy_agency: {
    name: 'DFY Full Agency Automation',
    price: 499700,
    interval: null,
    description: 'Complete agency automation build — content, social, voice AI, CRM, analytics',
  },
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { plan, email, name } = JSON.parse(event.body || '{}');
    const planData = PLANS[plan];
    
    if (!planData) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid plan' }) };
    }

    const sessionParams = {
      payment_method_types: ['card'],
      customer_email: email || undefined,
      success_url: `https://nyspotlightreport.com/activate/?plan=${plan}&session={CHECKOUT_SESSION_ID}`,
      cancel_url: 'https://nyspotlightreport.com/proflow/?cancelled=true',
      metadata: { plan, customer_name: name || '' },
    };

    if (planData.interval) {
      // Subscription
      sessionParams.mode = 'subscription';
      sessionParams.line_items = [{
        price_data: {
          currency: 'usd',
          product_data: { name: planData.name, description: planData.description },
          unit_amount: planData.price,
          recurring: { interval: planData.interval },
        },
        quantity: 1,
      }];
    } else {
      // One-time payment
      sessionParams.mode = 'payment';
      sessionParams.line_items = [{
        price_data: {
          currency: 'usd',
          product_data: { name: planData.name, description: planData.description },
          unit_amount: planData.price,
        },
        quantity: 1,
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, id: session.id }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Checkout creation failed', details: err.message }),
    };
  }
};
