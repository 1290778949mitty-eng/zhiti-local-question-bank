import assert from "node:assert/strict";
import test from "node:test";
import { randomClientId } from "../lib/client-random-id.mjs";

test("uses Web Crypto randomUUID when the secure-context API is available", () => {
  assert.equal(randomClientId({ randomUUID: () => "native-uuid" }), "native-uuid");
});

test("builds an RFC 4122-shaped id from getRandomValues on insecure LAN origins", () => {
  const id = randomClientId({ getRandomValues(bytes) { bytes.fill(0x2a); return bytes; } });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
