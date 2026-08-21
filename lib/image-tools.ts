import type { ClipboardEvent as ReactClipboardEvent } from "react";

export type NormalizedBox = { x: number; y: number; width: number; height: number };
type PixelBox = { minX: number; minY: number; maxX: number; maxY: number };
type Component = PixelBox & { count: number };

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

function renderCleanCrop(image: HTMLImageElement, box: PixelBox): string {
  const sourceWidth = Math.max(1, box.maxX - box.minX); const sourceHeight = Math.max(1, box.maxY - box.minY); const scale = Math.min(2.2, Math.max(1, 900 / sourceWidth));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(sourceWidth * scale); canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("无法处理配图");
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(image, box.minX, box.minY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height); const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
    if (luminance > 238 || pixels[index + 3] < 20) { pixels[index] = 255; pixels[index + 1] = 255; pixels[index + 2] = 255; pixels[index + 3] = 255; }
    else { pixels[index] = Math.max(0, Math.min(255, (pixels[index] - 128) * 1.12 + 128)); pixels[index + 1] = Math.max(0, Math.min(255, (pixels[index + 1] - 128) * 1.12 + 128)); pixels[index + 2] = Math.max(0, Math.min(255, (pixels[index + 2] - 128) * 1.12 + 128)); }
  }
  context.putImageData(imageData, 0, 0); return canvas.toDataURL("image/png");
}

export async function cropDataUrl(source: string, box: NormalizedBox): Promise<string> {
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

export async function compressDataUrl(source: string, maxWidth = 2200): Promise<string> {
  const image = await loadImage(source); if (image.naturalWidth <= maxWidth) return source; const ratio = maxWidth / image.naturalWidth;
  const canvas = document.createElement("canvas"); canvas.width = maxWidth; canvas.height = Math.round(image.naturalHeight * ratio); canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL("image/jpeg", .9);
}
