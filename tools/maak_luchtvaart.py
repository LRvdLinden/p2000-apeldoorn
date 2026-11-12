#!/usr/bin/env python3
"""Builds website/luchtvaart/index.html (what flies in A-Alerts) and the block on the homepage (between the LUCHT markers).
The drawings are A-Alerts' own (tools/lucht/*.svg); they are put inline so the rotors can turn. Run: python3 tools/maak_luchtvaart.py"""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = ROOT / "tools" / "lucht"
V = "1"

def inline(name, pref):
    s = (SVG / f"{name}.svg").read_text()
    s = re.sub(r'id="(\w+)"', lambda m: f'id="{pref}{m.group(1)}"', s)
    s = re.sub(r'url\(#(\w+)\)', lambda m: f'url(#{pref}{m.group(1)})', s)
    s = re.sub(r'<path d="(M[^"]*Q[^"]*)" fill="none" stroke="#1b1b1b"', r'<path class="rot" d="\1" fill="none" stroke="#1b1b1b"', s)
    s = s.replace('<g stroke="#1b1b1b" stroke-width="8" stroke-linecap="round">', '<g class="trot" stroke="#1b1b1b" stroke-width="8" stroke-linecap="round">')
    return s.replace("<svg ", '<svg aria-hidden="true" ', 1)

def teken(f, pref):
    return f'<img src="/assets/img/{f}" alt="" loading="lazy">' if f.endswith(".png") else inline(f, pref)

GROEPEN = [("Hulpdiensten", [
 ("heli_lifeliner.png", "Lifeliner", "Traumahelikopter · EC135", "Brengt een arts en verpleegkundige van het Mobiel Medisch Team snel naar een ernstig ongeval. Er zijn vier Lifeliners, met als bases Amsterdam, Rotterdam, Volkel en Groningen."),
 ("heli_politie.png", "Zulu", "Politiehelikopter · EC135", "De helikopter van de Luchtvaartpolitie. Zoekt vermiste personen en verdachten, vaak met een warmtebeeldcamera, en ondersteunt bij achtervolgingen en grote incidenten."),
 ("heli_politie_aw139.png", "Zulu", "Politiehelikopter · AW139", "De grotere politiehelikopter. Kan meer mensen en materiaal meenemen, bijvoorbeeld een arrestatieteam.")]),
("Defensie: helikopters", [
 ("chinook", "Chinook", "Transporthelikopter · CH-47", "De grote helikopter met twee rotors. Vervoert militairen en zwaar materieel en helpt bij natuurbranden met een blusbak onder de romp."),
 ("apache", "Apache", "Gevechtshelikopter · AH-64", "Smalle gevechtshelikopter met twee bemanningsleden achter elkaar. Je ziet hem vooral bij oefeningen, vaak laag en in tweetallen."),
 ("cougar", "Cougar", "Transporthelikopter · AS532", "Middelgrote transporthelikopter voor militairen en gewonden. Wordt ook ingezet voor blussen en hulp bij rampen."),
 ("nh90", "NH90", "Maritieme helikopter", "De grijze helikopter van de marine. Vliegt vanaf schepen en vanaf de kust, voor opsporing, redding en transport."),
 ("heli", "Overige helikopter", "Buitenlandse en nieuwe types", "Militaire helikopters die geen eigen tekening hebben, zoals toestellen van buurlanden die door Nederland vliegen.")]),
("Defensie: vliegtuigen", [
 ("f35", "Straaljager", "F-35", "Het jachtvliegtuig van de luchtmacht. Vliegt hoog en snel; je hoort hem meestal eerder dan je hem ziet."),
 ("hercules", "Transport", "C-130 Hercules", "Het viermotorige transportvliegtuig voor vracht, militairen en hulpgoederen."),
 ("les", "Lesvliegtuig", "Pilatus PC-7", "Het toestel waarin nieuwe vliegers van de luchtmacht leren vliegen. Maakt veel oefenvluchten boven Nederland."),
 ("vliegtuig", "Overig vliegtuig", "Tankers en transport", "Andere militaire vliegtuigen, zoals tankvliegtuigen, grote transporttoestellen en toestellen van buurlanden.")]),
("Kustwacht, Marechaussee en regering", [
 ("kustwacht_dash8", "Kustwacht vliegtuig", "Dash-8", "Patrouilleert boven de Noordzee: let op scheepvaart, vervuiling en mensen in nood."),
 ("kustwacht_aw189", "Kustwacht helikopter", "AW189", "De reddingshelikopter van de Kustwacht, voor opsporing en redding op zee en langs de kust."),
 ("kustwacht_heli", "Kustwacht overig", "Buitenland", "Reddingshelikopters van buitenlandse kustwachten die boven Nederland of de Noordzee vliegen."),
 ("kmar", "Koninklijke Marechaussee", "Patrouillevliegtuig", "Klein tweemotorig vliegtuig met camera's, voor toezicht vanuit de lucht."),
 ("phgov", "Regeringsvliegtuig", "PH-GOV · Boeing 737", "Het vliegtuig van de Nederlandse regering, voor reizen van het Koninklijk Huis en ministers.")])]

ANIM = """
.rot{transform-box:fill-box;transform-origin:center;animation:lv-draai .28s linear infinite}
.trot{transform-box:fill-box;transform-origin:center;animation:lv-rond .35s linear infinite}
@keyframes lv-draai{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.12)}}
@keyframes lv-rond{to{transform:rotate(360deg)}}
@keyframes lv-puls{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}100%{box-shadow:0 0 0 12px rgba(34,197,94,0)}}
"""
TELLER = """<script type="module">
import { API } from "/assets/js/core.js?v=61";
// Live number: Lifeliners and police helicopters in the air plus defence and government aircraft above the Netherlands.
const el = document.getElementById("lvAantal");
async function tel() {
  try {
    const [h, l] = await Promise.all([fetch(`${API}/v1/helikopters`).then((r) => r.json()), fetch(`${API}/v1/lucht`).then((r) => r.json())]);
    const n = (h.helikopters || []).filter((x) => !x.op_grond).length + (l.toestellen || []).filter((x) => !x.op_grond).length;
    el.textContent = n === 1 ? "1 toestel nu in de lucht" : `${n} toestellen nu in de lucht`;
  } catch { el.textContent = "Live op de kaart"; }
}
tel(); setInterval(() => { if (!document.hidden) tel(); }, 30000);
</script>"""

def detail():
    uitleg, k = "", 0
    for titel, items in GROEPEN:
        uitleg += f'<h2>{titel}</h2><div class="rijen">'
        for f, naam, soort, tekst in items:
            k += 1
            uitleg += f'<section class="rij"><span class="tek">{teken(f, f"u{k}")}</span><div><b>{naam}</b><small>{soort}</small><p>{tekst}</p></div></section>'
        uitleg += "</div>"
    lucht = [("heli_lifeliner.png", 58, 26, 0, 150, 0), ("chinook", 30, 34, -6, 190, 0), ("f35", 8, 11, -3, 170, 0), ("kustwacht_aw189", 70, 30, -14, 170, 1),
             ("hercules", 18, 24, -12, 210, 1), ("apache", 46, 28, -20, 170, 0), ("phgov", 4, 19, -9, 230, 1)]
    sky = "".join(f'<div class="vl{" rev" if rev else ""}" style="top:{top}%;width:{w}px;animation-duration:{dur}s;animation-delay:{dl}s"><div class="bob" style="animation-delay:{-i * 0.7}s">{teken(f, f"k{i}")}</div></div>'
                  for i, (f, top, dur, dl, w, rev) in enumerate(lucht))
    titel = "Alles wat vliegt in A-Alerts"
    desc = "Welke helikopters en vliegtuigen zie je live in A-Alerts? Lifeliners, politiehelikopters, Defensie (Chinook, Apache, F-35), de Kustwacht, de Marechaussee en het regeringsvliegtuig."
    return f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titel}: helikopters en vliegtuigen live | A-Alerts</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://a-alerts.nl/luchtvaart/">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#cf0a1e">
<meta property="og:type" content="website">
<meta property="og:site_name" content="A-Alerts">
<meta property="og:locale" content="nl_NL">
<meta property="og:title" content="{titel}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://a-alerts.nl/luchtvaart/">
<meta property="og:image" content="https://a-alerts.nl/og/a-alerts.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/assets/img/aalerts-icon-32.png">
<link rel="apple-touch-icon" href="/assets/img/aalerts-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/css/base.css?v=57">
<style>
  body {{ padding: 0 16px 60px; }}
  header {{ max-width: 1120px; margin: 0 auto; padding: 20px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }}
  header > a {{ display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 700; }}
  header .shield {{ width: 36px; height: 36px; }}
  header nav {{ margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: .9rem; }}
  header nav a {{ font-weight: 500; color: var(--muted); }}
  main {{ max-width: 1120px; margin: 0 auto; }}
  h1 {{ font-family: var(--display); font-weight: 900; font-size: clamp(1.9rem, 4.4vw, 2.9rem); line-height: 1.05; margin: 10px 0 .3em; }}
  .sub {{ color: var(--muted); max-width: 640px; margin: 0; }}
  .live {{ display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 999px; padding: 7px 13px; font-weight: 700; font-size: .85rem; box-shadow: var(--shadow); }}
  .live i {{ width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: lv-puls 1.6s ease-out infinite; }}
  .knop {{ display: inline-flex; gap: 8px; align-items: center; background: var(--red); color: #fff; text-decoration: none; font-weight: 700; padding: 11px 17px; border-radius: 12px; margin: 16px 0 0; }}
  .lucht {{ position: relative; height: clamp(200px, 30vw, 280px); border-radius: 24px; overflow: hidden; background: linear-gradient(#5aa9e6, #a7d5f5 55%, #e3f2fc); box-shadow: var(--shadow); margin-top: 22px; }}
  .wolk {{ position: absolute; height: 34px; border-radius: 40px; background: rgba(255,255,255,.75); filter: blur(2px); animation: lv-drijf linear infinite; }}
  .wolk::before, .wolk::after {{ content: ""; position: absolute; background: inherit; border-radius: 50%; }}
  .wolk::before {{ width: 46%; height: 170%; left: 14%; top: -70%; }} .wolk::after {{ width: 34%; height: 130%; right: 16%; top: -45%; }}
  .vl {{ position: absolute; left: 0; animation: lv-vlieg linear infinite; }} .vl.rev {{ animation-name: lv-terug; }}
  .vl img, .vl svg {{ display: block; width: 100%; height: auto; filter: drop-shadow(0 6px 6px rgba(15,23,42,.25)); }}
  .bob {{ animation: lv-dein 3.2s ease-in-out infinite alternate; }} .vl.rev .bob {{ animation-name: lv-deinterug; }}
  h2 {{ margin: 34px 0 12px; font-size: .95rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }}
  .rijen {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; }}
  .rij {{ display: flex; gap: 14px; align-items: center; background: var(--surface); border-radius: 16px; padding: 14px; box-shadow: var(--shadow); transition: transform .25s; }}
  .rij .tek {{ flex: none; width: 112px; }} .rij .tek img, .rij .tek svg {{ width: 100%; height: auto; display: block; transition: transform .45s cubic-bezier(.2,.9,.3,1.3); }}
  .rij b {{ display: block; font-size: 1rem; }} .rij small {{ color: var(--muted); font-size: .78rem; }} .rij p {{ margin: 6px 0 0; font-size: .86rem; line-height: 1.45; }}
  .rij:hover {{ transform: translateY(-3px); }} .rij:hover .tek img, .rij:hover .tek svg {{ transform: translate(6px,-6px) rotate(-4deg) scale(1.06); }}
  .hoe {{ background: var(--surface); border-radius: 16px; padding: 16px 18px; margin-top: 14px; font-size: .9rem; line-height: 1.5; box-shadow: var(--shadow); }} .hoe b {{ display: block; margin-bottom: 4px; }}
  footer {{ max-width: 1120px; margin: 28px auto 0; color: var(--muted); font-size: .85rem; text-align: center; }}
  @keyframes lv-vlieg {{ from {{ transform: translateX(-260px); }} to {{ transform: translateX(calc(100vw + 60px)); }} }}
  @keyframes lv-terug {{ from {{ transform: translateX(calc(100vw + 60px)); }} to {{ transform: translateX(-260px); }} }}
  @keyframes lv-dein {{ from {{ transform: translateY(-5px) rotate(-1.2deg); }} to {{ transform: translateY(5px) rotate(1.2deg); }} }}
  @keyframes lv-deinterug {{ from {{ transform: scaleX(-1) translateY(-5px) rotate(-1.2deg); }} to {{ transform: scaleX(-1) translateY(5px) rotate(1.2deg); }} }}
  @keyframes lv-drijf {{ from {{ transform: translateX(-30vw); }} to {{ transform: translateX(110vw); }} }}
  {ANIM}
  @media (prefers-reduced-motion: reduce) {{ .vl, .bob, .rot, .trot, .wolk, .live i {{ animation: none; }} .vl {{ position: static; display: inline-block; margin: 10px; }} .lucht {{ height: auto; padding: 12px; }} }}
</style>
<script src="/config.js?v=57"></script>
<script src="/assets/js/consent.js?v=59" defer></script>
</head>
<body>
<header>
  <a href="/"><span class="shield appmark"><img src="/assets/img/aalerts-icon-180.png" alt="" width="40" height="40"></span>A-Alerts</a>
  <nav aria-label="Informatie"><a href="/pager/#kaart">Live kaart</a><a href="/nieuws/">Nieuws</a><a href="/hulp/">Hulp</a><a href="/wat-is-nieuw/">Wat is nieuw</a></nav>
</header>
<main>
<span class="live"><i></i> <span id="lvAantal">Live op de kaart</span></span>
<h1>{titel}</h1>
<p class="sub">Zeventien soorten helikopters en vliegtuigen, live op de kaart in de app en op de website. Hieronder zie je wat ze zijn en wat ze doen.</p>
<a class="knop" href="/pager/#kaart">Open de live kaart →</a>
<div class="lucht" aria-hidden="true"><span class="wolk" style="top:14%;width:180px;animation-duration:70s;animation-delay:-10s"></span><span class="wolk" style="top:50%;width:240px;animation-duration:95s;animation-delay:-50s"></span>{sky}</div>
{uitleg}
<h2>Goed om te weten</h2>
<div class="hoe"><b>Hoe herkent A-Alerts een toestel?</b>Elk toestel zendt een vast adres uit dat nooit verandert. Daaraan en aan het type herkennen we het, ook als de roepnaam per vlucht anders is. Een toestel dat zijn positie niet uitzendt, staat niet op de kaart. Posities: adsb.lol (ODbL).</div>
<div class="hoe"><b>Zo zet je het aan</b>Open de kaart, kies Kaartlagen en zet <b style="display:inline">Defensie en overheid</b> aan. Lifeliners en politiehelikopters staan standaard aan.</div>
</main>
<footer>A-Alerts (voorheen P2000 Apeldoorn) · Bel bij nood altijd 112 · <a href="/">a-alerts.nl</a> · tekeningen: A-Alerts</footer>
{TELLER}
<script type="module">import {{ trackVisit }} from "/assets/js/core.js?v=61"; trackVisit();</script>
</body>
</html>
"""

def home():
    mk = [("heli_lifeliner.png", "Lifeliner 3", "lv-p1", 22), ("chinook", "Chinook", "lv-p2", 30), ("heli_politie.png", "Zulu 05", "lv-p3", 26), ("f35", "F-35", "lv-p4", 9), ("kustwacht_dash8", "Kustwacht", "lv-p5", 28)]
    def t(f, pref): return f'<img src="assets/img/{f}" alt="" loading="lazy">' if f.endswith(".png") else inline(f, pref)
    markers = "".join(f'<div class="lv-mk" style="animation:{p} {d}s linear infinite"><div>{t(f, f"h{i}")}</div><span>{l}</span></div>' for i, (f, l, p, d) in enumerate(mk))
    return f"""<!-- LUCHT:START (made by tools/maak_luchtvaart.py) -->
  <section class="lv" id="luchtvaart" aria-label="Helikopters en vliegtuigen">
    <style>
      .lv {{ max-width: 1120px; margin: 0 auto; padding: 4rem 20px; display: grid; grid-template-columns: 1.15fr 1fr; gap: 28px; align-items: center; }}
      @media (max-width: 760px) {{ .lv {{ grid-template-columns: 1fr; padding: 3rem 20px; }} }}
      .lv h2 {{ font-family: var(--display); font-weight: 900; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.05; margin: 0; }}
      .lv .sub {{ color: var(--muted); margin: .8rem 0 0; max-width: 520px; }}
      .lv-live {{ display: inline-flex; align-items: center; gap: 8px; background: color-mix(in srgb, currentColor 12%, transparent); border-radius: 999px; padding: 7px 13px; font-weight: 700; font-size: .85rem; margin-bottom: 12px; }}
      .lv-live i {{ width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: lv-puls 1.6s ease-out infinite; }}
      .lv-knop {{ display: inline-flex; gap: 8px; align-items: center; background: var(--red); color: #fff; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 12px; margin: 18px 8px 0 0; }}
      .lv-knop.licht {{ background: color-mix(in srgb, currentColor 14%, transparent); color: inherit; }}
      .lv-map {{ --land: #e4ecd9; --weg: #fff; --water: #b9dcf2; --stad: #d6d9de; position: relative; aspect-ratio: 4/3; border-radius: 22px; overflow: hidden; background: var(--land); box-shadow: var(--shadow); display: block; }}
      .lv-map > svg {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
      .lv-mk {{ position: absolute; left: 0; top: 0; width: 86px; margin: -22px 0 0 -43px; text-align: center; z-index: 2; }}
      .lv-mk img, .lv-mk svg {{ width: 86px; height: auto; display: block; filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }}
      .lv-mk span {{ display: inline-block; margin-top: 2px; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: rgba(255,255,255,.92); color: #111; white-space: nowrap; }}
      @keyframes lv-p1 {{ 0% {{ left: -8%; top: 70%; }} 100% {{ left: 108%; top: 28%; }} }}
      @keyframes lv-p2 {{ 0% {{ left: 20%; top: 108%; }} 100% {{ left: 74%; top: -10%; }} }}
      @keyframes lv-p3 {{ 0% {{ left: 38%; top: 44%; }} 25% {{ left: 56%; top: 40%; }} 50% {{ left: 60%; top: 58%; }} 75% {{ left: 42%; top: 62%; }} 100% {{ left: 38%; top: 44%; }} }}
      @keyframes lv-p4 {{ 0% {{ left: -10%; top: 16%; }} 100% {{ left: 112%; top: 8%; }} }}
      @keyframes lv-p5 {{ 0% {{ left: -10%; top: 90%; }} 100% {{ left: 112%; top: 66%; }} }}
      {ANIM}
      @media (prefers-reduced-motion: reduce) {{ .lv .rot, .lv .trot, .lv-live i {{ animation: none; }} .lv-mk {{ animation-play-state: paused !important; animation-delay: -6s !important; }} }}
    </style>
    <a class="lv-map" href="luchtvaart/" aria-label="Voorbeeld van de kaart met helikopters en vliegtuigen; naar de uitleg per toestel" data-reveal>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M352 0 Q344 80 358 150 Q370 220 356 300 L372 300 Q386 220 374 150 Q360 80 368 0Z" fill="var(--water)"/>
        <ellipse cx="190" cy="150" rx="58" ry="40" fill="var(--stad)"/><ellipse cx="300" cy="96" rx="16" ry="11" fill="var(--stad)"/><ellipse cx="110" cy="230" rx="18" ry="12" fill="var(--stad)"/>
        <path d="M0 205 Q120 190 200 200 T400 178" fill="none" stroke="var(--weg)" stroke-width="7"/><path d="M262 300 Q250 200 258 150 T250 0" fill="none" stroke="var(--weg)" stroke-width="7"/>
        <path d="M0 120 Q90 130 190 150 T330 70" fill="none" stroke="var(--weg)" stroke-width="3"/><path d="M190 150 Q170 220 110 230" fill="none" stroke="var(--weg)" stroke-width="3"/>
        <g font-family="Arial" font-weight="700" fill="#6b7280"><text x="160" y="154" font-size="13" fill="#111827">Apeldoorn</text><text x="286" y="84" font-size="8">Teuge</text><text x="92" y="250" font-size="8">Beekbergen</text><text x="30" y="198" font-size="8">A1</text><text x="266" y="40" font-size="8">A50</text><text x="376" y="150" font-size="7">IJssel</text></g>
      </svg>
      {markers}
    </a>
    <div data-reveal>
      <span class="lv-live"><i></i> <span id="lvAantal">Live op de kaart</span></span>
      <h2>Zie wat er boven je vliegt</h2>
      <p class="sub">Lifeliners en politiehelikopters, en nu ook Defensie, de Kustwacht en het regeringsvliegtuig. Live op de kaart, elk toestel met zijn eigen tekening.</p>
      <a class="lv-knop" href="luchtvaart/">Welke toestellen zie je? →</a><a class="lv-knop licht" href="pager/#kaart">Open de kaart</a>
    </div>
    {TELLER.replace('"/assets/js/core.js?v=61"', '"./assets/js/core.js?v=61"')}
  </section>
  <!-- LUCHT:END -->"""

(ROOT / "website" / "luchtvaart").mkdir(exist_ok=True)
(ROOT / "website" / "luchtvaart" / "index.html").write_text(detail())
idx = ROOT / "website" / "index.html"
s = idx.read_text()
blok = home()
if "<!-- LUCHT:START" in s:
    s = re.sub(r"<!-- LUCHT:START.*?<!-- LUCHT:END -->", lambda m: blok, s, flags=re.S)
else:
    anker = "  <!-- DEVICES -->"
    assert s.count(anker) == 1
    s = s.replace(anker, blok + "\n\n" + anker)
idx.write_text(s)
print("luchtvaart/index.html", len(detail()) // 1024, "KB; homepage", len(s) // 1024, "KB")
