#!/usr/bin/env python3
"""Builds static, crawlable pages for the legal texts and the changelog of a-alerts.nl from website/data/*.json.

Run after changing a text:  python3 tools/build_info_pages.py
Output: website/privacy/, cookies/, voorwaarden/, disclaimer/, wat-is-nieuw/ (index.html each).
The old /info/?p=… addresses redirect to these pages (.htaccess and info/index.html).
"""
import html
import json
import pathlib
import re
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent / "website"
SITE = "https://a-alerts.nl"
V = "59"

PAGES = [
    # slug, data file, title (<title>), h1, description
    ("privacy", "privacy", "Privacyverklaring app en website | A-Alerts",
     "Privacyverklaring",
     "Welke gegevens A-Alerts gebruikt in de app en op a-alerts.nl, waarom, hoe lang en welke rechten je hebt. Geen account, geen advertenties en geen tracking."),
    ("cookies", "cookies", "Cookiebeleid a-alerts.nl | A-Alerts",
     "Cookiebeleid",
     "Welke opslag a-alerts.nl gebruikt: alleen wat nodig is voor de site, plus Apple Kaarten na jouw toestemming. Geen advertentie- of trackingcookies."),
    ("voorwaarden", "terms", "Gebruiksvoorwaarden app en website | A-Alerts",
     "Gebruiksvoorwaarden",
     "De gebruiksvoorwaarden van de app en website A-Alerts: wat je mag verwachten, de bronnen van de meldingen en waarom je bij nood altijd 112 belt."),
    ("disclaimer", "disclaimer", "Disclaimer: geen officiële dienst | A-Alerts",
     "Disclaimer",
     "A-Alerts is onafhankelijk en geen officiële dienst van hulpdiensten of overheid. Meldingen kunnen onvolledig of vertraagd zijn. Bel bij nood altijd 112."),
    ("wat-is-nieuw", "changelog", "Wat is nieuw: alle versies | A-Alerts",
     "Wat is nieuw",
     "Alle versies van A-Alerts (voorheen P2000 Apeldoorn): NL-Alert, Burgernet en KNMI, live helikopters, kaartlagen, meldingsprofielen en meer."),
]
NAV = [("privacy", "Privacy"), ("voorwaarden", "Voorwaarden"), ("disclaimer", "Disclaimer"), ("cookies", "Cookies"), ("wat-is-nieuw", "Wat is nieuw")]

ALLOWED = re.compile(r"<(/?)(p|h2|h3|h4|ul|ol|li|strong|b|em|i|a|br|table|thead|tbody|tr|th|td|code|section)(\s[^>]*)?>", re.I)


def clean(fragment: str) -> str:
    """Keeps a small set of tags from our own content files and drops scripts, styles and event handlers."""
    s = re.sub(r"<(script|style|iframe|object|embed|form)[\s\S]*?</\1>", "", fragment or "", flags=re.I)
    s = re.sub(r"\son\w+=\"[^\"]*\"", "", s)
    s = re.sub(r"\sstyle=\"[^\"]*\"", "", s)
    s = re.sub(r"href=\"\s*javascript:[^\"]*\"", "href=\"#\"", s, flags=re.I)
    # Links to the old addresses now go to the static pages.
    for slug, data, *_ in PAGES:
        s = s.replace(f"/info/?p={data}", f"/{slug}/").replace(f"info/?p={data}", f"/{slug}/")
    return s


def nl_date(iso: str) -> str:
    months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
    d = date.fromisoformat(iso[:10])
    return f"{d.day} {months[d.month - 1]} {d.year}"


def body_for(data_name: str):
    data = json.loads((ROOT / "data" / f"{data_name}.json").read_text())
    if isinstance(data, list):
        parts = []
        for v in data:
            vid = html.escape(str(v.get("version") or v.get("id") or ""))
            when = f'<p class="meta">{nl_date(v["release_date"])}</p>' if v.get("release_date") else ""
            parts.append(f'<section class="versie" id="v{vid}"><h2>{vid} · {html.escape(v.get("title", ""))}</h2>{when}{clean(v.get("content", ""))}</section>')
        updated = data[0].get("release_date", "")[:10] if data else ""
        return "".join(parts), updated, ""
    version = str(data.get("version") or "")
    meta = f'<p class="meta">Laatst bijgewerkt: {html.escape(version)}</p>' if version else ""
    return meta + clean(data.get("content", "")), "", version


def page(slug, data_name, title, h1, desc):
    content, updated, _ = body_for(data_name)
    url = f"{SITE}/{slug}/"
    nav = "".join(f'<a href="/{s}/"{" aria-current=\"page\"" if s == slug else ""}>{t}</a>' for s, t in NAV)
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "@id": url, "url": url, "name": h1, "description": desc, "inLanguage": "nl-NL",
             "isPartOf": {"@id": f"{SITE}/#website"}, **({"dateModified": updated} if updated else {})},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "A-Alerts", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": h1, "item": url}]},
        ],
    }
    return f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#cf0a1e">
<meta property="og:type" content="article">
<meta property="og:site_name" content="A-Alerts">
<meta property="og:locale" content="nl_NL">
<meta property="og:title" content="{html.escape(h1)} – A-Alerts">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og/a-alerts.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A-Alerts: live meldingen van brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(h1)} – A-Alerts">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{SITE}/og/a-alerts.jpg">
<meta name="twitter:image:alt" content="A-Alerts: live meldingen in de gemeente Apeldoorn">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/assets/img/aalerts-icon-32.png">
<link rel="apple-touch-icon" href="/assets/img/aalerts-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/css/base.css?v={V}">
<style>
  body {{ padding: 0 16px 60px; }}
  header {{ max-width: 760px; margin: 0 auto; padding: 20px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }}
  header > a {{ display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 700; }}
  header .shield {{ width: 36px; height: 36px; }}
  header nav {{ margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: .9rem; }}
  header nav a {{ font-weight: 500; color: var(--muted); }}
  header nav a[aria-current] {{ color: var(--red); font-weight: 700; }}
  article {{ max-width: 760px; margin: 0 auto; background: var(--surface); border-radius: 24px; padding: clamp(20px, 4vw, 40px); box-shadow: var(--shadow); }}
  article h1 {{ font-family: var(--display); font-weight: 900; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.05; margin: 0 0 .3em; }}
  article h2, article h3 {{ margin-top: 1.6em; }}
  article .meta {{ color: var(--muted); font-size: .9rem; margin-bottom: 1.4em; }}
  article a {{ color: var(--red); }}
  footer {{ max-width: 760px; margin: 24px auto 0; color: var(--muted); font-size: .85rem; text-align: center; }}
</style>
<script src="/config.js?v={V}"></script>
<script src="/assets/js/consent.js?v={V}" defer></script>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header>
  <a href="/"><span class="shield appmark"><img src="/assets/img/aalerts-icon-180.png" alt="" width="40" height="40"></span>A-Alerts</a>
  <nav aria-label="Informatie">{nav}<a href="/pager/">Live pager</a></nav>
</header>
<main>
<article><h1>{html.escape(h1)}</h1>{content}</article>
</main>
<footer>A-Alerts (voorheen P2000 Apeldoorn) · Bel bij nood altijd 112 · <a href="/">a-alerts.nl</a></footer>
<script type="module">import {{ trackVisit }} from "/assets/js/core.js?v={V}"; trackVisit();</script>
</body>
</html>
"""


def main():
    for slug, data_name, title, h1, desc in PAGES:
        out = ROOT / slug / "index.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(page(slug, data_name, title, h1, desc))
        print("wrote", out.relative_to(ROOT.parent), f"title {len(title)} / desc {len(desc)}")


if __name__ == "__main__":
    main()
