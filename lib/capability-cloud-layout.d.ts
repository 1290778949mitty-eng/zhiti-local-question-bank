import type { CapabilityEdge, CapabilityNode } from "./types";

export type CapabilityPoint = { x: number; y: number; z: number };
export function capabilityCloudHash(value: string): number;
export function capabilityGraphPoint(node: CapabilityNode, index: number, nodes: CapabilityNode[], input?: { dimension?: "knowledge" | "skill" }): CapabilityPoint;
export function projectCapabilityGraphPoint(point: CapabilityPoint, input?: {
  rotationX?: number; rotationY?: number; tilt?: number; scaleX?: number; scaleY?: number; centerX?: number; centerY?: number;
}): { x: number; y: number; depth: number };
export function graphDragRotationDirections(point: CapabilityPoint, input?: {
  rotationX?: number; rotationY?: number; scaleX?: number; scaleY?: number; centerX?: number; centerY?: number;
}): { rotationX: 1 | -1; rotationY: 1 | -1 };
export function graphDragRotationDelta(point: CapabilityPoint, input?: {
  rotationX?: number; rotationY?: number; scaleX?: number; scaleY?: number; centerX?: number; centerY?: number;
}, targetDelta?: { x?: number; y?: number }): { rotationX: number; rotationY: number; projected: { x: number; y: number; depth: number } };
export function traceCapabilityPath(edges: CapabilityEdge[], selectedKey: string): { prerequisites: string[]; unlocks: string[]; edgeKeys: string[] };
export function visibleCapabilityGraph<T extends CapabilityNode>(nodes: T[], edges: CapabilityEdge[], selectedKey: string, mode?: "teacher" | "student"): { nodes: T[]; edges: CapabilityEdge[] };
export function capabilitySpherePoint(key: string, index: number, total: number): CapabilityPoint;
export function projectCapabilityPoint(point: CapabilityPoint, input?: {
  rotationX?: number; rotationY?: number; scale?: number; centerX?: number; centerY?: number;
}): { x: number; y: number; depth: number };
