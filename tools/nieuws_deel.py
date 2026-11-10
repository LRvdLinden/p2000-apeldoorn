#!/usr/bin/env python3
"""Static share pages for the tab Nieuws: a-alerts.nl/nieuws/<id>/ with the title, intro and image of that article in the
link preview (WhatsApp, iMessage, Facebook …) and in search engines, plus sitemap-nieuws.xml.

Plain HTML (no PHP): each page is website/nieuws/index.html with its own meta tags; the JavaScript then shows the article.
Run by .github/workflows/nieuws-deel.yml every 15 minutes. Usage: nieuws_deel.py <website-dir> <out-dir>
"""
import html
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

API = os.environ.get("API", "https://p2000-apeldoorn-api.lrvdlinden.workers.dev")
SITE = "https://a-alerts.nl"
IMG = SITE + "/assets/img/nieuws/"
ID = re.compile(r"^[pwlr]-[0-9a-f]{12}$")


def get(path):
    req = urllib.request.Request(API + path, headers={"accept": "application/json", "user-agent": "A-Alerts-site/1.0 (+https://a-alerts.nl)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def og_image(url):
    """Static images as JPEG 1200×630 (WhatsApp does not always show WebP); own photos from the beheer are JPEG already."""
    u = (url or "").split("?")[0]
    if u.startswith(IMG) and u.endswith(".webp"):
        return IMG + "og/" + u[len(IMG):-5] + ".jpg", "image/jpeg", 1200, 630
    if "/v1/nieuws/foto/" in u:
        return url, "image/jpeg", None, None
    return SITE + "/og/a-alerts.jpg", "image/jpeg", 1200, 630


def label(x):
    live = x.get("liveblog", x["soort"] == "liveblog")
    if x["soort"] == "liveblog":
        naam = {"burgernet": "Burgernet", "amber": "AMBER Alert", "vermistkind": "Vermist Kind Alert", "nlalert": "NL-Alert"}.get(x["bron"], "Melding")
        return f"Liveblog {naam}" if live else naam
    if x["soort"] == "regionaal":
        return "112 Nieuws" + (f" · {x['plaats']}" if x.get("plaats") else "")
    if x["soort"] == "weer":
        return "Weer"
    return "Politie" + (f" · {x['plaats']}" if x.get("plaats") else "")


def clip(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def page(template, x):
    e = lambda s: html.escape(s or "", quote=True)
    url = f"{SITE}/nieuws/{x['id']}/"
    titel = clip(x["titel"], 110)
    desc = clip(x.get("intro") or "", 190) or f"{label(x)} op A-Alerts."
    img, typ, w, h = og_image(x.get("afbeelding"))
    t = template
    t = re.sub(r"<title>.*?</title>", f"<title>{e(titel)} | A-Alerts</title>", t, flags=re.S)
    t = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + e(desc), t)
    t = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + url, t)
    t = re.sub(r'(<meta property="og:type" content=")[^"]*', lambda m: m.group(1) + "article", t)
    t = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + e(titel), t)
    t = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + e(desc), t)
    t = re.sub(r'(<meta property="og:url" content=")[^"]*', lambda m: m.group(1) + url, t)
    t = re.sub(r'(<meta property="og:image" content=")[^"]*', lambda m: m.group(1) + e(img), t)
    t = re.sub(r'(<meta property="og:image:type" content=")[^"]*', lambda m: m.group(1) + typ, t)
    t = re.sub(r'(<meta property="og:image:alt" content=")[^"]*', lambda m: m.group(1) + e(f"{label(x)}: {titel}"), t)
    if w:
        t = re.sub(r'(<meta property="og:image:width" content=")[^"]*', lambda m: m.group(1) + str(w), t)
        t = re.sub(r'(<meta property="og:image:height" content=")[^"]*', lambda m: m.group(1) + str(h), t)
    else:
        t = re.sub(r'\s*<meta property="og:image:(width|height)" content="[^"]*">', "", t)
    t = re.sub(r'(<meta name="twitter:title" content=")[^"]*', lambda m: m.group(1) + e(titel), t)
    t = re.sub(r'(<meta name="twitter:description" content=")[^"]*', lambda m: m.group(1) + e(desc), t)
    t = re.sub(r'(<meta name="twitter:image" content=")[^"]*', lambda m: m.group(1) + e(img), t)
    ld = {"@context": "https://schema.org", "@type": "LiveBlogPosting" if x.get("liveblog", x["soort"] == "liveblog") else "NewsArticle",
          "headline": titel, "description": desc, "image": [img], "datePublished": x.get("start") or x["at"], "dateModified": x.get("bijgewerkt") or x["at"],
          "url": url, "inLanguage": "nl-NL", "publisher": {"@type": "Organization", "name": "A-Alerts", "url": SITE},
          "isPartOf": {"@id": f"{SITE}/nieuws/"}}
    if x["soort"] == "regionaal":
        ld["isBasedOn"] = x.get("bron_url")
        t = t.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">')
    t = re.sub(r'<script type="application/ld\+json">.*?</script>', lambda m: '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>", t, flags=re.S)
    return t


def main(site_dir, out_dir):
    template = open(os.path.join(site_dir, "nieuws", "index.html"), encoding="utf-8").read()
    items = [x for x in get("/v1/nieuws?limit=100") if ID.match(x.get("id", ""))]
    os.makedirs(os.path.join(out_dir, "nieuws"), exist_ok=True)
    urls = []
    for x in items:
        d = os.path.join(out_dir, "nieuws", x["id"])
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(template, x))
        # 112 Nieuws: only title and intro, the article itself is theirs: not in the sitemap (noindex).
        if x["soort"] != "regionaal":
            urls.append((f"{SITE}/nieuws/{x['id']}/", (x.get("bijgewerkt") or x["at"])[:10]))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          f"  <url><loc>{SITE}/nieuws/</loc><lastmod>{today}</lastmod><changefreq>hourly</changefreq></url>"]
    sm += [f"  <url><loc>{u}</loc><lastmod>{d}</lastmod></url>" for u, d in urls]
    sm.append("</urlset>")
    open(os.path.join(out_dir, "sitemap-nieuws.xml"), "w", encoding="utf-8").write("\n".join(sm) + "\n")
    print(f"{len(items)} deelpagina's, {len(urls)} in de sitemap")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
