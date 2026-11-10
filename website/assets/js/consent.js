// Cookie notice (AVG/ePrivacy), same pattern as weekdot.com. Necessary storage (this choice, read alerts and filters)
// is always on. Apple Maps (MapKit JS, a third party that sees your IP address) and Google Tag Manager (statistics)
// only load after "Accepteren".
// The choice is kept for 12 months, in localStorage and in a first-party cookie.
(function () {
  "use strict";
  var KEY = "p2000_consent", MAX = 365 * 24 * 3600, MAX_MS = MAX * 1000;
  var root = document.currentScript ? new URL("../../", document.currentScript.src).pathname : "/";
  var T = {
    title: "Cookies en privacy",
    text: "A-Alerts gebruikt alleen opslag die nodig is voor de site: deze keuze, welke meldingen je al hebt bekeken en je filters. " +
      "Met je toestemming laden we ook de kaarten van Apple Kaarten en meten we het bezoek met Google Tag Manager; daarbij zien Apple en Google je IP-adres. Geen advertenties.",
    more: "Meer over cookies",
    accept: "Accepteren",
    necessary: "Alleen noodzakelijk",
    settings: "Cookie-instellingen",
  };
  var COOKIE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.3A9 9 0 1 1 11.7 3a3 3 0 0 0 3.8 3.8 3 3 0 0 0 3.7 3.7 3 3 0 0 0 1.8 1.8z"/><circle cx="8.5" cy="10.5" r="1" fill="currentColor"/><circle cx="12" cy="15.5" r="1" fill="currentColor"/><circle cx="16" cy="14" r="1" fill="currentColor"/><circle cx="8" cy="15" r=".6" fill="currentColor"/></svg>';

  function valid(v) { return v && (v.choice === "all" || v.choice === "necessary") && !(Date.now() - Date.parse(v.at) > MAX_MS); }
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); if (valid(v)) return v; } catch (e) {}
    var m = document.cookie.match(/(?:^|; )p2000_consent=([^;]+)/);
    if (m) { try { var c = JSON.parse(decodeURIComponent(m[1])); if (valid(c)) return c; } catch (e) {} }
    return null;
  }
  function save(choice) {
    var v = { choice: choice, at: new Date().toISOString(), v: 1 };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    try {
      document.cookie = KEY + "=" + encodeURIComponent(JSON.stringify(v)) + "; Max-Age=" + MAX + "; Path=/; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) {}
    return v;
  }

  // Non-modal dialog: named by its heading, focus moves to it when shown and back when closed.
  function banner() {
    if (document.getElementById("p2000-consent")) return;
    var prev = document.activeElement;
    var d = document.createElement("div");
    d.id = "p2000-consent"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "false");
    d.setAttribute("aria-labelledby", "p2000-consent-t"); d.setAttribute("aria-describedby", "p2000-consent-p"); d.tabIndex = -1;
    d.innerHTML = '<div class="t" id="p2000-consent-t">' + T.title + "</div>" +
      '<p id="p2000-consent-p">' + T.text + ' <a href="' + root + 'cookies/">' + T.more + "</a></p>" +
      '<div class="b"><button type="button" class="y">' + T.accept + '</button><button type="button" class="n">' + T.necessary + "</button></div>";
    function close(choice) {
      var before = read();
      save(choice);
      var hadFocus = d.contains(document.activeElement);
      d.remove(); showBubble(true);
      // Pages with a map reload, so Apple Maps is loaded (or no longer loaded) right away.
      if ((!before || before.choice !== choice) && document.body && document.body.hasAttribute("data-maps") && (before || choice === "all")) {
        location.reload();
        return;
      }
      if (hadFocus) {
        var back = prev && prev !== document.body && document.contains(prev) ? prev : document.getElementById("p2000-cookie-btn");
        if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
      }
    }
    d.querySelector(".y").onclick = function () { close("all"); laadGTM(); };
    d.querySelector(".n").onclick = function () { close("necessary"); };
    (document.body || document.documentElement).appendChild(d);
    try { d.focus({ preventScroll: true }); } catch (e) { d.focus(); }
  }

  // Small round cookie button bottom-left (once a choice exists): tap = show the notice again.
  function bubble() {
    if (document.getElementById("p2000-cookie-btn")) return;
    var b = document.createElement("button"); b.id = "p2000-cookie-btn"; b.type = "button";
    b.title = T.settings; b.setAttribute("aria-label", T.settings);
    b.innerHTML = COOKIE;
    b.onclick = function () { open(); };
    (document.body || document.documentElement).appendChild(b);
  }
  function showBubble(on) { var b = document.getElementById("p2000-cookie-btn"); if (on) bubble(); else if (b) b.remove(); }
  function open() { var x = document.getElementById("p2000-consent"); if (x) x.remove(); showBubble(false); banner(); }

  // Google Tag Manager (GTM-PTJLKPQX): only with consent, once per page.
  var GTM = "GTM-PTJLKPQX";
  function laadGTM() {
    if (window.__aalertsGTM) return;
    window.__aalertsGTM = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtm.js?id=" + GTM;
    (document.head || document.documentElement).appendChild(s);
  }

  window.P2000Consent = { open: open, get: read, maps: function () { var c = read(); return !!(c && c.choice === "all"); } };

  function start() {
    var c = read();
    if (c && c.choice === "all") laadGTM();
    if (c) bubble(); else banner();
    // Links and buttons "Cookie-instellingen" (fall back to the privacy page without JavaScript).
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-consent-open]");
      if (a) { e.preventDefault(); open(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
