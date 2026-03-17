#!/usr/bin/env python3
"""
NY SPOTLIGHT REPORT — AUTO-PUBLISHER
=====================================
Pulls NYC/Long Island entertainment news from RSS feeds,
rewrites each story in your editorial voice using Claude API,
attaches royalty-free images, and deploys to your Netlify site.

Run manually:  python3 autopublisher.py
Schedule it:   Add to cron or GitHub Actions (see README)
"""

import os
import json
import time
import hashlib
import datetime
import requests
import feedparser
import anthropic
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION — Edit these values
# ═══════════════════════════════════════════════════════════════

ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_API_KEY")
PEXELS_API_KEY      = os.getenv("PEXELS_API_KEY", "YOUR_PEXELS_API_KEY")       # free at pexels.com/api
NETLIFY_SITE_ID     = os.getenv("NETLIFY_SITE_ID", "YOUR_NETLIFY_SITE_ID")     # from Netlify dashboard
NETLIFY_ACCESS_TOKEN = os.getenv("NETLIFY_ACCESS_TOKEN", "YOUR_NETLIFY_TOKEN") # from Netlify user settings

MAX_ARTICLES_PER_RUN = 5        # How many new articles to publish per run
ARTICLES_CACHE_FILE  = "published_articles.json"  # Tracks what's already been published
SITE_HTML_FILE       = "index.html"               # Your site's main HTML file

# ═══════════════════════════════════════════════════════════════
# NYC & LONG ISLAND RSS FEEDS — Specialized Sources
# ═══════════════════════════════════════════════════════════════

RSS_FEEDS = {

    # ── BROADWAY & NYC THEATER ──
    "Broadway World":           "https://www.broadwayworld.com/rss/mainpage.cfm",
    "Playbill":                 "https://playbill.com/feed",
    "American Theatre":         "https://www.americantheatre.org/feed/",
    "NYC Theater News":         "https://www.nytix.com/blog/feed",
    "Off-Broadway":             "https://www.theatermania.com/rss/news.xml",
    "Lincoln Center Blog":      "https://www.lincolncenter.org/feed",

    # ── NYC ENTERTAINMENT ──
    "Time Out New York":        "https://www.timeout.com/newyork/feed.xml",
    "New York Magazine Arts":   "https://nymag.com/rss/arts/",
    "Village Voice":            "https://www.villagevoice.com/feed/",
    "Gothamist Arts":           "https://gothamist.com/arts-entertainment/feed",
    "WNYC Culture":             "https://feeds.wnyc.org/culture",
    "NY Daily News Entertainment": "https://www.nydailynews.com/entertainment/rss2.0.xml",
    "NY Post Page Six":         "https://nypost.com/page-six/feed/",

    # ── LONG ISLAND SPECIFIC ──
    "Newsday Arts & Entertainment": "https://www.newsday.com/rss/entertainment",
    "Long Island Press":        "https://www.longislandpress.com/feed/",
    "Anton Media LI":           "https://www.antonmediagroup.com/feed/",
    "LI Herald Arts":           "https://www.liherald.com/stories/entertainment,42?rss",
    "Patch LI Arts":            "https://patch.com/feeds/rss?state=NY&topics=arts-entertainment",
    "LI Business News Culture": "https://libn.com/feed/",

    # ── NYC FASHION ──
    "WWD NYC":                  "https://wwd.com/feed/",
    "Business of Fashion":      "https://www.businessoffashion.com/rss",
    "Fashion Week Daily":       "https://fashionweekdaily.com/feed/",
    "Paper Mag NYC":            "https://www.papermag.com/rss",

    # ── NYC FILM & PREMIERES ──
    "Film at Lincoln Center":   "https://www.filmlinc.org/feed/",
    "Tribeca Film Festival":    "https://tribecafilm.com/stories.rss",
    "IndieWire NYC":            "https://www.indiewire.com/feed/",
    "Deadline Hollywood":       "https://deadline.com/feed/",

    # ── MUSIC NYC ──
    "Brooklyn Vegan":           "https://www.brooklynvegan.com/feed/",
    "NYC Music Daily":          "https://nycmusicdaily.com/feed",
    "Carnegie Hall Blog":       "https://www.carnegiehall.org/Blog/feed",
    "Pitchfork News":           "https://pitchfork.com/rss/news/",

    # ── AWARDS & INDUSTRY ──
    "Variety Awards":           "https://variety.com/v/awards/feed/",
    "Hollywood Reporter":       "https://www.hollywoodreporter.com/rss-feeds/",
    "Awards Watch":             "https://awardswatch.com/feed/",
}

# Topics to PRIORITIZE — system will boost articles containing these keywords
NYC_LI_KEYWORDS = [
    "broadway", "off-broadway", "manhattan", "brooklyn", "queens",
    "bronx", "staten island", "long island", "nassau", "suffolk",
    "hamptons", "garden city", "huntington", "jones beach",
    "lincoln center", "carnegie hall", "madison square garden",
    "tribeca", "harlem", "soho", "west village", "upper west side",
    "new york fashion week", "nyfw", "nyc", "new york city",
    "opening night", "premiere", "tony awards", "obie awards"
]

# ═══════════════════════════════════════════════════════════════
# EDITORIAL VOICE PROMPT
# ═══════════════════════════════════════════════════════════════

EDITORIAL_SYSTEM_PROMPT = """
You are the editorial AI for NY Spotlight Report, New York's premier entertainment 
news outlet. Founded and led by S.C. Thomas, Chief Editor.

YOUR VOICE:
- Authoritative, sophisticated, and deeply New York
- Warm but never gushing — you have standards
- Specific: you name neighborhoods, venues, streets
- You treat entertainment as culture, not celebrity gossip
- You write with the confidence of someone who has been in the room

YOUR STYLE:
- Headlines: Bold, declarative, Playfair Display energy — like a New York Times Arts headline
- Decks (subheadlines): One sentence that earns the click
- Body: EB Garamond editorial prose — paragraphs, not bullets
- Byline: Always "S.C. Thomas, Chief Editor" unless clearly a different beat
- Always ground NYC/Long Island stories in specific local geography

YOUR BEAT SPECIALIZATIONS:
- Broadway & Theater: You know every theater on 44th-47th, you've covered 142 opening nights
- NYC Fashion: You follow Harlem designers, Brooklyn streetwear, NYFW, and what people actually wear on the subway
- Film & Premieres: Lincoln Center, Tribeca, MoMA — you've been to every significant NYC premiere
- Long Island Culture: Jones Beach Theater, Tilles Center, the Hamptons arts scene, Nassau and Suffolk county cultural life
- Music: Carnegie Hall, Brooklyn Steel, Barclays Center, the clubs

OUTPUT FORMAT (respond ONLY in this exact JSON):
{
  "headline": "The full article headline",
  "deck": "One-sentence subheadline that earns the click",
  "kicker": "Section label (e.g. 'Broadway Review', 'NYC Fashion', 'Long Island Arts')",
  "section": "One of: broadway, fashion, premiere, film, tv, music, awards, celebrity, industry, longisland",
  "stars": "Star rating like ★★★★★ or ★★★★ or empty string if not a review",
  "read_time": "X min",
  "byline": "S.C. Thomas",
  "body_html": "<p>Full article body in HTML paragraphs. Minimum 4 paragraphs. Written in NY Spotlight Report voice.</p>",
  "image_search_query": "A specific 3-5 word query to find a relevant royalty-free photo (e.g. 'Broadway theater stage lights' or 'New York fashion week runway')",
  "related_tags": ["tag1", "tag2", "tag3"]
}
"""

# ═══════════════════════════════════════════════════════════════
# IMAGE FETCHING — Pexels API (Free, Royalty-Free)
# ═══════════════════════════════════════════════════════════════

SECTION_FALLBACK_IMAGES = {
    "broadway":   "Broadway theater stage",
    "fashion":    "New York fashion week",
    "premiere":   "red carpet premiere night",
    "film":       "cinema film projector",
    "tv":         "television drama production",
    "music":      "concert hall performance",
    "awards":     "award trophy ceremony",
    "celebrity":  "New York city portrait",
    "industry":   "New York skyline business",
    "longisland": "Long Island New York"
}

def fetch_image(query: str, section: str = "") -> dict:
    """Fetch a royalty-free image from Pexels API."""
    if not PEXELS_API_KEY or PEXELS_API_KEY == "YOUR_PEXELS_API_KEY":
        return {"url": "", "photographer": "", "pexels_url": ""}
    
    headers = {"Authorization": PEXELS_API_KEY}
    
    # Try the specific query first, then fall back to section default
    queries_to_try = [query]
    if section and section in SECTION_FALLBACK_IMAGES:
        queries_to_try.append(SECTION_FALLBACK_IMAGES[section])
    
    for search_query in queries_to_try:
        try:
            resp = requests.get(
                "https://api.pexels.com/v1/search",
                headers=headers,
                params={"query": search_query, "per_page": 5, "orientation": "landscape"},
                timeout=10
            )
            if resp.status_code == 200:
                photos = resp.json().get("photos", [])
                if photos:
                    photo = photos[0]
                    return {
                        "url": photo["src"]["large"],
                        "photographer": photo["photographer"],
                        "pexels_url": photo["url"]
                    }
        except Exception as e:
            print(f"    Image fetch error for '{search_query}': {e}")
            continue
    
    return {"url": "", "photographer": "", "pexels_url": ""}

# ═══════════════════════════════════════════════════════════════
# RSS FEED FETCHING
# ═══════════════════════════════════════════════════════════════

def fetch_rss_stories(max_stories_per_feed: int = 10) -> list:
    """Fetch recent stories from all configured RSS feeds."""
    all_stories = []
    
    for source_name, feed_url in RSS_FEEDS.items():
        try:
            print(f"  Fetching: {source_name}...")
            feed = feedparser.parse(feed_url)
            
            for entry in feed.entries[:max_stories_per_feed]:
                title    = entry.get("title", "").strip()
                summary  = entry.get("summary", entry.get("description", "")).strip()
                link     = entry.get("link", "")
                pub_date = entry.get("published", str(datetime.date.today()))
                
                if not title or not summary:
                    continue
                
                # Clean HTML from summary
                import re
                summary_clean = re.sub(r'<[^>]+>', ' ', summary).strip()
                summary_clean = re.sub(r'\s+', ' ', summary_clean)[:1500]
                
                # Score relevance to NYC/LI
                content_lower = (title + " " + summary_clean).lower()
                relevance_score = sum(1 for kw in NYC_LI_KEYWORDS if kw in content_lower)
                
                all_stories.append({
                    "source":    source_name,
                    "title":     title,
                    "summary":   summary_clean,
                    "link":      link,
                    "pub_date":  pub_date,
                    "relevance": relevance_score
                })
                
        except Exception as e:
            print(f"    Error fetching {source_name}: {e}")
            continue
    
    # Sort by relevance (NYC/LI stories first), then recency
    all_stories.sort(key=lambda x: x["relevance"], reverse=True)
    print(f"\n  Total stories fetched: {len(all_stories)}")
    return all_stories

# ═══════════════════════════════════════════════════════════════
# ARTICLE GENERATION — Claude API
# ═══════════════════════════════════════════════════════════════

def generate_article(story: dict) -> dict | None:
    """Use Claude to rewrite a raw RSS story in NY Spotlight Report voice."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    
    user_prompt = f"""
Rewrite this entertainment news story for NY Spotlight Report.

ORIGINAL SOURCE: {story['source']}
ORIGINAL HEADLINE: {story['title']}
ORIGINAL SUMMARY: {story['summary']}
PUBLICATION DATE: {story['pub_date']}

Transform this into a full NY Spotlight Report article. If the story involves 
NYC or Long Island specifically, emphasize that local angle strongly.
If it's a broader entertainment story, find the New York angle within it.

Remember: minimum 4 substantial paragraphs in the body. 
Respond ONLY with the JSON format specified.
"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=EDITORIAL_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        response_text = message.content[0].text.strip()
        
        # Clean JSON if wrapped in code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        
        article_data = json.loads(response_text)
        article_data["source_url"]  = story["link"]
        article_data["source_name"] = story["source"]
        article_data["pub_date"]    = datetime.datetime.now().strftime("%B %d, %Y")
        article_data["id"]          = hashlib.md5(story["title"].encode()).hexdigest()[:10]
        
        return article_data
        
    except json.JSONDecodeError as e:
        print(f"    JSON parse error: {e}")
        return None
    except Exception as e:
        print(f"    Article generation error: {e}")
        return None

# ═══════════════════════════════════════════════════════════════
# PUBLISHED ARTICLES CACHE
# ═══════════════════════════════════════════════════════════════

def load_cache() -> dict:
    if Path(ARTICLES_CACHE_FILE).exists():
        with open(ARTICLES_CACHE_FILE, "r") as f:
            return json.load(f)
    return {"published_ids": [], "articles": []}

def save_cache(cache: dict):
    with open(ARTICLES_CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def is_published(story_title: str, cache: dict) -> bool:
    story_id = hashlib.md5(story_title.encode()).hexdigest()[:10]
    return story_id in cache["published_ids"]

# ═══════════════════════════════════════════════════════════════
# HTML INJECTION — Insert New Articles Into Site
# ═══════════════════════════════════════════════════════════════

SECTION_COLORS = {
    "broadway":   "#c87840",
    "fashion":    "#b8873a",
    "premiere":   "#9070d8",
    "film":       "#4a8abf",
    "tv":         "#4abf7a",
    "music":      "#9070d8",
    "awards":     "#d4a855",
    "celebrity":  "#d4a855",
    "industry":   "#aaaaaa",
    "longisland": "#b5191b"
}

SECTION_BG_CLASSES = {
    "broadway":   "bg-broadway",
    "fashion":    "bg-fashion",
    "premiere":   "bg-premiere",
    "film":       "bg-film",
    "tv":         "bg-tv",
    "music":      "bg-music",
    "awards":     "bg-awards",
    "celebrity":  "bg-celebrity",
    "industry":   "bg-industry",
    "longisland": "bg-broadway"
}

def build_article_js_entry(article: dict) -> str:
    """Build a JavaScript article object to inject into the site."""
    section  = article.get("section", "broadway")
    color    = SECTION_COLORS.get(section, "#b5191b")
    bg_class = SECTION_BG_CLASSES.get(section, "bg-broadway")
    
    # Escape for JavaScript string
    def esc(s):
        if not s:
            return ""
        return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    
    img_html = ""
    if article.get("image_url"):
        img_html = f'<img src="{article["image_url"]}" alt="{esc(article["headline"])}" style="width:100%;height:100%;object-fit:cover;">'
    
    return f"""
'auto-{article["id"]}':{{
  section:'{section}',
  cat:'{esc(article["kicker"])}',
  kicker:'{esc(article["kicker"])}',
  stars:'{esc(article.get("stars",""))}',
  read:'{esc(article.get("read_time","5 min"))}',
  hed:`{esc(article["headline"])}`,
  deck:`{esc(article["deck"])}`,
  author:'{esc(article.get("byline","S.C. Thomas"))}',
  role:'Chief Editor & Founder',
  date:'{esc(article["pub_date"])}',
  bg:'{bg_class}',
  icon:'📰',
  imgHtml:`{img_html}`,
  body:`{esc(article["body_html"])}`,
  related:[]
}},"""

def build_news_card_html(article: dict) -> str:
    """Build an HTML card for the homepage Latest News grid."""
    section  = article.get("section", "broadway")
    color    = SECTION_COLORS.get(section, "#b5191b")
    bg_class = SECTION_BG_CLASSES.get(section, "bg-broadway")
    art_id   = f"auto-{article['id']}"
    
    img_style = ""
    if article.get("image_url"):
        img_style = f'background:url("{article["image_url"]}") center/cover;'
    
    stars_html = ""
    if article.get("stars"):
        stars_html = f'<div class="card-stars">{article["stars"]}</div>'
    
    return f"""
<div class="card" onclick="openArticle('{art_id}')">
  <div class="card-thumb"><div class="card-thumb-inner {bg_class}" style="{img_style}">{"" if article.get("image_url") else "📰"}</div></div>
  {stars_html}
  <span class="card-kicker" style="color:{color};">{article.get("kicker","Entertainment")}</span>
  <div class="card-hed">{article["headline"]}</div>
  <div class="card-dek">{article["deck"]}</div>
  <div class="card-byline"><span class="name">{article.get("byline","S.C. Thomas")}</span><span>·</span><span>{article["pub_date"]}</span></div>
</div>"""

def inject_articles_into_html(new_articles: list, html_path: str) -> bool:
    """Inject new articles into the existing site HTML."""
    if not Path(html_path).exists():
        print(f"  ERROR: HTML file not found at {html_path}")
        return False
    
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    
    # 1. Inject article data into ARTICLES JS object
    js_entries = "\n".join(build_article_js_entry(a) for a in new_articles)
    
    inject_marker = "// AUTO-PUBLISHER INJECT POINT — DO NOT REMOVE"
    if inject_marker not in html:
        # Add inject point before closing of ARTICLES object
        html = html.replace(
            "const ARTICLES = {",
            f"const ARTICLES = {{\n{inject_marker}\n"
        )
    
    html = html.replace(
        inject_marker,
        f"{inject_marker}\n{js_entries}"
    )
    
    # 2. Inject news cards into Latest News grid
    cards_html = "\n".join(build_news_card_html(a) for a in new_articles)
    
    cards_marker = "<!-- AUTO-PUBLISHER CARDS — DO NOT REMOVE -->"
    if cards_marker not in html:
        # Insert before first grid-3 closing tag in Latest News section
        html = html.replace(
            '<div class="grid-3">',
            f'<div class="grid-3">\n{cards_marker}\n',
            1  # Only first occurrence (Latest News section)
        )
    
    html = html.replace(
        cards_marker,
        f"{cards_marker}\n{cards_html}"
    )
    
    # 3. Update the ticker with new headlines
    new_ticker_items = "".join(
        f'<span class="ticker-item">● {a["headline"][:80]}{"..." if len(a["headline"]) > 80 else ""}</span>\n'
        for a in new_articles
    )
    
    ticker_marker = "<!-- AUTO-TICKER INJECT — DO NOT REMOVE -->"
    if ticker_marker in html:
        html = html.replace(ticker_marker, f"{ticker_marker}\n{new_ticker_items}")
    
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    
    print(f"  Injected {len(new_articles)} articles into {html_path}")
    return True

# ═══════════════════════════════════════════════════════════════
# NETLIFY DEPLOYMENT
# ═══════════════════════════════════════════════════════════════

def deploy_to_netlify(html_path: str) -> bool:
    """Deploy updated HTML to Netlify via their Files API."""
    if not NETLIFY_SITE_ID or NETLIFY_SITE_ID == "YOUR_NETLIFY_SITE_ID":
        print("  Netlify credentials not configured — skipping auto-deploy.")
        print("  Upload the updated index.html to Netlify Drop manually.")
        return False
    
    print("  Deploying to Netlify...")
    
    with open(html_path, "rb") as f:
        html_content = f.read()
    
    # Create a new deploy
    headers = {
        "Authorization": f"Bearer {NETLIFY_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    
    try:
        # Create deploy
        deploy_resp = requests.post(
            f"https://api.netlify.com/api/v1/sites/{NETLIFY_SITE_ID}/deploys",
            headers=headers,
            json={"files": {"/index.html": hashlib.sha1(html_content).hexdigest()}},
            timeout=30
        )
        
        if deploy_resp.status_code not in [200, 201]:
            print(f"  Deploy creation failed: {deploy_resp.status_code} — {deploy_resp.text[:200]}")
            return False
        
        deploy_data = deploy_resp.json()
        deploy_id = deploy_data["id"]
        required_files = deploy_data.get("required", [])
        
        # Upload files if needed
        if required_files:
            upload_headers = {
                "Authorization": f"Bearer {NETLIFY_ACCESS_TOKEN}",
                "Content-Type": "application/octet-stream"
            }
            upload_resp = requests.put(
                f"https://api.netlify.com/api/v1/deploys/{deploy_id}/files/index.html",
                headers=upload_headers,
                data=html_content,
                timeout=60
            )
            if upload_resp.status_code not in [200, 204]:
                print(f"  File upload failed: {upload_resp.status_code}")
                return False
        
        print(f"  ✓ Deployed successfully! Deploy ID: {deploy_id}")
        print(f"  ✓ Your site at nyspotlightreport.com is now updated.")
        return True
        
    except Exception as e:
        print(f"  Netlify deploy error: {e}")
        return False

# ═══════════════════════════════════════════════════════════════
# MAIN RUNNER
# ═══════════════════════════════════════════════════════════════

def run():
    print("=" * 60)
    print("NY SPOTLIGHT REPORT — AUTO-PUBLISHER")
    print(f"Running at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Load cache
    cache = load_cache()
    print(f"\nPreviously published: {len(cache['published_ids'])} articles")
    
    # Fetch RSS stories
    print("\n[1/4] Fetching RSS feeds...")
    stories = fetch_rss_stories(max_stories_per_feed=8)
    
    # Filter out already-published stories
    new_stories = [s for s in stories if not is_published(s["title"], cache)]
    print(f"  New stories to process: {len(new_stories)}")
    
    if not new_stories:
        print("  No new stories found. Try again later.")
        return
    
    # Generate articles
    print(f"\n[2/4] Generating articles (up to {MAX_ARTICLES_PER_RUN})...")
    published_articles = []
    
    for i, story in enumerate(new_stories[:MAX_ARTICLES_PER_RUN * 2]):
        if len(published_articles) >= MAX_ARTICLES_PER_RUN:
            break
        
        print(f"\n  Story {i+1}: {story['title'][:70]}...")
        print(f"  Source: {story['source']} | Relevance: {story['relevance']}")
        
        article = generate_article(story)
        if not article:
            print("  Skipped (generation failed)")
            continue
        
        # Fetch image
        print(f"  Fetching image: '{article.get('image_search_query','')}'...")
        image_data = fetch_image(
            article.get("image_search_query", ""),
            article.get("section", "broadway")
        )
        article["image_url"]          = image_data["url"]
        article["image_photographer"] = image_data["photographer"]
        
        published_articles.append(article)
        
        # Mark as published in cache
        story_id = hashlib.md5(story["title"].encode()).hexdigest()[:10]
        cache["published_ids"].append(story_id)
        cache["articles"].append({
            "id":       article["id"],
            "headline": article["headline"],
            "date":     article["pub_date"],
            "section":  article.get("section",""),
            "source":   story["source"]
        })
        
        print(f"  ✓ Generated: {article['headline'][:60]}...")
        time.sleep(1)  # Rate limit
    
    if not published_articles:
        print("\nNo articles successfully generated.")
        return
    
    # Inject into HTML
    print(f"\n[3/4] Injecting {len(published_articles)} articles into site HTML...")
    success = inject_articles_into_html(published_articles, SITE_HTML_FILE)
    
    if not success:
        print("  HTML injection failed.")
        return
    
    # Deploy to Netlify
    print("\n[4/4] Deploying to Netlify...")
    deploy_to_netlify(SITE_HTML_FILE)
    
    # Save cache
    save_cache(cache)
    
    # Summary
    print("\n" + "=" * 60)
    print("COMPLETED SUCCESSFULLY")
    print("=" * 60)
    print(f"Articles published this run: {len(published_articles)}")
    print(f"Total articles published ever: {len(cache['published_ids'])}")
    print("\nNew articles:")
    for a in published_articles:
        print(f"  • [{a.get('section','').upper()}] {a['headline'][:65]}...")
    print()

if __name__ == "__main__":
    run()
