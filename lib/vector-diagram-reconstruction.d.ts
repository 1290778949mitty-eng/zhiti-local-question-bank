import type { DiagramQuality, VectorDiagramPlan } from "./types";

export const MIN_RASTER_FIT_SCORE: number;
export function shouldAutoVectorizeDiagram(quality: DiagramQuality | null | undefined): boolean;
export function validateVectorDiagramPlan(plan: VectorDiagramPlan | null | undefined): { ok: boolean; error?: string };
export function scoreProjectionProfiles(reference: number[], rendered: number[]): number;
export function combineDiagramRasterFit(metrics: { precision: number; recall: number; projectionScore: number; boundsScore: number; toneScore: number }, allowSourceAnnotations?: boolean): { contourScore: number; strictScore: number; annotationAwareScore: number; score: number };
