import type { CV, Mat } from "@techstark/opencv-js";

type Point = { x: number; y: number };
type RequestMessage = { id: string; width: number; height: number; data: ArrayBuffer; corners?: Point[]; enhance?: boolean; rotation?: number };

type OpenCvModule = CV & { onRuntimeInitialized?: () => void };

type WorkerScope = typeof self & { cv?: OpenCvModule | Promise<OpenCvModule> };

async function openCv(): Promise<OpenCvModule> {
  const scope = self as WorkerScope;
  if (!scope.cv) importScripts("/opencv.js");
  const candidate = scope.cv;
  if (!candidate) throw new Error("扫描组件加载失败");
  if (candidate instanceof Promise) return candidate;
  if (candidate.Mat) return candidate;
  await new Promise<void>((resolve) => { candidate.onRuntimeInitialized = () => resolve(); });
  return candidate;
}

function orderCorners(points: Point[]) {
  const sum = (point: Point) => point.x + point.y; const diff = (point: Point) => point.x - point.y;
  return [
    points.reduce((best, point) => sum(point) < sum(best) ? point : best),
    points.reduce((best, point) => diff(point) > diff(best) ? point : best),
    points.reduce((best, point) => sum(point) > sum(best) ? point : best),
    points.reduce((best, point) => diff(point) < diff(best) ? point : best),
  ];
}

function distance(left: Point, right: Point) { return Math.hypot(left.x - right.x, left.y - right.y); }

function detectCorners(cv: OpenCvModule, src: Mat): Point[] | null {
  const scale = Math.min(1, 1400 / Math.max(src.cols, src.rows)); const working = new cv.Mat();
  if (scale < 1) cv.resize(src, working, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
  else src.copyTo(working);
  const gray = new cv.Mat(); const blurred = new cv.Mat(); const edges = new cv.Mat(); const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
  cv.cvtColor(working, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0); cv.Canny(blurred, edges, 55, 160);
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  let best: Point[] | null = null; let bestArea = 0;
  for (let index = 0; index < contours.size(); index += 1) {
    const contour = contours.get(index); const perimeter = cv.arcLength(contour, true); const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, perimeter * .025, true); const area = Math.abs(cv.contourArea(approx));
    if (approx.rows === 4 && area > bestArea && area > working.cols * working.rows * .18) {
      const points: Point[] = [];
      for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) points.push({ x: approx.data32S[pointIndex * 2] / scale, y: approx.data32S[pointIndex * 2 + 1] / scale });
      best = orderCorners(points); bestArea = area;
    }
    approx.delete(); contour.delete();
  }
  working.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
  return best;
}

function imageQuality(cv: OpenCvModule, src: Mat, detected: boolean) {
  const gray = new cv.Mat(); const laplacian = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.Laplacian(gray, laplacian, cv.CV_64F);
  const mean = new cv.Mat(); const deviation = new cv.Mat(); cv.meanStdDev(laplacian, mean, deviation);
  const sharpness = deviation.doubleAt(0, 0) ** 2; const average = cv.mean(gray)[0];
  let glare = 0; const sampleStep = Math.max(1, Math.floor(gray.data.length / 50_000));
  for (let index = 0; index < gray.data.length; index += sampleStep) if (gray.data[index] > 248) glare += 1;
  const glareRatio = glare / Math.ceil(gray.data.length / sampleStep); const warnings: string[] = [];
  if (!detected) warnings.push("未自动识别完整纸张边缘，请手动校准四角");
  const shortSide = Math.min(src.cols, src.rows);
  if (shortSide < 1000) warnings.push("图片分辨率偏低，细小字迹可能无法识别");
  if (sharpness < 70) warnings.push("照片可能模糊，建议重拍");
  if (average < 55) warnings.push("画面偏暗");
  if (glareRatio > .08) warnings.push("页面反光较明显");
  const score = Math.max(0, Math.min(1, .45 + Math.min(.4, sharpness / 500) - (!detected ? .25 : 0) - (glareRatio > .08 ? .15 : 0) - (average < 55 ? .15 : 0)));
  gray.delete(); laplacian.delete(); mean.delete(); deviation.delete();
  return { score, warnings, blocking: sharpness < 35 || average < 25 || shortSide < 720 };
}

function fingerprint(cv: OpenCvModule, src: Mat) {
  const gray = new cv.Mat(); const tiny = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.resize(gray, tiny, new cv.Size(16, 16), 0, 0, cv.INTER_AREA);
  const average = cv.mean(tiny)[0]; let result = "";
  for (let offset = 0; offset < 256; offset += 4) {
    let nibble = 0; for (let bit = 0; bit < 4; bit += 1) if (tiny.data[offset + bit] >= average) nibble |= 1 << bit;
    result += nibble.toString(16);
  }
  gray.delete(); tiny.delete(); return result;
}

function transform(cv: OpenCvModule, src: Mat, corners: Point[], enhance: boolean, rotation: number) {
  const ordered = orderCorners(corners); const naturalWidth = Math.max(320, Math.round(Math.max(distance(ordered[0], ordered[1]), distance(ordered[3], ordered[2]))));
  const naturalHeight = Math.max(320, Math.round(Math.max(distance(ordered[0], ordered[3]), distance(ordered[1], ordered[2]))));
  const outputScale = Math.min(1, 2400 / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(320, Math.round(naturalWidth * outputScale)); const height = Math.max(320, Math.round(naturalHeight * outputScale));
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const matrix = cv.getPerspectiveTransform(from, to); const warped = new cv.Mat();
  cv.warpPerspective(src, warped, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  if (enhance) {
    const gray = new cv.Mat(); const enhanced = new cv.Mat(); cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, enhanced); cv.cvtColor(enhanced, warped, cv.COLOR_GRAY2RGBA); gray.delete(); enhanced.delete();
  }
  if (rotation === 90) cv.rotate(warped, warped, cv.ROTATE_90_CLOCKWISE);
  else if (rotation === 180) cv.rotate(warped, warped, cv.ROTATE_180);
  else if (rotation === 270) cv.rotate(warped, warped, cv.ROTATE_90_COUNTERCLOCKWISE);
  from.delete(); to.delete(); matrix.delete(); return warped;
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  try {
    const cv = await openCv(); const image = new ImageData(new Uint8ClampedArray(message.data), message.width, message.height); const src = cv.matFromImageData(image);
    const detected = message.corners?.length === 4 ? message.corners : detectCorners(cv, src);
    const corners = detected ?? [{ x: 0, y: 0 }, { x: src.cols - 1, y: 0 }, { x: src.cols - 1, y: src.rows - 1 }, { x: 0, y: src.rows - 1 }];
    const quality = imageQuality(cv, src, Boolean(detected)); const result = transform(cv, src, corners, Boolean(message.enhance), message.rotation ?? 0);
    const output = new Uint8ClampedArray(result.data); const response = { id: message.id, ok: true, width: result.cols, height: result.rows,
      data: output.buffer, corners, quality, fingerprint: fingerprint(cv, result) };
    src.delete(); result.delete(); (self as unknown as Worker).postMessage(response, [output.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : "扫描校准失败" });
  }
};
