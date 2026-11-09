import test from "node:test";
import assert from "node:assert/strict";
import { toestelCode } from "../src/toestel.js";

test("toestel-ID: eerste 8 tekens van het install-ID, in tweeën", () => {
  assert.equal(toestelCode("3f9a12bc-77aa-4b1c-9d2e-0123456789ab"), "3F9A-12BC");
  assert.equal(toestelCode(""), null);
});
