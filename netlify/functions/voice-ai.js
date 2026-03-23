// netlify/functions/voice-ai.js
// ProFlow Voice AI Receptionist — Emma
// Twilio calls this for every inbound voice interaction

exports.handler = async (event) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Thank you for calling ProFlow by NY Spotlight Report. My name is Emma and I am happy to assist you today.</Say>
    <Gather numDigits="1" timeout="6" action="/.netlify/functions/voice-ai?step=route">
        <Say voice="Polly.Joanna">For sales and pricing information, press 1. For support, press 2. To speak with our team, press 0. Or simply stay on the line.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I did not receive a selection. Let me connect you with our team now.</Say>
    <Say voice="Polly.Joanna">Thank you for calling NY Spotlight Report. Have a wonderful day.</Say>
</Response>`;

  // Handle menu routing
  const params = event.queryStringParameters || {};
  const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
  const digits = body.get('Digits') || params.Digits || '';
  const step = params.step || '';

  if (step === 'route') {
    let routeTwiml = '';
    switch(digits) {
      case '1':
        routeTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Great choice. Let me tell you about ProFlow. ProFlow is a done for you AI content engine that replaces your entire content team for a fraction of the cost. Starting at just 97 dollars per month, you get daily blog posts, social media on 6 platforms, professional images, and weekly performance reports. All written in your brand voice. Setup takes just 5 minutes. Would you like to learn more? Visit nyspotlightreport.com slash proflow, or I can connect you with our sales team.</Say>
    <Gather numDigits="1" timeout="5" action="/.netlify/functions/voice-ai?step=sales">
        <Say voice="Polly.Joanna">Press 1 to hear pricing details, or press 0 to return to the main menu.</Say>
    </Gather>
    <Say voice="Polly.Joanna">Thank you for your interest in ProFlow. Visit nyspotlightreport.com slash proflow to get started today. Goodbye.</Say>
</Response>`;
        break;
      case '2':
        routeTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">For support, please email us at nyspotlightreport at gmail dot com, or visit our website at nyspotlightreport.com. Our team typically responds within 24 hours. Thank you for being a ProFlow customer.</Say>
</Response>`;
        break;
      default:
        routeTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Thank you for calling NY Spotlight Report. For the fastest response, email us at nyspotlightreport at gmail dot com or visit nyspotlightreport.com. Have a great day.</Say>
</Response>`;
    }
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: routeTwiml };
  }

  if (step === 'sales') {
    const salesTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Our plans start at 97 dollars per month for the Starter plan, which includes daily blog posts, social media on 3 platforms, and HD images. Our most popular plan is Growth at 297 dollars per month, which adds 6 platform social media, a weekly newsletter, an AI phone receptionist for your business, and weekly performance reports. For agencies, we offer our Agency plan at 497 dollars per month with white label capabilities, ad creative generation, and a dedicated account manager. All plans come with a 14 day delivery guarantee. No contracts. Cancel anytime. Visit nyspotlightreport.com slash proflow to get started in just 5 minutes.</Say>
    <Say voice="Polly.Joanna">Thank you for calling ProFlow. We look forward to serving you.</Say>
</Response>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: salesTwiml };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml
  };
};
