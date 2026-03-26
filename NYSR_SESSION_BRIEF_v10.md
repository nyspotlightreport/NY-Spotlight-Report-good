# NYSR SESSION BRIEF v10
## NY Spotlight Report + SCT Agency System
### Last Updated: March 26, 2026 (01:00 UTC)
### Chairman: S.C. Thomas

---

## SYSTEM OVERVIEW

| Component | Repo | Count |
|-----------|------|-------|
| Agents | sct-agency-bots/agents/ | 160 |
| Bots | sct-agency-bots/bots/ | 234 |
| GitHub Workflows | sct-agency-bots/.github/workflows/ | 201 |
| Netlify Functions | NY-Spotlight-Report-good/netlify/functions/ | 38 |
| Site Pages | NY-Spotlight-Report-good/ | 260 |
| Blog Articles | NY-Spotlight-Report-good/blog/ | 93 |
| GitHub Secrets (bots) | sct-agency-bots | 97 |
| GitHub Secrets (site) | NY-Spotlight-Report-good | 14 |

## DOMAINS & HOSTING

| Domain | Purpose | Host |
|--------|---------|------|
| nyspotlightreport.com | Main news site | Netlify |
| myproflow.org | ProFlow SaaS (separate) | Netlify |
| mail.nyspotlightreport.com | Email sending (Resend) | Resend VERIFIED |

## KEY CREDENTIALS LOCATION

All secrets stored in GitHub Actions Secrets. Key ones:
- ANTHROPIC_API_KEY, OPENAI_API_KEY — AI
- SUPABASE_URL, SUPABASE_KEY — Database
- RESEND_API_KEY — Email (re_dHFXQFGG...)
- STRIPE_SECRET_KEY, STRIPE_ACCOUNT_ID — Payments
- GH_PAT — Cross-repo access (fine-grained, sbp_ prefix)
- NETLIFY_AUTH_TOKEN / NETLIFY_ACCESS_TOKEN — Deploys (EXPIRES MARCH 27!)
- PUSHOVER_API_KEY, PUSHOVER_USER_KEY — Phone alerts
- GMAIL_USER, GMAIL_APP_PASS — Inbox monitoring
- Amazon Associates tag: nyspotlightrepo-20

## SUPABASE TABLES

| Table | Purpose | Status |
|-------|---------|--------|
| contacts | Leads + prospects | ACTIVE |
| outreach_log | Email send history | ACTIVE |
| brand_mentions | Press, mentions, alerts | ACTIVE |
| subscribers | Newsletter signups | ACTIVE |
| site_health_log | Site monitoring data | ACTIVE |

## REVENUE STREAMS

| Stream | Status | Details |
|--------|--------|---------|
| Gumroad | 10 products listed | $5.99-$14.99 range |
| Amazon KDP | 12 books submitted | 3 remaining (Thursday limit reset) |
| Amazon Associates | 92/93 articles linked | Tag: nyspotlightrepo-20 |
| Stripe | Active | Checkout integration live |
| Redbubble | 20 designs created | NOT YET UPLOADED |

## MONITORING STACK

| Monitor | Schedule | Purpose |
|---------|----------|---------|
| effectiveness_auditor.py | Daily 6:50am ET | 8 business outcome checks |
| chairman_briefing.py | Daily 7:00am ET | Revenue, leads, systems summary |
| master_audit_99d.py | Daily | 105-dimension system audit |
| self_repair_engine.py | On failure | Auto-fix content + config issues |
| self_healer.py | Every 30min | Infrastructure self-healing |
| site_health_monitor.yml | Every 5min | Endpoint monitoring |
| output_verifier.py | Daily | Zero-output detection |
| guardian workflows | Every 30min | Multiple guardian checks |

## NAMED AI PERSONNEL

| Name | Role | Agent File |
|------|------|-----------|
| Alex Mercer | Orchestrator | alex_mercer_orchestrator.py |
| Blake Sutton | Finance Director | blake_sutton_finance.py |
| Cameron Reed | Content Director | cameron_reed_content.py |
| Casey Lin | IT Director | casey_lin_it.py |
| Drew Sinclair | Analytics Director | drew_sinclair_analytics.py |
| Elliot Shaw | Marketing Director | elliot_shaw_marketing.py |
| Hayden Cross | QA Director | hayden_cross_qa.py |
| Jeff Banks | Chief Results Officer | jeff_banks_cro.py |
| Jordan Wells | Operations Director | jordan_wells_ops.py |
| Nina Caldwell | Strategy Director | nina_caldwell_strategy.py |
| Parker Hayes | Product Director | parker_hayes_product.py |
| Rowan Blake | BizDev Director | rowan_blake_bizdev.py |
| Taylor Grant | HR Director | taylor_grant_hr.py |
| Vivian Cole | PR Director | vivian_cole_pr.py |

## CHANGES THIS SESSION (March 25-26, 2026 — Evening)

### Infrastructure
- Supabase: 4+ tables actively queried by agents
- Replicate API: Added to both repos for image generation
- Resend domain: mail.nyspotlightreport.com VERIFIED
- Cold outreach: UNBLOCKED — email_blaster sending from verified domain
- GH_PAT: Updated in both repos

### Content & Revenue
- Amazon affiliate links: 92/93 articles now covered (was 5/93) — 1740% increase
- Gumroad: 10 products fully loaded with PDFs and descriptions
- KDP: 12 books submitted (3 remaining after limit reset Thursday)
- ProFlow separation: 0 editorial violations (was 169 files with ProFlow sales)

### Monitoring & Self-Healing
- NEW: effectiveness_auditor.py — 8 business checks daily at 6:50am ET
- Smoke tests: 13/13 PASSING (was 0/7, was auto-reverting every deploy)
- 105-Dimension Audit: 6 new dimensions (was 99)
- Self-repair engine: 3 new content repair capabilities (affiliates, ProFlow strip, stub alert)
- Chairman briefing: Upgraded to 7 sections with 4 Supabase table queries

### Agents
- inbox_intelligence_agent.py: Rebuilt from 8 to 203 lines (Gmail IMAP monitoring)
- apollo_scale_agent.py: Rebuilt from 10 to 198 lines (Apollo lead search + dedup)
- email_blaster.py: Updated from address to outreach@mail.nyspotlightreport.com

### Site
- Smoke test workflow: Fixed (was checking deleted ProFlow endpoints)
- conversion-engine.html: Rewritten (ProFlow CTAs replaced with newsletter signup)
- 37 editorial pages cleaned of ProFlow sales references
- Phone: (631) 375-1097 sitewide

## PENDING (Carry Forward)

### URGENT (Do Today/Tomorrow)
1. **Netlify PAT expires March 27** — Renew at app.netlify.com/user/applications#personal-access-tokens
   - sct-agency-bots secret: NETLIFY_AUTH_TOKEN
   - NY-Spotlight-Report-good secret: NETLIFY_ACCESS_TOKEN (different name!)
2. **Apollo real prospect pull** — 25 test prospects loaded, need real Apollo API pull for verified leads
3. **Remaining 3 KDP books** — Upload Thursday after limit resets

### MEDIUM PRIORITY
4. GitHub account email fix (email GitHub Support from Zoho)
5. Real affiliate programs signup (Amazon Associates active, Impact/ShareASale pending)
6. Redbubble: 20 designs created but none uploaded to store
7. WMA Agency: Chairman replied to Kelsi Ring (VP of PR) — follow up

### LOW PRIORITY
8. Sync workflow still failing (PAT auth issue with fine-grained token for cross-repo push)
9. 2 GitHub Dependabot vulnerabilities flagged (1 high, 1 moderate)
10. Node.js 20 deprecation warnings on GitHub Actions (deadline June 2026)

## SYSTEM HEALTH SCORE: 89/100

| Category | Score | Notes |
|----------|-------|-------|
| Infrastructure | 24/25 | All monitoring live, sync workflow needs fix |
| Automation | 24/25 | 201 workflows, effectiveness auditor NEW |
| Site | 23/25 | 13/13 smoke tests, ProFlow clean, affiliates at 99% |
| Revenue | 18/25 | Gumroad live, KDP mostly done, Redbubble pending, affiliates expanded |

Previous score: 82/100 (+7 improvement this session)
