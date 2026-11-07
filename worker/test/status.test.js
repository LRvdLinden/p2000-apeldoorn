import { test } from "node:test";
import assert from "node:assert/strict";
import { dagVan, GROEPEN, ONDERDELEN } from "../src/status.js";

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
