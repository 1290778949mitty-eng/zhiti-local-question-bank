import test from "node:test";
import assert from "node:assert/strict";
import { EXAM_MODULES, EXAM_SEED_CATEGORIES, normalizeQuestionProvenance, QUESTION_PROVENANCES } from "../lib/exam-modules.mjs";

test("defines three separate Shenzhen math exam modules", () => {
  assert.deepEqual(EXAM_MODULES.map((examModule) => examModule.name), ["深圳中考", "深圳自主招生考试", "深国交入学考"]);
  assert.equal(new Set(EXAM_MODULES.map((examModule) => examModule.rootCategoryId)).size, 3);
  for (const examModule of EXAM_MODULES) {
    const root = EXAM_SEED_CATEGORIES.find((category) => category.id === examModule.rootCategoryId);
    assert.equal(root?.parentId, null);
    assert.ok(EXAM_SEED_CATEGORIES.some((category) => category.parentId === examModule.rootCategoryId));
  }
  assert.equal(EXAM_SEED_CATEGORIES.some((category) => /英语|English/i.test(category.name)), false);
});

test("uses a shared provenance vocabulary without silently promoting material", () => {
  assert.deepEqual(QUESTION_PROVENANCES, ["真题", "风格题", "来源待核实"]);
  assert.equal(normalizeQuestionProvenance("深国交真题"), "真题");
  assert.equal(normalizeQuestionProvenance("深国交风格题"), "风格题");
  assert.equal(normalizeQuestionProvenance("模拟题"), "来源待核实");
  assert.equal(normalizeQuestionProvenance(undefined), "来源待核实");
});
