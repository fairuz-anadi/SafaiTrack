import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMessages, normalizeBangladeshiNumber } from "../server/routes/whatsapp.js";
import { parseCommand } from "../server/routes/complaints.js";

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

test("the command parser survives the instruction being pasted back at it", () => {
  // The reply used to read "Reply REG <your ward number> to register", and
  // this is what a resident actually sent back. It was read as a complaint.
  assert.deepEqual(parseCommand("REG<16>to register"), { kind: "register", ward: "16" });
  assert.deepEqual(parseCommand("REG <16>"), { kind: "register", ward: "16" });
  assert.deepEqual(parseCommand("reg ward 27"), { kind: "register", ward: "27" });
  assert.deepEqual(parseCommand("REGISTER: 32"), { kind: "register", ward: "32" });
  assert.deepEqual(parseCommand("REG 19"), { kind: "register", ward: "19" });

  assert.deepEqual(parseCommand("STATUS <CMP-2087>"), { kind: "status", code: "CMP-2087" });
  assert.deepEqual(parseCommand("status cmp-2087"), { kind: "status", code: "CMP-2087" });
  assert.deepEqual(parseCommand("STATUS2087"), { kind: "status", code: "CMP-2087" });

  // Still not commands: these have to stay reports, or a resident texting
  // about a bin would get a parser error instead of a complaint.
  assert.equal(parseCommand("BIN W27-B001 FULL"), null);
  assert.equal(parseCommand("REGULAR truck never came"), null);
  assert.equal(parseCommand("the bin at 27 is full"), null);
});
