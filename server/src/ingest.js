import { config, PLAATS_KEYS, plaatsKey } from "./config.js";
import { insertMelding, hasMelding } from "./db.js";
import { geocode } from "./apple.js";

// ------------------------------------------------------------------ parsing

/** "A1 Ambu …" → A1, "P 1 BAD-02 …" → P1, "Prio 3 …" → P3. */
export function prioriteit(text) {
  let m = text.match(/^\s*([AB][0-3])\b/i);
  if (m) return m[1].toUpperCase();
  m = text.match(/^\s*P\s?([1-3])\b/i) || text.match(/^\s*Prio\s*([1-5])\b/i);
  return m ? `P${m[1]}` : null;
}

const RULES = [
  [/BR CONTAINER|CONTAINERBRAND|CONTAINER BRAND/, "Afvalcontainer brand"],
  [/BR (WONING|GEBOUW).*ZOLDER|ZOLDERBRAND/, "Woningbrand (zolder)"],
  [/BR WONING|WONINGBRAND|BR FLAT|BR APPARTEMENT/, "Woningbrand"],
  [/BR (VOERTUIG|AUTO|BUS|VRACHTWAGEN)|VOERTUIGBRAND|AUTOBRAND/, "Voertuigbrand"],
  [/BR (BUITEN|AFVAL|BERM|BOS|NATUUR|HEIDE)|BUITENBRAND|NATUURBRAND/, "Buitenbrand (afval)"],
  [/BR (SCHUUR|BIJGEBOUW|SCHUURTJE|GARAGE)/, "Brand bijgebouw"],
  [/BRANDGERUCHT/, "Brandgerucht"],
  [/\bOMS\b|AUTOM\.? ?BRAND|AUTOMATISCH BRANDALARM|\bPAC\b|BRANDMELDINSTALLATIE/, "Automatisch brandalarm"],
  [/CO[- ]?MELDER|ROOKMELDER|KOOLMONOXIDE/, "Rookmelder"],
  [/GASLUCHT|GASLEK|GASLEKKAGE/, "Gaslucht"],
  [/STANK|HIND\.? ?LUCHT|GEURHINDER/, "Stank (geurhinder)"],
  [/LIFT ?OPSLUITING|OPSLUITING LIFT/, "Liftopsluiting"],
  [/WATEROVERLAST/, "Wateroverlast"],
  [/STORMSCHADE|STORM\b/, "Stormschade"],
  [/VOERTUIG TE WATER|\bVTW\b/, "Voertuig te water"],
  [/PERSOON TE WATER|\bPTW\b/, "Persoon te water"],
  [/DIER |DIER$|DIEREN|PAARD|\bKOE\b|HOND /, "Dier in problemen"],
  [/AFHIJSEN/, "Assistentie afhijsen patient"],
  [/BUITENGESLOTEN/, "Persoon buitengesloten"],
  [/(AANRIJDING|AANR\.?).*LETSEL/, "Aanrijding met letsel"],
  [/ONGEVAL.*LETSEL|OVL\b/, "Ongeval met letsel"],
  [/VERKEERSONGEVAL/, "Verkeersongeval"],
  [/ONGEVAL|AANRIJDING/, "Ongeval melding"],
  [/HERBEZETTING|HERBEZ\b/, "Herbezetting brandweer"],
  [/NACONTROLE/, "Nacontrole"],
  [/OEFENING|PROEFALARM|TESTOPROEP/, "Oefening"],
  [/DIENSTVERLENING/, "Dienstverlening verzoek"],
];

export function categorie(dienst, prio, text) {
  const t = text.toUpperCase();
  if (/REANIM/.test(t)) return dienst === "ambulance" ? "Hartstilstand (reanimatie)" : "Assistentie bij reanimatie";
  if (dienst === "traumaheli") return "Traumaheli persoon in levensgevaar";
  if (dienst === "ambulance") {
    if (/HERPOS|PARAAT/.test(t)) return "Herpositioneren (paraatstelling)";
    if (/\b112\b/.test(t)) return "Ambulance naar 112 melding";
    if (/ASSISTENTIE|ASS\.? ?POL/.test(t)) return "Assistentie bij politie";
    if (prio === "B1") return "Besteld vervoer met medicatie";
    if (prio === "B2" || prio === "B3") return "Besteld vervoer zonder medicatie";
    if (/\bDIA\b/.test(t)) return "Directe inzet ambulance";
    if (prio === "A0" || prio === "A1") return "Ambulance spoedurgentie";
    if (prio === "A2") return "Ambulance met gepaste spoed";
    return "Medische assistentie";
  }
  for (const [re, cat] of RULES) if (re.test(t)) return cat;
  if (dienst === "politie") return /\b112\b/.test(t) ? "Politie naar 112 melding" : "Politie-inzet";
  if (dienst === "brandweer") return /\bBR\b|BRAND/.test(t) ? "Brand melding" : "Brandweer-inzet";
  return null;
}

const parseLatLon = (s) => {
  if (!s) return null;
  const [a, b] = String(s).split(",").map((x) => Number(x.trim()));
  return Number.isFinite(a) && Number.isFinite(b) && a !== 0 ? [a, b] : null;
};

const parseJSON = (s, key) => { try { return JSON.parse(s || "{}")[key] || []; } catch { return []; } };

/** Converts one p2000.page record into the app's alert shape (or null when it is outside the municipality). */
export function fromFeed(r) {
  if (!r?.uid || !r?.melding || !PLAATS_KEYS.has(plaatsKey(r.plaats))) return null;
  const text = String(r.melding).trim();
  const prio = prioriteit(text);

  const units = parseJSON(r.capcodes_json, "capcodes")
    .map((c) => {
      const parts = String(c.label || "").split(" / ");
      return { code: c.capcode, naam: parts[0] || null, type: parts[1] || null, regio: parts[2] || null };
    })
    .filter((u) => u.code && !/^(monitorcode|lichtkrant)/i.test(u.naam || ""));

  let dienst = String(r.dienst || "").toLowerCase();
  if (units.some((u) => /lifeliner|traumaheli|\bmmt\b/i.test(u.naam || "")) || /lifeliner|\bmmt\b/i.test(text)) dienst = "traumaheli";
  if (!["brandweer", "ambulance", "politie", "traumaheli", "kustwacht"].includes(dienst)) dienst = "onbekend";

  const coord = parseLatLon(r.latlong) || parseLatLon(r.plaats_latlon);
  const title = prio ? text.replace(/^\s*(?:Prio\s*\d|P\s?\d|[AB]\d)\s*/i, "") : text;
  const datum = Number(r.timestamp) > 0 ? Number(r.timestamp) * 1000 : Date.now();

  return {
    guid: r.uid,
    title: title.trim(),
    full_melding: text,
    dienst,
    prioriteit: prio,
    datum,
    locatie: r.locatie || null,
    lat: coord?.[0] ?? null,
    lon: coord?.[1] ?? null,
    stad: r.plaats,
    regio: r.vr || r.regio || null,
    capcode: units[0]?.code ?? null,
    categorie: categorie(dienst, prio, text),
    grip: r.grip && r.grip !== "0" ? r.grip : null,
    opschaling: r.soortopschaling || null,
    eenheden: units,
    voertuigen: parseJSON(r.voertuigen_json, "voertuig"),
    link: r.link || null,
  };
}

// ------------------------------------------------------------------ polling

let lastOk = 0;
let lastError = null;
export const feedStatus = () => ({ lastOk: lastOk ? new Date(lastOk).toISOString() : null, lastError });

export function startIngest(onNew) {
  if (!config.feedURL) {
    console.warn("[ingest] P2000_PAGE_API_URL ontbreekt – geen nieuwe meldingen");
    return;
  }
  const tick = async () => {
    try {
      const res = await fetch(config.feedURL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      const fresh = [];
      for (const r of Array.isArray(list) ? list : []) {
        const m = fromFeed(r);
        if (!m || hasMelding(m.guid)) continue;
        // Precise coordinates for the street via the Apple Maps Server API (when configured).
        if (m.locatie) {
          const c = await geocode(m.locatie, m.stad);
          if (c) [m.lat, m.lon] = c;
        }
        if (insertMelding(m)) fresh.push(m);
      }
      lastOk = Date.now();
      lastError = null;
      // Oldest first so pushes arrive in order.
      for (const m of fresh.sort((a, b) => a.datum - b.datum)) await onNew(m);
    } catch (err) {
      lastError = String(err?.message || err);
      console.error("[ingest]", lastError);
    } finally {
      setTimeout(tick, config.feedIntervalMs);
    }
  };
  tick();
}
