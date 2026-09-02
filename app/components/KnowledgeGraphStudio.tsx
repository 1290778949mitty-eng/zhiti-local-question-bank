"use client";

import { useEffect, useMemo, useRef } from "react";
import { capabilityCloudHash, graphDragRotationDelta, projectCapabilityGraphPoint } from "../../lib/capability-cloud-layout.mjs";
import type { CapabilityDimension, CapabilityProfileNode, StudentCapabilityProfile } from "../../lib/types";

export type StudioGraphMode = "knowledge" | "capability";
export type StudioGradeFilter = "all" | 7 | 8 | 9;
export type StudioDomainFilter = "all" | string;

type Props = {
  profile: StudentCapabilityProfile;
  mode: StudioGraphMode;
  gradeFilter: StudioGradeFilter;
  domainFilter: StudioDomainFilter;
  evidenceOnly: boolean;
  selectedKey: string;
  onSelect: (key: string) => void;
};

type GraphPoint = { node: CapabilityProfileNode; x: number; y: number; radius: number; depth: number };
type Point3D = { x: number; y: number; z: number };

const DOMAIN_COLORS: Record<string, string> = {
  "cn-math:domain:number-algebra": "#6d8cff",
  "cn-math:domain:geometry": "#54d4cf",
  "cn-math:domain:statistics-probability": "#ffc56e",
  "cn-math:domain:integrated-application": "#c58cff",
};
const SKILL_COLORS: Record<string, string> = {
  "skill:calculation": "#72a7ff",
  "skill:concept": "#68d9d2",
  "skill:reasoning": "#ffbd67",
  "skill:modeling": "#c891ff",
  "skill:expression": "#ff769e",
};
const DOMAIN_LABELS: Record<string, string> = {
  "cn-math:domain:number-algebra": "数与代数",
  "cn-math:domain:geometry": "图形与几何",
  "cn-math:domain:statistics-probability": "统计与概率",
  "cn-math:domain:integrated-application": "综合与应用",
};

function nodeDomain(node: CapabilityProfileNode) {
  return node.dimension === "skill" ? node.key : node.domainKey;
}

function seedPoint(node: CapabilityProfileNode, index: number, mode: StudioGraphMode): Point3D {
  const domains = mode === "knowledge"
    ? ["cn-math:domain:number-algebra", "cn-math:domain:geometry", "cn-math:domain:statistics-probability", "cn-math:domain:integrated-application"]
    : ["skill:calculation", "skill:concept", "skill:reasoning", "skill:modeling", "skill:expression"];
  const cluster = Math.max(0, domains.indexOf(nodeDomain(node)));
  const x = domains.length <= 1 ? 0 : (cluster / (domains.length - 1) - .5) * 2.8;
  const hash = capabilityCloudHash(`${node.key}:${index}`);
  const jitterX = ((hash % 1000) / 1000 - .5) * (mode === "knowledge" ? .75 : .34);
  const jitterZ = (((hash >>> 8) % 1000) / 1000 - .5) * .95;
  const stage = Number(node.stage) || (mode === "knowledge" ? 7 : 1);
  const y = mode === "knowledge" ? (stage - 8) * .95 : (stage - 2) * .92;
  return { x: x + jitterX, y, z: jitterZ };
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16) || 0;
  const green = Number.parseInt(value.slice(2, 4), 16) || 0;
  const blue = Number.parseInt(value.slice(4, 6), 16) || 0;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default function KnowledgeGraphStudio({ profile, mode, gradeFilter, domainFilter, evidenceOnly, selectedKey, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedRef = useRef<GraphPoint[]>([]);
  const hoveredKeyRef = useRef("");

  const nodes = useMemo(() => profile.nodes.filter((node) => {
    const dimension = mode === "capability" ? "skill" : "knowledge";
    if (node.dimension !== dimension) return false;
    if (gradeFilter !== "all" && mode === "knowledge" && node.stage !== gradeFilter) return false;
    if (domainFilter !== "all" && nodeDomain(node) !== domainFilter) return false;
    if (evidenceOnly && node.evidenceCount === 0) return false;
    return true;
  }), [domainFilter, evidenceOnly, gradeFilter, mode, profile.nodes]);
  const nodeKeys = useMemo(() => new Set(nodes.map((node) => node.key)), [nodes]);
  const edges = useMemo(() => profile.edges.filter((edge) => nodeKeys.has(edge.sourceKey) && nodeKeys.has(edge.targetKey)), [nodeKeys, profile.edges]);
  const selected = nodes.find((node) => node.key === selectedKey) ?? nodes.find((node) => node.highlighted) ?? nodes[0] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let rotationY = -.16;
    let rotationX = .14;
    let zoom = 1;
    let frame = 0;
    let dragStart: { x: number; y: number; lastX: number; lastY: number; anchor: Point3D } | null = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const positions = new Map(nodes.map((node, index) => [node.key, seedPoint(node, index, mode)]));
    const selectedPath = new Set(selected ? [selected.key] : []);
    if (selected) {
      for (const edge of edges) {
        if (edge.sourceKey === selected.key) selectedPath.add(edge.targetKey);
        if (edge.targetKey === selected.key) selectedPath.add(edge.sourceKey);
      }
    }

    function draw(timestamp = 0) {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const centerX = bounds.width / 2;
      const centerY = bounds.height / 2;
      const scaleX = Math.min(bounds.width / 3.35, 225) * zoom;
      const scaleY = Math.min(bounds.height / 2.55, 175) * zoom;

      const background = context.createRadialGradient(centerX, centerY - 20, 12, centerX, centerY, Math.max(bounds.width, bounds.height) * .75);
      background.addColorStop(0, "rgba(24, 38, 76, .32)");
      background.addColorStop(.46, "rgba(10, 17, 35, .18)");
      background.addColorStop(1, "rgba(4, 7, 17, 0)");
      context.fillStyle = background;
      context.fillRect(0, 0, bounds.width, bounds.height);

      context.save();
      context.globalAlpha = .25;
      context.strokeStyle = "#42618a";
      context.lineWidth = 1;
      for (let index = -8; index <= 8; index += 1) {
        const y = centerY + index * 28;
        context.beginPath(); context.moveTo(0, y); context.lineTo(bounds.width, y); context.stroke();
      }
      for (let index = -18; index <= 18; index += 1) {
        const x = centerX + index * 38;
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, bounds.height); context.stroke();
      }
      context.restore();

      const projected = nodes.map((node, index) => {
        const point = projectCapabilityGraphPoint(positions.get(node.key) ?? seedPoint(node, index, mode), { rotationX, rotationY, scaleX, scaleY, centerX, centerY });
        const radius = 3.6 + Math.min(8, node.evidenceCount * 1.4) + (node.level === "domain" ? 3.4 : 0) + (node.key === selected?.key ? 2.6 : 0);
        return { node, x: point.x, y: point.y, radius, depth: point.depth };
      }).sort((left, right) => left.depth - right.depth);
      projectedRef.current = projected;
      const byKey = new Map(projected.map((item) => [item.node.key, item]));

      context.save();
      for (const edge of edges) {
        const from = byKey.get(edge.sourceKey); const to = byKey.get(edge.targetKey);
        if (!from || !to) continue;
        const active = selectedPath.has(edge.sourceKey) && selectedPath.has(edge.targetKey);
        context.globalAlpha = active ? .86 : .16;
        context.strokeStyle = active ? "#94a9ff" : "#52627f";
        context.lineWidth = active ? 1.5 : .7;
        context.setLineDash(edge.strength === "soft" ? [3, 5] : []);
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
      }
      context.setLineDash([]);
      context.restore();

      for (const item of projected) {
        const color = mode === "knowledge" ? DOMAIN_COLORS[item.node.domainKey] ?? "#8ba2ff" : SKILL_COLORS[item.node.key] ?? "#8ba2ff";
        const statusColor = item.node.status === "attention" ? "#ff6f7f" : item.node.status === "developing" ? "#ffc56e" : item.node.status === "stable" ? "#5fe0b5" : "#8291aa";
        const focused = item.node.key === selected?.key;
        const dimmed = selected && !selectedPath.has(item.node.key);
        context.globalAlpha = dimmed ? .3 : 1;
        if (item.node.highlighted || focused || item.node.key === hoveredKeyRef.current) {
          const pulse = reduceMotion ? 0 : (Math.sin(timestamp / 500 + item.depth) + 1) * 3;
          context.strokeStyle = item.node.highlighted ? "#ff6688" : color;
          context.globalAlpha = .28;
          context.lineWidth = focused ? 2.4 : 1.6;
          context.beginPath(); context.arc(item.x, item.y, item.radius + 6 + pulse, 0, Math.PI * 2); context.stroke();
          context.globalAlpha = dimmed ? .3 : 1;
        }
        const glow = context.createRadialGradient(item.x, item.y, 0, item.x, item.y, item.radius * 4.5);
        glow.addColorStop(0, hexToRgba(statusColor, .65)); glow.addColorStop(1, hexToRgba(statusColor, 0));
        context.fillStyle = glow; context.beginPath(); context.arc(item.x, item.y, item.radius * 4.5, 0, Math.PI * 2); context.fill();
        context.fillStyle = color; context.beginPath(); context.arc(item.x, item.y, item.radius, 0, Math.PI * 2); context.fill();
        context.strokeStyle = statusColor; context.lineWidth = focused ? 2 : 1; context.stroke();
        if (focused || item.node.highlighted || item.node.level === "domain" || item.node.key === hoveredKeyRef.current) {
          context.globalAlpha = 1; context.fillStyle = "#e8eeff";
          context.font = `${focused ? 700 : 600} ${focused ? 12 : 10}px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif`;
          context.textAlign = "center"; context.fillText(item.node.label, item.x, item.y + item.radius + 16, 124);
        }
      }
      context.globalAlpha = 1;
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    }

    function redraw() { if (frame) cancelAnimationFrame(frame); frame = 0; draw(); if (!reduceMotion) frame = requestAnimationFrame(draw); }
    function pointerDown(event: PointerEvent) {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
      const closest = projectedRef.current.map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) })).sort((a, b) => a.distance - b.distance)[0];
      const anchor = closest ? positions.get(closest.item.node.key) ?? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: 1 };
      canvas.setPointerCapture(event.pointerId);
      dragStart = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, anchor };
    }
    function pointerMove(event: PointerEvent) {
      const bounds = canvas.getBoundingClientRect(); const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
      const closest = projectedRef.current.map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) })).sort((a, b) => a.distance - b.distance)[0];
      hoveredKeyRef.current = closest && closest.distance <= closest.item.radius + 11 ? closest.item.node.key : "";
      if (!dragStart) return;
      // Re-evaluate the local projection direction while dragging. The nearest
      // node therefore follows the pointer even after the view crosses an axis.
      const centerX = bounds.width / 2; const centerY = bounds.height / 2;
      const scaleX = Math.min(bounds.width / 3.35, 225) * zoom;
      const scaleY = Math.min(bounds.height / 2.55, 175) * zoom;
      const delta = graphDragRotationDelta(dragStart.anchor, { rotationX, rotationY, scaleX, scaleY, centerX, centerY }, {
        x: event.clientX - dragStart.lastX,
        y: event.clientY - dragStart.lastY,
      });
      rotationY += delta.rotationY;
      rotationX = Math.max(-1.05, Math.min(1.05, rotationX + delta.rotationX));
      dragStart.lastX = event.clientX; dragStart.lastY = event.clientY;
      redraw();
    }
    function pointerUp(event: PointerEvent) {
      if (!dragStart) return;
      const moved = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y); dragStart = null;
      if (moved < 7) {
        const bounds = canvas.getBoundingClientRect(); const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
        const closest = projectedRef.current.map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) })).sort((a, b) => a.distance - b.distance)[0];
        if (closest && closest.distance <= closest.item.radius + 13) onSelect(closest.item.node.key);
      }
    }
    function wheel(event: WheelEvent) { event.preventDefault(); zoom = Math.max(.72, Math.min(1.45, zoom - event.deltaY * .0008)); redraw(); }
    const observer = new ResizeObserver(redraw); observer.observe(canvas);
    canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointermove", pointerMove); canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("pointercancel", pointerUp); canvas.addEventListener("wheel", wheel, { passive: false }); redraw();
    return () => { if (frame) cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointermove", pointerMove); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", pointerUp); canvas.removeEventListener("wheel", wheel); };
  }, [domainFilter, edges, evidenceOnly, gradeFilter, mode, nodes, onSelect, selected]);

  return <div className="graph-studio-canvas-wrap">
    <div className="graph-studio-axis graph-studio-axis-top"><span>{mode === "knowledge" ? "九年级" : "综合应用"}</span><i></i></div>
    <div className="graph-studio-axis graph-studio-axis-middle"><span>{mode === "knowledge" ? "八年级" : "推理表达"}</span><i></i></div>
    <div className="graph-studio-axis graph-studio-axis-bottom"><span>{mode === "knowledge" ? "七年级" : "基础能力"}</span><i></i></div>
    <canvas ref={canvasRef} aria-label="可拖动、缩放并点选的知识图谱" />
    {!nodes.length && <div className="graph-studio-empty">当前筛选没有节点<br /><small>放宽年级、领域或证据筛选后继续探索</small></div>}
    <div className="graph-studio-canvas-hint">拖动方向与旋转方向一致 · 滚轮缩放 · 点击节点查看前置路径</div>
  </div>;
}

export function studioDomainLabel(key: string) { return DOMAIN_LABELS[key] ?? key; }
export function studioDomainColor(node: CapabilityProfileNode) { return node.dimension === "skill" ? SKILL_COLORS[node.key] ?? "#8ba2ff" : DOMAIN_COLORS[node.domainKey] ?? "#8ba2ff"; }
export function studioDimensionLabel(dimension: CapabilityDimension) { return dimension === "knowledge" ? "知识" : "能力"; }
