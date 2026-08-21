import type { VectorDiagramPlan } from "./types";
import { MIN_RASTER_FIT_SCORE, scoreProjectionProfiles, validateVectorDiagramPlan } from "./vector-diagram-reconstruction.mjs";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("无法读取配图")); image.src = source;
  });
}

export function svgFromVectorDiagramPlan(plan: VectorDiagramPlan) {
  const validation = validateVectorDiagramPlan(plan);
  if (!validation.ok) throw new Error(validation.error || "矢量重绘方案无效");
  const height = 1000 / plan.sourceAspectRatio;
  const y = (value: number) => value / plan.sourceAspectRatio;
  const strokes = plan.strokes.map((stroke) => {
    const points = stroke.points.map((point) => `${point.x.toFixed(2)},${y(point.y).toFixed(2)}`).join(" ");
    const dash = stroke.dash.length ? ` stroke-dasharray="${stroke.dash.join(" ")}"` : "";
    return `<polyline id="${escapeXml(stroke.id)}" points="${points}" fill="${stroke.closed ? "#ffffff" : "none"}" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const ellipses = plan.ellipses.map((ellipse) => {
    const dash = ellipse.dash.length ? ` stroke-dasharray="${ellipse.dash.join(" ")}"` : "";
    return `<ellipse id="${escapeXml(ellipse.id)}" cx="${ellipse.cx}" cy="${y(ellipse.cy)}" rx="${ellipse.rx}" ry="${ellipse.ry / plan.sourceAspectRatio}" fill="none" stroke="${ellipse.color}" stroke-width="${ellipse.width}"${dash}/>`;
  }).join("");
  const markers = plan.markers.map((marker) => `<circle cx="${marker.x}" cy="${y(marker.y)}" r="${marker.radius}" fill="${marker.color}"/>`).join("");
  const labels = plan.labels.map((label) => `<text x="${label.x}" y="${y(label.y)}" text-anchor="${label.anchor}" dominant-baseline="middle" fill="${label.color}" font-family="Times New Roman, STIX Two Text, serif" font-size="${label.fontSize}" font-style="${label.italic ? "italic" : "normal"}" font-weight="${label.bold ? "700" : "400"}">${escapeXml(label.text)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${height.toFixed(3)}" width="1000" height="${height.toFixed(3)}" role="img" aria-label="高清矢量数学配图"><rect width="1000" height="${height.toFixed(3)}" fill="#ffffff"/>${strokes}${ellipses}${markers}${labels}</svg>`;
}

async function rasterizeSvg(svg: string, aspectRatio: number) {
  const image = await loadImage(svgDataUrl(svg));
  const width = 1400; const height = Math.max(350, Math.round(width / aspectRatio));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("浏览器无法生成高清配图");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

async function sourceInkColor(source: string, aspectRatio: number) {
  const image = await loadImage(source); const width = 220; const height = Math.max(80, Math.round(width / aspectRatio));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return "#231f20";
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data; const threshold = otsuThreshold(pixels);
  const samples: Array<{ red: number; green: number; blue: number; luminance: number }> = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]; const green = pixels[index + 1]; const blue = pixels[index + 2]; const luminance = red * .299 + green * .587 + blue * .114;
    if (luminance < threshold) samples.push({ red, green, blue, luminance });
  }
  if (!samples.length) return "#231f20";
  samples.sort((a, b) => a.luminance - b.luminance);
  const darkest = samples.slice(0, Math.max(1, Math.ceil(samples.length * .28)));
  const median = (channel: "red" | "green" | "blue") => darkest.map((sample) => sample[channel]).sort((a, b) => a - b)[Math.floor(darkest.length / 2)];
  const hex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  return `#${hex(median("red"))}${hex(median("green"))}${hex(median("blue"))}`;
}

function otsuThreshold(data: Uint8ClampedArray) {
  const histogram = new Uint32Array(256); let total = 0; let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(data[index] * .299 + data[index + 1] * .587 + data[index + 2] * .114);
    histogram[value] += 1; total += 1; sum += value;
  }
  let backgroundWeight = 0; let backgroundSum = 0; let bestVariance = -1; let best = 210;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value]; if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight; if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight; const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; best = value; }
  }
  return Math.max(80, Math.min(235, best + 18));
}

function dilate(mask: Uint8Array, width: number, height: number, radius = 2) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx; const ny = y + dy; if (nx >= 0 && nx < width && ny >= 0 && ny < height) result[ny * width + nx] = 1;
    }
  }
  return result;
}

async function rasterMask(source: string, aspectRatio: number) {
  const image = await loadImage(source); const width = 256; const height = Math.max(96, Math.round(width / aspectRatio));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("无法比较配图");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data; const threshold = otsuThreshold(pixels); const mask = new Uint8Array(width * height);
  const xProfile = new Array<number>(width).fill(0); const yProfile = new Array<number>(height).fill(0);
  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let count = 0; const inkValues: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4; const luminance = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
    if (luminance >= threshold) continue;
    mask[index] = 1; count += 1; inkValues.push(luminance); const x = index % width; const y = Math.floor(index / width);
    xProfile[x] += 1; yProfile[y] += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  inkValues.sort((a, b) => a - b); const inkLuminance = inkValues[Math.floor(inkValues.length * .2)] ?? 255;
  return { mask, dilated: dilate(mask, width, height), width, height, count, inkLuminance, xProfile, yProfile, box: { minX, minY, maxX, maxY } };
}

function boxSimilarity(a: { minX: number; minY: number; maxX: number; maxY: number }, b: { minX: number; minY: number; maxX: number; maxY: number }, width: number, height: number) {
  if (a.maxX < 0 || b.maxX < 0) return 0;
  const error = (Math.abs(a.minX - b.minX) + Math.abs(a.maxX - b.maxX)) / (2 * width) + (Math.abs(a.minY - b.minY) + Math.abs(a.maxY - b.maxY)) / (2 * height);
  return Math.max(0, 1 - error * 2.5);
}

export async function scoreDiagramRasterFit(reference: string, rendered: string, aspectRatio: number) {
  const [source, output] = await Promise.all([rasterMask(reference, aspectRatio), rasterMask(rendered, aspectRatio)]);
  let sourceHit = 0; let outputHit = 0;
  for (let index = 0; index < source.mask.length; index += 1) {
    if (source.mask[index] && output.dilated[index]) sourceHit += 1;
    if (output.mask[index] && source.dilated[index]) outputHit += 1;
  }
  const recall = source.count ? sourceHit / source.count : 0; const precision = output.count ? outputHit / output.count : 0;
  const contourScore = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const projectionScore = (scoreProjectionProfiles(source.xProfile, output.xProfile) + scoreProjectionProfiles(source.yProfile, output.yProfile)) / 2;
  const boundsScore = boxSimilarity(source.box, output.box, source.width, source.height);
  const toneScore = Math.max(0, 1 - Math.abs(source.inkLuminance - output.inkLuminance) / 160);
  const score = Math.max(0, Math.min(1, contourScore * .55 + projectionScore * .15 + boundsScore * .2 + toneScore * .1));
  return { score, contourScore, projectionScore, boundsScore, toneScore, precision, recall };
}

export class VectorDiagramFitError extends Error {
  feedback: string[];
  constructor(fit: Awaited<ReturnType<typeof scoreDiagramRasterFit>>) {
    super(`高清矢量重绘与原图的综合匹配度只有 ${Math.round(fit.score * 100)}%`);
    this.name = "VectorDiagramFitError";
    this.feedback = [
      `综合视觉匹配度 ${Math.round(fit.score * 100)}%，必须达到 ${Math.round(MIN_RASTER_FIT_SCORE * 100)}%。`,
      `线条与标签轮廓 ${Math.round(fit.contourScore * 100)}%，横纵分布 ${Math.round(fit.projectionScore * 100)}%，四周留白 ${Math.round(fit.boundsScore * 100)}%，墨色 ${Math.round(fit.toneScore * 100)}%。`,
      "请直接修正 strokes、labels、markers 的原图坐标、线宽与字号；不得通过重新求解几何关系改变构图。",
    ];
  }
}

export async function renderVectorDiagramPlan(plan: VectorDiagramPlan, referenceImage: string) {
  const inkColor = await sourceInkColor(referenceImage, plan.sourceAspectRatio);
  const styledPlan: VectorDiagramPlan = {
    ...plan,
    strokes: plan.strokes.map((stroke) => ({ ...stroke, color: inkColor, width: Math.max(3.5, stroke.width) })),
    ellipses: plan.ellipses.map((ellipse) => ({ ...ellipse, color: inkColor, width: Math.max(3.5, ellipse.width) })),
    labels: plan.labels.map((label) => ({ ...label, color: inkColor })),
    markers: plan.markers.map((marker) => ({ ...marker, color: inkColor })),
  };
  const svg = svgFromVectorDiagramPlan(styledPlan); const image = await rasterizeSvg(svg, plan.sourceAspectRatio);
  const fit = await scoreDiagramRasterFit(referenceImage, image, plan.sourceAspectRatio);
  if (fit.score < MIN_RASTER_FIT_SCORE) throw new VectorDiagramFitError(fit);
  return { image, svg, visualFitScore: fit.score, fit };
}
