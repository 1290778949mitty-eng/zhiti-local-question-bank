const PHOTO_ISSUE_PATTERN = /拍照|透视|倾斜|旋转|阴影|反光|褶皱|手写|低分辨率|模糊|噪点/;

export function isPhotographedDiagram(quality) {
  return Boolean(
    quality
    && (quality.capture === "photo" || (quality.issues ?? []).some((issue) => PHOTO_ISSUE_PATTERN.test(issue))),
  );
}

export function normalizeDiagramRotation(value) {
  const numeric = Number(value);
  return numeric === 90 || numeric === 180 || numeric === 270 ? numeric : 0;
}

export function correctionForCapturedRotation(value) {
  const rotation = normalizeDiagramRotation(value);
  if (rotation === 90) return 270;
  if (rotation === 270) return 90;
  return rotation;
}

export function fitWithinMaxEdge(width, height, maxEdge) {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
