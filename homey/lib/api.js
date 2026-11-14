'use strict';

const https = require('https');

const BASE = 'https://p2000-apeldoorn-api.lrvdlinden.workers.dev';

/** GET JSON from the A-Alerts API, with a timeout and a few retries (exponential backoff). */
function getJSON(path, { timeout = 15000, retries = 2 } = {}) {
  const once = () => new Promise((resolve, reject) => {
    const req = https.get(`${BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'A-Alerts-Homey/0.1 (+https://a-alerts.nl)', 'X-App-Client': 'A-Alerts-Homey' },
      timeout,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
  const attempt = async (n) => {
    try { return await once(); } catch (e) {
      if (n >= retries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** n));
      return attempt(n + 1);
    }
  };
  return attempt(0);
}

module.exports = {
  meldingen: (limit = 60) => getJSON(`/v1/meldingen?limit=${limit}`),
  waarschuwingen: (days = 3) => getJSON(`/v1/waarschuwingen?days=${days}&kind=1`),
  waarschuwing: (id) => getJSON(`/v1/waarschuwingen/${encodeURIComponent(id)}`),
  nieuws: (limit = 20) => getJSON(`/v1/nieuws?limit=${limit}`),
  helikopters: async () => (await getJSON('/v1/helikopters')).helikopters || [],
};
