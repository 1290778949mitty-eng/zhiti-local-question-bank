import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { fitWithinMaxEdge, normalizeDiagramRotation } from "./image-processing-rules.mjs";
import type { DiagramKind, DiagramRotation } from "./types";

export type NormalizedBox = { x: number; y: number; width: number; height: number };
type PixelBox = { minX: number; minY: number; maxX: number; maxY: number };
type Component = PixelBox & { count: number };
type CropOptions = { photographed?: boolean; rotation?: DiagramRotation; kind?: DiagramKind };

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
  });
}

export function clipboardImage(event: ReactClipboardEvent): File | null {
  for (const item of Array.from(event.clipboardData.items)) if (item.type.startsWith("image/")) return item.getAsFile();
  return null;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
}

export async function imageAspectRatio(source: string) {
  const image = await loadImage(source);
  return image.naturalWidth / Math.max(1, image.naturalHeight);
}

function normalizedToPixels(box: NormalizedBox, image: HTMLImageElement): PixelBox {
  return {
    minX: Math.max(0, Math.floor(box.x / 1000 * image.naturalWidth)), minY: Math.max(0, Math.floor(box.y / 1000 * image.naturalHeight)),
    maxX: Math.min(image.naturalWidth, Math.ceil((box.x + box.width) / 1000 * image.naturalWidth)), maxY: Math.min(image.naturalHeight, Math.ceil((box.y + box.height) / 1000 * image.naturalHeight)),
  };
}

function expandBox(box: PixelBox, image: HTMLImageElement): PixelBox {
  const width = box.maxX - box.minX; const height = box.maxY - box.minY;
  return { minX: Math.max(0, Math.floor(box.minX - width * .18 - 12)), minY: Math.max(0, Math.floor(box.minY - height * .28 - 12)), maxX: Math.min(image.naturalWidth, Math.ceil(box.maxX + width * .18 + 12)), maxY: Math.min(image.naturalHeight, Math.ceil(box.maxY + height * .42 + 12)) };
}

function findComponents(data: Uint8ClampedArray, width: number, height: number): Component[] {
  const mask = new Uint8Array(width * height); const seen = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4; const alpha = data[offset + 3]; const luminance = data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114;
    if (alpha > 20 && luminance < 218) mask[index] = 1;
  }
  const components: Component[] = []; const stack = new Int32Array(width * height);
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    let top = 0; stack[top++] = seed; seen[seed] = 1; let minX = width; let minY = height; let maxX = 0; let maxY = 0; let count = 0;
    while (top) {
      const index = stack[--top]; const x = index % width; const y = Math.floor(index / width); count += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue; const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx; if (mask[next] && !seen[next]) { seen[next] = 1; stack[top++] = next; }
      }
    }
    if (count >= 4) components.push({ minX, minY, maxX, maxY, count });
  }
  return components;
}

function componentScore(component: Component) {
  const width = component.maxX - component.minX + 1; const height = component.maxY - component.minY + 1;
  return width * height * Math.log2(component.count + 2);
}

function refineToDiagram(components: Component[], roiWidth: number, roiHeight: number): PixelBox | null {
  const candidates = components.filter((item) => item.maxX - item.minX > roiWidth * .12 && item.maxY - item.minY > roiHeight * .12);
  const main = (candidates.length ? candidates : components).sort((a, b) => componentScore(b) - componentScore(a))[0]; if (!main) return null;
  let result: PixelBox = { minX: main.minX, minY: main.minY, maxX: main.maxX, maxY: main.maxY };
  const mainWidth = main.maxX - main.minX + 1; const mainHeight = main.maxY - main.minY + 1; const margin = Math.max(7, Math.min(mainWidth, mainHeight) * .085);
  for (const item of components) {
    if (item === main) continue; const width = item.maxX - item.minX + 1; const height = item.maxY - item.minY + 1;
    if (width > mainWidth * .2 || height > mainHeight * .22) continue;
    const dx = Math.max(main.minX - item.maxX, item.minX - main.maxX, 0); const dy = Math.max(main.minY - item.maxY, item.minY - main.maxY, 0);
    if (dx <= margin && dy <= margin) result = { minX: Math.min(result.minX, item.minX), minY: Math.min(result.minY, item.minY), maxX: Math.max(result.maxX, item.maxX), maxY: Math.max(result.maxY, item.maxY) };
  }
  const padding = Math.max(10, Math.round(Math.min(mainWidth, mainHeight) * .06));
  return { minX: Math.max(0, result.minX - padding), minY: Math.max(0, result.minY - padding), maxX: Math.min(roiWidth, result.maxX + padding), maxY: Math.min(roiHeight, result.maxY + padding) };
}

function photoThreshold(data: Uint8ClampedArray) {
  const histogram = new Uint32Array(256); let total = 0; let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(data[index] * .299 + data[index + 1] * .587 + data[index + 2] * .114);
    histogram[value] += 1; total += 1; sum += value;
  }
  let weight = 0; let weightedSum = 0; let best = 190; let bestVariance = -1;
  for (let value = 0; value < 256; value += 1) {
    weight += histogram[value]; if (!weight) continue;
    const foreground = total - weight; if (!foreground) break;
    weightedSum += value * histogram[value];
    const variance = weight * foreground * (weightedSum / weight - (sum - weightedSum) / foreground) ** 2;
    if (variance > bestVariance) { bestVariance = variance; best = value; }
  }
  return Math.max(175, Math.min(232, best + 32));
}

function paddedBox(box: PixelBox, image: HTMLImageElement, amount = .08): PixelBox {
  const width = box.maxX - box.minX; const height = box.maxY - box.minY;
  return {
    minX: Math.max(0, Math.floor(box.minX - width * amount)), minY: Math.max(0, Math.floor(box.minY - height * amount)),
    maxX: Math.min(image.naturalWidth, Math.ceil(box.maxX + width * amount)), maxY: Math.min(image.naturalHeight, Math.ceil(box.maxY + height * amount)),
  };
}

function rotateCanvas180(source: HTMLCanvasElement) {
  const output = document.createElement("canvas"); output.width = source.width; output.height = source.height;
  const context = output.getContext("2d"); if (!context) return source;
  context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width, output.height); context.rotate(Math.PI); context.drawImage(source, 0, 0);
  return output;
}

function orientCoordinateDiagram(source: HTMLCanvasElement) {
  const width = 240; const height = Math.max(100, Math.round(width * source.height / Math.max(1, source.width)));
  const sample = document.createElement("canvas"); sample.width = width; sample.height = height;
  const context = sample.getContext("2d", { willReadFrequently: true }); if (!context) return source;
  context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data; const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4; const luminance = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
    if (luminance < 185) mask[index] = 1;
  }
  let axisY = 0; let horizontalBest = 0;
  for (let y = Math.round(height * .12); y < height * .88; y += 1) {
    let count = 0; for (let x = Math.round(width * .08); x < width * .92; x += 1) count += mask[y * width + x];
    if (count > horizontalBest) { horizontalBest = count; axisY = y; }
  }
  let axisX = 0; let verticalBest = 0;
  for (let x = Math.round(width * .12); x < width * .88; x += 1) {
    let count = 0; for (let y = Math.round(height * .08); y < height * .92; y += 1) count += mask[y * width + x];
    if (count > verticalBest) { verticalBest = count; axisX = x; }
  }
  if (horizontalBest < width * .18 || verticalBest < height * .18) return source;
  const patchInk = (cx: number, cy: number) => {
    let count = 0;
    for (let y = Math.max(0, cy - 13); y <= Math.min(height - 1, cy + 13); y += 1) for (let x = Math.max(0, cx - 13); x <= Math.min(width - 1, cx + 13); x += 1) count += mask[y * width + x];
    return count;
  };
  const horizontalInk = Array.from({ length: width }, (_, x) => mask[axisY * width + x] + (axisY ? mask[(axisY - 1) * width + x] : 0) + (axisY + 1 < height ? mask[(axisY + 1) * width + x] : 0));
  const verticalInk = Array.from({ length: height }, (_, y) => mask[y * width + axisX] + (axisX ? mask[y * width + axisX - 1] : 0) + (axisX + 1 < width ? mask[y * width + axisX + 1] : 0));
  const left = horizontalInk.findIndex((value) => value > 0); const right = horizontalInk.findLastIndex((value) => value > 0);
  const top = verticalInk.findIndex((value) => value > 0); const bottom = verticalInk.findLastIndex((value) => value > 0);
  if (left < 0 || right < 0 || top < 0 || bottom < 0) return source;
  const leftScore = patchInk(left, axisY); const rightScore = patchInk(right, axisY); const topScore = patchInk(axisX, top); const bottomScore = patchInk(axisX, bottom);
  return leftScore > rightScore * 1.08 && bottomScore > topScore * 1.08 ? rotateCanvas180(source) : source;
}

function renderCleanCrop(image: HTMLImageElement, box: PixelBox, options: CropOptions = {}): string {
  const sourceWidth = Math.max(1, box.maxX - box.minX); const sourceHeight = Math.max(1, box.maxY - box.minY); const scale = Math.min(2.2, Math.max(1, 900 / sourceWidth));
  const crop = document.createElement("canvas"); crop.width = Math.round(sourceWidth * scale); crop.height = Math.round(sourceHeight * scale);
  const cropContext = crop.getContext("2d"); if (!cropContext) throw new Error("无法处理配图");
  cropContext.fillStyle = "#fff"; cropContext.fillRect(0, 0, crop.width, crop.height); cropContext.imageSmoothingEnabled = true; cropContext.imageSmoothingQuality = "high";
  cropContext.drawImage(image, box.minX, box.minY, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
  const rotation = normalizeDiagramRotation(options.rotation); const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas"); canvas.width = swap ? crop.height : crop.width; canvas.height = swap ? crop.width : crop.height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("无法处理配图");
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.save();
  if (rotation === 90) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
  else if (rotation === 180) { context.translate(canvas.width, canvas.height); context.rotate(Math.PI); }
  else if (rotation === 270) { context.translate(0, canvas.height); context.rotate(-Math.PI / 2); }
  context.drawImage(crop, 0, 0); context.restore();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height); const pixels = imageData.data;
  const adaptiveThreshold = options.photographed ? photoThreshold(pixels) : 238;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
    if (luminance > adaptiveThreshold || pixels[index + 3] < 20) { pixels[index] = 255; pixels[index + 1] = 255; pixels[index + 2] = 255; pixels[index + 3] = 255; }
    else if (options.photographed) { const value = Math.max(0, Math.min(246, (luminance - adaptiveThreshold) * 1.45 + 246)); pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value; pixels[index + 3] = 255; }
    else { pixels[index] = Math.max(0, Math.min(255, (pixels[index] - 128) * 1.12 + 128)); pixels[index + 1] = Math.max(0, Math.min(255, (pixels[index + 1] - 128) * 1.12 + 128)); pixels[index + 2] = Math.max(0, Math.min(255, (pixels[index + 2] - 128) * 1.12 + 128)); }
  }
  context.putImageData(imageData, 0, 0);
  const oriented = options.photographed && (options.kind === "coordinate" || options.kind === "function") ? orientCoordinateDiagram(canvas) : canvas;
  return oriented.toDataURL("image/png");
}

export async function cropDataUrl(source: string, box: NormalizedBox, options: CropOptions = {}): Promise<string> {
  if (options.photographed) {
    const image = await loadImage(source);
    return renderCleanCrop(image, paddedBox(normalizedToPixels(box, image), image, .04), options);
  }
  const image = await loadImage(source); const rough = expandBox(normalizedToPixels(box, image), image); const width = rough.maxX - rough.minX; const height = rough.maxY - rough.minY;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return renderCleanCrop(image, normalizedToPixels(box, image)); context.drawImage(image, rough.minX, rough.minY, width, height, 0, 0, width, height);
  const refined = refineToDiagram(findComponents(context.getImageData(0, 0, width, height).data, width, height), width, height);
  if (!refined) return renderCleanCrop(image, normalizedToPixels(box, image));
  return renderCleanCrop(image, { minX: rough.minX + refined.minX, minY: rough.minY + refined.minY, maxX: rough.minX + refined.maxX, maxY: rough.minY + refined.maxY });
}

export async function cropExactDataUrl(source: string, box: NormalizedBox): Promise<string> {
  const image = await loadImage(source); return renderCleanCrop(image, normalizedToPixels(box, image));
}

export async function materializeImageDataUrl(source: string, maxEdge = 1800): Promise<string> {
  const image = await loadImage(source); const size = fitWithinMaxEdge(image.naturalWidth, image.naturalHeight, maxEdge);
  if (source.startsWith("data:image/") && size.scale === 1) return source;
  const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("无法读取图片");
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL("image/jpeg", .88);
}

export async function compressDataUrl(source: string, maxEdge = 1800): Promise<string> {
  return materializeImageDataUrl(source, maxEdge);
}
