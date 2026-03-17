#!/usr/bin/env python3
"""
NY SPOTLIGHT REPORT — AUTO-PUBLISHER v2
========================================
- Pulls NYC/Long Island entertainment news from RSS feeds
- Rewrites in your voice via Claude API
- Attaches royalty-free images from Pexels
- Updates index.html and pushes to GitHub
- Netlify auto-deploys from GitHub (no API tokens needed)
"""

import os, json, time, hashlib, datetime, re, sys
import requests
import feedparser
import anthropic

# ═══════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════
ANTHROPIC_API_KEY    = os.environ.get("ANTHROPIC_API_KEY", "")
PEXELS_API_KEY       = os.environ.get("PEXELS_API_KEY", "")
MAX_ARTICLES_PER_RUN = 5
CACHE_FILE           = "published_articles.json"
HTML_FILE            = "index.html"

# ═══════════════════════════════════════════════════════════════
# RSS FEEDS — NYC & LONG ISLAND FOCUSED
# ═══════════════════════════════════════════════════════════════
RSS_FEEDS = {
    "Broadway World":            "https://www.broadwayworld.com/rss/mainpage.cfm",
    "Playbill":                  "https://playbill.com/feed",
    "TheaterMania":              "https://www.theatermania.com/rss/news.xml",
    "American Theatre":          "https://www.americantheatre.org/feed/",
    "Time Out New York":         "https://www.timeout.com/newyork/feed.xml",
    "Gothamist Arts":            "https://gothamist.com/arts-entertainment/feed",
    "NY Daily News Entertainment":"https://www.nydailynews.com/entertainment/rss2.0.xml",
    "NY Post Page Six":          "https://nypost.com/page-six/feed/",
    "Newsday Entertainment":     "https://www.newsday.com/rss/entertainment",
    "Long Island Press":         "https://www.longislandpress.com/feed/",
    "Deadline Hollywood":        "https://deadline.com/feed/",
    "Variety":                   "https://variety.com/feed/",
    "Hollywood Reporter":        "https://www.hollywoodreporter.com/feed/",
    "IndieWire":                 "https://www.indiewire.com/feed/",
    "Brooklyn Vegan":            "https://www.brooklynvegan.com/feed/",
    "Pitchfork News":            "https://pitchfork.com/rss/news/",
    "WWD":                       "https://wwd.com/feed/",
    "Paper Mag":                 "https://www.papermag.com/rss",
    "Tribeca Film":              "https://tribecafilm.com/stories.rss",
    "New York Magazine Arts":    "https://nymag.com/rss/arts/",
}

NYC_KEYWORDS = [
    "broadway", "off-broadway", "manhattan", "brooklyn", "queens", "bronx",
    "long island", "nassau", "suffolk", "hamptons", "jones beach", "huntington",
    "lincoln center", "carnegie hall", "tribeca", "harlem", "nyfw",
    "new york", "nyc", "opening night", "tony awards"
]

# ═══════════════════════════════════════════════════════════════
# EDITORIAL VOICE
# ═══════════════════════════════════════════════════════════════
SYSTEM_PROMPT = """You are the editorial AI for NY Spotlight Report — New York's premier 
entertainment news outlet, founded by S.C. Thomas.

VOICE: Authoritative, sophisticated, deeply New York. Specific about neighborhoods 
and venues. Treat entertainment as culture, not gossip.

STYLE: Bold declarative headlines. One-sentence decks that earn the click. 
Editorial prose paragraphs — minimum 4 paragraphs in the body.

ALWAYS ground stories in NYC/Long Island geography when possible.

Respond ONLY in this exact JSON format, no extra text:
{
  "headline": "Article headline",
  "deck": "One sentence subheadline",
  "kicker": "Section label e.g. Broadway Review, NYC Fashion, Long Island Arts",
  "section": "one of: broadway, fashion, premiere, film, tv, music, awards, celebrity, industry, longisland",
  "stars": "star rating like ★★★★★ or empty string",
  "read_time": "X min",
  "byline": "S.C. Thomas",
  "body_html": "<p>Body in HTML paragraphs. Min 4 paragraphs.</p>",
  "image_query": "3-5 word royalty-free photo search query"
}"""

# ═══════════════════════════════════════════════════════════════
# CACHE
# ═══════════════════════════════════════════════════════════════
def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {"ids": [], "articles": []}

def save_cache(cache):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def story_id(title):
    return hashlib.md5(title.encode()).hexdigest()[:12]

# ═══════════════════════════════════════════════════════════════
# RSS FETCHING
# ═══════════════════════════════════════════════════════════════
def fetch_stories():
    print("\n[STEP 1] Fetching RSS feeds...")
    stories = []
    for name, url in RSS_FEEDS.items():
        try:
            feed = feedparser.parse(url)
            count = 0
            for entry in feed.entries[:8]:
                title   = entry.get("title","").strip()
                summary = re.sub(r'<[^>]+>',' ', entry.get("summary", entry.get("description",""))).strip()
                summary = re.sub(r'\s+',' ', summary)[:1200]
                link    = entry.get("link","")
                if not title or len(summary) < 50:
                    continue
                text = (title + " " + summary).lower()
                score = sum(1 for kw in NYC_KEYWORDS if kw in text)
                stories.append({"source": name, "title": title, "summary": summary,
                                 "link": link, "score": score})
                count += 1
            print(f"  ✓ {name}: {count} stories")
        except Exception as e:
            print(f"  ✗ {name}: {e}")

    stories.sort(key=lambda x: x["score"], reverse=True)
    print(f"  Total: {len(stories)} stories fetched")
    return stories

# ═══════════════════════════════════════════════════════════════
# ARTICLE GENERATION
# ═══════════════════════════════════════════════════════════════
def generate_article(story):
    if not ANTHROPIC_API_KEY:
        print("  ✗ ERROR: ANTHROPIC_API_KEY not set!")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt = f"""Rewrite this for NY Spotlight Report. Find or emphasize the NYC/Long Island angle.

SOURCE: {story['source']}
HEADLINE: {story['title']}
SUMMARY: {story['summary']}

Respond ONLY with valid JSON."""

    try:
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        text = msg.content[0].text.strip()
        # Strip markdown code fences if present
        text = re.sub(r'^```json?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        data = json.loads(text)
        data["id"]      = story_id(story["title"])
        data["date"]    = datetime.datetime.now().strftime("%B %d, %Y")
        data["src_url"] = story["link"]
        data["source"]  = story["source"]
        return data
    except json.JSONDecodeError as e:
        print(f"    JSON error: {e}")
        print(f"    Raw response: {text[:300]}")
        return None
    except Exception as e:
        print(f"    Generation error: {e}")
        return None

# ═══════════════════════════════════════════════════════════════
# IMAGE FETCHING
# ═══════════════════════════════════════════════════════════════
FALLBACKS = {
    "broadway": "Broadway theater New York",
    "fashion":  "New York fashion runway",
    "premiere": "red carpet premiere",
    "film":     "cinema movie theater",
    "tv":       "television production",
    "music":    "concert performance music",
    "awards":   "award ceremony trophy",
    "celebrity":"New York city night",
    "industry": "New York skyline",
    "longisland":"Long Island New York"
}

def fetch_image(query, section):
    if not PEXELS_API_KEY:
        print("  ⚠ PEXELS_API_KEY not set — skipping images")
        return ""
    headers = {"Authorization": PEXELS_API_KEY}
    for q in [query, FALLBACKS.get(section, "New York entertainment")]:
        try:
            r = requests.get("https://api.pexels.com/v1/search",
                headers=headers,
                params={"query": q, "per_page": 3, "orientation": "landscape"},
                timeout=10)
            if r.status_code == 200:
                photos = r.json().get("photos", [])
                if photos:
                    return photos[0]["src"]["large"]
        except Exception as e:
            print(f"    Image error: {e}")
    return ""

# ═══════════════════════════════════════════════════════════════
# HTML INJECTION
# ═══════════════════════════════════════════════════════════════
SECTION_COLORS = {
    "broadway":"#c87840","fashion":"#b8873a","premiere":"#9070d8",
    "film":"#4a8abf","tv":"#4abf7a","music":"#9070d8","awards":"#d4a855",
    "celebrity":"#d4a855","industry":"#aaaaaa","longisland":"#b5191b"
}
SECTION_BG = {
    "broadway":"bg-broadway","fashion":"bg-fashion","premiere":"bg-premiere",
    "film":"bg-film","tv":"bg-tv","music":"bg-music","awards":"bg-awards",
    "celebrity":"bg-celebrity","industry":"bg-industry","longisland":"bg-broadway"
}

def inject_into_html(articles):
    if not os.path.exists(HTML_FILE):
        print(f"  ✗ ERROR: {HTML_FILE} not found in repo!")
        print("  Make sure you uploaded index.html to your GitHub repository.")
        sys.exit(1)

    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    ARTICLE_MARKER = "// ☆ AUTO-ARTICLES-START ☆"
    CARD_MARKER    = "<!-- ☆ AUTO-CARDS-START ☆ -->"
    TICKER_MARKER  = "<!-- ☆ AUTO-TICKER-START ☆ -->"

    # ── Build JS article entries ──
    js_entries = ""
    for a in articles:
        sec   = a.get("section","broadway")
        bg    = SECTION_BG.get(sec,"bg-broadway")
        img   = a.get("image_url","")
        img_s = f'<img src=\\"{img}\\" alt=\\"{esc(a["headline"])}\\" style=\\"width:100%;height:100%;object-fit:cover;\\">' if img else ""

        js_entries += f"""
'auto-{a["id"]}':{{
  section:'{sec}',cat:'{esc(a.get("kicker",""))}',kicker:'{esc(a.get("kicker",""))}',
  stars:'{esc(a.get("stars",""))}',read:'{esc(a.get("read_time","5 min"))}',
  hed:`{esc(a["headline"])}`,deck:`{esc(a["deck"])}`,
  author:'{esc(a.get("byline","S.C. Thomas"))}',role:'Chief Editor & Founder',
  date:'{esc(a["date"])}',bg:'{bg}',icon:'📰',
  imgHtml:`{img_s}`,
  body:`{esc(a["body_html"])}`,related:[]
}},"""

    # ── Build HTML cards ──
    cards_html = ""
    for a in articles:
        sec   = a.get("section","broadway")
        color = SECTION_COLORS.get(sec,"#b5191b")
        bg    = SECTION_BG.get(sec,"bg-broadway")
        img   = a.get("image_url","")
        img_style = f'background:url("{img}") center/cover no-repeat;' if img else ""
        stars = f'<div class="card-stars">{a["stars"]}</div>' if a.get("stars") else ""
        cards_html += f"""
<div class="card" onclick="openArticle('auto-{a["id"]}')">
  <div class="card-thumb"><div class="card-thumb-inner {bg}" style="{img_style}">{"" if img else "📰"}</div></div>
  {stars}
  <span class="card-kicker" style="color:{color};">{a.get("kicker","")}</span>
  <div class="card-hed">{a["headline"]}</div>
  <div class="card-dek">{a["deck"]}</div>
  <div class="card-byline"><span class="name">{a.get("byline","S.C. Thomas")}</span><span>·</span><span>{a["date"]}</span></div>
</div>"""

    # ── Build ticker items ──
    ticker_html = "".join(
        f'<span class="ticker-item">● {a["headline"][:90]}</span>\n' for a in articles
    )

    # ── Inject markers if missing (first-time setup) ──
    if ARTICLE_MARKER not in html:
        html = html.replace("const ARTICLES = {", f"const ARTICLES = {{\n{ARTICLE_MARKER}\n", 1)
    if CARD_MARKER not in html:
        # Insert at start of first grid-3 div
        html = html.replace('<div class="grid-3">', f'<div class="grid-3">\n{CARD_MARKER}\n', 1)
    if TICKER_MARKER not in html:
        # Insert after first ticker-item
        html = html.replace('class="ticker-item">', 'class="ticker-item">', 1)
        # Find breaking news ticker div and add marker
        html = html.replace('<div class="ticker-wrap">\n  <div class="ticker-track">',
                            f'<div class="ticker-wrap">\n  <div class="ticker-track">\n{TICKER_MARKER}\n', 1)

    # ── Replace markers with new content (prepend so newest is first) ──
    html = html.replace(ARTICLE_MARKER, f"{ARTICLE_MARKER}\n{js_entries}")
    html = html.replace(CARD_MARKER,    f"{CARD_MARKER}\n{cards_html}")
    if TICKER_MARKER in html:
        html = html.replace(TICKER_MARKER, f"{TICKER_MARKER}\n{ticker_html}")

    with open(HTML_FILE, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  ✓ {len(articles)} articles injected into {HTML_FILE}")

def esc(s):
    if not s: return ""
    return str(s).replace("\\","\\\\").replace("`","\\`").replace("${","\\${").replace('"','\\"')

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
def main():
    print("=" * 55)
    print("NY SPOTLIGHT REPORT — AUTO-PUBLISHER v2")
    print(datetime.datetime.now().strftime("%Y-%m-%d %H:%M UTC"))
    print("=" * 55)

    # Validate API keys
    if not ANTHROPIC_API_KEY:
        print("✗ FATAL: ANTHROPIC_API_KEY secret is missing or empty!")
        sys.exit(1)
    print(f"✓ Anthropic API key: set ({ANTHROPIC_API_KEY[:12]}...)")
    print(f"{'✓' if PEXELS_API_KEY else '⚠'} Pexels API key: {'set' if PEXELS_API_KEY else 'NOT SET — images will be skipped'}")

    # Check HTML file exists
    if not os.path.exists(HTML_FILE):
        print(f"\n✗ FATAL: {HTML_FILE} not found!")
        print("You must upload your index.html to the GitHub repository root.")
        sys.exit(1)
    print(f"✓ {HTML_FILE} found ({os.path.getsize(HTML_FILE):,} bytes)")

    # Load cache
    cache = load_cache()
    print(f"✓ Cache: {len(cache['ids'])} articles previously published")

    # Fetch stories
    stories = fetch_stories()
    new_stories = [s for s in stories if story_id(s["title"]) not in cache["ids"]]
    print(f"\n  New unpublished stories: {len(new_stories)}")

    if not new_stories:
        print("\n⚠ No new stories this run — all recent stories already published.")
        print("This is normal. The site is up to date.")
        sys.exit(0)

    # Generate articles
    print(f"\n[STEP 2] Generating up to {MAX_ARTICLES_PER_RUN} articles with Claude...")
    published = []
    for i, story in enumerate(new_stories[:MAX_ARTICLES_PER_RUN * 2]):
        if len(published) >= MAX_ARTICLES_PER_RUN:
            break
        print(f"\n  [{i+1}] {story['title'][:70]}")
        print(f"       Source: {story['source']} | NYC relevance: {story['score']}")

        article = generate_article(story)
        if not article:
            continue

        print(f"       ✓ Generated: {article['headline'][:60]}")

        # Fetch image
        img_url = fetch_image(article.get("image_query",""), article.get("section","broadway"))
        article["image_url"] = img_url
        if img_url:
            print(f"       ✓ Image: {img_url[:60]}...")
        else:
            print(f"       ⚠ No image found")

        published.append(article)
        cache["ids"].append(story_id(story["title"]))
        cache["articles"].append({
            "headline": article["headline"],
            "date": article["date"],
            "section": article.get("section",""),
            "source": story["source"]
        })
        time.sleep(0.5)

    if not published:
        print("\n✗ No articles generated successfully.")
        sys.exit(1)

    # Inject into HTML
    print(f"\n[STEP 3] Injecting {len(published)} articles into {HTML_FILE}...")
    inject_into_html(published)

    # Save cache
    save_cache(cache)
    print(f"✓ Cache saved")

    # Summary
    print("\n" + "=" * 55)
    print(f"✓ SUCCESS — {len(published)} articles published")
    print("=" * 55)
    for a in published:
        print(f"  • [{a.get('section','').upper():10}] {a['headline'][:60]}")
    print("\n✓ index.html updated — Netlify will deploy automatically via GitHub.")

if __name__ == "__main__":
    main()
