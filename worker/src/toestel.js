// "Toestel-ID": a short code shown in the apps (Instellingen, under Disclaimer) that a user can give for support.
// It is the start of the anonymous install ID (XXXX-XXXX). The apps send the install ID along when they register
// for push, so the beheer can find the install and its push registration with that code.
import { HttpError } from "./rules.js";
import { sendPush } from "./apple.js";

/** "3f9a12bc-…" → "3F9A-12BC". */
export const toestelCode = (installId) => {
  const hex = String(installId || "").replace(/[^0-9a-f]/gi, "").slice(0, 8).toUpperCase();
  return hex.length === 8 ? `${hex.slice(0, 4)}-${hex.slice(4)}` : null;
};

/** Remembers which install belongs to a push registration (called from POST /v1/devices). */
export async function koppelInstall(env, token, installId) {
  const id = String(installId || "").toLowerCase();
  if (!/^[0-9a-f-]{32,40}$/.test(id)) return;
  await env.DB.prepare("INSERT OR REPLACE INTO device_install (token, install_id, at) VALUES (?, ?, ?)").bind(token, id, Date.now()).run();
}

const prefix = (code) => {
  const hex = String(code || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length < 6 || hex.length > 8) throw new HttpError(400, "Toestel-ID is 8 tekens, bijvoorbeeld 3F9A-12BC");
  return hex;
};

/** GET /v1/beheer/toestel/:code — the install(s) with this code and their push registration. */
export async function zoekToestel(env, code) {
  const hex = prefix(code);
  const like = `${hex.slice(0, 8)}%`;
  const { results: installs } = await env.DB.prepare(
    "SELECT id, platform, model, os_version, app_version, build, apple_login, push, language, first_seen, last_seen FROM installs WHERE replace(id, '-', '') LIKE ? ORDER BY last_seen DESC LIMIT 5",
  ).bind(like).all();
  const out = [];
  for (const i of installs) {
    const { results: devices } = await env.DB.prepare(
      `SELECT d.token, d.platform, d.environment, d.language, d.app_version, d.enabled, d.quiet, d.radius_km, d.updated_at, p.data AS prefs
       FROM device_install di JOIN devices d ON d.token = di.token LEFT JOIN device_prefs p ON p.token = d.token
       WHERE di.install_id = ? ORDER BY d.updated_at DESC LIMIT 3`,
    ).bind(i.id).all().catch(() => ({ results: [] }));
    out.push({
      code: toestelCode(i.id), platform: i.platform, model: i.model, os: i.os_version, app_version: i.app_version, build: i.build,
      apple_login: !!i.apple_login, push_aan: !!i.push, taal: i.language,
      eerst: new Date(i.first_seen).toISOString(), laatst: new Date(i.last_seen).toISOString(),
      push: devices.map((d) => {
        let prefs = {};
        try { prefs = JSON.parse(d.prefs || "{}"); } catch {}
        return {
          id: d.token.slice(0, 10), platform: d.platform, omgeving: d.environment, app_version: d.app_version, aan: !!d.enabled,
          stille_uren: !!d.quiet, straal_km: d.radius_km, bijgewerkt: d.updated_at ? new Date(Number(d.updated_at) || d.updated_at).toISOString() : null,
          profielen: (prefs.profielen || []).length, heli_zones: prefs.heli?.zones?.length || 0, groot_incident: !!prefs.groot?.aan,
          capcodes: (prefs.capcodes || []).length,
        };
      }),
    });
  }
  return { gevonden: out.length, toestellen: out };
}

/** POST /v1/beheer/toestel/:code/test — test notification to every push registration of this install. */
export async function testToestel(env, code) {
  const hex = prefix(code);
  const { results } = await env.DB.prepare(
    `SELECT d.* FROM installs i JOIN device_install di ON di.install_id = i.id JOIN devices d ON d.token = di.token
     WHERE replace(i.id, '-', '') LIKE ? LIMIT 5`,
  ).bind(`${hex.slice(0, 8)}%`).all();
  if (!results.length) throw new HttpError(404, "Geen pushregistratie bij dit toestel-ID");
  const out = [];
  for (const d of results) {
    const nl = (d.language || "nl").startsWith("nl");
    const r = await sendPush(env, d, {
      aps: { alert: { title: "A-Alerts", body: nl ? "Testmelding van de beheerder: pushmeldingen werken." : "Test notification from the admin: notifications work." }, sound: "default" },
    }, { urgent: false });
    out.push({ platform: d.platform, ok: !!r.ok, status: r.status ?? null, reason: r.reason ?? null });
  }
  return { ok: out.every((x) => x.ok), resultaten: out };
}
