import { test } from "node:test";
import assert from "node:assert/strict";
import { kaartParams, world, unworld } from "../src/kaart.js";

test("kaartParams: only places around the Netherlands, zoom 7–17 and known markers", () => {
  const q = (s) => new URLSearchParams(s);
  assert.deepEqual(kaartParams(q("c=52.18992,5.96554&z=16&m=brandweer")), { lat: 52.18992, lon: 5.96554, z: 16, m: "brandweer" });
  assert.equal(kaartParams(q("c=40.7,-74&z=16")), null);
  assert.equal(kaartParams(q("c=52.2,5.9&z=20")), null);
  assert.equal(kaartParams(q("c=52.2,5.9&z=12&m=iets")), null);
});

test("world/unworld are each other's inverse", () => {
  const [x, y] = world(52.2108, 5.9737, 16);
  const [lat, lon] = unworld(x, y, 16);
  assert.ok(Math.abs(lat - 52.2108) < 1e-9 && Math.abs(lon - 5.9737) < 1e-9);
});
