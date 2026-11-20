import test from "node:test";
import assert from "node:assert/strict";
import { koyebVerbinding, KOYEB_STANDAARD_URL } from "../src/koyeb-feed.js";

const HOMEY = "homey-a11ea1eaa11ea1eaa11ea1ea-nl.lrvdlinden.p2000";
const CODE = "abcDEF123456ghiJKL";

test("website login with a fresh timestamp when P2000_CODE is set", () => {
  const v = koyebVerbinding({ P2000_CODE: CODE, KOYEB_SUBPROTOCOL: HOMEY }, 1_763_650_000_999);
  assert.equal(v.soort, "website");
  assert.equal(v.protocol, `website-1763650000-${CODE}`);
  assert.equal(v.url, KOYEB_STANDAARD_URL);
  assert.equal(koyebVerbinding({ P2000_CODE: CODE }, 1_763_650_060_000).protocol, `website-1763650060-${CODE}`);
});

test("P2000_URL wins over the old setting and the default", () => {
  assert.equal(koyebVerbinding({ P2000_CODE: CODE, P2000_URL: "wss://p2000.example", KOYEB_WEBSOCKET_URL: "wss://old.example" }).url, "wss://p2000.example");
  assert.equal(koyebVerbinding({ P2000_CODE: CODE, KOYEB_WEBSOCKET_URL: "wss://old.example" }).url, "wss://old.example");
  assert.equal(koyebVerbinding({ P2000_CODE: CODE, P2000_URL: "https://not-a-socket" }), null);
});

test("without a code the dedicated Homey identity keeps working; nothing else is accepted", () => {
  assert.deepEqual(koyebVerbinding({ KOYEB_SUBPROTOCOL: HOMEY }), { url: KOYEB_STANDAARD_URL, protocol: HOMEY, soort: "homey" });
  assert.equal(koyebVerbinding({ KOYEB_SUBPROTOCOL: "homey-123-other" }), null);
  assert.equal(koyebVerbinding({}), null);
  // A code that could break the header is refused: back to the Homey identity.
  assert.equal(koyebVerbinding({ P2000_CODE: "bad code,with,commas", KOYEB_SUBPROTOCOL: HOMEY }).soort, "homey");
});
