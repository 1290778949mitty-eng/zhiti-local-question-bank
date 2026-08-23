import assert from "node:assert/strict";
import test from "node:test";
import {
  batchRecognitionSchema,
  buildBatchRecognitionPrompt,
  buildSingleRecognitionPrompt,
  commonRecognitionRequirements,
  normalizeBatchRecognitionResult,
  normalizeSingleRecognitionResult,
  recognitionQuestionSchema,
  singleRecognitionSchema,
} from "../lib/recognition-contract.ts";
import { hasUsableRecognitionDiagramBox, MIN_RECOGNITION_DIAGRAM_EDGE, shouldReconstructRecognizedDiagram } from "../lib/recognition-diagram-rules.mjs";
import { recognitionReasoningEffort } from "../lib/server/recognition-model-rules.mjs";

const categories = [{ id: "equation", path: "七年级数学 / 一元一次方程" }];

test("single and batch recognition use one shared question schema", () => {
  const single = singleRecognitionSchema;
  const batchQuestion = batchRecognitionSchema.properties.questions.items;
  const batchProperties = Object.fromEntries(Object.entries(batchQuestion.properties).filter(([name]) => name !== "question_number"));
  assert.deepEqual(batchProperties, single.properties);
  assert.deepEqual(batchQuestion.required.filter((field) => field !== "question_number"), single.required);
  assert.deepEqual(recognitionQuestionSchema(), single);
  assert.equal(batchQuestion.additionalProperties, false);
  assert.equal(single.additionalProperties, false);
});

test("single screenshots and PDF pages receive every shared formula and diagram rule", () => {
  const single = buildSingleRecognitionPrompt(categories);
  const batch = buildBatchRecognitionPrompt({ categories, fileName: "回归.pdf", pageNumber: 2, textHint: "2．计算分式" });
  for (const requirement of commonRecognitionRequirements) {
    assert.ok(single.includes(requirement));
    assert.ok(batch.includes(requirement));
  }
  assert.match(single, /不得用图片代替公式/);
  assert.match(batch, /不得用图片代替公式/);
  assert.match(batch, /answers 只放答案表或解析区/);
  assert.doesNotMatch(single, /answers 只放答案表或解析区/);
  assert.match(batch, /第 2 页/);
});

test("single and batch results pass through the same normalization contract", () => {
  const raw = {
    type: "单选题", difficulty: "基础", stem: "  计算 x＝1  ", options: ["A. 1", "B．2", "B．2", ""],
    answer: "answer", analysis: "截图中没有明确解析，因此解析字段留空。", source: "  2026·深圳  ", tags: ["方程", "方程", "一次方程"],
    suggested_category_id: "equation", diagram_bbox: { x: -10, y: 950, width: 1_100, height: 100 },
    diagram_quality: { score: 1.4, reconstructable: true, kind: "function", issues: ["拍照倾斜", "拍照倾斜"], capture: "photo", rotation: "90" },
    confidence: 1.2, warnings: ["请核对", "请核对"],
  };
  const single = normalizeSingleRecognitionResult(raw, categories);
  const batch = normalizeBatchRecognitionResult({ questions: [{ ...raw, question_number: " 12 " }], answers: [] }, categories).questions[0];
  const { question_number, ...batchQuestion } = batch;
  assert.equal(question_number, "12");
  assert.deepEqual(batchQuestion, single);
  assert.deepEqual(single.options, ["1", "2"]);
  assert.equal(single.answer, "");
  assert.equal(single.analysis, "");
  assert.deepEqual(single.diagram_bbox, { x: 0, y: 950, width: 1_000, height: 50 });
  assert.equal(single.diagram_quality.rotation, 90);
  assert.equal(single.diagram_quality.score, 1);
  assert.equal(single.confidence, 1);
});

test("normalization rejects stale categories and clears diagram quality without a valid crop", () => {
  const normalized = normalizeSingleRecognitionResult({
    type: "填空题", difficulty: "中等", stem: "x＝____", options: ["不应保留"], answer: "1", analysis: "", source: "", tags: [],
    suggested_category_id: "missing", diagram_bbox: { x: 1_000, y: 1_000, width: 20, height: 20 },
    diagram_quality: { score: .5, reconstructable: true, kind: "geometry", issues: [], capture: "scan", rotation: "0" }, confidence: .8, warnings: [],
  }, categories);
  assert.equal(normalized.suggested_category_id, null);
  assert.deepEqual(normalized.options, []);
  assert.equal(normalized.diagram_bbox, null);
  assert.equal(normalized.diagram_quality, null);
});

test("single and PDF diagram extraction share one minimum box and reconstruction gate", () => {
  assert.equal(MIN_RECOGNITION_DIAGRAM_EDGE, 20);
  assert.equal(hasUsableRecognitionDiagramBox({ x: 0, y: 0, width: 20, height: 20 }), true);
  assert.equal(hasUsableRecognitionDiagramBox({ x: 0, y: 0, width: 19.9, height: 20 }), false);
  const photographed = { score: .95, reconstructable: true, kind: "geometry", issues: [], capture: "photo", rotation: 0 };
  assert.equal(shouldReconstructRecognizedDiagram("data:image/png;base64,AA==", photographed, true), true);
  assert.equal(shouldReconstructRecognizedDiagram("data:image/png;base64,AA==", photographed, false), false);
  assert.equal(shouldReconstructRecognizedDiagram(undefined, photographed, true), false);
});

test("recognition reasoning effort is shared by both API routes", () => {
  assert.equal(recognitionReasoningEffort("low"), "low");
  assert.equal(recognitionReasoningEffort("max"), "max");
  assert.equal(recognitionReasoningEffort("unsupported"), "low");
});
