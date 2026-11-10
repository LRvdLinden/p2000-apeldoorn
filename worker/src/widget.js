// A-Alerts widgets (live map and "Verkeer nu") on a-alerts.nl/nieuws and on other websites (iframe or script).
// Every load of the widget on another site reports the domain name (no visitor data): the beheer shows on which
// sites the widget is embedded, and can block a site (it then only shows "Bekijk dit op a-alerts.nl").

const EIGEN = /(^|\.)a-alerts\.nl$|(^|\.)lrvdlinden\.app$|^localhost$|^127\.0\.0\.1$/;
const dag = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** Domain name from a URL or host ("https://www.buurt.nl/x" → "buurt.nl"); null when not usable. */
export function siteVan(s) {
  let h = String(s || "").trim().toLowerCase();
  if (!h) return null;
  try { if (/^https?:\/\//.test(h)) h = new URL(h).hostname; } catch { return null; }
  h = h.replace(/^www\./, "").replace(/:\d+$/, "");
  return /^[a-z0-9.-]{3,120}$/.test(h) && h.includes(".") ? h : null;
}

const WIDGETS = ["kaart", "verkeer", "weer"];
const widgetsVan = (w) => [...new Set(String(w || "").split(",").map((x) => x.trim()).filter((x) => WIDGETS.includes(x)))].join(",") || "kaart,verkeer";

/** GET /v1/widget/ping?site=…&w=…: counts the view (other sites only) and says whether the site is blocked. */
export async function widgetPing(env, q) {
  const site = siteVan(q.get("site"));
  if (!site || EIGEN.test(site)) return { blok: false };
  const blok = await env.DB.prepare("SELECT 1 FROM widget_blok WHERE site = ?").bind(site).first();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO widget_sites (site, widgets, eerst, laatst) VALUES (?, ?, ?, ?)
      ON CONFLICT(site) DO UPDATE SET widgets = excluded.widgets, laatst = excluded.laatst`).bind(site, widgetsVan(q.get("w")), now, now),
    env.DB.prepare(`INSERT INTO widget_views (site, dag, n) VALUES (?, ?, 1) ON CONFLICT(site, dag) DO UPDATE SET n = n + 1`).bind(site, dag(now)),
  ]);
  return { blok: Boolean(blok) };
}

/** Beheer: every site with the widget, newest first, with views in the last 7 days and the block state. */
export async function widgetSites(env) {
  const van = dag(Date.now() - 6 * 86_400_000);
  const { results } = await env.DB.prepare(`SELECT s.site, s.widgets, s.eerst, s.laatst,
      COALESCE((SELECT SUM(n) FROM widget_views v WHERE v.site = s.site AND v.dag >= ?), 0) AS views7,
      COALESCE((SELECT SUM(n) FROM widget_views v WHERE v.site = s.site), 0) AS totaal,
      EXISTS (SELECT 1 FROM widget_blok b WHERE b.site = s.site) AS blok
    FROM widget_sites s ORDER BY s.laatst DESC LIMIT 200`).bind(van).all();
  return results.map((r) => ({ site: r.site, widgets: r.widgets, eerst: new Date(r.eerst).toISOString(), laatst: new Date(r.laatst).toISOString(),
    views7: r.views7, totaal: r.totaal, blok: Boolean(r.blok), actief: Date.now() - r.laatst < 3 * 86_400_000 }));
}

/** Beheer: block or unblock a site. */
export async function widgetBlok(env, body) {
  const site = siteVan(body?.site);
  if (!site) return false;
  if (body.blok) await env.DB.prepare("INSERT OR REPLACE INTO widget_blok (site, at) VALUES (?, ?)").bind(site, Date.now()).run();
  else await env.DB.prepare("DELETE FROM widget_blok WHERE site = ?").bind(site).run();
  return true;
}

/** Housekeeping: views older than 90 days. */
export const widgetHousekeeping = (env) => env.DB.prepare("DELETE FROM widget_views WHERE dag < ?").bind(dag(Date.now() - 90 * 86_400_000)).run();
