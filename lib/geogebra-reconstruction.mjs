const RECONSTRUCTABLE_TYPES = new Set(["geometry", "coordinate", "function"]);
const POINT_ROLES = new Set(["base", "midpoint", "intersection", "dependent"]);
export const MIN_VISUAL_FIT_SCORE = 0.8;
const ALLOWED_COMMANDS = new Set([
  "abs", "Angle", "AngleBisector", "Arc", "Circle", "cos", "Dilate", "Ellipse", "Function",
  "Hyperbola", "Intersect", "Line", "Locus", "Midpoint", "Parabola", "ParallelLine", "PerpendicularBisector",
  "PerpendicularLine", "Point", "PointIn", "Polygon", "Ray", "Reflect", "RegularPolygon", "Rotate", "Segment",
  "Semicircle", "sin", "sqrt", "Tangent", "tan", "Translate", "Vector",
]);

export function shouldAutoReconstructDiagram(quality) {
  return Boolean(
    quality
    && quality.reconstructable
    && RECONSTRUCTABLE_TYPES.has(quality.kind)
    && Number.isFinite(quality.score)
    && quality.score < 0.72,
  );
}

export function isSafeGeoGebraCommand(command) {
  if (typeof command !== "string" || !command.trim() || command.length > 280) return false;
  if (/['"`;{}]|(?:javascript|http|file|delete|execute|runscript|setscript)/i.test(command)) return false;
  if (!/^[\p{L}\p{N}_+\-*/^=().,[\]\s°]+$/u.test(command)) return false;
  const calls = [...command.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*[([]/g)].map((match) => match[1]);
  return calls.every((name) => ALLOWED_COMMANDS.has(name));
}

export function validateGeoGebraPlan(plan) {
  if (!plan || !RECONSTRUCTABLE_TYPES.has(plan.diagramType)) return { ok: false, error: "不支持的图形类型" };
  if (!Array.isArray(plan.commands) || !plan.commands.length || plan.commands.length > 80) return { ok: false, error: "GeoGebra 指令数量不正确" };
  const unsafe = plan.commands.find((command) => !isSafeGeoGebraCommand(command));
  if (unsafe) return { ok: false, error: `存在不安全或不支持的指令：${unsafe}` };
  const view = plan.view;
  if (!view || ![view.xMin, view.xMax, view.yMin, view.yMax].every(Number.isFinite) || view.xMin >= view.xMax || view.yMin >= view.yMax) return { ok: false, error: "绘图区范围不正确" };
  if (view.xMax - view.xMin > 10000 || view.yMax - view.yMin > 10000) return { ok: false, error: "绘图区范围过大" };
  if (!Number.isFinite(plan.sourceAspectRatio) || plan.sourceAspectRatio < .45 || plan.sourceAspectRatio > 3) return { ok: false, error: "原图宽高比不正确" };
  if (plan.diagramType === "geometry") {
    if (!Array.isArray(plan.referencePoints) || plan.referencePoints.length < 3) return { ok: false, error: "缺少原图点位锚点" };
    const labels = new Set();
    for (const point of plan.referencePoints) {
      if (!point || typeof point.label !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,7}$/.test(point.label) || labels.has(point.label)) return { ok: false, error: "原图点位标签重复或格式不正确" };
      if (![point.x, point.y, point.labelX, point.labelY].every(Number.isFinite) || [point.x, point.y, point.labelX, point.labelY].some((value) => value < 0 || value > 1000)) return { ok: false, error: `点 ${point.label} 的原图坐标或标签坐标不正确` };
      if (typeof point.markerVisible !== "boolean") return { ok: false, error: `点 ${point.label} 的点标记状态不正确` };
      if (!POINT_ROLES.has(point.role)) return { ok: false, error: `点 ${point.label} 的构造角色不正确` };
      labels.add(point.label);
      const definition = plan.commands.find((command) => new RegExp(`^\\s*${point.label}\\s*=`).test(command));
      if (!definition) return { ok: false, error: `缺少点 ${point.label} 的构造指令` };
      if (point.role === "midpoint" && !/=\s*Midpoint\s*[([]/.test(definition)) return { ok: false, error: `点 ${point.label} 必须由 Midpoint 构造` };
      if (point.role === "intersection" && !/=\s*Intersect\s*[([]/.test(definition)) return { ok: false, error: `点 ${point.label} 必须由 Intersect 构造` };
    }
    const missing = (plan.expectedLabels ?? []).find((label) => !labels.has(label));
    if (missing) return { ok: false, error: `点 ${missing} 缺少原图位置锚点` };
  }
  return { ok: true };
}

export function scoreDiagramVisualFit(referencePoints, renderedPoints) {
  const actual = new Map((renderedPoints ?? []).map((point) => [point.label, point]));
  const pointErrors = (referencePoints ?? []).flatMap((reference) => {
    const rendered = actual.get(reference.label);
    if (!rendered || ![rendered.x, rendered.y].every(Number.isFinite)) return [];
    return [{ label: reference.label, error: Math.hypot(reference.x - rendered.x, reference.y - rendered.y) }];
  });
  if (pointErrors.length < 3) return { score: 0, matchedCount: pointErrors.length, rmsError: Infinity, maxError: Infinity, pointErrors };
  const rmsError = Math.sqrt(pointErrors.reduce((sum, point) => sum + point.error ** 2, 0) / pointErrors.length);
  const maxError = Math.max(...pointErrors.map((point) => point.error));
  const coverage = pointErrors.length / Math.max(1, referencePoints.length);
  const score = Math.max(0, Math.min(1, coverage * (1 - rmsError / 220) * (1 - Math.max(0, maxError - 80) / 900)));
  return { score, matchedCount: pointErrors.length, rmsError, maxError, pointErrors };
}
