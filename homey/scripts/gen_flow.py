#!/usr/bin/env python3
"""Generates the Flow cards in .homeycompose/flow/ (Dutch only; 'en' carries the same Dutch text because
Homey requires an English value). Run after changing a card: python3 scripts/gen_flow.py"""
import json, os

T = lambda s: {"en": s, "nl": s}
ROOT = os.path.join(os.path.dirname(__file__), "..", ".homeycompose", "flow")

def tok(name, typ, title, example):
    return {"name": name, "type": typ, "title": T(title), "example": example if typ != "image" else None}

MELDING = [
    tok("afbeelding", "image", "Afbeelding", None),
    tok("afbeelding_url", "string", "Afbeelding-URL", "https://raw.githubusercontent.com/LRvdLinden/P2000-brand/main/banners/banner-life-apeldoorn.png"),
    tok("bericht", "string", "Bericht (kant-en-klaar)", "🚨🚁: Traumaheli (Gelderland Zuid) met Prio 1 naar melding …"),
    tok("titel", "string", "Titel", "A0 Ambu 08993 Reanimatie Europaweg Apeldoorn"),
    tok("p2000_tekst", "string", "P2000-tekst", "A0 Ambu 08993 Reanimatie Europaweg Apeldoorn Rit 342706 reg6"),
    tok("discipline", "string", "Discipline", "Traumaheli"),
    tok("prioriteit", "string", "Prioriteit", "A0"),
    tok("categorie", "string", "Categorie", "Assistentie bij reanimatie"),
    tok("woonplaats", "string", "Woonplaats", "Apeldoorn"),
    tok("plaatsen", "string", "Plaatsen en wijken", "Apeldoorn, Zevenhuizen"),
    tok("straat", "string", "Straat", "Europaweg"),
    tok("regio", "string", "Regio", "Gelderland-Zuid"),
    tok("tijd", "string", "Tijd", "22:05"),
    tok("datum", "string", "Datum", "06/11/2026"),
    tok("capcodes", "string", "Capcodes", "0923993"),
    tok("eenheden", "string", "Eenheden", "Traumaheli LifeLiner 3"),
    tok("voertuigen", "string", "Voertuigen", "Nijmegen - Lifeliner 3"),
    tok("helikopter", "string", "Helikopter", "Lifeliner 3"),
    tok("grip", "string", "GRIP / opschaling", "GRIP 1"),
    tok("link", "string", "Link naar a-alerts.nl", "https://a-alerts.nl/melding/7b9acb9c-…"),
    tok("latitude", "number", "Breedtegraad", 52.21),
    tok("longitude", "number", "Lengtegraad", 5.97),
    tok("whatsapp_link", "string", "WhatsApp-groeplink", "https://korturl.nl/?r=wa-p2000"),
]
WAARSCHUWING = [
    tok("afbeelding", "image", "Afbeelding", None),
    tok("afbeelding_url", "string", "Afbeelding-URL", "https://raw.githubusercontent.com/LRvdLinden/P2000-brand/main/banners/banner-burgernet-apeldoorn.png"),
    tok("bericht", "string", "Bericht (kant-en-klaar)", "Burgernet melding in APELDOORN gesloten! …"),
    tok("bron", "string", "Bron", "Burgernet"),
    tok("titel", "string", "Titel", "Vermissing"),
    tok("tekst", "string", "Tekst", "De politie zoekt naar …"),
    tok("plaats", "string", "Plaats", "Apeldoorn"),
    tok("status", "string", "Status", "Actief"),
    tok("code", "string", "KNMI-code", "Code oranje"),
    tok("soort", "string", "Soort", "Zware windstoten"),
    tok("begin", "string", "Begin", "06/11/2026 13:05"),
    tok("einde", "string", "Einde", "06/11/2026 13:19"),
    tok("link", "string", "Link naar a-alerts.nl", "https://a-alerts.nl/waarschuwing/burgernet:3967274"),
    tok("bron_link", "string", "Link naar de bron", "https://www.burgernet.nl/burgernet/3967274"),
    tok("whatsapp_link", "string", "WhatsApp-groeplink", "https://korturl.nl/?r=wa-burgernet"),
]

PLAATS = {"name": "plaats", "type": "autocomplete", "title": T("Plaats"), "placeholder": T("Alle plaatsen")}
DIENST = {"name": "dienst", "type": "dropdown", "title": T("Discipline"), "values": [
    {"id": "alle", "label": T("Alle disciplines")}, {"id": "brandweer", "label": T("Brandweer")},
    {"id": "ambulance", "label": T("Ambulance")}, {"id": "politie", "label": T("Politie")}, {"id": "traumaheli", "label": T("Traumaheli")}]}
PRIO = {"name": "prioriteit", "type": "text", "required": False, "title": T("Prioriteit"), "placeholder": T("Alle (bv. A1, P1)")}
CAPCODE = {"name": "capcode", "type": "text", "required": False, "title": T("Capcode"), "placeholder": T("Alle capcodes")}
CODE = {"name": "code", "type": "dropdown", "title": T("Code"), "values": [
    {"id": "1", "label": T("geel of hoger")}, {"id": "2", "label": T("oranje of hoger")}, {"id": "3", "label": T("rood")}]}

def strip(tokens):
    return [{k: v for k, v in t.items() if v is not None} for t in tokens]

def card(kind, id_, title, fmt, hint, args=(), tokens=None):
    c = {"title": T(title), "hint": T(hint)}
    if fmt: c["titleFormatted"] = T(fmt)
    if args: c["args"] = list(args)
    if tokens: c["tokens"] = strip(tokens)
    path = os.path.join(ROOT, kind, f"{id_}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(c, open(path, "w"), ensure_ascii=False, indent=2)

M_ARGS = [PLAATS, DIENST, PRIO, CAPCODE]
card("triggers", "melding_nieuw", "Er is een nieuwe P2000-melding", "Er is een nieuwe P2000-melding in [[plaats]] voor [[dienst]] met prioriteit [[prioriteit]] en capcode [[capcode]]",
     "Elke nieuwe melding van brandweer, ambulance, politie of traumaheli in de gemeente Apeldoorn. Laat prioriteit en capcode leeg voor alle.", M_ARGS, MELDING)
card("triggers", "traumaheli_nieuw", "De traumaheli (Lifeliner) is opgeroepen", "De traumaheli is opgeroepen in [[plaats]]",
     "Een melding voor de traumaheli of een Lifeliner.", [PLAATS], MELDING)
card("triggers", "grip_melding", "Er is een GRIP of opschaling", "Er is een GRIP of opschaling in [[plaats]]",
     "Een melding met GRIP of opschaling (bijvoorbeeld middelbrand of grote inzet).", [PLAATS], MELDING)
card("triggers", "nlalert_nieuw", "Er is een nieuwe NL-Alert", "Er is een nieuwe NL-Alert voor [[plaats]]", "Een NL-Alert van de overheid in de gemeente Apeldoorn.", [PLAATS], WAARSCHUWING)
card("triggers", "nlalert_beeindigd", "Een NL-Alert is beëindigd", "Een NL-Alert voor [[plaats]] is beëindigd", "De NL-Alert is ingetrokken of afgelopen.", [PLAATS], WAARSCHUWING)
card("triggers", "burgernet_geopend", "Er is een nieuwe Burgernet-melding", "Er is een nieuwe Burgernet-melding in [[plaats]]", "Een nieuwe Burgernet-actie (zoekactie of vermissing).", [PLAATS], WAARSCHUWING)
card("triggers", "burgernet_gesloten", "Een Burgernet-melding is gesloten", "Een Burgernet-melding in [[plaats]] is gesloten", "De Burgernet-actie is beëindigd.", [PLAATS], WAARSCHUWING)
card("triggers", "knmi_nieuw", "Er is een nieuwe KNMI-code", "Er is een nieuwe KNMI-code [[code]]", "Een nieuwe of verhoogde weerwaarschuwing van het KNMI voor de gemeente Apeldoorn.", [CODE], WAARSCHUWING)
card("triggers", "knmi_vervallen", "Een KNMI-code is vervallen", "Een KNMI-code [[code]] is vervallen", "De weerwaarschuwing is afgelopen.", [CODE], WAARSCHUWING)

card("conditions", "nlalert_actief", "Er is een actieve NL-Alert", "Er !{{is|is geen}} actieve NL-Alert", "Een NL-Alert voor de gemeente Apeldoorn die nog niet is beëindigd.")
card("conditions", "burgernet_actief", "Er is een actieve Burgernet-melding", "Er !{{is|is geen}} actieve Burgernet-melding", "Een Burgernet-actie die nog loopt.")
card("conditions", "knmi_actief", "Er geldt een KNMI-code", "Er !{{geldt|geldt geen}} KNMI-code [[code]]", "Een KNMI-weerwaarschuwing die nu geldt.", [CODE])
card("conditions", "lifeliner_in_lucht", "Een Lifeliner is in de lucht", "[[heli]] !{{is|is niet}} in de lucht", "Live positie via adsb.lol. Laag vliegend of aan de grond ontbreekt de positie soms.",
     [{"name": "heli", "type": "dropdown", "title": T("Helikopter"), "values": [{"id": "alle", "label": T("Een Lifeliner")}] + [{"id": f"lifeliner{i}", "label": T(f"Lifeliner {i}")} for i in range(1, 5)]}])

card("actions", "laatste_melding", "Haal de laatste melding op", "Haal de laatste melding op in [[plaats]] voor [[dienst]]", "Geeft de gegevens van de laatste P2000-melding als tags.",
     [PLAATS, DIENST], [t for t in MELDING if t["type"] != "image"])
card("actions", "laatste_waarschuwing", "Haal de laatste waarschuwing op", "Haal de laatste [[bron]] op", "Geeft de gegevens van de laatste NL-Alert, Burgernet-melding of KNMI-code als tags.",
     [{"name": "bron", "type": "dropdown", "title": T("Bron"), "values": [{"id": "nlalert", "label": T("NL-Alert")}, {"id": "burgernet", "label": T("Burgernet-melding")}, {"id": "knmi", "label": T("KNMI-code")}]}],
     [t for t in WAARSCHUWING if t["type"] != "image"])
print("ok")
