import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("limits automatic administrator access to loopback hostnames", async () => {
  const auth = await readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /hostname === "localhost"/);
  assert.match(auth, /hostname === "127\.0\.0\.1"/);
  assert.match(auth, /hostname === "::1"/);
  assert.match(auth, /hostname\.endsWith\("\.localhost"\)/);
  assert.match(auth, /if \(isLocalRequest\(request\)\)/);
  assert.match(auth, /return LOCAL_ADMIN/);
  assert.match(auth, /INSERT OR IGNORE INTO users/);
});

test("shows localhost as a passwordless administrator and hides logout", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /authUser\.local \? "本地管理员"/);
  assert.match(page, /authUser\.local \? "无需登录"/);
  assert.match(page, /!authUser\.local && <button className="account-button" onClick=\{signOut\}>退出<\/button>/);
  assert.match(page, /localhost 本地管理员/);
});
