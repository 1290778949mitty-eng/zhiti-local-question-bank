export const AI_PROVIDER_WIRE_APIS = ["auto", "responses", "chat_completions", "antigravity_gemini"];

export function normalizeAiProviderWireApi(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "chat" || normalized === "chat_completions") return "chat_completions";
  if (normalized === "responses") return "responses";
  if (normalized === "antigravity_gemini") return "antigravity_gemini";
  return "auto";
}

export function normalizeAiProviderApiBase(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("AI_PROVIDER_BASE_URL_REQUIRED");
  let url;
  try { url = new URL(raw); }
  catch { throw new Error("AI_PROVIDER_BASE_URL_INVALID"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("AI_PROVIDER_BASE_URL_INVALID");
  url.search = "";
  url.hash = "";
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/(responses|chat\/completions)$/i, "");
  path = path.replace(/\/+$/, "");
  if (!path || path === "/") path = "/v1";
  else if (!/\/v1$/i.test(path)) path += "/v1";
  url.pathname = path;
  return url.toString().replace(/\/$/, "");
}

export function aiProviderModelsUrl(baseUrl) {
  return `${normalizeAiProviderApiBase(baseUrl)}/models`;
}

export function parseAiProviderModelCatalog(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set();
  const models = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const displayNameValue = typeof item.display_name === "string"
      ? item.display_name
      : typeof item.displayName === "string" ? item.displayName : "";
    const displayName = displayNameValue.trim();
    models.push(displayName ? { id, displayName } : { id });
  }
  return models;
}

export function selectAiProviderRoleModel(config, role) {
  const recognition = String(config?.recognitionModel ?? "").trim();
  const text = String(config?.textModel ?? "").trim();
  const diagram = String(config?.diagramModel ?? "").trim();
  const grading = String(config?.gradingModel ?? "").trim();
  if (role === "text") return text || recognition || diagram || grading;
  if (role === "diagram") return diagram || recognition || text || grading;
  if (role === "grading") return grading || recognition || diagram || text;
  return recognition || diagram || text || grading;
}

export function shouldTryAlternateAiProtocol(result) {
  const status = Number(result?.status) || 0;
  const retryAfter = String(result?.retryAfter ?? "").trim();
  if (retryAfter) return false;
  if ([401, 403, 408, 429].includes(status)) return false;
  return [400, 404, 405, 415, 422, 500, 501, 502, 503, 504].includes(status);
}

export function aiProviderAutoProtocolOrder(model) {
  const order = ["responses", "chat_completions"];
  if (/gemini/i.test(String(model ?? "").trim())) order.push("antigravity_gemini");
  return order;
}
