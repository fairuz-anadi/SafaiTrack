import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMessages, normalizeBangladeshiNumber } from "../server/routes/whatsapp.js";

test("WhatsApp international numbers map onto the local form stored in the database", () => {
  assert.equal(normalizeBangladeshiNumber("8801911000000"), "01911000000");
  assert.equal(normalizeBangladeshiNumber("+880 1911-000000"), "01911000000");
  assert.equal(normalizeBangladeshiNumber("01911000000"), "01911000000");
  assert.equal(normalizeBangladeshiNumber("447700900123"), null, "a UK number is ignored, not guessed");
  assert.equal(normalizeBangladeshiNumber("8801211000000"), null, "012 is not a Bangladeshi mobile prefix");
});

test("only text messages are pulled out of a Cloud API payload", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [
      { from: "8801911000000", id: "a", type: "text", text: { body: "BIN W27-B001 FULL" } },
      { from: "8801911000001", id: "b", type: "image", image: { id: "x" } },
      { from: "8801911000002", id: "c", type: "text", text: { body: "ময়লা উপচে পড়ছে" } },
    ] } }] }],
  };
  assert.deepEqual(extractMessages(payload), [
    { from: "8801911000000", text: "BIN W27-B001 FULL", id: "a" },
    { from: "8801911000002", text: "ময়লা উপচে পড়ছে", id: "c" },
  ]);
  assert.deepEqual(extractMessages(null), []);
  assert.deepEqual(extractMessages({ entry: [{}] }), []);
});
