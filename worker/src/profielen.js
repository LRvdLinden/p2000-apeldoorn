// A-Alerts notification profiles (max 5 per device): own places, services, priorities, warnings and times.
// The device row keeps the global parts (on/off, radius, quiet hours, critical); profiles decide the rest.
import { matches, TIME_ZONE, isQuiet, isUrgent } from "./rules.js";
import { wantsPush } from "./alerts.js";

export const MAX_PROFIELEN = 5;

const strList = (v, max = 40) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length < 64).slice(0, max) : []);
const int = (v, min, max, d) => (Number.isInteger(v) && v >= min && v <= max ? v : d);
const LEVELS = new Set(["yellow", "orange", "red"]);

/** Cleans the profiles the app sends (unknown fields are dropped). */
export function profielenFrom(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, MAX_PROFIELEN).filter((p) => p && typeof p === "object").map((p) => {
    const dagen = Array.isArray(p.dagen) ? [...new Set(p.dagen.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))] : [];
    return {
      id: typeof p.id === "string" ? p.id.slice(0, 64) : "",
      actief: p.actief !== false,
      diensten: strList(p.diensten),
      plaatsen: strList(p.plaatsen),
      prioriteiten: strList(p.prioriteiten).map((x) => x.toUpperCase()),
      nlalert: p.nlalert === true,
      burgernet: p.burgernet === true,
      knmi: strList(p.knmi).filter((l) => LEVELS.has(l)),
      altijd: p.altijd !== false,
      van: int(p.van, 0, 1439, 420),
      tot: int(p.tot, 0, 1439, 1380),
      dagen: dagen.length ? dagen : [1, 2, 3, 4, 5, 6, 7],
    };
  });
}

/** Minutes after midnight and ISO weekday (1 = Monday) in Amsterdam. */
export function localTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    .formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const days = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { minutes: Number(get("hour")) * 60 + Number(get("minute")), day: days[get("weekday")] || 1 };
}

/** Whether a profile is active at this moment (overnight windows count for the day they start). */
export function geldt(p, date = new Date()) {
  if (!p.actief) return false;
  if (p.altijd) return true;
  const { minutes, day } = localTime(date);
  let dag = day, inWindow;
  if (p.van === p.tot) inWindow = true;
  else if (p.van < p.tot) inWindow = minutes >= p.van && minutes < p.tot;
  else {
    inWindow = minutes >= p.van || minutes < p.tot;
    if (minutes < p.tot) dag = dag === 1 ? 7 : dag - 1;
  }
  return inWindow && p.dagen.includes(dag);
}

/** Followed capcodes ("ster"): digits only, at most 50. */
export function capcodesFrom(list) {
  if (!Array.isArray(list)) return null;
  return [...new Set(list.map((c) => String(c || "").replace(/\D/g, "")).filter((c) => c.length >= 6 && c.length <= 10))].slice(0, 50);
}

/** The alert calls one of the capcodes this device follows. */
export function volgtCapcode(prefs, m) {
  const volg = prefs?.capcodes;
  if (!Array.isArray(volg) || !volg.length) return false;
  const codes = [m.capcode, ...(Array.isArray(m.eenheden) ? m.eenheden.map((e) => e?.code) : [])]
    .map((c) => String(c || "").replace(/\D/g, "")).filter(Boolean);
  return codes.some((c) => volg.includes(c));
}

/**
 * P2000 alert: the device's global rules (radius, quiet hours) plus at least one matching active profile.
 * A followed capcode always counts, also outside the radius, places, services or profiles (quiet hours still apply).
 */
export function meldingWanted(device, prefs, m, date = new Date()) {
  if (device.enabled && volgtCapcode(prefs, m) && !(isQuiet(device, date) && !(device.critical && isUrgent(m)))) return true;
  const profielen = prefs?.profielen;
  if (!Array.isArray(profielen) || !profielen.length) return matches(device, m, date);
  return profielen.some((p) => geldt(p, date)
    && matches({ ...device, diensten: p.diensten, plaatsen: p.plaatsen, prioriteiten: p.prioriteiten }, m, date));
}

/** NL-Alert, Burgernet or KNMI: at least one active profile wants this kind for one of its places. */
export function warningWanted(device, prefs, w, date = new Date()) {
  const profielen = prefs?.profielen;
  if (!Array.isArray(profielen) || !profielen.length) return wantsPush(device, prefs, w);
  return profielen.some((p) => geldt(p, date)
    && wantsPush({ ...device, plaatsen: p.plaatsen }, { nlalert: p.nlalert, burgernet: p.burgernet, knmi: p.knmi }, w));
}
