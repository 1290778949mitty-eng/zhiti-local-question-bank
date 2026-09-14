"use client";

import { useEffect, useMemo, useState } from "react";

type WireApi = "auto" | "responses" | "chat_completions" | "antigravity_gemini";
type Model = { id: string; displayName?: string };
type ProviderConfig = {
  name: string;
  baseUrl: string;
  wireApi: WireApi;
  modelCatalog: Model[];
  recognitionModel: string;
  textModel: string;
  diagramModel: string;
  gradingModel: string;
  enabled: boolean;
  hasApiKey: boolean;
  updatedAt: number;
};

type Draft = Omit<ProviderConfig, "hasApiKey" | "updatedAt"> & { apiKey: string };

const emptyDraft: Draft = {
  name: "AI Provider",
  baseUrl: "",
  apiKey: "",
  wireApi: "auto",
  modelCatalog: [],
  recognitionModel: "",
  textModel: "",
  diagramModel: "",
  gradingModel: "",
  enabled: true,
};

const pageStyle: React.CSSProperties = { maxWidth: 920, margin: "0 auto", padding: "36px 24px 64px", fontFamily: "system-ui, sans-serif" };
const cardStyle: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 14, padding: 20, marginTop: 18 };
const fieldStyle: React.CSSProperties = { display: "grid", gap: 7, marginTop: 14 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #bbb", borderRadius: 8, fontSize: 14 };
const buttonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 650 };

export default function AiSettingsPage() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [environmentFallback, setEnvironmentFallback] = useState<{ configured?: boolean; baseUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manualModel, setManualModel] = useState("");

  const modelOptions = useMemo(() => draft.modelCatalog, [draft.modelCatalog]);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/ai-provider", { cache: "no-store" });
      const payload = await response.json() as { config?: ProviderConfig | null; environmentFallback?: { configured?: boolean; baseUrl?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "读取 AI Provider 配置失败");
      if (payload.config) {
        const { hasApiKey, updatedAt: _updatedAt, ...config } = payload.config;
        setDraft({ ...config, apiKey: "" });
        setHasSavedKey(hasApiKey);
      }
      setEnvironmentFallback(payload.environmentFallback ?? null);
    } catch (value) {
      setError(value instanceof Error ? value.message : "读取失败");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function fetchModels() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/ai-provider/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: draft.baseUrl, apiKey: draft.apiKey }),
      });
      const payload = await response.json() as { models?: Model[]; latencyMs?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "获取模型失败");
      const models = payload.models ?? [];
      setDraft((current) => ({ ...current, modelCatalog: models }));
      setNotice(`已从上游获取 ${models.length} 个模型${typeof payload.latencyMs === "number" ? ` · ${payload.latencyMs} ms` : ""}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "获取模型失败");
    } finally { setBusy(false); }
  }

  function addManualModel() {
    const id = manualModel.trim();
    if (!id) return;
    setDraft((current) => current.modelCatalog.some((item) => item.id.toLowerCase() === id.toLowerCase())
      ? current
      : { ...current, modelCatalog: [...current.modelCatalog, { id }] });
    setManualModel("");
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/ai-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json() as { config?: ProviderConfig; error?: string };
      if (!response.ok || !payload.config) throw new Error(payload.error || "保存失败");
      const { hasApiKey, updatedAt: _updatedAt, ...config } = payload.config;
      setDraft({ ...config, apiKey: "" });
      setHasSavedKey(hasApiKey);
      setNotice("AI Provider 已保存。后续 AI 请求将优先使用这里的配置。");
    } catch (value) {
      setError(value instanceof Error ? value.message : "保存失败");
    } finally { setBusy(false); }
  }

  const modelSelect = (label: string, key: "recognitionModel" | "textModel" | "diagramModel" | "gradingModel") => (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select style={inputStyle} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}>
        <option value="">自动回退到其他已选模型</option>
        {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.displayName ? `${model.displayName} · ${model.id}` : model.id}</option>)}
      </select>
    </label>
  );

  return <main style={pageStyle}>
    <a href="/" style={{ textDecoration: "none" }}>← 返回题库</a>
    <h1 style={{ marginBottom: 6 }}>AI Provider</h1>
    <p style={{ color: "#666", marginTop: 0 }}>管理员统一配置中转站并从上游拉取模型。API Key 只发送到本站 Worker，不会从保存接口返回浏览器。</p>

    {loading ? <p>正在读取配置…</p> : <>
      <section style={cardStyle}>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
          启用数据库中的 Provider 配置
        </label>
        <label style={fieldStyle}><span>名称</span><input style={inputStyle} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：灵算 / Sub2API / OpenRouter" /></label>
        <label style={fieldStyle}><span>Base URL</span><input style={inputStyle} value={draft.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://relay.example.com/v1" /></label>
        <label style={fieldStyle}><span>API Key</span><input style={inputStyle} type="password" autoComplete="off" value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={hasSavedKey ? "已保存密钥；留空表示保持不变" : "sk-..."} /></label>
        <label style={fieldStyle}><span>API 协议</span><select style={inputStyle} value={draft.wireApi} onChange={(event) => setDraft((current) => ({ ...current, wireApi: event.target.value as WireApi }))}><option value="auto">自动：Responses → Chat Completions</option><option value="responses">Responses</option><option value="chat_completions">Chat Completions</option><option value="antigravity_gemini">Antigravity Gemini</option></select></label>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}><button style={{ ...buttonStyle, background: "#eee" }} disabled={busy || !draft.baseUrl.trim()} onClick={() => void fetchModels()}>{busy ? "处理中…" : "获取上游模型"}</button></div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>模型目录 <small style={{ fontSize: 14, color: "#777" }}>({draft.modelCatalog.length})</small></h2>
        <div style={{ display: "flex", gap: 8 }}><input style={inputStyle} value={manualModel} onChange={(event) => setManualModel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualModel(); } }} placeholder="上游不提供 /models 时，可手动添加模型 ID" /><button style={{ ...buttonStyle, background: "#eee", flexShrink: 0 }} onClick={addManualModel}>添加</button></div>
        {draft.modelCatalog.length > 0 && <div style={{ maxHeight: 180, overflow: "auto", marginTop: 12, border: "1px solid #eee", borderRadius: 8, padding: 10 }}>{draft.modelCatalog.map((model) => <div key={model.id} style={{ padding: "4px 2px", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{model.id}</div>)}</div>}
        {modelSelect("截图 / 文件识题", "recognitionModel")}
        {modelSelect("文字优化 / 解析", "textModel")}
        {modelSelect("几何图重绘", "diagramModel")}
        {modelSelect("作业批改", "gradingModel")}
      </section>

      <section style={cardStyle}>
        <strong>兼容回退：</strong>{environmentFallback?.configured ? ` 已检测到环境变量 Provider（${environmentFallback.baseUrl || "已配置"}）` : " 未检测到 OPENAI_API_KEY"}。当上面的 Provider 未配置或停用时，系统继续使用原有 `.env.local` / Cloudflare Secret。
      </section>

      {error && <p style={{ color: "#b42318", fontWeight: 650 }}>{error}</p>}
      {notice && <p style={{ color: "#067647", fontWeight: 650 }}>{notice}</p>}
      <button style={{ ...buttonStyle, marginTop: 18, background: "#111", color: "white", minWidth: 140 }} disabled={busy || !draft.baseUrl.trim() || (!hasSavedKey && !draft.apiKey.trim())} onClick={() => void save()}>{busy ? "保存中…" : "保存配置"}</button>
    </>}
  </main>;
}
