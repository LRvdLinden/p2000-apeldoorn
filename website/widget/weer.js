// A-Alerts widget "weer": <script src="https://a-alerts.nl/widget/weer.js" data-thema="auto" async></script>
// Puts the widget right where the script tag stands, in an iframe of a-alerts.nl that grows with its content.
// The content and layout always come from A-Alerts; no cookies or scripts of A-Alerts land on the host site.
(function () {
  var W = "weer", BASE = "https://a-alerts.nl/widget/";
  var tags = document.currentScript ? [document.currentScript] : document.querySelectorAll('script[src*="/widget/' + W + '.js"]:not([data-a-alerts-klaar])');
  for (var i = 0; i < tags.length; i++) {
    var s = tags[i];
    if (s.getAttribute("data-a-alerts-klaar")) continue;
    s.setAttribute("data-a-alerts-klaar", "1");
    var id = "aaw" + Math.random().toString(36).slice(2, 8), thema = s.getAttribute("data-thema") || "auto";
    var f = document.createElement("iframe");
    f.src = BASE + "?w=" + W + "&thema=" + encodeURIComponent(thema) + "&site=" + encodeURIComponent(location.hostname) + "&id=" + id;
    f.title = "A-Alerts: KNMI-weerwaarschuwing voor Apeldoorn e.o.";
    f.loading = "lazy";
    f.setAttribute("data-id", id);
    f.style.cssText = "width:100%;max-width:520px;height:" + (W === "verkeer" ? 640 : W === "weer" ? 470 : 560) + "px;border:0;display:block;background:transparent";
    s.parentNode.insertBefore(f, s);
  }
  if (!window.__aAlertsWidget) {
    window.__aAlertsWidget = true;
    window.addEventListener("message", function (e) {
      if (e.origin !== "https://a-alerts.nl" || !e.data || !e.data.aAlertsWidget) return;
      var f = document.querySelector('iframe[data-id="' + e.data.id + '"]');
      if (f && e.data.hoogte > 100) f.style.height = Math.min(e.data.hoogte + 4, 2400) + "px";
    });
  }
})();
