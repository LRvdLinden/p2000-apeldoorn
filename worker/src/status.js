// Status of A-Alerts for a-alerts.nl/status, the apps (Instellingen › Status) and the beheer.
//
// Nothing here makes extra requests to the sources: every component is judged by what the Worker already does
// (the P2000 reads, the NL-Alert/Burgernet/KNMI reads, the helicopter reads, the pushes it sends and the weather
// the apps ask for). The only own check is a light request to the website every five minutes.
// Every minute the cron adds the current state of each component to status_dag (minutes per state per day), which
// gives the 90-day bars. When a component stays off normal for a few minutes the beheer gets a push, and again
// when it works again.

const MIN = 60_000;
const DAY = 86_400_000;
const rows = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const kvGet = async (env, key) => (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first())?.value ?? null;
const kvSet = (env, key, value) => env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(key, String(value), Date.now()).run();
const kvDel = (env, key) => env.DB.prepare("DELETE FROM kv WHERE key = ?").bind(key).run();
const parse = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** Day in Dutch time, "2026-11-07". */
export const dagVan = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
function startVanDag(t) {
  const d = dagVan(t);
  // Midnight in Amsterdam: try both offsets (winter +1, summer +2).
  for (const off of [1, 2]) { const s = Date.parse(`${d}T00:00:00Z`) - off * 3600_000; if (dagVan(s) === d && dagVan(s - 1) !== d) return s; }
  return Date.parse(`${d}T00:00:00Z`) - 3600_000;
}

export const GROEPEN = [
  { id: "meldingen", naam: "Meldingen", naam_en: "Alerts", onderdelen: [
    { id: "p2000", naam: "P2000-meldingen", naam_en: "P2000 alerts" },
    { id: "nlalert", naam: "NL-Alert", naam_en: "NL-Alert" },
    { id: "burgernet", naam: "Burgernet", naam_en: "Burgernet" },
    { id: "knmi", naam: "KNMI-waarschuwingen", naam_en: "KNMI warnings" },
  ] },
  { id: "push", naam: "Pushmeldingen", naam_en: "Push notifications", onderdelen: [
    { id: "push_apple", naam: "iPhone, iPad, Mac en Watch", naam_en: "iPhone, iPad, Mac and Watch" },
    { id: "push_android", naam: "Android", naam_en: "Android" },
  ] },
  { id: "live", naam: "Live data", naam_en: "Live data", onderdelen: [
    { id: "heli", naam: "Helikopters", naam_en: "Helicopters" },
    { id: "weer", naam: "Weer", naam_en: "Weather" },
  ] },
  { id: "apps", naam: "Apps en website", naam_en: "Apps and website", onderdelen: [
    { id: "api", naam: "Server (API)", naam_en: "Server (API)" },
    { id: "web", naam: "Website en live pager", naam_en: "Website and live pager" },
  ] },
];
export const ONDERDELEN = GROEPEN.flatMap((g) => g.onderdelen);
const NAAM = Object.fromEntries(ONDERDELEN.map((o) => [o.id, o.naam]));
const RANG = { ok: 0, maint: 1, warn: 2, down: 3 };

// ------------------------------------------------------------------ signals the Worker already has

/** Pushes sent in this invocation, written once per drain (one row per 10 minutes and platform). */
export async function notePushes(env, list) {
  if (!list.length) return;
  const bucket = Math.floor(Date.now() / (10 * MIN)) * 10 * MIN;
  const per = {};
  for (const p of list) {
    const s = (per[p.platform] ||= { ok: 0, fail: 0, latSum: 0, latN: 0 });
    if (p.ok) s.ok++; else if (!p.dead) s.fail++;
    if (p.ok && p.latency != null && p.latency >= 0 && p.latency < 30 * MIN) { s.latSum += p.latency; s.latN++; }
  }
  await env.DB.batch(Object.entries(per).map(([platform, s]) => env.DB.prepare(`INSERT INTO status_push (bucket, platform, ok, fail, lat_sum, lat_n) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucket, platform) DO UPDATE SET ok = ok + excluded.ok, fail = fail + excluded.fail, lat_sum = lat_sum + excluded.lat_sum, lat_n = lat_n + excluded.lat_n`)
    .bind(bucket, platform, s.ok, s.fail, s.latSum, s.latN)));
}

/** Weather asked by an app: worked or not (only when the alert has a place). */
export const noteWeer = (env, ok) => kvSet(env, ok ? "status_weer_ok" : "status_weer_fout", Date.now());
export const noteHeli = (env, ok) => kvSet(env, ok ? "status_heli_ok" : "status_heli_fout", Date.now());

/** A light check of the website, at most every five minutes. */
export async function checkWebsite(env, budget) {
  const last = Number(await kvGet(env, "status_web_try")) || 0;
  if (Date.now() - last < 5 * MIN || !budget.take()) return;
  await kvSet(env, "status_web_try", Date.now());
  const url = env.STATUS_WEB_URL || "https://a-alerts.nl/";
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "A-Alerts status" } });
    if (res.ok) { await kvSet(env, "status_web_ok", Date.now()); await kvDel(env, "status_web_fout"); }
    else await kvSet(env, "status_web_fout", JSON.stringify({ at: Date.now(), fout: `HTTP ${res.status}` }));
  } catch (e) {
    await kvSet(env, "status_web_fout", JSON.stringify({ at: Date.now(), fout: String(e.message || e).slice(0, 120) }));
  }
}

// ------------------------------------------------------------------ current state

const ago = (ms) => ms < MIN ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3600_000 ? `${Math.round(ms / MIN)} min` : `${Math.round(ms / 3600_000)} uur`;
const agoEn = (ms) => ms < MIN ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3600_000 ? `${Math.round(ms / MIN)} min` : `${Math.round(ms / 3600_000)} h`;
const tijd = (t) => new Date(t).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });

/** State by the age of the last successful read: ok below `warn`, verstoord below `down`, storing above. */
function opLeeftijd(okAt, fout, now, warn, down) {
  if (!okAt) return { staat: "ok", detail: null, detail_en: null, onbekend: true };
  const age = now - okAt;
  const staat = age > down ? "down" : age > warn ? "warn" : "ok";
  return staat === "ok"
    ? { staat, detail: `Laatste ophaalronde ${ago(age)} geleden`, detail_en: `Last read ${agoEn(age)} ago` }
    : { staat, detail: `Ophalen lukt niet sinds ${tijd(okAt)}`, detail_en: `Reading has failed since ${tijd(okAt)}`, fout };
}

async function pushStaat(env, platform, now) {
  const r = await env.DB.prepare("SELECT SUM(ok) AS ok, SUM(fail) AS fail, SUM(lat_sum) AS ls, SUM(lat_n) AS ln FROM status_push WHERE platform = ? AND bucket >= ?")
    .bind(platform, now - 30 * MIN).first();
  const ok = r?.ok || 0, fail = r?.fail || 0, tot = ok + fail;
  const lat = r?.ln ? r.ls / r.ln : null;
  if (tot < 5) return { staat: "ok", detail: null, detail_en: null, lat };
  const pct = fail / tot;
  // One or two failures (e.g. during a deploy, or one old phone) is not an outage: at least 3 (warn) or 5 (down).
  let staat = pct > 0.2 && fail >= 5 ? "down" : pct > 0.05 && fail >= 3 ? "warn" : "ok";
  if (staat === "ok" && lat != null && lat > 3 * MIN) staat = "warn";
  const afg = `${Math.round((ok / tot) * 1000) / 10}`.replace(".", ",");
  return {
    staat, lat, ok, fail,
    detail: staat === "ok" ? `${afg}% afgeleverd` : lat != null && lat > 3 * MIN ? `Gem. ${Math.round(lat / MIN)} min vertraging` : `${Math.round(pct * 100)}% mislukt`,
    detail_en: staat === "ok" ? `${afg}% delivered` : lat != null && lat > 3 * MIN ? `Avg. ${Math.round(lat / MIN)} min delay` : `${Math.round(pct * 100)}% failed`,
  };
}

/** Current state of every component (and the beheer-only signals). */
export async function huidigeStaat(env, now = Date.now()) {
  const keys = ["feed_ok", "feed_error", "bron_ok:nlalert", "bron_ok:burgernet", "bron_ok:knmi", "bron_fout:nlalert", "bron_fout:burgernet", "bron_fout:knmi",
    "status_heli_ok", "status_heli_fout", "status_weer_ok", "status_weer_fout", "status_web_ok", "status_web_fout", "cron_run"];
  const { results } = await env.DB.prepare(`SELECT key, value FROM kv WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all();
  const kv = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const n = (k) => Number(kv[k]) || 0;
  const s = {};
  s.p2000 = opLeeftijd(n("feed_ok"), kv.feed_error, now, 3 * MIN, 10 * MIN);
  for (const b of ["nlalert", "burgernet", "knmi"]) s[b] = opLeeftijd(n(`bron_ok:${b}`), kv[`bron_fout:${b}`], now, 10 * MIN, 30 * MIN);
  s.heli = opLeeftijd(n("status_heli_ok"), null, now, 5 * MIN, 15 * MIN);
  if (s.heli.staat === "ok" && !s.heli.onbekend) { s.heli.detail = s.heli.detail.replace("Laatste ophaalronde", "Laatste positie"); s.heli.detail_en = s.heli.detail_en.replace("Last read", "Last position"); }
  s.push_apple = await pushStaat(env, "apple", now);
  s.push_android = await pushStaat(env, "android", now);
  const weerOk = n("status_weer_ok"), weerFout = n("status_weer_fout");
  s.weer = weerFout > weerOk && now - weerFout < 30 * MIN
    ? { staat: "warn", detail: "Weer kon niet worden geladen", detail_en: "Weather could not be loaded" }
    : { staat: "ok", detail: null, detail_en: null };
  const cronAge = now - n("cron_run");
  s.api = cronAge > 5 * MIN
    ? { staat: "warn", detail: "Achtergrondtaken lopen achter", detail_en: "Background tasks are behind" }
    : { staat: "ok", detail: null, detail_en: null };
  const webFout = parse(kv.status_web_fout);
  s.web = webFout && webFout.at > n("status_web_ok")
    ? { staat: "down", detail: "Website niet bereikbaar", detail_en: "Website unreachable", fout: webFout.fout }
    : { staat: "ok", detail: null, detail_en: null, onbekend: !n("status_web_ok") };

  // Maintenance (from the beheer) puts the components it names on "onderhoud".
  for (const inc of await actieveIncidenten(env, now)) {
    if (inc.soort !== "onderhoud") continue;
    for (const id of inc.onderdelen) if (s[id] && s[id].staat !== "down") s[id] = { ...s[id], staat: "maint" };
  }
  return s;
}

/** Beheer-only signals: things that are off normal but not a public outage. */
export async function afwijkingen(env, now = Date.now()) {
  const out = [];
  const backlog = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS oudste FROM outbox").first();
  if (backlog?.n > 300 || (backlog?.oudste && now - backlog.oudste > 5 * MIN)) {
    out.push({ id: "wachtrij", tekst: `Push-wachtrij loopt achter: ${backlog.n} wachtend, oudste ${ago(now - backlog.oudste)}` });
  }
  // A long quiet period in the daytime while the reads work: something may be wrong at the source.
  const uur = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", hour12: false }).format(new Date(now)));
  const laatste = (await env.DB.prepare("SELECT MAX(datum) AS t FROM meldingen").first())?.t;
  if (uur >= 8 && uur < 23 && laatste && now - laatste > 3 * 3600_000) {
    out.push({ id: "stil", tekst: `Al ${ago(now - laatste)} geen nieuwe P2000-melding (overdag ongebruikelijk)` });
  }
  return out;
}

// ------------------------------------------------------------------ incidents (from the beheer)

const incidentAPI = (r) => ({
  id: r.id, titel: r.titel, titel_en: r.titel_en || null, soort: r.soort, onderdelen: parse(r.onderdelen, []),
  start: new Date(r.start_at).toISOString(), einde: r.eind_at ? new Date(r.eind_at).toISOString() : null,
  gepland_start: r.gepland_start ? new Date(r.gepland_start).toISOString() : null,
  gepland_einde: r.gepland_eind ? new Date(r.gepland_eind).toISOString() : null,
  updates: parse(r.updates, []).sort((a, b) => b.at - a.at).map((u) => ({ ...u, at: new Date(u.at).toISOString() })),
});

export async function actieveIncidenten(env, now = Date.now()) {
  const list = await rows(env, "SELECT * FROM status_incidenten WHERE eind_at IS NULL AND (gepland_start IS NULL OR gepland_start <= ?) ORDER BY start_at DESC", now);
  return list.map(incidentAPI);
}

export async function incidentenLijst(env, now = Date.now()) {
  const all = await rows(env, "SELECT * FROM status_incidenten WHERE COALESCE(eind_at, ?) >= ? ORDER BY start_at DESC LIMIT 100", now, now - 90 * DAY);
  const actief = [], gepland = [], recent = [];
  for (const r of all) {
    if (r.eind_at && r.eind_at <= now) { if (r.eind_at >= now - 30 * DAY) recent.push(incidentAPI(r)); }
    else if (r.gepland_start && r.gepland_start > now) gepland.push(incidentAPI(r));
    else actief.push(incidentAPI(r));
  }
  gepland.sort((a, b) => Date.parse(a.gepland_start) - Date.parse(b.gepland_start));
  return { actief, gepland, recent };
}

const SOORTEN = ["storing", "vertraagd", "onderhoud"];
const FASEN = ["onderzoek", "oorzaak", "herstel", "monitoren", "opgelost", "gepland", "bezig", "afgerond"];
const clean = (s, n) => String(s || "").trim().slice(0, n);

export async function maakIncident(env, body) {
  const titel = clean(body.titel, 140);
  if (!titel) throw Object.assign(new Error("Titel ontbreekt"), { status: 400 });
  const soort = SOORTEN.includes(body.soort) ? body.soort : "storing";
  const onderdelen = (Array.isArray(body.onderdelen) ? body.onderdelen : []).filter((o) => NAAM[o]);
  const now = Date.now();
  const gs = body.gepland_start ? Date.parse(body.gepland_start) : null;
  const ge = body.gepland_einde ? Date.parse(body.gepland_einde) : null;
  const tekst = clean(body.tekst, 1000);
  const updates = tekst ? [{ at: now, fase: soort === "onderhoud" ? "gepland" : clean(body.fase, 20) || "onderzoek", tekst, tekst_en: clean(body.tekst_en, 1000) || null }] : [];
  const r = await env.DB.prepare(`INSERT INTO status_incidenten (titel, titel_en, soort, onderdelen, start_at, eind_at, gepland_start, gepland_eind, updates, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(titel, clean(body.titel_en, 140) || null, soort, JSON.stringify(onderdelen), gs || now, Number.isFinite(gs) ? gs : null, Number.isFinite(ge) ? ge : null, JSON.stringify(updates), now, now).first();
  return incidentAPI(r);
}

export async function updateIncident(env, id, body) {
  const r = await env.DB.prepare("SELECT * FROM status_incidenten WHERE id = ?").bind(id).first();
  if (!r) return null;
  const now = Date.now();
  const updates = parse(r.updates, []);
  const fase = FASEN.includes(body.fase) ? body.fase : (body.opgelost ? (r.soort === "onderhoud" ? "afgerond" : "opgelost") : "onderzoek");
  const tekst = clean(body.tekst, 1000);
  if (tekst) updates.push({ at: now, fase, tekst, tekst_en: clean(body.tekst_en, 1000) || null });
  const einde = body.opgelost || fase === "opgelost" || fase === "afgerond" ? now : null;
  const r2 = await env.DB.prepare("UPDATE status_incidenten SET updates = ?, eind_at = COALESCE(?, eind_at), titel = COALESCE(?, titel), updated_at = ? WHERE id = ? RETURNING *")
    .bind(JSON.stringify(updates), einde, clean(body.titel, 140) || null, now, id).first();
  return incidentAPI(r2);
}

export const verwijderIncident = (env, id) => env.DB.prepare("DELETE FROM status_incidenten WHERE id = ?").bind(id).run();

// ------------------------------------------------------------------ the cron: history and beheer pushes

/** Once a minute: add the state of every component to the day bars and push the beheer on changes. */
export async function statusTick(env, pushAdmins, now = Date.now()) {
  const s = await huidigeStaat(env, now);
  const dag = dagVan(now);
  await env.DB.batch(ONDERDELEN.filter((o) => !s[o.id]?.onbekend).map((o) => {
    const st = s[o.id].staat;
    return env.DB.prepare(`INSERT INTO status_dag (onderdeel, dag, ok, warn, down, maint) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(onderdeel, dag) DO UPDATE SET ok = ok + excluded.ok, warn = warn + excluded.warn, down = down + excluded.down, maint = maint + excluded.maint`)
      .bind(o.id, dag, st === "ok" ? 1 : 0, st === "warn" ? 1 : 0, st === "down" ? 1 : 0, st === "maint" ? 1 : 0);
  }));

  // Beheer push: a component that stays off normal for 3 minutes, and again when it is fine.
  const meldingen = [];
  const vorige = parse(await kvGet(env, "status_alerts"), {});
  const sinds = parse(await kvGet(env, "status_sinds"), {});
  for (const o of ONDERDELEN) {
    const st = s[o.id]?.staat || "ok";
    const slecht = st === "warn" || st === "down";
    if (!slecht) { delete sinds[o.id]; } else if (!sinds[o.id] || sinds[o.id].staat !== st) sinds[o.id] = { staat: st, at: now };
    const gemeld = vorige[o.id];
    if (slecht && now - sinds[o.id].at >= 3 * MIN && gemeld !== st) {
      const extra = [s[o.id].detail, s[o.id].fout].filter(Boolean).join(" · ");
      meldingen.push([`${st === "down" ? "🔴" : "🟠"} ${o.naam}: ${st === "down" ? "storing" : "wijkt af"}`, extra || "Wijkt al 3 minuten af van normaal."]);
      vorige[o.id] = st;
    } else if (!slecht && gemeld) {
      meldingen.push([`✅ ${o.naam} werkt weer`, "Weer normaal."]);
      delete vorige[o.id];
    }
  }
  for (const a of await afwijkingen(env, now)) {
    if (!vorige[`x:${a.id}`]) { meldingen.push(["🟠 A-Alerts wijkt af", a.tekst]); vorige[`x:${a.id}`] = "warn"; }
  }
  const actieveX = new Set((await afwijkingen(env, now)).map((a) => `x:${a.id}`));
  for (const k of Object.keys(vorige)) if (k.startsWith("x:") && !actieveX.has(k)) { delete vorige[k]; }
  await kvSet(env, "status_sinds", JSON.stringify(sinds));
  await kvSet(env, "status_alerts", JSON.stringify(vorige));
  if (meldingen.length === 1) await pushAdmins(env, meldingen[0][0], meldingen[0][1], { kind: "bronnen" });
  else if (meldingen.length > 1) await pushAdmins(env, `A-Alerts: ${meldingen.length} wijzigingen in de status`, meldingen.map((m) => m[0].replace(/^\S+\s/, "")).join(" · "), { kind: "bronnen" });
  return s;
}

export async function statusHousekeeping(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM status_push WHERE bucket < ?").bind(now - 2 * DAY).run();
  await env.DB.prepare("DELETE FROM status_dag WHERE dag < ?").bind(dagVan(now - 95 * DAY)).run();
  await env.DB.prepare("DELETE FROM status_incidenten WHERE eind_at IS NOT NULL AND eind_at < ?").bind(now - 90 * DAY).run();
}

// ------------------------------------------------------------------ the public answer

function dagStaat(r) {
  if (!r) return { staat: "geen", uptime: null };
  const tot = r.ok + r.warn + r.down + r.maint;
  if (!tot) return { staat: "geen", uptime: null };
  const staat = r.down >= 5 ? "down" : r.warn + r.down >= 5 ? "warn" : r.maint > 0 ? "maint" : "ok";
  return { staat, uptime: (tot - r.down) / tot };
}

/** `/v1/status`: what the status page and the apps show. `beheer` adds the raw errors and the beheer-only signals. */
export async function statusOverzicht(env, { beheer = false } = {}, now = Date.now()) {
  const s = await huidigeStaat(env, now);
  const dagen = [];
  for (let i = 89; i >= 0; i--) dagen.push(dagVan(now - i * DAY));
  const hist = await rows(env, "SELECT * FROM status_dag WHERE dag >= ?", dagen[0]);
  const per = new Map(hist.map((r) => [`${r.onderdeel}|${r.dag}`, r]));
  const groepen = GROEPEN.map((g) => ({
    id: g.id, naam: g.naam, naam_en: g.naam_en,
    onderdelen: g.onderdelen.map((o) => {
      const cur = s[o.id] || { staat: "ok" };
      let som = 0, tot = 0;
      const d = dagen.map((dag) => {
        const r = per.get(`${o.id}|${dag}`);
        if (r) { som += r.ok + r.warn + r.maint; tot += r.ok + r.warn + r.down + r.maint; }
        return { dag, ...dagStaat(r) };
      });
      return {
        id: o.id, naam: o.naam, naam_en: o.naam_en, staat: cur.staat, detail: cur.detail || null, detail_en: cur.detail_en || null,
        uptime: tot ? Math.round((som / tot) * 10000) / 100 : null, dagen: d,
        ...(beheer && cur.fout ? { fout: String(cur.fout).slice(0, 300) } : {}),
      };
    }),
  }));
  const ergste = ONDERDELEN.reduce((a, o) => (RANG[s[o.id]?.staat] ?? 0) > (RANG[a] ?? 0) ? s[o.id].staat : a, "ok");
  const incidenten = await incidentenLijst(env, now);
  const start = startVanDag(now);
  const meldingen = (await env.DB.prepare("SELECT COUNT(*) AS n, MAX(datum) AS laatste FROM meldingen WHERE datum >= ?").bind(start).first()) || {};
  const laatste = (await env.DB.prepare("SELECT MAX(datum) AS t FROM meldingen").first())?.t || null;
  const push = (await env.DB.prepare("SELECT SUM(ok) AS ok, SUM(lat_sum) AS ls, SUM(lat_n) AS ln FROM status_push WHERE bucket >= ?").bind(start - 10 * MIN).first()) || {};
  return {
    bijgewerkt: new Date(now).toISOString(),
    staat: ergste,
    groepen,
    incidenten,
    vandaag: {
      meldingen: meldingen.n || 0,
      pushmeldingen: push.ok || 0,
      push_gem_s: push.ln ? Math.round(push.ls / push.ln / 1000) : null,
      laatste_p2000: laatste ? new Date(laatste).toISOString() : null,
    },
    ...(beheer ? { afwijkingen: await afwijkingen(env, now) } : {}),
  };
}
