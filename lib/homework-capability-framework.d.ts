import type { CapabilityNode, CapabilityEvidence, StudentCapabilityProfile } from "./types";

export const CAPABILITY_FRAMEWORK_VERSION: string;
export const CORE_CAPABILITY_NODES: CapabilityNode[];
export const CAPABILITY_GRAPH_EDGES: import("./types").CapabilityEdge[];
export function normalizeKnowledgeTags(value: unknown): string[];
export function knowledgeTagKey(label: string): string;
export function resolveKnowledgeTaxonomyKeys(labels: unknown, stem?: string): string[];
export function inferKnowledgeTags(stem: string): string[];
export function normalizeCapabilityKeys(value: unknown, input?: { errorType?: string; questionType?: string }): string[];
export function capabilityNodeFor(key: string, label?: string): CapabilityNode | null;
export function buildCapabilityProfile(evidence: Array<CapabilityEvidence & { questionNumber?: string }>, options?: { now?: number; assignmentId?: string; studentId?: string; viewMode?: "teacher" | "student"; includeAllKnowledge?: boolean }): StudentCapabilityProfile;
