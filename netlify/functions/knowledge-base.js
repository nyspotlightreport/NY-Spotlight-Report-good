// Knowledge Base API — powers the FAQ/help center
// Visitors get instant AI answers → reduces friction → more conversions

exports.handler = async (event, context) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  async function supabase(method, table, query = "") {
    const url = `${process.env.SUPABASE_URL}/rest/v1/${table}${query}`;
    const resp = await fetch(url, {
      headers: { "apikey": process.env.SUPABASE_KEY, "Authorization": `Bearer ${process.env.SUPABASE_KEY}` }
    });
    return resp.ok ? resp.json().catch(() => []) : [];
  }

  async function askClaude(question, context) {
    if (!process.env.ANTHROPIC_API_KEY) return "Please contact us at nyspotlightreport@gmail.com for help.";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: `You are the AI assistant for NY Spotlight Report (nyspotlightreport.com), an AI agency automation company. Answer questions helpfully and concisely. If you cannot answer, direct them to nyspotlightreport@gmail.com. Context about our services: ${context}`,
        messages: [{ role: "user", content: question }]
      })
    });
    const data = await resp.json();
    return data.content?.[0]?.text || "For more help, please contact nyspotlightreport@gmail.com";
  }

  const FAQS = [
    { q: "How much does it cost?", a: "Plans start at $97/mo for ProFlow Starter, $297/mo for Growth, or $1,497 one-time for our DFY Bot Setup. View pricing at nyspotlightreport.com/pricing/" },
    { q: "How fast can I get started?", a: "DFY setup takes 48-72 hours. Subscription plans activate immediately." },
    { q: "Do I need to know how to code?", a: "Zero coding required. We handle everything — you just describe what you need." },
    { q: "What is your refund policy?", a: "30-day money-back guarantee on all plans. No questions asked." },
    { q: "Can I see a demo?", a: "Yes! Book a free 15-minute demo at nyspotlightreport.com/tokens/ or email nyspotlightreport@gmail.com" },
    { q: "What platforms do you integrate with?", a: "HubSpot, Apollo, Supabase, Stripe, Gumroad, LinkedIn, Twitter/X, WordPress, TikTok, and 20+ others." },
    { q: "What results can I expect?", a: "Most clients see their content output increase 10x, lead generation automate fully, and ROI within the first month." },
  ];

  try {
    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters?.q || "";
      if (query) {
        const relevant = FAQS.filter(f => f.q.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().split(" ").some(w => f.q.toLowerCase().includes(w)));
        const answer = relevant.length > 0 ? relevant[0].a : await askClaude(query, FAQS.map(f => `Q: ${f.q} A: ${f.a}`).join("\n"));
        return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ answer, source: relevant.length > 0 ? "faq" : "ai" }) };
      }
      return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ faqs: FAQS }) };
    }

    if (event.httpMethod === "POST") {
      const { question = "" } = JSON.parse(event.body || "{}");
      if (!question) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Question required" }) };
      const answer = await askClaude(question, FAQS.map(f => `Q: ${f.q} A: ${f.a}`).join("\n"));
      return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ question, answer }) };
    }
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
