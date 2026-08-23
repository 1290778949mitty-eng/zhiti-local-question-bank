import { callAntigravityGemini, type AntigravityResult } from "./antigravity-gemini";
import { recognitionReasoningEffort } from "./recognition-model-rules.mjs";

type UpstreamResult = AntigravityResult;
type RecognitionModelInput = { apiKey: string; prompt: string; image: string; schema: Record<string, unknown>; schemaName: string };

function apiBase() {
  let base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  base = base.replace(/\/(responses|chat\/completions)$/i, "");
  if (!/\/v1$/i.test(base)) base += "/v1";
  return base;
}

function outputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output as Array<{ content?: Array<{ type?: string; text?: string }> }> : [];
  return output.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

async function callResponses(input: RecognitionModelInput): Promise<UpstreamResult> {
  const response = await fetch(`${apiBase()}/responses`, {
    method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || "gemini-3.7-flash", store: false, reasoning: { effort: recognitionReasoningEffort() }, input: [{ role: "user", content: [{ type: "input_text", text: input.prompt }, { type: "input_image", image_url: input.image, detail: "high" }] }], text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } } }),
  });
  const payload = await response.json() as Record<string, unknown> & { error?: { message?: string } };
  return { status: response.status, text: response.ok ? outputText(payload) : undefined, error: payload.error?.message || (!response.ok ? `Responses 请求失败（${response.status}）` : undefined) };
}

async function callChatCompletions(input: RecognitionModelInput): Promise<UpstreamResult> {
  const response = await fetch(`${apiBase()}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || "gemini-3.7-flash", reasoning_effort: recognitionReasoningEffort(), messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, { type: "image_url", image_url: { url: input.image, detail: "high" } }] }], response_format: { type: "json_schema", json_schema: { name: input.schemaName, strict: true, schema: input.schema } } }),
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>; error?: { message?: string } };
  const content = payload.choices?.[0]?.message?.content;
  return { status: response.status, text: response.ok ? typeof content === "string" ? content : content?.find((item) => item.type === "text")?.text : undefined, error: payload.error?.message || (!response.ok ? `Chat Completions 请求失败（${response.status}）` : undefined) };
}

export async function callRecognitionModel(input: RecognitionModelInput): Promise<UpstreamResult> {
  const mode = process.env.OPENAI_API_MODE || "auto";
  if (mode === "antigravity_gemini") return callAntigravityGemini(process.env.OPENAI_BASE_URL || "https://api.openai.com", input.apiKey, process.env.OPENAI_VISION_MODEL || "gemini-3.7-flash", input.prompt, [input.image], input.schema, recognitionReasoningEffort());
  if (mode === "chat_completions") return callChatCompletions(input);
  const first = await callResponses(input);
  if (first.text && first.status < 400) return first;
  const fallback = await callChatCompletions(input);
  if (!fallback.error) fallback.error = first.error;
  return fallback;
}

export function parseRecognitionModelText(text: string) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown;
}
