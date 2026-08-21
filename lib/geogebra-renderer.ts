import type { GeoGebraPlan } from "./types";
import { MIN_VISUAL_FIT_SCORE, scoreDiagramVisualFit, validateGeoGebraPlan } from "./geogebra-reconstruction.mjs";

type GeoGebraApi = {
  evalCommand(command: string): boolean;
  setCoordSystem(xMin: number, xMax: number, yMin: number, yMax: number): void;
  setAxesVisible(xVisible: boolean, yVisible: boolean): void;
  setGridVisible(visible: boolean): void;
  setColor(target: string, red: number, green: number, blue: number): void;
  setLineStyle(target: string, style: number): void;
  setLineThickness(target: string, thickness: number): void;
  setPointSize(target: string, size: number): void;
  setLabelVisible(target: string, visible: boolean): void;
  setVisible(target: string, visible: boolean): void;
  getAllObjectNames(): string[];
  getXcoord(target: string): number;
  getYcoord(target: string): number;
  getPNGBase64(scale: number, transparent: boolean, dpi: number): string;
  getBase64(callback: (value: string) => void): void;
  remove(): void;
};

type GGBAppletInstance = { inject(target: string): void };
type GGBAppletConstructor = new (parameters: Record<string, unknown>, useBrowserForJS?: boolean) => GGBAppletInstance;

declare global {
  interface Window { GGBApplet?: GGBAppletConstructor; }
}

let loader: Promise<void> | null = null;

function loadGeoGebra() {
  if (window.GGBApplet) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-zhiti-geogebra="true"]');
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("GeoGebra 加载失败")), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://www.geogebra.org/apps/deployggb.js";
    script.async = true;
    script.dataset.zhitiGeogebra = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GeoGebra 加载失败，请检查网络"));
    document.head.appendChild(script);
  });
  return loader;
}

function parseColor(value: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  const hex = match?.[1] ?? "26332e";
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)] as const;
}

function geometryHelperTargets(commands: string[]) {
  return commands.flatMap((command) => {
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(Line|PerpendicularLine|ParallelLine)\s*\(/i.exec(command);
    return match ? [match[1]] : [];
  });
}

export class DiagramVisualFitError extends Error {
  feedback: string[];
  constructor(score: number, pointErrors: Array<{ label: string; error: number }>) {
    const percent = Math.round(score * 100);
    super(`GeoGebra 构图与原图的匹配度只有 ${percent}%`);
    this.name = "DiagramVisualFitError";
    this.feedback = [
      `整体构图匹配度 ${percent}%，必须达到 ${Math.round(MIN_VISUAL_FIT_SCORE * 100)}%。`,
      ...pointErrors.sort((a, b) => b.error - a.error).slice(0, 6).map((point) => `点 ${point.label} 偏离原图约 ${Math.round(point.error)}／1000。`),
    ];
  }
}

async function overlayReferenceLabels(base64: string, plan: GeoGebraPlan) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = `data:image/png;base64,${base64}`;
  });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d"); if (!context) return `data:image/png;base64,${base64}`;
  context.drawImage(image, 0, 0);
  const fontSize = Math.round(Math.max(24, Math.min(48, canvas.height * .052)));
  context.font = `italic ${fontSize}px "Times New Roman", serif`;
  context.fillStyle = "#26332e";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const point of plan.referencePoints) context.fillText(point.label, point.labelX / 1000 * canvas.width, point.labelY / 1000 * canvas.height);
  return canvas.toDataURL("image/png");
}

export async function renderGeoGebraPlan(plan: GeoGebraPlan): Promise<{ image: string; source: string; visualFitScore: number }> {
  const validation = validateGeoGebraPlan(plan);
  if (!validation.ok) throw new Error(validation.error || "GeoGebra 绘图方案无效");
  await loadGeoGebra();
  const GGBApplet = window.GGBApplet;
  if (!GGBApplet) throw new Error("GeoGebra 未正确加载");
  const target = `zhiti-ggb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const width = 720;
  const height = Math.round(Math.max(360, Math.min(720, width / plan.sourceAspectRatio)));
  const host = document.createElement("div");
  host.id = target;
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1`;
  document.body.appendChild(host);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { host.remove(); reject(new Error("GeoGebra 绘图超时")); }, 30_000);
    const finish = (callback: () => void) => { window.clearTimeout(timeout); callback(); };
    try {
      const applet = new GGBApplet({
        id: target,
        appName: plan.diagramType === "geometry" ? "geometry" : "graphing",
        width,
        height,
        showToolBar: false,
        showMenuBar: false,
        showAlgebraInput: false,
        showResetIcon: false,
        enableRightClick: false,
        enableShiftDragZoom: false,
        language: "zh",
        appletOnLoad(api: GeoGebraApi) {
          try {
            api.setAxesVisible(plan.diagramType !== "geometry", plan.diagramType !== "geometry");
            api.setGridVisible(false);
            api.setCoordSystem(plan.view.xMin, plan.view.xMax, plan.view.yMin, plan.view.yMax);
            for (const command of plan.commands) if (!api.evalCommand(command)) throw new Error(`GeoGebra 无法执行：${command}`);
            // Keep construction lines available for intersections in the .ggb
            // source, but exclude their infinite extensions from the worksheet
            // image. The visible geometry is emitted with Segment or Ray.
            if (plan.diagramType === "geometry") for (const target of geometryHelperTargets(plan.commands)) api.setVisible(target, false);
            // GeoGebra labels newly created segments and auxiliary objects by
            // default. The final point labels are overlaid at their original
            // image positions, so every native label stays hidden.
            for (const target of api.getAllObjectNames()) api.setLabelVisible(target, false);
            for (const style of plan.styles ?? []) {
              const [red, green, blue] = parseColor(style.color);
              api.setColor(style.target, red, green, blue);
              api.setLineStyle(style.target, Math.max(0, Math.min(4, style.lineStyle)));
              api.setLineThickness(style.target, Math.max(1, Math.min(9, style.lineThickness)));
              api.setPointSize(style.target, Math.max(1, Math.min(9, style.pointSize)));
              api.setLabelVisible(style.target, false);
            }
            for (const point of plan.referencePoints) {
              api.setLabelVisible(point.label, false);
              api.setVisible(point.label, point.markerVisible);
            }
            window.setTimeout(() => {
              void (async () => {
                try {
                  const xRange = plan.view.xMax - plan.view.xMin; const yRange = plan.view.yMax - plan.view.yMin;
                  const renderedPoints = plan.referencePoints.map((point) => ({ label: point.label, x: (api.getXcoord(point.label) - plan.view.xMin) / xRange * 1000, y: (plan.view.yMax - api.getYcoord(point.label)) / yRange * 1000 }));
                  const fit = scoreDiagramVisualFit(plan.referencePoints, renderedPoints);
                  if (fit.score < MIN_VISUAL_FIT_SCORE) throw new DiagramVisualFitError(fit.score, fit.pointErrors);
                  const image = await overlayReferenceLabels(api.getPNGBase64(2, true, 300), plan);
                  api.getBase64((source) => finish(() => { try { api.remove(); } finally { host.remove(); } resolve({ image, source, visualFitScore: fit.score }); }));
                } catch (error) { finish(() => { host.remove(); reject(error); }); }
              })();
            }, 450);
          } catch (error) { finish(() => { host.remove(); reject(error); }); }
        },
      }, true);
      applet.inject(target);
    } catch (error) { finish(() => { host.remove(); reject(error); }); }
  });
}
