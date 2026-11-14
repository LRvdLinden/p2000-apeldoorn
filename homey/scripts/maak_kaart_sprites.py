"""Builds assets/kaart/: the pieces the Homey app puts on a map image (watermark, NL-Alert marker, KNMI card text and icons).
Text is pre-rendered (Homey has no fonts), at 2x for the 1200x1200 map. Run from the app folder:
  python3 scripts/maak_kaart_sprites.py <a-alerts website/assets/img> <knmi-homey app folder>
"""
import sys, os, json, base64, io
from PIL import Image, ImageDraw, ImageFont
IMG, KNMI = sys.argv[1], sys.argv[2]
OUT = 'assets/kaart'
os.makedirs(OUT, exist_ok=True)
F = '/usr/share/fonts/opentype/inter/'
REG, BOLD = ImageFont.truetype(F + 'Inter-Regular.otf', 24), ImageFont.truetype(F + 'Inter-Bold.otf', 30)
meta = {}

def save(name, im):
    im.save(f'{OUT}/{name}.png', optimize=True)
    meta[name] = [im.width, im.height]

# Watermark (130x34 pt) and NL-Alert marker (39x48 pt), at 2x
save('watermerk', Image.open(f'{IMG}/kaart-watermerk.png').convert('RGBA').resize((260, 68), Image.LANCZOS))
save('marker_nlalert', Image.open(f'{IMG}/marker_nlalert.png').convert('RGBA').resize((78, 96), Image.LANCZOS))
save('marker_vermistkind', Image.open(f'{IMG}/marker_vermistkind.png').convert('RGBA').resize((78, 96), Image.LANCZOS))

def tekst(name, s, font, kleur):
    l, t, r, b = font.getbbox(s)
    h = 40 if font is BOLD else 32
    im = Image.new('RGBA', (r + 2, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, h / 2), s, font=font, fill=kleur, anchor='lm')
    save(name, im)

tekst('knmi_label', 'KNMI-weerwaarschuwing', REG, (93, 101, 120))
tekst('knmi_vanaf', 'vanaf ', BOLD, (18, 23, 38))
for code, naam in {'yellow': 'Code geel', 'orange': 'Code oranje', 'red': 'Code rood', 'green': 'Code groen'}.items():
    tekst(f'code_{code}', f'{naam} · ', BOLD, (18, 23, 38))
SOORTEN = ['Mist', 'Dichte mist', 'Wind', 'Zware windstoten', 'Windstoten', 'Onweer', 'Regen', 'Zware regen', 'Sneeuw',
           'Sneeuw en gladheid', 'Gladheid', 'IJzel', 'Hitte', 'Kou', 'Strenge vorst', 'Hagel', 'Tornado', 'Kustwaarschuwing', 'Weerwaarschuwing']
for i, s in enumerate(SOORTEN):
    tekst(f'soort_{i}', s, BOLD, (18, 23, 38))
meta['soorten'] = SOORTEN
for ch, key in [*[(str(d), str(d)) for d in range(10)], (':', 'colon'), ('/', 'slash'), (' – ', 'dash'), (' ', 'space')]:
    tekst(f'teken_{key}', ch, BOLD, (18, 23, 38))
# Time window like knmi.nl: "maandag 23:30 tot dinsdag 12:00"
for i, d in enumerate(['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']):
    tekst(f'dag_{i}', d, BOLD, (18, 23, 38))
tekst('woord_tot', 'tot', BOLD, (18, 23, 38))

# KNMI icons from the KNMI Homey app (same author): dark for yellow, white for orange/red/green
sp = json.load(open(f'{KNMI}/assets/map/sprites.json'))['common']
for k in ['wind', 'thunderstorm', 'rain', 'snow', 'ice', 'fog', 'heat', 'cold', 'waterspout', 'warning']:
    for v in 'dw':
        im = Image.open(io.BytesIO(base64.b64decode(sp[f'icon_{k}_{v}']['png']))).convert('RGBA').resize((40, 40), Image.LANCZOS)
        save(f'icon_{k}_{v}', im)
json.dump(meta, open(f'{OUT}/kaart.json', 'w'), indent=1)
print(len(meta), 'onderdelen')
