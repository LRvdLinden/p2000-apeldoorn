import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pager = source("../../website/assets/js/pager.js");
const marker = source("../../website/assets/js/aalerts.js");
const backend = source("../src/heli.js");

test("aircraft backend does not fetch from NDW / traffic service", () => {
  assert.doesNotMatch(backend, /env\.VERKEER_URL|env\.VERKEER_TOKEN|\/adsb\?lat=/);
  assert.match(backend, /https:\/\/api\.adsb\.lol\/v2\/point/);
});

test("aircraft position polling does not re-render the full map or wait for traffic", () => {
  const fn = pager.split("async function pollHelis() {")[1]?.split('\n}\n')[0];
  assert.ok(fn, "pollHelis must be present");
  assert.match(fn, /await fetchLuchtvaart\(/);
  assert.match(fn, /await updateAircraftMap\(/);
  assert.doesNotMatch(fn, /renderMap\(|fetchVerkeer\(|removeAnnotations\(|removeOverlays\(/);
});

test("MapKit aircraft annotations persist and move smoothly independent of NDW", () => {
  const fn = pager.split("async function updateAircraftMap() {")[1]?.split('\n}\n')[0];
  assert.ok(fn, "independent layer updater");
  assert.match(fn, /heliMarkers\.update\(/);
  assert.match(fn, /luchtMarkers\.update\(/);
  assert.doesNotMatch(fn, /renderMap\(|fetchVerkeer\(|removeAnnotations\(|removeOverlays\(/);
  assert.match(marker, /export function heliLaag\(/);
  assert.match(marker, /const timer = setInterval\(/);
  assert.match(marker, /a\.coordinate = new mk\.Coordinate/);
});

test("routine 15 second pager refreshes redraw the map only on alert changes", () => {
  assert.match(pager, /function mapContentKey\(/);
  assert.match(pager, /if \(state\.tab === "kaart" && mapChanged\) renderMap\(\)/);
  assert.match(pager, /render\(new Set\(fresh\.map\(\(m\) => m\.guid\)\), \{ mapChanged \}\)/);
});

test("web output keeps 90 second offline aircraft threshold", () => {
  assert.match(marker, /now - at < 90_000/);
  assert.match(pager, /from "\.\/aalerts\.js\?v=82"/);
});
