import {
  aiProviderAutoProtocolOrder,
  normalizeAiProviderApiBase,
  shouldTryAlternateAiProtocol,
  type AiProviderRole,
  type AiProviderWireApi,
} from "../ai-provider-rules.mjs";
import { callAntigravityGemini, type AntigravityResult } from "./antigravity-gemini";
import { resolveAiRuntime, type AiRuntime } from "./ai-provider";

export type StructuredAiInput = {
  role: AiProviderRole;
  prompt: string;
  images?: string[];
  schema: Record<string, unknown>;
  schemaName: string;
  reasoningEffort?: string;
  missingMessage?: string;
  stopAutoFallbackStatuses?: number[];
};

export type AiGatewayResult = AntigravityResult;
type ConcreteWireApi = Exclude<AiProviderWireApi, "auto">;

function outputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output)
    ? payload.output as Array<{ content?: Array<{ type?: string; text?: string }> }>
    : [];
  return output.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

async function readJson(response: Response) {
  const raw = await response.text();
  try { return { payload: JSON.parse(raw) as Record<string, unknown>, parseError: undefined }; }
  catch { return { payload: {} as Record<string, unknown>, parseError: `中转站返回了非 JSON 响应（HTTP ${response.status}）` }; }
}

async function callResponses(runtime: AiRuntime, input: StructuredAiInput): Promise<AiGatewayResult> {
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: input.prompt }];
  for (const image of input.images ?? []) content.push({ type: "input_image", image_url: image, detail: "high" });
  const response = await fetch(`${normalizeAiProviderApiBase(runtime.baseUrl)}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${runtime.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtime.model,
      store: false,
      reasoning: { effort: input.reasoningEffort || "high" },
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } },
    }),
  });
  const retryAfter = response.headers.get("retry-after");
  const { payload, parseError } = await readJson(response);
  const upstreamError = payload.error as { message?: string } | undefined;
  return {
    status: response.status,
    retryAfter,
    text: response.ok && !parseError ? outputText(payload) : undefined,
    error: parseError || upstreamError?.message || (!response.ok ? `Responses 请求失败（${response.status}）` : undefined),
  };
}

async function callChatCompletions(runtime: AiRuntime, input: StructuredAiInput): Promise<AiGatewayResult> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
  for (const image of input.images ?? []) content.push({ type: "image_url", image_url: { url: image, detail: "high" } });
  const response = await fetch(`${normalizeAiProviderApiBase(runtime.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${runtime.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtime.model,
      reasoning_effort: input.reasoningEffort || "high",
      messages: [{ role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name: input.schemaName, strict: true, schema: input.schema } },
    }),
  });
  const retryAfter = response.headers.get("retry-after");
  const { payload: rawPayload, parseError } = await readJson(response);
  const payload = rawPayload as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>; error?: { message?: string } };
  const message = payload.choices?.[0]?.message?.content;
  const text = typeof message === "string" ? message : message?.find((item) => item.type === "text")?.text;
  return {
    status: response.status,
    retryAfter,
    text: response.ok && !parseError ? text : undefined,
    error: parseError || payload.error?.message || (!response.ok ? `Chat Completions 请求失败（${response.status}）` : undefined),
  };
}

async function callProtocol(protocol: ConcreteWireApi, runtime: AiRuntime, input: StructuredAiInput): Promise<AiGatewayResult> {
  if (protocol === "responses") return callResponses(runtime, input);
  if (protocol === "chat_completions") return callChatCompletions(runtime, input);
  return callAntigravityGemini(
    runtime.baseUrl,
    runtime.apiKey,
    runtime.model,
    input.prompt,
    input.images ?? [],
    input.schema,
    input.reasoningEffort || "high",
  );
}

function protocolLabel(protocol: ConcreteWireApi) {
  if (protocol === "responses") return "Responses";
  if (protocol === "chat_completions") return "Chat Completions";
  return "Antigravity Gemini";
}

export async function callStructuredAi(input: StructuredAiInput): Promise<AiGatewayResult> {
  const runtime = await resolveAiRuntime(input.role);
  if (!runtime) return { status: 503, error: input.missingMessage || "尚未配置 AI Provider" };
  if (runtime.wireApi !== "auto") return callProtocol(runtime.wireApi, runtime, input);

  const failures: string[] = [];
  let lastResult: AiGatewayResult = { status: 502, error: "AI Provider 自动协议没有返回结果" };
  for (const protocol of aiProviderAutoProtocolOrder(runtime.model)) {
    const result = await callProtocol(protocol, runtime, input);
    lastResult = result;
    if (result.text && result.status < 400) return result;
    failures.push(`${protocolLabel(protocol)}: ${result.error || `HTTP ${result.status}`}`);
    if ((input.stopAutoFallbackStatuses ?? []).includes(result.status)) return result;
    if (!shouldTryAlternateAiProtocol(result)) return result;
  }
  return {
    ...lastResult,
    error: `${runtime.providerName} / ${runtime.model} 自动协议均失败：${failures.join("；")}`,
  };
}
