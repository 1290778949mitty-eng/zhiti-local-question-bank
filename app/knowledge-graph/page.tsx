"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta currently breaks next/link RSC prefetch on these client-only pages. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { homeworkApi } from "../../lib/homework-api-client";
import type { AuthUser, StudentCapabilityProfile, StudentSummary } from "../../lib/types";
import KnowledgeGraphStudio, { studioDimensionLabel, studioDomainColor, studioDomainLabel, type StudioDomainFilter, type StudioGradeFilter, type StudioGraphMode } from "../components/KnowledgeGraphStudio";
type ColorTheme = "light" | "dark";

export default function KnowledgeGraphPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentId, setStudentId] = useState("");
  const [profile, setProfile] = useState<StudentCapabilityProfile | null>(null);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("light");
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [graphMode, setGraphMode] = useState<StudioGraphMode>("knowledge");
  const [gradeFilter, setGradeFilter] = useState<StudioGradeFilter>("all");
  const [domainFilter, setDomainFilter] = useState<StudioDomainFilter>("all");
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [extensionOpen, setExtensionOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setColorTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
      void homeworkApi.me().then(async ({ user: currentUser }) => {
        setUser(currentUser);
        if (!currentUser) return;
        const [studentData, graphData] = await Promise.all([homeworkApi.students(), homeworkApi.knowledgeGraph()]);
        setStudents(studentData.students);
        setProfile(graphData.profile);
      }).catch((error) => setNotice(error instanceof Error ? error.message : "知识图谱读取失败")).finally(() => setLoading(false));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const selectedStudent = students.find((student) => student.id === studentId) ?? null;
  const graphNodes = useMemo(() => {
    const dimension = graphMode === "capability" ? "skill" : "knowledge";
    return profile?.nodes.filter((node) => node.dimension === dimension) ?? [];
  }, [graphMode, profile]);
  const domainOptions = useMemo(() => [...new Map(graphNodes.map((node) => {
    const key = graphMode === "knowledge" ? node.domainKey : node.key;
    return [key, graphMode === "knowledge" ? studioDomainLabel(key) : node.label];
  }))], [graphMode, graphNodes]);
  const visibleGraphNodes = useMemo(() => graphNodes.filter((node) => {
    if (graphMode === "knowledge" && gradeFilter !== "all" && node.stage !== gradeFilter) return false;
    if (domainFilter !== "all" && nodeDomainKey(node, graphMode) !== domainFilter) return false;
    if (evidenceOnly && node.evidenceCount === 0) return false;
    return true;
  }), [domainFilter, evidenceOnly, gradeFilter, graphMode, graphNodes]);
  const selectedNode = visibleGraphNodes.find((node) => node.key === selectedKey) ?? visibleGraphNodes.find((node) => node.highlighted) ?? visibleGraphNodes[0] ?? null;
  const selectedPrerequisites = selectedNode ? profile?.edges.filter((edge) => edge.targetKey === selectedNode.key).map((edge) => profile.nodes.find((node) => node.key === edge.sourceKey)?.label).filter(Boolean) ?? [] : [];
  const selectedUnlocks = selectedNode ? profile?.edges.filter((edge) => edge.sourceKey === selectedNode.key).map((edge) => profile.nodes.find((node) => node.key === edge.targetKey)?.label).filter(Boolean) ?? [] : [];
  const summary = useMemo(() => {
    const knowledgeNodes = profile?.nodes.filter((node) => node.dimension === "knowledge") ?? [];
    return {
      nodes: knowledgeNodes.length,
      edges: profile?.edges.filter((edge) => edge.sourceKey.startsWith("cn-math:") && edge.targetKey.startsWith("cn-math:")).length ?? 0,
      active: knowledgeNodes.filter((node) => node.evidenceCount > 0).length,
    };
  }, [profile]);

  function chooseColorTheme(theme: ColorTheme) {
    setColorTheme(theme);
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("mitty-color-theme", theme); } catch { /* 仅保留本次切换 */ }
  }

  const handleSelect = useCallback((key: string) => setSelectedKey(key), []);
  function chooseGraphMode(nextMode: StudioGraphMode) {
    setGraphMode(nextMode); setGradeFilter("all"); setDomainFilter("all"); setSelectedKey("");
  }

  async function chooseStudent(nextStudentId: string) {
    setStudentId(nextStudentId);
    setProfileLoading(true);
    setNotice("");
    try {
      setProfile((await homeworkApi.knowledgeGraph(nextStudentId)).profile);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "学生图谱读取失败");
    } finally { setProfileLoading(false); }
  }

  if (loading) return <main className="knowledge-graph-loading">正在打开知识图谱…</main>;
  if (!user) return <main className="knowledge-graph-loading"><h1>请先登录教师账号</h1><a href="/">返回题库登录</a></main>;

  return <main className="graph-studio-shell">
    <header className="graph-studio-topbar">
      <a className="graph-studio-brand" href="/"><span>题</span><div><b>MITTY</b><small>CURRICULUM LAB</small></div></a>
      <a className="graph-studio-back" href="/" aria-label="返回题库"><span aria-hidden="true">←</span><b>返回题库</b></a>
      <div className="graph-studio-breadcrumb"><span>知识图谱</span><i>/</i><b>{selectedStudent ? selectedStudent.name : "中国数学 V1"}</b></div>
      <div className="graph-studio-account"><div className="theme-switch" role="group" aria-label="显示模式"><button className={colorTheme === "light" ? "active" : ""} aria-label="浅色模式" aria-pressed={colorTheme === "light"} onClick={() => chooseColorTheme("light")}><span aria-hidden="true">☀</span><b>浅色</b></button><button className={colorTheme === "dark" ? "active" : ""} aria-label="深色模式" aria-pressed={colorTheme === "dark"} onClick={() => chooseColorTheme("dark")}><span aria-hidden="true">☾</span><b>深色</b></button></div><a href="/homework">作业中心</a></div>
    </header>

    <section className="graph-studio-body">
      <aside className="graph-studio-intro">
        <div className="graph-studio-kicker"><i></i> OPEN CURRICULUM / V1</div>
        <h1>每一个知识点，<br /><em>都有一条来路。</em></h1>
        <p>把中国初中数学课程拆成可连接、可追踪、可持续扩展的学习节点。点选任意节点，沿着前置关系回到最需要补上的地方。</p>
        <div className="graph-studio-rule"></div>
        <div className="graph-studio-stat-grid"><span><b>{summary.nodes}</b><small>KNOWLEDGE NODES</small></span><span><b>{summary.edges}</b><small>PREREQUISITE LINKS</small></span><span><b>{profile?.textbookEditions.length ?? 0}</b><small>TEXTBOOK LAYERS</small></span><span><b>{summary.active}</b><small>ACTIVE EVIDENCE</small></span></div>
        <button className="graph-studio-expand" onClick={() => setExtensionOpen(true)}><span>＋</span> 扩展图谱框架 <i>↗</i></button>
        <div className="graph-studio-credit">数据框架 · 中国初中数学课程 V1<br />人教版 / 北师大版 / 苏教版 · 章节持续校准中</div>
      </aside>

      <section className="graph-studio-stage" aria-label="知识图谱工作台">
        <div className="graph-studio-stage-head"><div><span>LIVE GRAPH / {profile?.frameworkVersion ?? "CN-MATH-V1"}</span><b>{selectedStudent ? `${selectedStudent.name} · 累计学习证据` : "课程骨架 · 可继续搭建"}</b></div><label>查看对象<select value={studentId} onChange={(event) => void chooseStudent(event.target.value)} disabled={profileLoading}><option value="">完整课程框架</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.className ? ` · ${student.className}` : ""}</option>)}</select></label></div>
        <div className="graph-studio-stage-toolbar"><div className="graph-studio-mode-tabs" role="tablist" aria-label="图谱层级"><button role="tab" aria-selected={graphMode === "knowledge"} className={graphMode === "knowledge" ? "active" : ""} onClick={() => chooseGraphMode("knowledge")}>知识节点</button><button role="tab" aria-selected={graphMode === "capability"} className={graphMode === "capability" ? "active" : ""} onClick={() => chooseGraphMode("capability")}>核心能力</button></div><span className="graph-studio-live-dot"><i></i> 可交互</span></div>
        {notice && <div className="graph-studio-notice" role="status">{notice}</div>}
        {profileLoading || !profile ? <div className="graph-studio-loading">正在同步图谱…</div> : <KnowledgeGraphStudio profile={profile} mode={graphMode} gradeFilter={gradeFilter} domainFilter={domainFilter} evidenceOnly={evidenceOnly} selectedKey={selectedNode?.key ?? ""} onSelect={handleSelect} />}
      </section>

      <aside className="graph-studio-controls">
        <div className="graph-studio-panel-head"><span>GRAPH CONTROLS</span><b>探索选项</b></div>
        <div className="graph-studio-control-label"><span>年级层级</span><div className="graph-studio-segmented"><button className={gradeFilter === "all" ? "active" : ""} onClick={() => { setGradeFilter("all"); setSelectedKey(""); }}>全部</button><button className={gradeFilter === 7 ? "active" : ""} onClick={() => { setGradeFilter(7); setSelectedKey(""); }}>七</button><button className={gradeFilter === 8 ? "active" : ""} onClick={() => { setGradeFilter(8); setSelectedKey(""); }}>八</button><button className={gradeFilter === 9 ? "active" : ""} onClick={() => { setGradeFilter(9); setSelectedKey(""); }}>九</button></div></div>
        <div className="graph-studio-control-label"><label htmlFor="graph-domain-filter">课程领域</label><select id="graph-domain-filter" value={domainFilter} onChange={(event) => { setDomainFilter(event.target.value); setSelectedKey(""); }}><option value="all">全部领域</option>{domainOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="graph-studio-check"><input id="graph-evidence-only" aria-label="只看已有证据" type="checkbox" checked={evidenceOnly} onChange={(event) => { setEvidenceOnly(event.target.checked); setSelectedKey(""); }} /><span><b>只看已有证据</b><small>隐藏尚未产生作业记录的节点</small></span></div>
        <div className="graph-studio-control-divider"></div>
        <div className="graph-studio-legend"><span>节点状态</span><p><i className="stable"></i>表现稳定</p><p><i className="developing"></i>正在形成</p><p><i className="attention"></i>需要关注</p><p><i className="insufficient"></i>证据不足</p></div>
        <div className="graph-studio-palette"><span>领域色彩</span>{domainOptions.map(([key, label]) => <p key={key}><i style={{ background: studioDomainColor(graphNodes.find((node) => nodeDomainKey(node, graphMode) === key) ?? graphNodes[0]!) }}></i>{label}</p>)}</div>
        <div className="graph-studio-control-note">围绕画面中心旋转 · 拖动方向与旋转方向一致<br />点击节点查看它的学习路径</div>
      </aside>
    </section>

    {selectedNode && <section className="graph-studio-selected"><div className="graph-studio-selected-index"><span>SELECTED NODE</span><b>{selectedNode.level === "domain" ? "DOMAIN" : graphMode === "capability" ? "CAPABILITY" : "TOPIC"}</b></div><div className="graph-studio-selected-main"><div><p>{graphMode === "knowledge" ? `${studioDomainLabel(selectedNode.domainKey)} · ${selectedNode.stage ? `${selectedNode.stage}年级层` : "课程层"}` : `${studioDimensionLabel("skill")} · 能力层`}</p><h2>{selectedNode.label}</h2><span>{selectedNode.description}</span></div><div className={`graph-studio-status ${selectedNode.status}`}><i></i>{selectedNode.status === "stable" ? "表现稳定" : selectedNode.status === "developing" ? "正在形成" : selectedNode.status === "attention" ? "需要关注" : "证据不足"}<small>{selectedNode.evidenceCount} 条证据</small></div></div><div className="graph-studio-selected-path"><div><span>PREREQUISITES · 前置</span><b>{selectedPrerequisites.length ? selectedPrerequisites.slice(0, 3).join("、") : "暂无明确前置"}</b></div><i>→</i><div className="current"><span>CURRENT · 当前节点</span><b>{selectedNode.label}</b></div><i>→</i><div><span>UNLOCKS · 后续</span><b>{selectedUnlocks.length ? selectedUnlocks.slice(0, 3).join("、") : "继续积累证据"}</b></div></div></section>}

    {extensionOpen && <div className="graph-studio-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExtensionOpen(false); }}><aside className="graph-studio-drawer" role="dialog" aria-modal="true" aria-labelledby="graph-studio-drawer-title"><div className="graph-studio-drawer-head"><div><span>FRAMEWORK BUILDER</span><h2 id="graph-studio-drawer-title">扩展图谱框架</h2></div><button onClick={() => setExtensionOpen(false)} aria-label="关闭扩展框架">×</button></div><p className="graph-studio-drawer-intro">这里预留后续搭建中国课程知识图谱的入口。当前 V1 先固定稳定的节点与关系，后续可以在这里继续补充。</p><div className="graph-studio-builder-grid"><button><b>＋</b><span>新增知识节点</span><small>名称 · 年级 · 领域 · 描述</small></button><button><b>⌁</b><span>建立前置关系</span><small>前置 · 支持 · 关系说明</small></button><button><b>◈</b><span>教材章节映射</span><small>人教 · 北师大 · 苏教</small></button><button><b>✦</b><span>能力证据规则</span><small>题目 · 判定 · 能力层</small></button></div><div className="graph-studio-schema"><span>DATA MODEL / READY TO EXTEND</span><code>node → prerequisite → evidence → profile</code><p>节点 ID、DAG 关系和作业证据已经分层保存。未来增加教材或学段时，不需要重做学生历史记录。</p></div><button className="graph-studio-drawer-close" onClick={() => setExtensionOpen(false)}>知道了</button></aside></div>}
  </main>;
}

function nodeDomainKey(node: StudentCapabilityProfile["nodes"][number], mode: StudioGraphMode) { return mode === "knowledge" ? node.domainKey : node.key; }
