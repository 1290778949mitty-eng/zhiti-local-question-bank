import { mkdir, copyFile } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("public", { recursive: true });
await copyFile("node_modules/@techstark/opencv-js/dist/opencv.js", "public/opencv.js");
await build({
  entryPoints: ["lib/document-scanner-worker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outfile: "public/document-scanner-worker.js",
  logLevel: "silent",
});
