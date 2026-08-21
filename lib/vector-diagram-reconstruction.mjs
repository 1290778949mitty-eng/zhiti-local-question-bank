const RECONSTRUCTABLE_TYPES = new Set(["geometry", "coordinate", "function"]);
const LABEL_ANCHORS = new Set(["start", "middle", "end"]);
export const MIN_RASTER_FIT_SCORE = 0.72;

export function shouldAutoVectorizeDiagram(quality) {
  return Boolean(
    quality
    && quality.reconstructable
    && RECONSTRUCTABLE_TYPES.has(quality.kind)
    && Number.isFinite(quality.score)
    && quality.score < 0.72,
  );
}

function normalized(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1000;
}

function validColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function validDash(value) {
  return Array.isArray(value) && value.length <= 4 && value.every((item) => Number.isFinite(item) && item >= 0 && item <= 50);
}

export function validateVectorDiagramPlan(plan) {
  if (!plan || !RECONSTRUCTABLE_TYPES.has(plan.diagramType)) return { ok: false, error: "不支持的图形类型" };
  if (!Number.isFinite(plan.confidence) || plan.confidence < 0 || plan.confidence > 1) return { ok: false, error: "重绘可信度不正确" };
  if (!Number.isFinite(plan.sourceAspectRatio) || plan.sourceAspectRatio < .3 || plan.sourceAspectRatio > 4) return { ok: false, error: "原图宽高比不正确" };
  if (!Array.isArray(plan.strokes) || !plan.strokes.length || plan.strokes.length > 160) return { ok: false, error: "可见线条数量不正确" };
  for (const stroke of plan.strokes) {
    if (!stroke || typeof stroke.id !== "string" || !/^[\p{L}\p{N}_-]{1,40}$/u.test(stroke.id)) return { ok: false, error: "线条编号不正确" };
    if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 80 || stroke.points.some((point) => !normalized(point?.x) || !normalized(point?.y))) return { ok: false, error: `线条 ${stroke.id} 的坐标不正确` };
    if (typeof stroke.closed !== "boolean" || !Number.isFinite(stroke.width) || stroke.width < .5 || stroke.width > 16 || !validColor(stroke.color) || !validDash(stroke.dash)) return { ok: false, error: `线条 ${stroke.id} 的样式不正确` };
  }
  if (!Array.isArray(plan.ellipses) || plan.ellipses.length > 40) return { ok: false, error: "圆弧数量不正确" };
  for (const ellipse of plan.ellipses) {
    if (!ellipse || typeof ellipse.id !== "string" || ![ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry].every(normalized) || ellipse.rx <= 0 || ellipse.ry <= 0 || !Number.isFinite(ellipse.width) || ellipse.width < .5 || ellipse.width > 16 || !validColor(ellipse.color) || !validDash(ellipse.dash)) return { ok: false, error: `圆弧 ${ellipse?.id ?? ""} 不正确` };
  }
  if (!Array.isArray(plan.labels) || plan.labels.length > 100) return { ok: false, error: "标签数量不正确" };
  for (const label of plan.labels) {
    if (!label || typeof label.text !== "string" || !label.text.trim() || label.text.length > 16 || !normalized(label.x) || !normalized(label.y) || !Number.isFinite(label.fontSize) || label.fontSize < 12 || label.fontSize > 100 || !validColor(label.color) || typeof label.italic !== "boolean" || typeof label.bold !== "boolean" || !LABEL_ANCHORS.has(label.anchor)) return { ok: false, error: `标签 ${label?.text ?? ""} 不正确` };
  }
  if (!Array.isArray(plan.markers) || plan.markers.length > 100) return { ok: false, error: "点标记数量不正确" };
  for (const marker of plan.markers) if (!marker || !normalized(marker.x) || !normalized(marker.y) || !Number.isFinite(marker.radius) || marker.radius < 1 || marker.radius > 16 || !validColor(marker.color)) return { ok: false, error: "点标记样式不正确" };
  const visibleLabels = new Set(plan.labels.map((label) => label.text));
  const missing = (plan.expectedLabels ?? []).find((label) => !visibleLabels.has(label));
  if (missing) return { ok: false, error: `缺少标签 ${missing}` };
  return { ok: true };
}

export function scoreProjectionProfiles(reference, rendered) {
  if (!reference || !rendered || reference.length !== rendered.length || !reference.length) return 0;
  let difference = 0; let scale = 0;
  for (let index = 0; index < reference.length; index += 1) {
    difference += Math.abs(reference[index] - rendered[index]);
    scale += Math.max(reference[index], rendered[index]);
  }
  return scale ? Math.max(0, 1 - difference / scale) : 1;
}
