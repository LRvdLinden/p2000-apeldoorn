import { test } from "node:test";
import assert from "node:assert/strict";
import { dagVan, GROEPEN, ONDERDELEN, p2000Staat } from "../src/status.js";

test("status: day in Dutch time", () => {
  assert.equal(dagVan(Date.parse("2026-11-06T23:30:00Z")), "2026-11-07");
  assert.equal(dagVan(Date.parse("2026-07-01T21:59:00Z")), "2026-07-01");
  assert.equal(dagVan(Date.parse("2026-07-01T22:01:00Z")), "2026-07-02");
});

test("status: every component in one group, unique ids", () => {
  const ids = ONDERDELEN.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(GROEPEN.reduce((n, g) => n + g.onderdelen.length, 0), ids.length);
  assert.ok(ids.includes("p2000") && ids.includes("push_android"));
});

test("P2000 public status is healthy when EITHER primary or Koyeb supplies data", () => {
  const now = Date.parse("2026-11-18T10:00:00Z");
  const recent = now - 45_000;
  const stale = now - 30 * 60_000;
  const scenarios = [
    { name: "both healthy", page: recent, koyeb: recent, expected: "ok" },
    { name: "p2000.page healthy, Koyeb down", page: recent, koyeb: stale, expected: "ok" },
    { name: "p2000.page HTTP 403, Koyeb healthy", page: stale, koyeb: recent, expected: "ok" },
    { name: "primary was never reachable, Koyeb healthy", page: 0, koyeb: recent, expected: "ok" },
    { name: "Koyeb was never reachable, primary healthy", page: recent, koyeb: 0, expected: "ok" },
    { name: "both stale for four minutes", page: now - 4*60_000, koyeb: now - 5*60_000, expected: "warn" },
    { name: "both stale for eleven minutes", page: now - 11*60_000, koyeb: stale, expected: "down" },
    { name: "both never delivered any data", page: 0, koyeb: 0, expected: "down" },
  ];
  for (const { name, page, koyeb, expected } of scenarios) {
    const result = p2000Staat(page, koyeb, "HTTP 403", now);
    assert.equal(result.staat, expected, name);
    assert.ok(result.detail, name);
    assert.ok(result.detail_en, name);
  }
});

test("Koyeb working keeps P2000 green without surfacing the primary-only HTTP error", () => {
  const now = Date.parse("2026-11-18T10:00:00Z");
  const state = p2000Staat(now - 50*60_000, now - 15_000, "HTTP 403", now);
  assert.equal(state.staat, "ok");
  assert.match(state.detail, /via Koyeb/);
  assert.equal(state.fout, undefined);
});
