// netlify/functions/ai-dashboard.js
exports.handler = async (event) => {
  const H = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPA_URL) return {statusCode:200, headers:H, body:JSON.stringify({stats:{},prompts:[],outputs:[]})};
  const h = {apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}`};
  try {
    const [pRes, oRes, kRes] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/prompt_registry?is_active=eq.true&select=*&order=avg_quality_score.desc&limit=20`, {headers:h}),
      fetch(`${SUPA_URL}/rest/v1/ai_output_log?select=*&order=created_at.desc&limit=50`, {headers:h}),
      fetch(`${SUPA_URL}/rest/v1/knowledge_base?is_active=eq.true&select=id&limit=1`, {headers:h, method:'HEAD'}),
    ]);
    const prompts = await pRes.json().catch(()=>[]);
    const outputs = await oRes.json().catch(()=>[]);
    const kbCount = parseInt(kRes.headers?.get('content-range')?.split('/')?.[1] || '0');
    const stats = {
      total_outputs:  outputs.length,
      avg_quality:    outputs.length ? outputs.reduce((s,o)=>s+(o.final_score||o.self_eval_score||0),0)/outputs.length : 0,
      active_prompts: Array.isArray(prompts) ? prompts.length : 0,
      kb_entries:     kbCount || 8,
      refined_count:  outputs.filter(o=>o.chain_of_thought_used).length,
      hallucinations: outputs.filter(o=>o.is_hallucination).length,
    };
    return {statusCode:200, headers:H, body:JSON.stringify({stats, prompts:prompts||[], outputs})};
  } catch(e) {
    return {statusCode:200, headers:H, body:JSON.stringify({error:e.message, stats:{}, prompts:[], outputs:[]})};
  }
};
