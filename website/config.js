// API address. The MapKit JS token is fetched from the API (/v1/mapkit-token) when mapkitToken is empty.
window.P2000_CONFIG = {
  api: "https://api.a-alerts.nl",
  mapkitToken: "",
  // Zet op true zodra api.a-alerts.nl de token-header toestaat (CORS); daarvoor breekt de preflight de live pager.
  tokenAan: true,
  appStoreURL: "https://apps.apple.com/nl/app/a-alerts/id6829732272",
};

// Every call to the A-Alerts API carries a short-lived token from /token.php (the key itself stays on the server).
(() => {
  const echt = window.fetch.bind(window);
  const basis = window.P2000_CONFIG.api.replace(/\/+$/, "");
  let huidig = null; // { t, tot }
  const haal = async () => {
    if (huidig && huidig.tot > Date.now()) return huidig.t;
    try {
      const r = await echt("/token.php", { cache: "no-store" });
      const j = r.ok ? await r.json() : {};
      huidig = { t: j.t || "", tot: Date.now() + (j.t ? (j.ttl || 6600) * 1000 - 60000 : 60000) };
    } catch { huidig = { t: "", tot: Date.now() + 30000 }; }
    return huidig.t;
  };
  window.fetch = async (invoer, opties) => {
    const url = typeof invoer === "string" ? invoer : invoer instanceof URL ? invoer.href : invoer && invoer.url;
    if (!url || !url.startsWith(basis + "/v1/") || /\/(afbeelding\.png|mapkit-token)|\/v1\/(app|changelog|content|status|downloads|radar|kaart)/.test(url)) return echt(invoer, opties);
    if (!window.P2000_CONFIG.tokenAan) return echt(invoer, opties);
    const t = await haal();
    if (!t) return echt(invoer, opties);
    const kop = new Headers((opties && opties.headers) || (invoer instanceof Request ? invoer.headers : undefined));
    kop.set("X-AAlerts-Token", t);
    return echt(invoer, { ...(opties || {}), headers: kop });
  };
})();
