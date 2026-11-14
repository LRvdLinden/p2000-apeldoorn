'use strict';

// Everything about one alert or warning: discipline, banner, places, tokens and the ready-made message
// (same build-up as the WhatsApp messages of A-Alerts). The texts come from locales/ via __().
const WERKGEBIED = require('./werkgebied.json');

const SITE = 'https://a-alerts.nl';
const BANNERS = 'https://raw.githubusercontent.com/LRvdLinden/P2000-brand/main/banners';
const TZ = 'Europe/Amsterdam';

const DIENSTEN = {
  brandweer: { banner: 'brand', emoji: '🚒' },
  ambulance: { banner: 'ambu', emoji: '🚑' },
  politie: { banner: 'pol', emoji: '🚓' },
  traumaheli: { banner: 'life', emoji: '🚨🚁' },
};
const BRON_BANNER = { nlalert: 'nlalert', burgernet: 'burgernet', knmi: 'knmi', amber: 'amber', vermistkind: 'vermistkind' };

/** Discipline key: brandweer, ambulance, politie, traumaheli or overig. */
function dienst(m) {
  const d = String(m.dienst || '').toLowerCase();
  if (d === 'lifeliner' || d === 'mmt' || d === 'traumaheli') return 'traumaheli';
  // An ambulance call-out for a Lifeliner is a trauma helicopter alert (banner and heading of the Lifeliner).
  if (/lifeliner/i.test((m.eenheden || []).map((e) => e.naam || '').join(' '))) return 'traumaheli';
  return DIENSTEN[d] ? d : 'overig';
}

/** Share links on a-alerts.nl: previews show the banner of the service or source, and the app opens when installed. */
const meldingLink = (m) => `${SITE}/melding/${dienst(m)}/${encodeURIComponent(m.guid)}`;
const waarschuwingLink = (w) => `${SITE}/waarschuwing/${encodeURIComponent(w.id).replace(/%3A/gi, ':')}`;

const bannerKey = (item) => (item.bron ? BRON_BANNER[item.bron] : (DIENSTEN[dienst(item)] || DIENSTEN.brandweer).banner);
// Square banners (1200x1200) for Homey; KNMI code green has its own per kind of weather (knmi-green-<icon>).
// "<bron>-afgerond": the ended banner of Burgernet, AMBER Alert, Vermist Kind and NL-Alert.
const bannerUrl = (key) => {
  const k = String(key);
  if (k.startsWith('knmi-green-')) return `${BANNERS}/${k}-vierkant.png`;
  if (k.endsWith('-afgerond')) return `${BANNERS}/banner-${k.slice(0, -9)}-apeldoorn-vierkant-afgerond.png`;
  return `${BANNERS}/banner-${k}-apeldoorn-vierkant.png`;
};
const AFGEROND_BRONNEN = ['burgernet', 'amber', 'vermistkind', 'nlalert'];
const KNMI_ICOON = [[/mist/i, 'fog'], [/wind/i, 'wind'], [/onweer|tornado|hagel/i, 'thunderstorm'], [/regen/i, 'rain'], [/sneeuw/i, 'snow'],
  [/glad|ijzel|vorst/i, 'ice'], [/hitte/i, 'heat'], [/kou/i, 'cold'], [/kust/i, 'waterspout']];
/** KNMI code green (lifted): the green banner of the kind of weather. */
const knmiGroenKey = (w) => `knmi-green-${(KNMI_ICOON.find(([re]) => re.test(`${w.soort || ''} ${w.titel || ''}`)) || [null, 'warning'])[1]}`;

// ------------------------------------------------------------------ places (same rules as the app)

const norm = (s) => String(s || '').toLowerCase().replace(/-/g, ' ').trim();
const keys = (p) => new Set([p.naam, ...(p.aliassen || [])].map(norm));

function ringContains(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const hasStreet = (m) => Boolean(m.locatie && String(m.locatie).trim() && norm(m.locatie) !== 'onbekend');
const capPlaats = (s) => String(s || '').toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** All places, villages and neighbourhoods of the working area an alert belongs to. */
function plaatsenVoor(m) {
  const out = new Set();
  const stad = norm(m.stad);
  for (const p of WERKGEBIED.plaatsen) if (p.woonplaats && keys(p).has(stad)) out.add(p.naam);
  if (hasStreet(m) && m.lat != null && m.lon != null) {
    for (const p of WERKGEBIED.plaatsen) {
      const inArea = (p.gebied || []).some((ring) => ringContains(ring, m.lat, m.lon))
        || (p.straalKm != null && distanceKm(m.lat, m.lon, p.lat, p.lon) <= p.straalKm);
      if (inArea) out.add(p.naam);
    }
  }
  if (!out.size && m.stad) out.add(capPlaats(m.stad));
  return [...out];
}

/** Places for a warning: Burgernet has one place, NL-Alert/KNMI cover the places inside their area. */
function plaatsenVoorWaarschuwing(w) {
  if (w.bron === 'burgernet') return [capPlaats(w.plaats || 'Apeldoorn')];
  // AMBER Alert: all of the Netherlands, so every place.
  if (w.bron === 'amber') return WERKGEBIED.plaatsen.map((p) => p.naam);
  // Vermist Kind Alert: every place and hamlet of the working area in (or within 1 km of) the search circle, same rule as the server.
  if (w.bron === 'vermistkind' && w.lat != null && w.lon != null && w.straal_km) {
    return WERKGEBIED.plaatsen.filter((p) => distanceKm(w.lat, w.lon, p.lat, p.lon) <= Number(w.straal_km) + 1).map((p) => p.naam);
  }
  if (!Array.isArray(w.gebied) || !w.gebied.length) return WERKGEBIED.plaatsen.map((p) => p.naam);
  return WERKGEBIED.plaatsen.filter((p) => w.gebied.some((ring) => ringContains(ring, p.lat, p.lon))).map((p) => p.naam);
}

const plaatsNamen = () => WERKGEBIED.plaatsen.map((p) => ({ naam: p.naam, groep: p.groep }));

// ------------------------------------------------------------------ time

const fmt = (d, opts) => new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, ...opts }).format(d);
const tijd = (d) => fmt(d, { hour: '2-digit', minute: '2-digit' });
const datum = (d) => fmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/-/g, '/');

// ------------------------------------------------------------------ alerts

const PRIO = { A0: 1, A1: 1, A2: 2, B1: 3, B2: 3, B3: 3, P1: 1, P2: 2, P3: 3 };
const lijst = (arr) => arr.filter(Boolean).join(', ');

function capcodes(m) { return lijst((m.eenheden || []).map((e) => e.code)); }
function eenheden(m) { return lijst((m.eenheden || []).map((e) => e.naam || e.code)); }
function voertuigen(m) {
  return lijst((m.voertuigen || []).map((v) => [v.label, v.nrb || v.nra].filter(Boolean).join(' ')))
    || lijst((m.eenheden || []).map((e) => e.naam).filter((n) => /lifeliner|zulu/i.test(n || '')));
}

/** Lifeliner or Zulu named in the call-out ("Lifeliner 3"). */
function heliGenoemd(m) {
  const tekst = [...(m.eenheden || []).map((u) => u.naam || ''), m.full_melding || '', m.title || ''].join(' ');
  const ll = /life\s*liner\s*0?([1-4])/i.exec(tekst);
  if (ll) return `Lifeliner ${ll[1]}`;
  const z = /zulu\s*0?(\d{1,2})/i.exec(tekst);
  return z ? `Zulu ${z[1]}` : '';
}

function meldingTokens(m, __, whatsapp) {
  const d = dienst(m);
  const datumTijd = new Date(m.datum_tijd || m.datum);
  const plaatsen = plaatsenVoor(m);
  const woonplaats = capPlaats(m.stad) || 'Apeldoorn';
  const straat = hasStreet(m) ? m.locatie : '';
  const prio = String(m.prioriteit || '').toUpperCase();
  const disc = __(`dienst.${d}`);
  const categorie = m.categorie || disc;
  const link = meldingLink(m);
  const emoji = (DIENSTEN[d] || { emoji: '🚨' }).emoji;

  const regio = m.regio ? ` (${String(m.regio).replace(/-/g, ' ').replace(/\s+/g, ' ')})` : '';
  const metPrio = PRIO[prio] ? __('bericht.met_prio', { n: PRIO[prio] }) : '';
  const waar = straat ? __('bericht.op_te', { straat, plaats: woonplaats }) : __('bericht.in', { plaats: woonplaats });
  const kop = `${emoji}: ${disc}${regio}${metPrio} ${__('bericht.naar_melding')}: "${categorie}" ${waar} (${__('bericht.provincie')})`;
  const regels = [
    kop, '',
    `*${__('bericht.p2000')}*: ${m.full_melding || m.title}`,
    `*${__('bericht.tijd')}*: ${tijd(datumTijd)} ${__('bericht.uur')}`,
    m.regio ? `*${__('bericht.regio')}*: ${String(m.regio).replace(/-/g, ' ').replace(/\s+/g, ' ')}` : null,
    `*${__('bericht.woonplaats')}*: ${woonplaats}`,
    straat ? `*${__('bericht.straat')}*: ${straat}` : null,
    capcodes(m) ? `*${__('bericht.capcodes')}*: ${capcodes(m)}` : null,
    voertuigen(m) ? `*${__('bericht.voertuigen')}*: ${voertuigen(m)}` : null,
    Number(m.grip) > 0 ? `*GRIP*: ${m.grip}` : null,
    `*${__('bericht.bekijk')}*: ${link}`,
    '',
    `📊 ${__('bericht.statistieken')}: ${SITE}/statistieken`,
    '',
    `© ${__('bericht.footer')}`,
  ].filter((r) => r !== null);

  return {
    banner: bannerKey(m),
    tokens: {
      bericht: regels.join('\n'),
      afbeelding_url: bannerUrl(bannerKey(m)),
      titel: m.title || '',
      p2000_tekst: m.full_melding || m.title || '',
      discipline: disc,
      prioriteit: prio || '',
      categorie: m.categorie || '',
      woonplaats,
      plaatsen: plaatsen.join(', '),
      straat,
      regio: m.regio || '',
      tijd: tijd(datumTijd),
      datum: datum(datumTijd),
      capcodes: capcodes(m),
      eenheden: eenheden(m),
      voertuigen: voertuigen(m),
      helikopter: heliGenoemd(m),
      grip: Number(m.grip) > 0 ? `GRIP ${m.grip}` : (/middel|groot|grip/i.test(m.opschaling || '') ? capPlaats(m.opschaling) : ''),
      link,
      latitude: Number(m.lat) || 0,
      longitude: Number(m.lon) || 0,
      whatsapp_link: whatsapp || '',
    },
    state: { dienst: d, plaatsen, prioriteit: prio, capcodes: (m.eenheden || []).map((e) => e.code).filter(Boolean) },
  };
}

// ------------------------------------------------------------------ warnings

const KNMI_LABEL = { yellow: 'geel', orange: 'oranje', red: 'rood' };
const KNMI_RANG = { yellow: 1, orange: 2, red: 3 };

/** Burgernet messages (start, updates, closing), newest first. Built from start/afloop for older API data. */
function tijdlijn(w) {
  if (!['burgernet', 'amber', 'vermistkind'].includes(w.bron)) return [];
  const lijst = Array.isArray(w.berichten) && w.berichten.length ? w.berichten : [
    { soort: 'start', at: w.start, tekst: w.startbericht || w.tekst || '' },
    ...(w.afloop ? [{ soort: 'afloop', at: w.einde, tekst: w.afloop }] : []),
  ];
  return lijst.filter((b) => b && b.tekst).slice().reverse();
}

function waarschuwingTokens(w, gebeurtenis, __, whatsapp) {
  const start = new Date(w.start);
  const einde = w.einde ? new Date(w.einde) : null;
  const plaats = w.bron === 'burgernet' ? capPlaats(w.plaats || 'Apeldoorn') : (w.plaats || 'Apeldoorn');
  const link = waarschuwingLink(w);
  const code = w.bron === 'knmi' ? __(`knmi.${KNMI_LABEL[w.niveau] || 'geel'}`) : '';
  const moment = gebeurtenis === 'einde' ? (einde || new Date()) : start;
  const bron = __(`bron.${w.bron}`);

  const lijn = tijdlijn(w);
  let regels;
  if (w.bron === 'burgernet') {
    const open = gebeurtenis !== 'einde';
    const kop = gebeurtenis === 'update' ? 'bericht.burgernet_update' : open ? 'bericht.burgernet_open' : 'bericht.burgernet_dicht';
    const laatste = lijn[0];
    const tijdBericht = gebeurtenis === 'update' && laatste && laatste.at ? new Date(laatste.at) : moment;
    // Newest message on top, like burgernet.nl: closing message, updates, start message — each with its time.
    const blokken = lijn.length > 1
      ? lijn.flatMap((b) => [`*${__(`bericht.soort_${b.soort}`)}*${b.at ? ` · ${datum(new Date(b.at))} ${tijd(new Date(b.at))}${__('bericht.uur_kort')}` : ''}`, `${b.tekst}\n`])
      : (() => {
        // Burgernet titles are usually the first sentence of the message: then the title is not repeated.
        const body = (open ? (w.startbericht || w.tekst) : (w.afloop || w.tekst)) || '';
        const plat = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const dubbel = w.titel && plat(body).startsWith(plat(w.titel).slice(0, 60));
        return [open && w.titel && !dubbel ? w.titel : null, `${body}\n`];
      })();
    regels = [
      `*${__(kop, { plaats: plaats.toUpperCase() })}*`, '',
      ...blokken,
      `*${__('bericht.woonplaats')}*: ${plaats.toUpperCase()}`,
      `*${__('bericht.datum')}*: ${datum(tijdBericht)}`,
      `*${__(gebeurtenis === 'update' ? 'bericht.tijd_update' : open ? 'bericht.tijd_open' : 'bericht.tijd_dicht')}*: ${tijd(tijdBericht)}${__('bericht.uur_kort')}`,
      `*${__('bericht.bekijk')}*: ${link}`,
    ];
  } else if (w.bron === 'amber' || w.bron === 'vermistkind') {
    // AMBER Alert / Vermist Kind Alert (police, through Burgernet): every message with its time, newest first.
    const open = gebeurtenis !== 'einde';
    const kop = `bericht.${w.bron}_${gebeurtenis === 'update' ? 'update' : open ? 'open' : 'dicht'}`;
    const laatste = lijn[0];
    const tijdBericht = laatste && laatste.at ? new Date(laatste.at) : moment;
    regels = [
      `${w.bron === 'amber' ? '🟠' : '🔵'} *${__(kop, { plaats: plaats.toUpperCase() })}*`, '',
      open && w.titel ? `*${w.titel}*` : null,
      ...lijn.flatMap((b) => [`*${__(`bericht.soort_${b.soort}`)}*${b.at ? ` · ${datum(new Date(b.at))} ${tijd(new Date(b.at))}${__('bericht.uur_kort')}` : ''}`, `${b.tekst}\n`]),
      open ? `*${__(w.bron === 'amber' ? 'bericht.amber_tip' : 'bericht.vermistkind_tip')}*\n` : null,
      w.bron === 'vermistkind' ? `*${__('bericht.zoekgebied')}*: ${plaats}${w.straal_km ? ` (${w.straal_km} km)` : ''}` : null,
      `*${__('bericht.datum')}*: ${datum(tijdBericht)}`,
      `*${__(gebeurtenis === 'update' ? 'bericht.tijd_update' : open ? 'bericht.tijd_open' : 'bericht.tijd_dicht')}*: ${tijd(tijdBericht)}${__('bericht.uur_kort')}`,
      `*${__('bericht.bekijk')}*: ${link}`,
      `${__('bericht.bron_politie')}`,
    ];
  } else if (w.bron === 'nlalert') {
    const open = gebeurtenis !== 'einde';
    regels = [
      `📢 *${__(open ? 'bericht.nlalert_open' : 'bericht.nlalert_dicht', { plaats })}*`, '',
      open && w.tekst ? `${w.tekst}\n` : null,
      `*${__('bericht.datum')}*: ${datum(moment)}`,
      `*${__(open ? 'bericht.tijd' : 'bericht.tijd_dicht')}*: ${tijd(moment)} ${__('bericht.uur')}`,
      `*${__('bericht.bekijk')}*: ${link}`,
    ];
  } else {
    const open = gebeurtenis !== 'einde';
    regels = [
      `⚠️ *${__(open ? 'bericht.knmi_open' : 'bericht.knmi_dicht', { code, soort: w.soort || w.titel || '' })}*`, '',
      open && w.tekst ? `${w.tekst}\n` : null,
      `*${__('bericht.van')}*: ${datum(start)} ${tijd(start)}`,
      einde ? `*${__('bericht.tot')}*: ${datum(einde)} ${tijd(einde)}` : null,
      `*${__('bericht.bekijk')}*: ${link}`,
    ];
  }
  // The WhatsApp group link is only a tag (WhatsApp-groeplink), not in the ready-made message.
  regels.push('', `© ${__('bericht.footer')}`);

  return {
    banner: bannerKey(w),
    tokens: {
      bericht: regels.filter((r) => r !== null).join('\n'),
      afbeelding_url: bannerUrl(bannerKey(w)),
      bron,
      titel: w.titel || '',
      tekst: w.startbericht || w.tekst || '',
      afloop: w.afloop || '',
      update: (lijn.find((b) => b.soort === 'update') || {}).tekst || '',
      laatste_bericht: (lijn[0] || {}).tekst || w.tekst || '',
      tijdlijn: lijn.map((b) => `${__(`bericht.soort_${b.soort}`)}${b.at ? ` (${datum(new Date(b.at))} ${tijd(new Date(b.at))})` : ''}: ${b.tekst}`).join('\n\n'),
      aantal_updates: lijn.filter((b) => b.soort === 'update').length,
      foto_url: w.status !== 'beeindigd' && w.foto ? w.foto : '',
      zoekgebied_km: Number(w.straal_km) || 0,
      plaats,
      status: __(`status.${w.status}`) || w.status || '',
      code,
      soort: w.soort || '',
      begin: `${datum(start)} ${tijd(start)}`,
      einde: einde ? `${datum(einde)} ${tijd(einde)}` : '',
      link,
      bron_link: w.link || link,
      whatsapp_link: whatsapp || '',
    },
    state: { plaatsen: plaatsenVoorWaarschuwing(w), niveau: KNMI_RANG[w.niveau] || 0 },
  };
}

/**
 * A news article (GET /v1/nieuws) → the tokens of "Er is een nieuw nieuwsartikel". The image is the JPG version of
 * the article image (WhatsApp and most apps do not take WebP): /assets/img/nieuws/x.webp → /assets/img/nieuws/og/x.jpg.
 */
const WEER_ICONEN = ['fog', 'wind', 'thunderstorm', 'rain', 'snow', 'ice', 'heat', 'cold', 'waterspout', 'warning'];
function nieuwsTokens(n, __, whatsapp) {
  const link = `${SITE}/nieuws/${n.id}`;
  const m = String(n.afbeelding || '').match(/^(https:\/\/[^/]+\/assets\/img\/nieuws\/)([\w-]+)\.webp/);
  // Own banners (weather, Burgernet, AMBER Alert, Vermist Kind, NL-Alert): the square one, like the alert cards send.
  const klaar = n.status === 'afgerond';
  let eigen = null;
  if (n.soort === 'weer') {
    eigen = klaar || n.niveau === 'green' ? `knmi-green-${WEER_ICONEN.includes(n.categorie) ? n.categorie : 'warning'}` : 'knmi';
  } else if (n.soort === 'liveblog' && BRON_BANNER[n.bron]) {
    eigen = `${BRON_BANNER[n.bron]}${klaar && AFGEROND_BRONNEN.includes(n.bron) ? '-afgerond' : ''}`;
  }
  const afbeeldingUrl = eigen ? bannerUrl(eigen)
    : m ? `${m[1]}og/${m[2]}.jpg` : (n.afbeelding || `${SITE}/assets/img/nieuws/og/politie-algemeen.jpg`);
  const soortNaam = n.soort === 'liveblog'
    ? ({ burgernet: 'Burgernet', amber: 'AMBER Alert', vermistkind: 'Vermist Kind Alert', nlalert: 'NL-Alert' }[n.bron] || __('bericht.soort_liveblog'))
    : __(`bericht.soort_${n.soort}`);
  const titel = String(n.titel || '').trim();
  const bericht = [`*${titel}*`, '', `${__('bericht.lees_verder')}: ${link}`, '', `© ${__('bericht.footer')}`].join('\n');
  return {
    afbeeldingUrl,
    state: { soort: n.soort },
    tokens: { afbeelding_url: afbeeldingUrl, bericht, titel, intro: String(n.intro || ''), soort: soortNaam, plaats: n.plaats || '', link, whatsapp_link: whatsapp || '' },
  };
}

module.exports = {
  nieuwsTokens,
  dienst, meldingLink, waarschuwingLink, bannerKey, bannerUrl, knmiGroenKey, AFGEROND_BRONNEN, plaatsNamen, plaatsenVoor, meldingTokens, waarschuwingTokens, tijdlijn, heliGenoemd, KNMI_RANG, capPlaats, tijd, datum,
};
