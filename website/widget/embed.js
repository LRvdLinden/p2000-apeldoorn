// A-Alerts widget, script version: <div data-a-alerts-widget="kaart,verkeer" data-thema="auto"></div>
// <script src="https://a-alerts.nl/widget/embed.js" async></script>
// Puts the widget in an iframe of a-alerts.nl that grows with its content (no cookies or scripts on the host site).
(function () {
  var BASE = "https://a-alerts.nl/widget/";
  var els = document.querySelectorAll("[data-a-alerts-widget]:not([data-a-alerts-klaar])");
  for (var i = 0; i < els.length; i++) {
    var el = els[i], id = "aaw" + Math.random().toString(36).slice(2, 8);
    el.setAttribute("data-a-alerts-klaar", "1");
    var f = document.createElement("iframe");
    f.src = BASE + "?w=" + encodeURIComponent(el.getAttribute("data-a-alerts-widget") || "kaart,verkeer") +
      "&thema=" + encodeURIComponent(el.getAttribute("data-thema") || "auto") + "&site=" + encodeURIComponent(location.hostname) + "&id=" + id;
    f.title = "A-Alerts: live kaart en verkeer Apeldoorn";
    f.loading = "lazy";
    f.setAttribute("data-id", id);
    f.style.cssText = "width:100%;max-width:520px;height:760px;border:0;display:block;background:transparent";
    el.appendChild(f);
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
