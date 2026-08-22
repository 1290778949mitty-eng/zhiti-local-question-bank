import assert from "node:assert/strict";
import test from "node:test";
import { resolveWordImageSource } from "../lib/word-image-source.mjs";

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

test("keeps Base64 images embeddable for local Word exports", async () => {
  const source = `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`;
  const resolved = await resolveWordImageSource(source);
  assert.equal(resolved.type, "png");
  assert.equal(resolved.mimeType, "image/png");
  assert.deepEqual(resolved.data, pngBytes);
});

test("downloads cloud asset URLs before embedding them in Word", async () => {
  let requested = "";
  const resolved = await resolveWordImageSource("/api/assets/example", async (source) => {
    requested = String(source);
    return new Response(pngBytes, { status: 200, headers: { "Content-Type": "image/png" } });
  });
  assert.equal(requested, "/api/assets/example");
  assert.equal(resolved.type, "png");
  assert.deepEqual(resolved.data, pngBytes);
  assert.ok(resolved.data.byteLength > 0);
});

test("rejects missing or empty cloud images instead of writing broken Word media", async () => {
  await assert.rejects(
    resolveWordImageSource("/api/assets/missing", async () => new Response("", { status: 404 })),
    /HTTP 404/,
  );
  await assert.rejects(
    resolveWordImageSource("/api/assets/empty", async () => new Response(new Uint8Array(), { status: 200, headers: { "Content-Type": "image/png" } })),
    /空图片/,
  );
});
