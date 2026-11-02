import { config, plaatsKey } from "./config.js";
import { activeDevices, deleteDevice, markPushed, wasPushed } from "./db.js";
import { send, isDeadToken } from "./apns.js";

const LABELS = {
  nl: { brandweer: "Brandweer", ambulance: "Ambulance", politie: "Politie", traumaheli: "Traumaheli", kustwacht: "Kustwacht", onbekend: "Melding", prio: "Prioriteit" },
  en: { brandweer: "Fire brigade", ambulance: "Ambulance", politie: "Police", traumaheli: "Trauma helicopter", kustwacht: "Coastguard", onbekend: "Alert", prio: "Priority" },
};

export const isUrgent = (m) => ["A0", "A1", "P1"].includes(String(m.prioriteit || "").toUpperCase());

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Minutes after midnight in Amsterdam. */
export function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("nl-NL", { timeZone: config.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

export function isQuiet(device, date = new Date()) {
  if (!device.quiet) return false;
  const now = localMinutes(date);
  const from = device.quiet_from, to = device.quiet_to;
  if (from === to) return true;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Same rules as AppSettings.matchesNotification in the app. */
export function matches(device, m, date = new Date()) {
  if (!device.enabled) return false;
  if (device.diensten.length && !device.diensten.includes(m.dienst)) return false;
  if (device.plaatsen.length && !device.plaatsen.some((p) => plaatsKey(p) === plaatsKey(m.stad))) return false;
  if (device.prioriteiten.length && !device.prioriteiten.includes(String(m.prioriteit || "").toUpperCase())) return false;
  if (device.radius_km > 0 && device.lat != null && device.lon != null) {
    if (m.lat == null || m.lon == null) return false;
    if (distanceKm(device.lat, device.lon, m.lat, m.lon) > device.radius_km) return false;
  }
  if (isQuiet(device, date) && !(device.critical && isUrgent(m))) return false;
  return true;
}

const capitalize = (s) => String(s || "").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function payloadFor(m, lang = "nl") {
  const L = LABELS[lang] || LABELS.nl;
  const plaats = [m.locatie, capitalize(m.stad)].filter(Boolean).join(", ") || "Apeldoorn";
  const prioLine = m.prioriteit ? `${L.prio} ${m.prioriteit}${m.categorie ? ` - ${m.categorie}` : ""}` : (m.categorie || "");
  const urgent = isUrgent(m);
  return {
    aps: {
      alert: { title: `${L[m.dienst] || L.onbekend} · ${plaats}`, body: [m.title, prioLine].filter(Boolean).join("\n") },
      sound: "default",
      "thread-id": m.dienst,
      "interruption-level": urgent ? "time-sensitive" : "active",
      "relevance-score": urgent ? 1 : 0.5,
    },
    guid: m.guid,
    dienst: m.dienst,
  };
}

/** Sends a new alert to every matching device. */
export async function notify(m) {
  // Don't push old alerts (e.g. after a restart or a backfill).
  if (Date.now() - m.datum > 15 * 60 * 1000 || wasPushed(m.guid)) return 0;
  const devices = activeDevices().filter((d) => matches(d, m));
  let sent = 0;
  await Promise.all(devices.map(async (d) => {
    const r = await send(d, payloadFor(m, d.language), { urgent: isUrgent(m), collapseId: m.guid });
    if (r.ok) sent++;
    else if (isDeadToken(r)) deleteDevice(d.token);
    else console.warn("[push]", d.token.slice(0, 8), r.status, r.reason);
  }));
  markPushed(m.guid, sent);
  if (devices.length) console.log(`[push] ${m.guid} → ${sent}/${devices.length}`);
  return sent;
}

export async function sendTest(device) {
  const nl = (device.language || "nl").startsWith("nl");
  return send(device, {
    aps: {
      alert: {
        title: "P2000 Apeldoorn",
        body: nl ? "Testmelding: je pushmeldingen werken! 🚨" : "Test notification: your push notifications work! 🚨",
      },
      sound: "default",
    },
  });
}

/** Admin message to everyone with notifications on (replaces the OneSignal admin push). */
export async function broadcast({ title, body, guid }) {
  const devices = activeDevices();
  let sent = 0;
  await Promise.all(devices.map(async (d) => {
    const r = await send(d, { aps: { alert: { title, body }, sound: "default" }, ...(guid ? { guid } : {}) });
    if (r.ok) sent++;
    else if (isDeadToken(r)) deleteDevice(d.token);
  }));
  return { sent, total: devices.length };
}
