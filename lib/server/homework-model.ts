import { callAntigravityGemini, type AntigravityResult } from "./antigravity-gemini";
import { recognitionReasoningEffort } from "./recognition-model-rules.mjs";

type ModelInput = { apiKey: string; prompt: string; images: string[]; schema: Record<string, unknown>; schemaName: string };
type ModelResult = AntigravityResult;

function apiBase() {
  let base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  base = base.replace(/\/(responses|chat\/completions)$/i, "");
  if (!/\/v1$/i.test(base)) base += "/v1";
  return base;
}

function modelName() { return process.env.HOMEWORK_GRADING_MODEL || process.env.OPENAI_VISION_MODEL || "gemini-3.7-flash"; }

function outputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output as Array<{ content?: Array<{ type?: string; text?: string }> }> : [];
  return output.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

async function callResponses(input: ModelInput): Promise<ModelResult> {
  const response = await fetch(`${apiBase()}/responses`, { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
    model: modelName(), store: false, reasoning: { effort: recognitionReasoningEffort() }, input: [{ role: "user", content: [
      { type: "input_text", text: input.prompt }, ...input.images.map((image) => ({ type: "input_image", image_url: image, detail: "high" })),
    ] }], text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } },
  }) });
  const payload = await response.json() as Record<string, unknown> & { error?: { message?: string } };
  return { status: response.status, text: response.ok ? outputText(payload) : undefined, error: payload.error?.message || (!response.ok ? `Responses 请求失败（${response.status}）` : undefined) };
}

async function callChat(input: ModelInput): Promise<ModelResult> {
  const response = await fetch(`${apiBase()}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
    model: modelName(), reasoning_effort: recognitionReasoningEffort(), messages: [{ role: "user", content: [
      { type: "text", text: input.prompt }, ...input.images.map((image) => ({ type: "image_url", image_url: { url: image, detail: "high" } })),
    ] }], response_format: { type: "json_schema", json_schema: { name: input.schemaName, strict: true, schema: input.schema } },
  }) });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>; error?: { message?: string } };
  const content = payload.choices?.[0]?.message?.content;
  return { status: response.status, text: response.ok ? typeof content === "string" ? content : content?.find((item) => item.type === "text")?.text : undefined, error: payload.error?.message || (!response.ok ? `Chat Completions 请求失败（${response.status}）` : undefined) };
}

export async function callHomeworkModel(input: ModelInput): Promise<ModelResult> {
  const mode = process.env.OPENAI_API_MODE || "auto";
  if (mode === "antigravity_gemini") return callAntigravityGemini(process.env.OPENAI_BASE_URL || "https://api.openai.com", input.apiKey, modelName(), input.prompt, input.images, input.schema, recognitionReasoningEffort());
  if (mode === "chat_completions") return callChat(input);
  if (mode === "responses") return callResponses(input);
  const first = await callResponses(input);
  if (first.text && first.status < 400) return first;
  const fallback = await callChat(input); if (!fallback.error) fallback.error = first.error; return fallback;
}

export function parseHomeworkModelText(value: string) {
  return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown;
}
