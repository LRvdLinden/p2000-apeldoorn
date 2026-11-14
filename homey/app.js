'use strict';

const Homey = require('homey');
const api = require('./lib/api');
const F = require('./lib/format');
const Kaart = require('./lib/kaart');

const RECENT_MS = 30 * 60_000; // warnings: an ended warning still triggers "ended" within 30 minutes
const MELDING_MAX_MS = 3 * 3_600_000; // alerts: a new (unseen) alert triggers when it is at most 3 hours old
const MAX_SEEN = 800;
const NIEUWS_MAX_MS = 6 * 3_600_000; // news: a new (unseen) article triggers when it is at most 6 hours old

class AAlertsApp extends Homey.App {
  async onInit() {
    this.seen = new Set(this.homey.settings.get('seen') || []);
    this.warn = this.homey.settings.get('warn') || {};
    this.initialized = Boolean(this.homey.settings.get('initialized'));
    this.nieuwsSeen = new Set(this.homey.settings.get('nieuwsSeen') || []);
    this.nieuwsInit = Boolean(this.homey.settings.get('nieuwsInit'));
    this.banners = {}; // PNG buffers of the banners, by key
    this.beelden = []; // the last images given to Flows (older ones are unregistered)
    this.laatsteBeeld = null;
    this.cache = { meldingen: [], waarschuwingen: [], at: 0 };
    this.lastReceived = null;
    this.lastSource = null;
    this.webhookOk = false;

    this.registerCards();
    await this.refresh('start').catch((e) => this.error('start', e.message));
    await this.connectWebhook();
    // Safety net: with the webhook every 5 minutes, without it every 30 seconds.
    this.pollTimer = this.homey.setInterval(() => this.refresh('poll').catch((e) => this.error('poll', e.message)), this.webhookOk ? 5 * 60_000 : 30_000);
    this.log('A-Alerts gestart', this.webhookOk ? 'met webhook' : 'zonder webhook');
  }

  async onUninit() {
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
    if (this.webhook) await this.webhook.unregister().catch(() => {});
  }

  // ------------------------------------------------------------------ data in

  async connectWebhook() {
    const { WEBHOOK_ID: id, WEBHOOK_SECRET: secret } = Homey.env || {};
    if (!id || !secret) return;
    try {
      this.webhook = await this.homey.cloud.createWebhook(id, secret, { $key: 'aalerts' });
      this.webhook.on('message', (args) => {
        const body = args && args.body ? args.body : {};
        this.process(body.meldingen || [], body.waarschuwingen || [], 'webhook').catch((e) => this.error('webhook', e.message));
        // New news articles: the webhook only sends their ids; the list itself is read from the API.
        if (Array.isArray(body.nieuws) && body.nieuws.some((id) => !this.nieuwsSeen.has(id))) this.refreshNieuws().catch((e) => this.error('nieuws', e.message));
      });
      this.webhookOk = true;
    } catch (e) {
      this.error('webhook', e.message);
    }
  }

  async refresh(source) {
    const [meldingen, waarschuwingen] = await Promise.all([api.meldingen(60), api.waarschuwingen(3)]);
    this.cache = { meldingen, waarschuwingen, at: Date.now() };
    await this.process(meldingen, waarschuwingen, source);
    await this.refreshNieuws().catch((e) => this.error('nieuws', e.message));
  }

  /** New news articles → the card "Er is een nieuw nieuwsartikel". The first load after installing is history. */
  async refreshNieuws() {
    const lijst = await api.nieuws(20);
    if (!Array.isArray(lijst)) return;
    const first = !this.nieuwsInit;
    const now = Date.now();
    for (const n of [...lijst].sort((a, b) => new Date(a.at) - new Date(b.at))) {
      if (!n || !n.id || this.nieuwsSeen.has(n.id)) continue;
      this.nieuwsSeen.add(n.id);
      if (first || now - new Date(n.start || n.at).getTime() > NIEUWS_MAX_MS) continue;
      try { await this.fireNieuws(n); } catch (e) { await this.logFlow('nieuws_nieuw', n.titel, Promise.reject(e)); }
    }
    const seen = [...this.nieuwsSeen];
    if (seen.length > 300) this.nieuwsSeen = new Set(seen.slice(-300));
    this.nieuwsInit = true;
    this.homey.settings.set('nieuwsSeen', [...this.nieuwsSeen]);
    this.homey.settings.set('nieuwsInit', true);
  }

  async fireNieuws(n) {
    const r = F.nieuwsTokens(n, this.__.bind(this), this.wa('nieuws'));
    let beeld = { image: null, soort: 'geen' };
    // Weather, Burgernet, AMBER Alert, Vermist Kind and NL-Alert: the same square image as the warning cards
    // (the map card with the code, or the square banner), not the wide article banner.
    if (n.waarschuwing && (n.soort === 'weer' || n.soort === 'liveblog')) {
      try {
        const w = await api.waarschuwing(n.waarschuwing);
        if (w && w.bron) {
          const b = await this.afbeelding(w, 'waarschuwing', n.status === 'afgerond' ? 'einde' : 'nieuw', F.bannerKey(w));
          if (b.image) beeld = b;
        }
      } catch (e) { this.error('nieuws waarschuwing', e.message); }
    }
    if (!beeld.image) try {
      const buf = await Kaart.download(r.afbeeldingUrl);
      const image = await this.homey.images.createImage();
      const jpg = /\.jpe?g(\?|$)/i.test(r.afbeeldingUrl) || (buf[0] === 0xff && buf[1] === 0xd8);
      image.setStream(async (stream) => {
        stream.contentType = jpg ? 'image/jpeg' : 'image/png';
        stream.filename = `a-alerts-nieuws.${jpg ? 'jpg' : 'png'}`;
        stream.contentLength = buf.length;
        stream.end(buf);
      });
      this.beelden.push(image);
      while (this.beelden.length > 12) { const oud = this.beelden.shift(); oud.unregister().catch(() => {}); }
      beeld = { image, soort: 'nieuws' };
    } catch (e) { this.error('nieuws afbeelding', e.message); }
    const tokens = { ...r.tokens, afbeelding: beeld.image, ...(beeld.url ? { afbeelding_url: beeld.url } : {}) };
    await this.logFlow('nieuws_nieuw', n.titel, this.homey.flow.getTriggerCard('nieuws_nieuw').trigger(tokens, r.state), beeld);
  }

  /** New alerts and changed warnings → Flows. Every alert and every status change triggers once. */
  async process(meldingen, waarschuwingen, source) {
    const now = Date.now();
    const first = !this.initialized;
    if (meldingen.length || waarschuwingen.length) { this.lastReceived = new Date().toISOString(); this.lastSource = source; }

    const sorted = [...meldingen].sort((a, b) => new Date(a.datum_tijd) - new Date(b.datum_tijd));
    for (const m of sorted) {
      if (!m || !m.guid || this.seen.has(m.guid)) continue;
      this.seen.add(m.guid);
      this.remember('meldingen', m);
      // Unseen = new for this Homey. Only the very first load after installing is skipped (that is history).
      // The age check is wide on purpose, so a clock or time zone difference never swallows an alert.
      const leeftijd = now - new Date(m.datum_tijd).getTime();
      if (first || leeftijd > MELDING_MAX_MS) continue;
      try { await this.fireMelding(m); } catch (e) { await this.logFlow('melding_nieuw', m.title, Promise.reject(e)); }
    }

    for (const w of waarschuwingen) {
      if (!w || !w.id) continue;
      this.remember('waarschuwingen', w);
      const prev = this.warn[w.id];
      const ended = w.status === 'beeindigd';
      const rank = F.KNMI_RANG[w.niveau] || 0;
      const updates = F.tijdlijn(w).filter((b) => b.soort === 'update').length;
      this.warn[w.id] = { s: w.status, r: rank, t: now, u: updates };
      if (first) continue;
      const recent = now - new Date(w.einde || w.start).getTime() < RECENT_MS;
      if (!prev) {
        if (!ended) await this.fireWaarschuwing(w, 'nieuw');
        else if (recent) await this.fireWaarschuwing(w, 'einde');
      } else if (prev.s !== 'beeindigd' && ended) {
        await this.fireWaarschuwing(w, 'einde');
      } else if (w.bron === 'knmi' && !ended && rank > (prev.r || 0)) {
        await this.fireWaarschuwing(w, 'nieuw'); // code raised
      } else if (['burgernet', 'amber', 'vermistkind'].includes(w.bron) && !ended && prev.u != null && updates > prev.u) {
        await this.fireWaarschuwing(w, 'update'); // Burgernet posted a follow-up message
      }
    }

    this.initialized = true;
    this.save();
  }

  remember(kind, item) {
    const list = this.cache[kind];
    const key = kind === 'meldingen' ? 'guid' : 'id';
    const i = list.findIndex((x) => x[key] === item[key]);
    if (i >= 0) list[i] = item; else list.push(item);
  }

  save() {
    const seen = [...this.seen];
    if (seen.length > MAX_SEEN) this.seen = new Set(seen.slice(-MAX_SEEN));
    const cutoff = Date.now() - 14 * 86_400_000;
    for (const [id, v] of Object.entries(this.warn)) if (!v || v.t < cutoff) delete this.warn[id];
    this.homey.settings.set('seen', [...this.seen]);
    this.homey.settings.set('warn', this.warn);
    this.homey.settings.set('initialized', true);
  }

  // ------------------------------------------------------------------ Flows

  wa(kind) { return this.homey.settings.get(`wa_${kind}`) || ''; }

  /**
   * The image for the "afbeelding" tag: a map with the spot or area (when known), otherwise the banner.
   * Served as a stream with content type and file name, so every app (WhatsApp, push, Telegram …) gets a real PNG.
   * Returns { image, url, soort } — soort is 'kaart', 'banner' or 'geen'.
   */
  async afbeelding(item, soort, gebeurtenis, bannerKey) {
    // KNMI code green (lifted): no map, the green banner of the kind of weather (without liveblog).
    const knmiGroen = soort === 'waarschuwing' && item.bron === 'knmi' && (gebeurtenis === 'einde' || item.niveau === 'green');
    if (knmiGroen) bannerKey = F.knmiGroenKey(item);
    // End of a Burgernet action, AMBER Alert, Vermist Kind Alert or NL-Alert: the square "afgerond" banner, no map.
    const afgerond = soort === 'waarschuwing' && F.AFGEROND_BRONNEN.includes(item.bron) && gebeurtenis === 'einde';
    if (afgerond) bannerKey = `${F.bannerKey(item)}-afgerond`;
    let png = null, url = F.bannerUrl(bannerKey), wat = 'banner';
    // The webhook sends warnings without their area (smaller); NL-Alert and KNMI need it for the map.
    if (soort === 'waarschuwing' && ['nlalert', 'knmi'].includes(item.bron) && !item.gebied) {
      try { const d = await api.waarschuwing(item.id); if (d && d.gebied) item = { ...item, gebied: d.gebied }; } catch (e) { this.error('gebied', e.message); }
    }
    if (!knmiGroen && !afgerond) try {
      const k = await Kaart.maak(item, soort, gebeurtenis);
      if (k) { png = k.png; url = k.url; wat = 'kaart'; }
    } catch (e) { this.error('kaart', e.message); }
    if (!png) {
      try {
        if (!this.banners[bannerKey]) this.banners[bannerKey] = await Kaart.download(F.bannerUrl(bannerKey));
        png = this.banners[bannerKey];
      } catch (e) { this.error('banner', bannerKey, e.message); }
    }
    if (!png) return { image: null, url, soort: 'geen' };
    const image = await this.homey.images.createImage();
    image.setStream(async (stream) => {
      stream.contentType = 'image/png';
      stream.filename = `a-alerts-${wat}.png`;
      stream.contentLength = png.length;
      stream.end(png);
    });
    this.beelden.push(image);
    while (this.beelden.length > 12) { const oud = this.beelden.shift(); oud.unregister().catch(() => {}); }
    this.laatsteBeeld = { png, soort: wat, at: Date.now() };
    return { image, url, soort: wat };
  }


  async fireMelding(m) {
    const r = F.meldingTokens(m, this.__.bind(this), this.wa('p2000'));
    const beeld = await this.afbeelding(m, 'melding', 'nieuw', r.banner);
    const tokens = { ...r.tokens, afbeelding: beeld.image, afbeelding_url: beeld.url };
    const run = (id) => this.logFlow(id, m.title, this.homey.flow.getTriggerCard(id).trigger(tokens, r.state), beeld);
    await run('melding_nieuw');
    if (r.state.dienst === 'traumaheli' || /lifeliner/i.test(r.tokens.helikopter)) await run('traumaheli_nieuw');
    // GRIP, or a fire scaled up to medium or larger ("klein" is a small fire, not an escalation).
    if (Number(m.grip) > 0 || /middel|groot|grip/i.test(m.opschaling || '')) await run('grip_melding');
  }

  alleenVanKaart(id, tokens) {
    const kaart = ((this.homey.manifest.flow || {}).triggers || []).find((t) => t.id === id);
    if (!kaart || !kaart.tokens) return tokens;
    return Object.fromEntries(kaart.tokens.map((t) => [t.name, tokens[t.name] ?? (t.type === 'number' ? 0 : t.type === 'image' ? null : '')]));
  }

  async fireWaarschuwing(w, gebeurtenis) {
    const id = {
      nlalert: { nieuw: 'nlalert_nieuw', einde: 'nlalert_beeindigd' },
      burgernet: { nieuw: 'burgernet_geopend', update: 'burgernet_update', einde: 'burgernet_gesloten' },
      amber: { nieuw: 'amber_nieuw', update: 'amber_update', einde: 'amber_beeindigd' },
      vermistkind: { nieuw: 'vermistkind_nieuw', update: 'vermistkind_update', einde: 'vermistkind_beeindigd' },
      knmi: { nieuw: 'knmi_nieuw', einde: 'knmi_vervallen' },
    }[w.bron]?.[gebeurtenis];
    if (!id) return;
    const r = F.waarschuwingTokens(w, gebeurtenis, this.__.bind(this), this.wa(w.bron));
    // Every card has its own set of tags (Burgernet, NL-Alert, KNMI): only pass the tags this card declares.
    const beeld = await this.afbeelding(w, 'waarschuwing', gebeurtenis, r.banner);
    const tokens = this.alleenVanKaart(id, { ...r.tokens, afbeelding: beeld.image, afbeelding_url: beeld.url });
    await this.logFlow(id, w.titel || w.bron, this.homey.flow.getTriggerCard(id).trigger(tokens, r.state), beeld);
  }

  /** Remembers the last Flow triggers (shown in the settings, to see whether the triggers fire). */
  async logFlow(id, titel, promise, beeld) {
    let fout = null;
    try { await promise; } catch (e) { fout = e.message || String(e); this.error(id, fout); }
    const log = [{ kaart: id, titel: String(titel || '').slice(0, 90), at: Date.now(), fout, afbeelding: beeld ? beeld.soort : null }, ...(this.homey.settings.get('flowlog') || [])].slice(0, 8);
    this.homey.settings.set('flowlog', log);
  }

  /** Settings page button: run the P2000 triggers once with the newest alert (to test your Flows). */
  async testMelding() {
    if (Date.now() - this.cache.at > 30_000) await this.refresh('test').catch(() => {});
    const m = [...this.cache.meldingen].sort((a, b) => new Date(b.datum_tijd) - new Date(a.datum_tijd))[0];
    if (!m) throw new Error(this.__('fout.geen_melding'));
    await this.fireMelding(m);
    return { titel: m.title };
  }

  __(key, tokens) { return this.homey.__(key, tokens); }

  registerCards() {
    const plaatsOk = (args, state) => !args.plaats || args.plaats.id === 'alle' || (state.plaatsen || []).includes(args.plaats.name);
    // Words that mean "everything" (people type the placeholder in): never a filter.
    const ALLES = new Set(['ALLE', 'ALLES', 'ALL', 'CAPCODES', 'PRIORITEITEN', '*', '-', 'GEEN', 'LEEG']);
    const lijst = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim().toUpperCase().replace(/\s+/g, '')).filter((x) => x && !ALLES.has(x));
    const capKey = (c) => String(c).replace(/\D/g, '').replace(/^0+/, '') || String(c).toUpperCase();
    const meldingOk = (args, state) => {
      const nee = (reden) => { this.filterLog(state, reden); return false; };
      if (!plaatsOk(args, state)) return nee(`plaats ${args.plaats && args.plaats.name} (melding: ${(state.plaatsen || []).join(', ')})`);
      if (args.dienst && args.dienst !== 'alle' && args.dienst !== state.dienst) return nee(`discipline ${args.dienst} (melding: ${state.dienst})`);
      const prio = lijst(args.prioriteit).map((p) => p.replace(/^PRIO/, ''));
      if (prio.length && !prio.includes(String(state.prioriteit || '').replace(/\s+/g, ''))) return nee(`prioriteit ${prio.join(', ')} (melding: ${state.prioriteit || 'geen'})`);
      const caps = lijst(args.capcode).map(capKey);
      if (caps.length && !caps.some((c) => (state.capcodes || []).map(capKey).includes(c))) return nee(`capcode ${caps.join(', ')}`);
      return true;
    };
    const autocomplete = async (query) => {
      const q = String(query || '').toLowerCase();
      return [{ id: 'alle', name: this.__('plaats.alle') }, ...F.plaatsNamen().map((p) => ({
        id: p.naam, name: p.naam, description: this.__(`plaats.groep_${p.groep}`) || '',
      }))].filter((x) => !q || x.name.toLowerCase().includes(q));
    };

    for (const id of ['melding_nieuw', 'traumaheli_nieuw', 'grip_melding']) {
      const card = this.homey.flow.getTriggerCard(id);
      card.registerRunListener(async (args, state) => meldingOk(args, state));
      card.registerArgumentAutocompleteListener('plaats', autocomplete);
    }
    // Vermist Kind Alert has no place to choose: every alert in the working area (Apeldoorn, the villages, hamlets and Teuge).
    for (const id of ['nlalert_nieuw', 'nlalert_beeindigd', 'burgernet_geopend', 'burgernet_update', 'burgernet_gesloten']) {
      const card = this.homey.flow.getTriggerCard(id);
      card.registerRunListener(async (args, state) => plaatsOk(args, state));
      card.registerArgumentAutocompleteListener('plaats', autocomplete);
    }
    this.homey.flow.getTriggerCard('nieuws_nieuw').registerRunListener(async (args, state) => !args.soort || args.soort === 'alle' || args.soort === state.soort);
    for (const id of ['knmi_nieuw', 'knmi_vervallen']) {
      this.homey.flow.getTriggerCard(id).registerRunListener(async (args, state) => state.niveau >= Number(args.code || 1));
    }

    const actief = async (bron) => {
      if (Date.now() - this.cache.at > 2 * 60_000) await this.refresh('conditie').catch(() => {});
      return this.cache.waarschuwingen.filter((w) => w.bron === bron && w.status === 'actief');
    };
    this.homey.flow.getConditionCard('nlalert_actief').registerRunListener(async () => (await actief('nlalert')).length > 0);
    this.homey.flow.getConditionCard('burgernet_actief').registerRunListener(async () => (await actief('burgernet')).length > 0);
    this.homey.flow.getConditionCard('amber_actief').registerRunListener(async () => (await actief('amber')).length > 0);
    this.homey.flow.getConditionCard('vermistkind_actief').registerRunListener(async () => (await actief('vermistkind')).length > 0);
    this.homey.flow.getConditionCard('knmi_actief').registerRunListener(async (args) => (await actief('knmi')).some((w) => (F.KNMI_RANG[w.niveau] || 0) >= Number(args.code || 1)));
    this.homey.flow.getConditionCard('lifeliner_in_lucht').registerRunListener(async (args) => {
      const helis = await api.helikopters();
      return helis.some((h) => h.soort === 'trauma' && !h.op_grond && (args.heli === 'alle' || h.id === args.heli));
    });

    const laatste = this.homey.flow.getActionCard('laatste_melding');
    laatste.registerArgumentAutocompleteListener('plaats', autocomplete);
    laatste.registerRunListener(async (args) => {
      const list = await api.meldingen(100).catch(() => { throw new Error(this.__('fout.offline')); });
      const m = list.find((x) => {
        const r = F.meldingTokens(x, this.__.bind(this), '');
        return plaatsOk(args, r.state) && (args.dienst === 'alle' || args.dienst === r.state.dienst);
      });
      if (!m) throw new Error(this.__('fout.geen_melding'));
      return F.meldingTokens(m, this.__.bind(this), this.wa('p2000')).tokens;
    });
    this.homey.flow.getActionCard('laatste_waarschuwing').registerRunListener(async (args) => {
      const list = await api.waarschuwingen(14).catch(() => { throw new Error(this.__('fout.offline')); });
      const w = list.filter((x) => x.bron === args.bron).sort((a, b) => new Date(b.start) - new Date(a.start))[0];
      if (!w) throw new Error(this.__('fout.geen_waarschuwing'));
      return F.waarschuwingTokens(w, w.status === 'beeindigd' ? 'einde' : 'nieuw', this.__.bind(this), this.wa(args.bron)).tokens;
    });
  }

  // ------------------------------------------------------------------ settings page and widget

  info() {
    return {
      flowlog: this.homey.settings.get('flowlog') || [],
      filterlog: this.homey.settings.get('filterlog') || [],
      version: this.homey.manifest.version,
      webhook: this.webhookOk,
      lastReceived: this.lastReceived,
      lastSource: this.lastSource,
    };
  }

  /** Remembers why a Flow did not start (a filter on the card), for the settings page. */
  filterLog(state, reden) {
    const log = [{ reden: String(reden).slice(0, 140), at: Date.now() }, ...(this.homey.settings.get('filterlog') || [])].slice(0, 5);
    this.homey.settings.set('filterlog', log);
  }

  /** The last image given to a Flow, for the settings page (to check it before WhatsApp sends it). */
  afbeeldingVoorbeeld() {
    const b = this.laatsteBeeld;
    return b ? { soort: b.soort, at: b.at, data: `data:image/png;base64,${b.png.toString('base64')}` } : null;
  }

  /** The two newest P2000 alerts, for the settings page ("does the app work?"). */
  async laatste(n = 2) {
    if (Date.now() - this.cache.at > 30_000) await this.refresh('instellingen').catch(() => {});
    return [...this.cache.meldingen].sort((a, b) => new Date(b.datum_tijd) - new Date(a.datum_tijd)).slice(0, n).map((x) => {
      const d = new Date(x.datum_tijd);
      return {
        titel: x.title, plaats: F.capPlaats(x.stad) || 'Apeldoorn', dienst: F.dienst(x), discipline: this.__(`dienst.${F.dienst(x)}`),
        prio: x.prioriteit || '', tijd: F.tijd(d), datum: F.datum(d), at: d.getTime(), link: F.meldingLink(x),
      };
    });
  }

  async recent() {
    if (Date.now() - this.cache.at > 60_000) await this.refresh('widget').catch(() => {});
    const m = [...this.cache.meldingen].sort((a, b) => new Date(b.datum_tijd) - new Date(a.datum_tijd)).slice(0, 12).map((x) => ({
      type: 'melding', id: x.guid, dienst: F.dienst(x), titel: x.title, plaats: F.capPlaats(x.stad) || 'Apeldoorn',
      tijd: F.tijd(new Date(x.datum_tijd)), at: new Date(x.datum_tijd).getTime(), prio: x.prioriteit || '',
      link: F.meldingLink(x),
    }));
    const w = this.cache.waarschuwingen.filter((x) => x.bron !== 'knmi' || x.status !== 'beeindigd').slice(0, 6).map((x) => ({
      type: 'waarschuwing', id: x.id, bron: x.bron, titel: x.titel || this.__(`bron.${x.bron}`), plaats: x.plaats || 'Apeldoorn',
      tijd: F.tijd(new Date(x.start)), at: new Date(x.start).getTime(), status: x.status, niveau: x.niveau || '',
      link: F.waarschuwingLink(x),
    }));
    return [...w, ...m].sort((a, b) => b.at - a.at).slice(0, 12);
  }
}

module.exports = AAlertsApp;
