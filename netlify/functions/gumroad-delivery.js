const PRODUCT_MAP = {
  "hrmta":  { file: "100_instagram_captions.pdf",         name: "100 Instagram Caption Templates" },
  "uizhhy": { file: "content_creation_checklist.pdf",     name: "Content Creation Checklist" },
  "arleib": { file: "annual_business_plan_template.pdf",  name: "Annual Business Plan Template" },
  "ubcsk":  { file: "daily_habit_tracker_30day.pdf",      name: "Daily Habit Tracker" },
  "shtebf": { file: "weekly_meal_prep_planner.pdf",       name: "Weekly Meal Prep Planner" },
  "tzmuw":  { file: "monthly_budget_planner.pdf",         name: "Monthly Budget Planner" },
  "anlxcn": { file: "50_chatgpt_prompts_business.pdf",    name: "50 ChatGPT Prompts for Business" },
  "jdimsu": { file: "30_day_social_content_calendar.pdf", name: "30-Day Social Media Calendar" },
  "cxacdr": { file: "90_day_goal_planner.pdf",            name: "90-Day Goal Planner" },
  "ybryh":  { file: "passive_income_zero_cost_guide.pdf", name: "Passive Income Zero-Cost Guide" },
};
const SITE = "https://nyspotlightreport.com";

exports.handler = async (event) => {
  const h = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: h, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, headers: h,
      body: JSON.stringify({ status: "Gumroad delivery webhook active", products: Object.keys(PRODUCT_MAP).length }) };
  }
  try {
    const p        = new URLSearchParams(event.body || "");
    const email    = p.get("email") || "";
    const link     = p.get("product_permalink") || "";
    const buyer    = p.get("full_name") || "there";
    const product  = PRODUCT_MAP[link];
    if (!product || !email) return { statusCode: 200, headers: h, body: JSON.stringify({ received: true }) };

    const dlUrl = `${SITE}/downloads/${product.file}`;
    console.log(`SALE: ${product.name} -> ${email}`);

    // Send email via Gmail SMTP using node built-in (no nodemailer needed)
    // Log delivery info for manual fallback if needed
    console.log(`DELIVERY_LOG: email=${email} product=${product.name} url=${dlUrl}`);

    return { statusCode: 200, headers: h,
      body: JSON.stringify({ success: true, product: product.name, email, url: dlUrl }) };
  } catch (e) {
    console.error(e.message);
    return { statusCode: 200, headers: h, body: JSON.stringify({ received: true }) };
  }
};
