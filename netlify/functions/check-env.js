exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      has_anthropic: !!process.env.ANTHROPIC_API_KEY,
      has_newsapi:   !!process.env.NEWSAPI_KEY,
      has_av:        !!process.env.ALPHA_VANTAGE_API_KEY,
      has_guardian:  !!process.env.GUARDIAN_API_KEY,
      node_ver:      process.version,
    })
  };
};
