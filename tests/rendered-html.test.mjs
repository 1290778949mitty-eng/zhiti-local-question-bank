import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { automaticQuestionImageLayout, markDocxUnderline, splitDisplayUnderlines } from "../lib/question-presentation-rules.mjs";
import { isSafeGeoGebraCommand, scoreDiagramVisualFit, validateGeoGebraPlan } from "../lib/geogebra-reconstruction.mjs";
import { scoreProjectionProfiles, shouldAutoVectorizeDiagram, validateVectorDiagramPlan } from "../lib/vector-diagram-reconstruction.mjs";
import { cleanRecognizedAnalysis, cleanRecognizedAnswer } from "../lib/recognition-cleanup.mjs";
import { toLatexMath } from "../lib/math-text.ts";
import { needsWordMathEquation, normalizeMathNotation } from "../lib/math-notation.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the cloud question-bank guest shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mitty 的宝藏题库<\/title>/i);
  assert.match(html, /全部试题/);
  assert.match(html, /云端共享题库/);
  assert.match(html, /登录后录题与下载/);
  assert.doesNotMatch(html, /新建试题/);
  assert.doesNotMatch(html, /⇧ 文件录入/);
  assert.doesNotMatch(html, /<button[^>]*>生成 Word/);
  assert.doesNotMatch(html, /Starter Project|Your site is taking shape/);
});

test("keeps every privileged operation behind server-side authentication", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const auth = await readFile(new URL("../lib/server/auth.ts", import.meta.url), "utf8");
  const questionRoute = await readFile(new URL("../app/api/questions/[id]/route.ts", import.meta.url), "utf8");
  const downloadRoute = await readFile(new URL("../app/api/download/route.ts", import.meta.url), "utf8");

  assert.match(page, /访客 · 仅浏览/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(auth, /PBKDF2/);
  assert.match(questionRoute, /await requireUser\(request\)/);
  assert.match(questionRoute, /你只能修改自己录入的题目/);
  assert.match(downloadRoute, /await requireUser\(request\)/);
});

test("keeps the select-all control on the right without filter scroll chrome", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(page, /local-badge/);
  assert.match(css, /\.select-visible\s*\{[^}]*margin-left:auto/);
  assert.match(css, /\.filters::-webkit-scrollbar\s*\{\s*display:none/);
  assert.match(css, /\.filters\s*\{[^}]*scrollbar-width:none/);
  assert.match(css, /html::-webkit-scrollbar,body::-webkit-scrollbar\s*\{\s*display:none/);
});

test("keeps file import inside the new-question flow only", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(page, /className="file-import-top"/);
  assert.doesNotMatch(css, /\.file-import-top/);
  assert.match(page, /<button onClick=\{openFileImport\}><b>文件批量录入<\/b>/);
});

test("keeps the Word export font and layout contract", async () => {
  const source = await readFile(
    new URL("../lib/export-word.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /eastAsia:\s*"Songti SC"/);
  assert.match(source, /<w:font w:name="Songti SC">/);
  assert.match(source, /<w:altName w:val="宋体"\/>/);
  assert.match(source, /<w:font w:name="Times New Roman">/);
  assert.match(source, /<w:font w:name="Cambria Math">/);
  assert.match(source, /archive\.file\("word\/fontTable\.xml", FONT_TABLE_XML\)/);
  assert.match(source, /columnWidths:\s*Array\.from\(\{ length: columnCount \}/);
  assert.match(source, /imageParagraph\(images\[0\], 220, 165, 80, AlignmentType\.RIGHT\)/);
  assert.doesNotMatch(source, /columnWidths:\s*\[6627, 3119\]/);
});

test("keeps screen and Word geometry layouts deliberately separate", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const optimizeRoute = await readFile(new URL("../app/api/optimize/route.ts", import.meta.url), "utf8");

  assert.match(css, /\.question-presentation\.layout-right\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(190px,28%\)/);
  assert.match(css, /\.question-presentation\.layout-right \.question-images\s*\{[^}]*place-items:end center;/);
  assert.match(page, /网页端题干左、配图右；导出 Word 时自动改为题干下、配图右/);
  assert.match(page, /网页 · 题干左配图右/);
  assert.match(optimizeRoute, /Word 导出由程序独立处理/);
});

test("preserves Word underline runs as visible web segments", () => {
  const display = `（①${markDocxUnderline("    ")}）`;
  assert.deepEqual(splitDisplayUnderlines(display), [
    { underlined: false, value: "（①" },
    { underlined: true, value: "\u00a0\u00a0\u00a0\u00a0" },
    { underlined: false, value: "）" },
  ]);
});

test("renders a triangle area name as the subscript of S", () => {
  assert.equal(normalizeMathNotation("S△EFG=5"), "S_{△EFG}=5");
  assert.equal(normalizeMathNotation("S Δ ABC = 12"), "S_{△ABC} = 12");
  assert.equal(toLatexMath("S△EFG=5"), "S_{\\triangle EFG}=5");
  assert.equal(normalizeMathNotation("△ABC≌△DEF"), "△ABC≌△DEF");
});

test("routes triangle area notation through the Word equation path", () => {
  assert.equal(needsWordMathEquation("S△EFG=5"), true);
  assert.equal(needsWordMathEquation("△ABC≌△DEF"), false);
  assert.equal(needsWordMathEquation("普通文字"), false);
});

test("chooses distinct image positions for short, multipart, and very long questions", () => {
  assert.equal(automaticQuestionImageLayout({ imageCount: 1, stemLength: 90, paragraphCount: 1 }), null);
  assert.equal(automaticQuestionImageLayout({ imageCount: 1, stemLength: 320, paragraphCount: 4 }), "below-right");
  assert.equal(automaticQuestionImageLayout({ imageCount: 1, stemLength: 900, paragraphCount: 12 }), "below");
  assert.equal(automaticQuestionImageLayout({ imageCount: 3, stemLength: 120, paragraphCount: 2 }), "below");
});

test("only sends low-quality reconstructable math diagrams to vector reconstruction", () => {
  assert.equal(shouldAutoVectorizeDiagram({ score: 0.41, reconstructable: true, kind: "geometry", issues: ["模糊"] }), true);
  assert.equal(shouldAutoVectorizeDiagram({ score: 0.92, reconstructable: true, kind: "geometry", issues: [] }), false);
  assert.equal(shouldAutoVectorizeDiagram({ score: 0.3, reconstructable: false, kind: "unsupported", issues: ["实物照片"] }), false);
});

test("keeps single-question vector reconstruction optional and renders from source coordinates", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../lib/vector-diagram-renderer.ts", import.meta.url), "utf8");

  assert.match(page, /useState\(true\).*enableVectorReconstruction|enableVectorReconstruction.*useState\(true\)/s);
  assert.match(page, /低质量配图时，自动高清矢量重绘/);
  assert.match(page, /questionDraft\.vectorDiagramPlan[\s\S]*renderVectorDiagramPlan\(questionDraft\.vectorDiagramPlan, original\)/);
  assert.match(renderer, /stroke\.points\.map/);
  assert.match(renderer, /scoreDiagramRasterFit/);
  assert.match(renderer, /contourScore/);
  assert.match(renderer, /boundsScore/);
  assert.match(renderer, /sourceInkColor/);
  assert.match(renderer, /toneScore/);
});

test("validates an explicit vector scene and requires every expected label", () => {
  const plan = {
    diagramType: "geometry", confidence: .94, sourceAspectRatio: 1,
    strokes: [{ id: "AB", points: [{ x: 100, y: 100 }, { x: 100, y: 900 }], closed: false, width: 5, color: "#231f20", dash: [] }],
    ellipses: [], labels: [{ text: "A", x: 70, y: 100, fontSize: 58, color: "#231f20", italic: true, bold: false, anchor: "middle" }], markers: [],
    expectedLabels: ["A"], constraints: ["A、B 共线"], geogebraCommands: ["A=(0,1)", "B=(0,0)"], warnings: [],
  };
  assert.deepEqual(validateVectorDiagramPlan(plan), { ok: true });
  assert.match(validateVectorDiagramPlan({ ...plan, expectedLabels: ["A", "B"] }).error, /缺少标签 B/);
});

test("visual profile score rejects a stretched composition with unchanged topology", () => {
  assert.equal(scoreProjectionProfiles([0, 2, 4, 2, 0], [0, 2, 4, 2, 0]), 1);
  assert.ok(scoreProjectionProfiles([0, 2, 4, 2, 0], [4, 2, 0, 0, 0]) < .5);
});

test("rejects unsafe GeoGebra scripts while allowing deterministic constructions", () => {
  assert.equal(isSafeGeoGebraCommand("A=(0,0)"), true);
  assert.equal(isSafeGeoGebraCommand("c=Circle(A,B)"), true);
  assert.equal(isSafeGeoGebraCommand('Execute({"Delete(A)"})'), false);
  const plan = {
    diagramType: "geometry", confidence: 0.94,
    commands: ["A=(0,0)", "B=(6,0)", "C=(3,4)", "s1=Segment(A,B)", "s2=Segment(A,C)", "s3=Segment(B,C)"],
    styles: [], view: { xMin: -1, xMax: 7, yMin: -1, yMax: 5 }, sourceAspectRatio: 4 / 3,
    referencePoints: [
      { label: "A", x: 125, y: 833, labelX: 105, labelY: 865, markerVisible: false, role: "base" },
      { label: "B", x: 875, y: 833, labelX: 895, labelY: 865, markerVisible: false, role: "base" },
      { label: "C", x: 500, y: 167, labelX: 500, labelY: 125, markerVisible: false, role: "base" },
    ],
    expectedLabels: ["A", "B", "C"], constraints: ["连接三角形三边"], warnings: [],
  };
  assert.deepEqual(validateGeoGebraPlan(plan), { ok: true });
});

test("rejects visually displaced reconstructions even when topology is unchanged", () => {
  const reference = [
    { label: "A", x: 100, y: 100 }, { label: "B", x: 100, y: 900 },
    { label: "C", x: 700, y: 900 }, { label: "D", x: 700, y: 100 },
  ];
  assert.equal(scoreDiagramVisualFit(reference, reference).score, 1);
  const displaced = [
    { label: "A", x: 100, y: 100 }, { label: "B", x: 100, y: 900 },
    { label: "C", x: 930, y: 900 }, { label: "D", x: 930, y: 100 },
  ];
  assert.ok(scoreDiagramVisualFit(reference, displaced).score < .8);
});

test("does not store AI meta commentary as an answer or analysis", () => {
  assert.equal(cleanRecognizedAnswer("answer"), "");
  assert.equal(cleanRecognizedAnswer("B"), "B");
  assert.equal(cleanRecognizedAnalysis("截图中可见一道选择题，未见明确答案或解析，因此 answer 和解析相关字段留空。"), "");
  assert.equal(cleanRecognizedAnalysis("由勾股定理可得 AB=5。"), "由勾股定理可得 AB=5。");
});

test("routes every AI feature through the native Antigravity Gemini adapter", async () => {
  const adapter = await readFile(new URL("../lib/server/antigravity-gemini.ts", import.meta.url), "utf8");
  assert.match(adapter, /\/antigravity\/v1beta/);
  assert.match(adapter, /:generateContent/);
  assert.match(adapter, /responseMimeType:\s*"application\/json"/);
  assert.match(adapter, /responseSchema:\s*geminiResponseSchema\(schema\)/);
  assert.match(adapter, /nullable:\s*true/);
  assert.match(adapter, /inlineData:\s*\{\s*mimeType:/);

  for (const route of ["optimize", "recognize", "recognize-batch", "reconstruct-diagram"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /mode === "antigravity_gemini"/);
    assert.match(source, /callAntigravityGemini/);
    assert.match(source, /gemini-3\.7-flash/);
  }
});
