// ONE-TIME USE — Register Stripe webhook endpoint
// DELETE THIS FILE after running it once
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // Only allow POST with admin password
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'POST only' };
  }

  try {
    const { action } = JSON.parse(event.body || '{}');

    if (action === 'list') {
      // List existing webhook endpoints
      const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: endpoints.data.length,
          endpoints: endpoints.data.map(ep => ({
            id: ep.id,
            url: ep.url,
            status: ep.status,
            events: ep.enabled_events,
          })),
        }),
      };
    }

    if (action === 'create') {
      const endpoint = await stripe.webhookEndpoints.create({
        url: 'https://nyspotlightreport.com/.netlify/functions/stripe-webhook',
        enabled_events: [
          'checkout.session.completed',
          'payment_intent.succeeded',
        ],
        description: 'NYSR ProFlow fulfillment pipeline',
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          webhook_id: endpoint.id,
          webhook_secret: endpoint.secret,
          url: endpoint.url,
          events: endpoint.enabled_events,
          status: endpoint.status,
          message: 'SAVE THE webhook_secret AS STRIPE_WEBHOOK_SECRET IN NETLIFY ENV VARS. Then delete this function.',
        }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Send {"action":"list"} or {"action":"create"}' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
