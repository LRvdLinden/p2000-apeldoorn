import { meldingenBetween } from "./db.js";
import { config } from "./config.js";

/** Start of a month in Amsterdam as unix ms ("2026-11" → 2026-11-01T00:00 local). */
function monthStart(year, month) {
  // Find the UTC instant whose Amsterdam wall time is the 1st, 00:00.
  const guess = Date.UTC(year, month - 1, 1, 0, 0, 0);
  const offset = tzOffsetMinutes(new Date(guess));
  return guess - offset * 60_000;
}

function tzOffsetMinutes(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUTC - date.getTime()) / 60_000);
}

function localParts(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone, hourCycle: "h23", weekday: "short", hour: "2-digit",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: days[p.weekday] ?? 0, hour: Number(p.hour) % 24 };
}

/** Same shape as the former MaandStatistiek entity (by_dag index 0 = zondag). */
export function monthStats(key) {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const from = monthStart(y, m);
  const to = m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1);
  const rows = meldingenBetween(from, to);
  const by = (k) => rows.reduce((acc, r) => { const v = r[k] || "onbekend"; acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const byDag = Array(7).fill(0);
  const byUur = Array(24).fill(0);
  for (const r of rows) {
    const { weekday, hour } = localParts(r.datum);
    byDag[weekday]++;
    byUur[hour]++;
  }
  return {
    jaar: y, maand: m, maand_key: `${y}-${String(m).padStart(2, "0")}`,
    totaal: rows.length,
    by_dienst: by("dienst"),
    by_prioriteit: by("prioriteit"),
    by_categorie: by("categorie"),
    by_dag: byDag,
    by_uur: byUur,
  };
}
