import type { DiagramQuality, GeoGebraPlan, GeoGebraReferencePoint } from "./types";

export const MIN_VISUAL_FIT_SCORE: number;
export function shouldAutoReconstructDiagram(quality: DiagramQuality | null | undefined): boolean;
export function isSafeGeoGebraCommand(command: string): boolean;
export function validateGeoGebraPlan(plan: GeoGebraPlan | null | undefined): { ok: boolean; error?: string };
export function scoreDiagramVisualFit(referencePoints: GeoGebraReferencePoint[], renderedPoints: Array<{ label: string; x: number; y: number }>): { score: number; matchedCount: number; rmsError: number; maxError: number; pointErrors: Array<{ label: string; error: number }> };
