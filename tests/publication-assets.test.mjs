import assert from "node:assert/strict";
import test from "node:test";
import { deduplicatePublicationAssets } from "../lib/publication-assets.mjs";

test("publishes one asset manifest entry when legacy asset IDs share identical content", () => {
  const shared = "a".repeat(64);
  const unique = "b".repeat(64);
  const result = deduplicatePublicationAssets([
    { localId: "first", hash: shared, contentType: "image/png", byteSize: 10 },
    { localId: "second", hash: shared, contentType: "image/png", byteSize: 10 },
    { localId: "third", hash: unique, contentType: "image/jpeg", byteSize: 20 },
  ]);

  assert.deepEqual(result, [
    { localId: "first", hash: shared, contentType: "image/png", byteSize: 10 },
    { localId: "third", hash: unique, contentType: "image/jpeg", byteSize: 20 },
  ]);
});
