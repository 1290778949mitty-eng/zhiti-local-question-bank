function clean(value, limit = 500) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function questions(value) { return Array.isArray(value) ? [...new Set(value.map((item) => clean(String(item), 40)).filter(Boolean))].slice(0, 12) : []; }

export function normalizeSubmissionReport(value, now = Date.now()) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const points = (list, gap = false) => (Array.isArray(list) ? list : []).map((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    return { title: clean(row.title, 120), detail: clean(row.detail, 600), questionNumbers: questions(row.question_numbers ?? row.questionNumbers),
      capabilityKey: gap ? clean(row.capability_key ?? row.capabilityKey, 100) || null : null };
  }).filter((item) => item.title).slice(0, 3);
  const actions = (Array.isArray(raw.actions) ? raw.actions : []).map((item) => clean(item, 300)).filter(Boolean).slice(0, 3);
  return { overallSummary: clean(raw.overall_summary ?? raw.overallSummary, 1_000), studentMessage: clean(raw.student_message ?? raw.studentMessage, 700),
    strengths: points(raw.strengths), gaps: points(raw.gaps, true), actions, warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).map((item) => clean(item, 240)).filter(Boolean).slice(0, 8),
    generatedAt: Number(raw.generatedAt) || now, updatedAt: now };
}

const ACTIONS = [
  [/计算|符号|运算/, "每道题完成后用逆运算或代入法检查一次，先消除符号和计算失误。"],
  [/审题|条件/, "圈出题目条件和最终问题，动笔前先写出已知量与目标量。"],
  [/概念/, "回到对应定义和适用条件，用一道基础题确认概念边界。"],
  [/步骤|表达|漏答/, "把关键推导分行写完整，并在最后单独写出结论。"],
  [/推理|证明/, "先写出每一步使用的依据，再检查前后结论是否连续。"],
];

export function buildFallbackSubmissionReport(items, now = Date.now()) {
  const rows = Array.isArray(items) ? items : [];
  const correct = rows.filter((item) => item.verdict === "correct");
  const gaps = rows.filter((item) => item.verdict === "partial" || item.verdict === "incorrect");
  const strengths = correct.slice(0, 3).map((item) => ({ title: `第 ${clean(item.questionNumber, 40)} 题完成较好`, detail: clean(item.feedback, 600) || "思路和结果与标准答案一致。", questionNumbers: [clean(item.questionNumber, 40)], capabilityKey: null }));
  const gapPoints = gaps.slice(0, 3).map((item) => ({ title: clean(item.errorType, 120) || `第 ${clean(item.questionNumber, 40)} 题需要巩固`, detail: clean(item.feedback, 600) || "请对照标准步骤定位差异。",
    questionNumbers: [clean(item.questionNumber, 40)], capabilityKey: Array.isArray(item.capabilityKeys) ? clean(item.capabilityKeys[0], 100) || null : null }));
  const actionSet = [];
  for (const item of gaps) {
    const error = clean(item.errorType, 120); const action = ACTIONS.find(([pattern]) => pattern.test(error))?.[1] ?? "重做本次错题，并用一句话说明原来的错误原因。";
    if (!actionSet.includes(action)) actionSet.push(action);
  }
  const overall = `本次共完成 ${rows.length} 题，${correct.length} 题表现稳定，${gaps.length} 题需要继续巩固。`;
  return { overallSummary: overall, studentMessage: gaps.length ? "先解决最优先的一个问题，再完成对应错题重做。" : "本次整体表现稳定，继续保持清晰完整的解题步骤。",
    strengths, gaps: gapPoints, actions: actionSet.slice(0, 3), warnings: ["AI 整份总结暂不可用，当前建议由逐题结果自动汇总。"], generatedAt: now, updatedAt: now };
}
