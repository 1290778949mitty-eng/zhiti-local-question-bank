import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const localPath = resolve(".env.local");
const workerPath = resolve(".dev.vars");

function readEnvironment(path) {
  if (!existsSync(path)) return new Map();
  const values = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function localNetworkAddress() {
  const entries = Object.entries(networkInterfaces()).sort(([left], [right]) => {
    const priority = (name) => name === "en0" ? 0 : name === "en1" ? 1 : 2;
    return priority(left) - priority(right);
  });
  for (const [, addresses] of entries) for (const item of addresses ?? []) {
    if (item.family !== "IPv4" || item.internal) continue;
    const parts = item.address.split(".").map(Number);
    const isPrivate = parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
    if (isPrivate) return item.address;
  }
  return "";
}

const workerValues = readEnvironment(workerPath);
const localValues = readEnvironment(localPath);
const merged = new Map([...workerValues, ...localValues]);
merged.set("LOCAL_ADMIN_MODE", "true");
const explicitStudentOrigin = localValues.get("STUDENT_PORTAL_ORIGIN")?.trim();
const localAddress = localNetworkAddress();
if (explicitStudentOrigin) merged.set("STUDENT_PORTAL_ORIGIN", explicitStudentOrigin);
else if (localAddress) merged.set("STUDENT_PORTAL_ORIGIN", `http://${localAddress}:3001`);
else merged.delete("STUDENT_PORTAL_ORIGIN");
if (!merged.size) process.exit(0);

const temporaryPath = `${workerPath}.tmp-${process.pid}`;
const content = `${[...merged].map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
writeFileSync(temporaryPath, content, { mode: 0o600 });
renameSync(temporaryPath, workerPath);
chmodSync(workerPath, 0o600);
process.stdout.write(`已同步 ${merged.size} 项本地 Worker 配置。\n`);
