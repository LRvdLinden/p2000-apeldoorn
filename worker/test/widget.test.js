import { test } from "node:test";
import assert from "node:assert/strict";
import { siteVan, widgetPing } from "../src/widget.js";

test("siteVan: domain without www and port", () => {
  assert.equal(siteVan("https://www.buurt-voorbeeld.nl/nieuws?x=1"), "buurt-voorbeeld.nl");
  assert.equal(siteVan("blog.voorbeeld.nl"), "blog.voorbeeld.nl");
  assert.equal(siteVan("localhost"), null);
  assert.equal(siteVan("<script>"), null);
});

test("widgetPing: own sites are not counted; others are, blocked sites say so", async () => {
  const runs = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ sql, a, first: async () => (a[0] === "slecht.nl" ? { 1: 1 } : null), run: async () => {} }) }),
    batch: async (q) => { runs.push(...q); } } };
  assert.deepEqual(await widgetPing(env, new URLSearchParams("site=a-alerts.nl")), { blok: false });
  assert.equal(runs.length, 0);
  assert.deepEqual(await widgetPing(env, new URLSearchParams("site=https://www.buurt.nl/&w=verkeer")), { blok: false });
  assert.equal(runs.length, 2);
  assert.equal(runs[0].a[1], "verkeer");
  assert.deepEqual(await widgetPing(env, new URLSearchParams("site=slecht.nl")), { blok: true });
});
