import type { DiagramQuality, DiagramRotation } from "./types";

export function isPhotographedDiagram(quality: DiagramQuality | null | undefined): boolean;
export function normalizeDiagramRotation(value: unknown): DiagramRotation;
export function correctionForCapturedRotation(value: unknown): DiagramRotation;
export function fitWithinMaxEdge(width: number, height: number, maxEdge: number): { width: number; height: number; scale: number };
