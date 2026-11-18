// Read-only probe for the existing Koyeb P2000 WebSocket.
// Never uses the Homey app's identity or the p2000.page REST API key.
const url = "wss://p2000-martijnpoppen.koyeb.app";
const controller = new AbortController();
const ws = new WebSocket(url, "homey-a11ea1eaa11ea1eaa11ea1ea-nl.lrvdlinden.aalerts");
let completed = false;
const finish = (status, message) => {
  if (completed) return;
  completed = true;
  console.log(status, message);
  try { ws.close(); } catch {}
  clearTimeout(timer);
  if (status !== "OK") process.exitCode = 1;
};
const timer = setTimeout(() => finish("FAIL", "no valid message within 45s"), 45000);
ws.addEventListener("open", () => console.log("connected with separate synthetic A-Alerts protocol"));
ws.addEventListener("message", (event) => {
  try {
    const data = JSON.parse(String(event.data));
    if (Array.isArray(data) && data.length && data.some(x => x?.id && x?.p2000)) {
      finish("OK", "received a valid P2000 event array from Koyeb");
    }
  } catch { /* Some control frames may not be JSON. */ }
});
ws.addEventListener("error", () => finish("FAIL", "websocket handshake failed"));
ws.addEventListener("close", () => { if (!completed) finish("FAIL", "socket closed before a message"); });
