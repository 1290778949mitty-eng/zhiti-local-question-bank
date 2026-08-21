const ANSWER_PLACEHOLDER = /^(?:answer|unknown|none|null|n\/?a)$/i;
const META_ANALYSIS_PATTERNS = [
  /截图中可见[\s\S]*(?:未见|没有|未提供)[\s\S]*(?:答案|解析)/,
  /(?:answer|analysis|答案|解析)[\s\S]*字段(?:留空|为空)/i,
  /(?:未见|没有|未提供)(?:明确)?(?:答案|解析)[\s\S]*(?:因此|所以)[\s\S]*(?:留空|为空)/,
];

export function cleanRecognizedAnswer(value) {
  const answer = typeof value === "string" ? value.trim() : "";
  return ANSWER_PLACEHOLDER.test(answer) ? "" : answer;
}

export function cleanRecognizedAnalysis(value) {
  const analysis = typeof value === "string" ? value.trim() : "";
  return META_ANALYSIS_PATTERNS.some((pattern) => pattern.test(analysis)) ? "" : analysis;
}
