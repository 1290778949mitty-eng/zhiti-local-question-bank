"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  capabilityGraphPoint,
  projectCapabilityGraphPoint,
  traceCapabilityPath,
  visibleCapabilityGraph,
} from "../../lib/capability-cloud-layout.mjs";
import type { CapabilityDimension, CapabilityProfileNode, StudentCapabilityProfile } from "../../lib/types";

type Props = { profile: StudentCapabilityProfile; title?: string; compact?: boolean };
type Projected = { node: CapabilityProfileNode; x: number; y: number; radius: number; depth: number };

const STATUS_LABEL = { stable: "表现稳定", developing: "正在形成", attention: "需要关注", insufficient: "证据不足" } as const;
const DOMAIN_COLOR: Record<string, string> = {
  "cn-math:domain:number-algebra": "#7483e8",
  "cn-math:domain:geometry": "#38a59a",
  "cn-math:domain:statistics-probability": "#d19b43",
  "cn-math:domain:integrated-application": "#9b72cf",
};

function shortenPath(nodes: CapabilityProfileNode[], fallback: string) {
  return nodes.length ? nodes.slice(0, 3).map((node) => node.label).join("、") : fallback;
}

export default function CapabilityCloud({ profile, title = "学习路径图", compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedRef = useRef<Projected[]>([]);
  const [dimension, setDimension] = useState<CapabilityDimension>("knowledge");
  const [selectedKey, setSelectedKey] = useState("");
  const audience = profile.viewMode === "student" ? "student" : "teacher";
  const nodes = useMemo(() => profile.nodes.filter((node) => node.dimension === dimension), [dimension, profile.nodes]);
  const selected = nodes.find((node) => node.key === selectedKey)
    ?? nodes.find((node) => node.highlighted)
    ?? nodes.find((node) => node.evidenceCount > 0)
    ?? nodes[0]
    ?? null;
  const path = useMemo(() => traceCapabilityPath(profile.edges, selected?.key ?? ""), [profile.edges, selected?.key]);
  const graph = useMemo(
    () => visibleCapabilityGraph(nodes, profile.edges, selected?.key ?? "", audience),
    [audience, nodes, profile.edges, selected?.key],
  );
  const displayGraph = useMemo(() => {
    const hasSpecificNodes = graph.nodes.some((node) => node.level !== "domain");
    const visibleNodes = hasSpecificNodes && selected?.level !== "domain" ? graph.nodes.filter((node) => node.level !== "domain") : graph.nodes;
    const visibleKeys = new Set(visibleNodes.map((node) => node.key));
    return { nodes: visibleNodes, edges: graph.edges.filter((edge) => visibleKeys.has(edge.sourceKey) && visibleKeys.has(edge.targetKey)) };
  }, [graph.edges, graph.nodes, selected?.level]);
  const byKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes]);
  const prerequisites = path.prerequisites.map((key) => byKey.get(key)).filter((node): node is CapabilityProfileNode => Boolean(node));
  const unlocks = path.unlocks.map((key) => byKey.get(key)).filter((node): node is CapabilityProfileNode => Boolean(node));

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    let rotationY = .08; let tilt = .16; let frame = 0;
    let dragStart: { x: number; y: number; rotationY: number; tilt: number } | null = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const styles = getComputedStyle(document.documentElement);
    const colors = {
      ink: styles.getPropertyValue("--ink").trim() || "#1f2d27",
      muted: styles.getPropertyValue("--muted").trim() || "#87908b",
      surface: styles.getPropertyValue("--surface").trim() || "#fff",
      line: styles.getPropertyValue("--line").trim() || "#dfe5e1",
      stable: "#4f8d70", developing: "#d1a34b", attention: "#d36b5d", insufficient: "#929aa7",
      prerequisite: "#7d6bc4", unlock: "#4d9875", current: "#6675c9",
    };
    const pathNodes = new Set([selected?.key ?? "", ...path.prerequisites, ...path.unlocks]);
    const prerequisiteNodes = new Set(path.prerequisites);
    const unlockNodes = new Set(path.unlocks);

    function arrow(from: Projected, to: Projected, color: string, dashed: boolean) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const startX = from.x + Math.cos(angle) * (from.radius + 2); const startY = from.y + Math.sin(angle) * (from.radius + 2);
      const endX = to.x - Math.cos(angle) * (to.radius + 5); const endY = to.y - Math.sin(angle) * (to.radius + 5);
      context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 1.3; context.setLineDash(dashed ? [4, 5] : []);
      context.beginPath(); context.moveTo(startX, startY); context.lineTo(endX, endY); context.stroke(); context.setLineDash([]);
      context.beginPath(); context.moveTo(endX, endY); context.lineTo(endX - Math.cos(angle - .45) * 6, endY - Math.sin(angle - .45) * 6);
      context.lineTo(endX - Math.cos(angle + .45) * 6, endY - Math.sin(angle + .45) * 6); context.closePath(); context.fill();
    }

    function draw(timestamp = 0) {
      const bounds = canvas.getBoundingClientRect(); const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(bounds.width * ratio)); const pixelHeight = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, bounds.width, bounds.height);
      const centerX = bounds.width / 2; const centerY = bounds.height / 2;
      const scaleX = Math.min(bounds.width / 3.25, compact ? 122 : 146); const scaleY = Math.min(bounds.height / 2.55, compact ? 105 : 128);
      const stages = dimension === "knowledge" ? [{ value: 9, label: "九年级" }, { value: 8, label: "八年级" }, { value: 7, label: "七年级" }]
        : [{ value: 3, label: "综合应用" }, { value: 2, label: "推理表达" }, { value: 1, label: "基础能力" }];
      for (const stage of stages) {
        const yValue = dimension === "knowledge" ? (stage.value - 8) * .92 : (stage.value - 2) * .82;
        const point = projectCapabilityGraphPoint({ x: 0, y: yValue, z: 0 }, { rotationY, tilt, scaleX, scaleY, centerX, centerY });
        context.strokeStyle = colors.line; context.globalAlpha = .55; context.setLineDash([3, 7]); context.beginPath();
        context.moveTo(42, point.y); context.lineTo(bounds.width - 18, point.y); context.stroke(); context.setLineDash([]);
        context.globalAlpha = 1; context.fillStyle = colors.muted; context.font = '600 9px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
        context.textAlign = "left"; context.fillText(stage.label, 8, point.y + 3);
      }
      const projected = displayGraph.nodes.map((node, index) => {
        const point = projectCapabilityGraphPoint(capabilityGraphPoint(node, index, displayGraph.nodes, { dimension }), { rotationY, tilt, scaleX, scaleY, centerX, centerY });
        const radius = 5.5 + Math.min(9, node.evidenceCount * 1.25) + (node.level === "domain" ? 2 : 0) + (node.highlighted ? 1.5 : 0);
        return { node, x: point.x, y: point.y, radius, depth: point.depth };
      }).sort((left, right) => left.depth - right.depth);
      projectedRef.current = projected; const projectedByKey = new Map(projected.map((item) => [item.node.key, item]));
      for (const edge of displayGraph.edges) {
        const from = projectedByKey.get(edge.sourceKey); const to = projectedByKey.get(edge.targetKey); if (!from || !to) continue;
        const isPrerequisitePath = prerequisiteNodes.has(edge.sourceKey) && (prerequisiteNodes.has(edge.targetKey) || edge.targetKey === selected?.key);
        const isUnlockPath = (edge.sourceKey === selected?.key || unlockNodes.has(edge.sourceKey)) && unlockNodes.has(edge.targetKey);
        context.globalAlpha = isPrerequisitePath || isUnlockPath ? .82 : audience === "student" ? .5 : .18;
        arrow(from, to, isPrerequisitePath ? colors.prerequisite : isUnlockPath ? colors.unlock : colors.line, edge.strength === "soft");
      }
      for (const item of projected) {
        const statusColor = colors[item.node.status]; const domainColor = DOMAIN_COLOR[item.node.domainKey] ?? colors.current;
        const onPath = pathNodes.has(item.node.key); context.globalAlpha = selected && !onPath && audience === "teacher" ? .48 : 1;
        if (item.node.highlighted) {
          const pulse = reduceMotion ? 5 : 5 + (Math.sin(timestamp / 420) + 1) * 2;
          context.strokeStyle = colors.current; context.lineWidth = 2; context.beginPath(); context.arc(item.x, item.y, item.radius + pulse, 0, Math.PI * 2); context.stroke();
        }
        context.fillStyle = colors.surface; context.beginPath(); context.arc(item.x, item.y, item.radius + 2.5, 0, Math.PI * 2); context.fill();
        context.strokeStyle = domainColor; context.lineWidth = item.node.key === selected?.key ? 3 : 2; context.stroke();
        context.fillStyle = statusColor; context.beginPath(); context.arc(item.x, item.y, item.radius, 0, Math.PI * 2); context.fill();
        if (item.node.key === selected?.key) { context.strokeStyle = colors.ink; context.lineWidth = 1.5; context.stroke(); }
        if (item.node.key === selected?.key || item.node.highlighted || item.node.evidenceCount > 0 || item.node.level === "domain") {
          context.globalAlpha = 1; context.font = `${item.node.key === selected?.key ? 700 : 600} ${compact ? 9 : 10}px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif`;
          context.fillStyle = colors.ink; context.textAlign = "center"; context.fillText(item.node.label, item.x, item.y + item.radius + 14, compact ? 88 : 108);
        }
      }
      context.globalAlpha = 1;
      if (!reduceMotion && displayGraph.nodes.some((node) => node.highlighted)) frame = requestAnimationFrame(draw);
    }

    function redraw() { if (frame) cancelAnimationFrame(frame); frame = 0; draw(); }
    function pointerDown(event: PointerEvent) { canvas.setPointerCapture(event.pointerId); dragStart = { x: event.clientX, y: event.clientY, rotationY, tilt }; }
    function pointerMove(event: PointerEvent) {
      if (!dragStart) return; rotationY = dragStart.rotationY + (event.clientX - dragStart.x) / 260;
      tilt = Math.max(-.08, Math.min(.38, dragStart.tilt + (event.clientY - dragStart.y) / 520)); redraw();
    }
    function pointerUp(event: PointerEvent) {
      if (!dragStart) return; const moved = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y); dragStart = null;
      if (moved < 7) {
        const bounds = canvas.getBoundingClientRect(); const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
        const closest = projectedRef.current.map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) })).sort((a, b) => a.distance - b.distance)[0];
        if (closest && closest.distance <= closest.item.radius + 13) setSelectedKey(closest.item.node.key);
      }
    }
    const observer = new ResizeObserver(redraw); observer.observe(canvas);
    canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("pointercancel", pointerUp); redraw();
    return () => {
      if (frame) cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", pointerUp);
    };
  }, [audience, compact, dimension, displayGraph.edges, displayGraph.nodes, path.prerequisites, path.unlocks, selected]);

  return <section className={`capability-cloud ${compact ? "compact" : ""} ${audience}`}>
    <div className="capability-cloud-heading">
      <div><p>{audience === "student" ? "本次问题 · 应补前置 · 下一步" : "中国课程 · 教材映射 · 本次证据"}</p><h2>{title}</h2></div>
      <div className="capability-toggle" role="group" aria-label="学习图谱维度">
        <button className={dimension === "knowledge" ? "active" : ""} onClick={() => { setDimension("knowledge"); setSelectedKey(""); }}>知识</button>
        <button className={dimension === "skill" ? "active" : ""} onClick={() => { setDimension("skill"); setSelectedKey(""); }}>能力</button>
      </div>
    </div>
    <p className="capability-cloud-hint">{dimension === "knowledge" ? "高度表示年级阶段，横向表示课程领域；实线是关键前置，虚线是支持关系。" : "从基础能力向推理、表达和综合应用逐层连接。"}</p>
    <canvas ref={canvasRef} aria-label={`${title}空间知识网络，可拖动视角并点选节点`} />
    <div className="capability-legend"><span data-status="stable">表现稳定</span><span data-status="developing">正在形成</span><span data-status="attention">需要关注</span><span data-status="insufficient">证据不足</span></div>
    {selected && <div className="capability-selected">
      <div className="capability-selected-title"><div><b>{selected.label}</b><small>{selected.description}</small></div><span className={`capability-status ${selected.status}`}>{STATUS_LABEL[selected.status]}</span></div>
      <div className="capability-path-summary" aria-label="所选知识点学习路径">
        <section data-step="prior"><span>先补</span><p>{shortenPath(prerequisites, "暂无明确前置")}</p></section>
        <section data-step="current"><span>当前</span><p>{selected.label}</p></section>
        <section data-step="next"><span>下一步</span><p>{shortenPath(unlocks, "继续积累证据")}</p></section>
      </div>
      {selected.highlighted && <small className="capability-current-note">本次作业在这里形成了新的改进证据</small>}
      {audience === "teacher" && <details className="capability-evidence"><summary>查看证据与教材定位</summary>
        {!!selected.recentEvidence.length && <div className="capability-question-evidence"><b>近期题目证据</b>{selected.recentEvidence.map((item) => <span key={`${item.assignmentId}-${item.questionNumber}-${item.createdAt}`}>第 {item.questionNumber} 题 · {item.diagnosis || STATUS_LABEL[selected.status]}</span>)}</div>}
        {dimension === "knowledge" && <div className="capability-textbooks"><b>教材版本定位</b><div>{selected.textbookMappings.map((mapping) => <span key={mapping.editionKey}><strong>{mapping.editionLabel}</strong><small>{mapping.grade} 年级 · {mapping.unitLabel}</small></span>)}</div><p>当前为课程框架映射；具体册次与章节需依据教材目录继续校准。</p></div>}
        {!!profile.edges.filter((edge) => edge.sourceKey === selected.key || edge.targetKey === selected.key).length && <div className="capability-edge-reasons"><b>关系依据</b>{profile.edges.filter((edge) => edge.sourceKey === selected.key || edge.targetKey === selected.key).map((edge) => <span key={`${edge.sourceKey}-${edge.targetKey}`}>{edge.reason}</span>)}</div>}
      </details>}
    </div>}
    <details className="capability-list"><summary>查看文字版学习节点</summary><div>{nodes.map((node) => <button key={node.key} className={node.key === selected?.key ? "active" : ""} onClick={() => setSelectedKey(node.key)}><span>{node.label}</span><small>{STATUS_LABEL[node.status]} · {node.evidenceCount} 条证据</small></button>)}</div></details>
  </section>;
}
