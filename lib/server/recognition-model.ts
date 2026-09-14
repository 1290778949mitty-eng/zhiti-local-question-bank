import { recognitionReasoningEffort } from "./recognition-model-rules.mjs";
import { callStructuredAi, type AiGatewayResult } from "./ai-gateway";

type RecognitionModelInput = {
  prompt: string;
  image: string;
  schema: Record<string, unknown>;
  schemaName: string;
};

export async function callRecognitionModel(input: RecognitionModelInput): Promise<AiGatewayResult> {
  return callStructuredAi({
    role: "recognition",
    prompt: input.prompt,
    images: [input.image],
    schema: input.schema,
    schemaName: input.schemaName,
    reasoningEffort: recognitionReasoningEffort(),
    missingMessage: "尚未配置智能识别",
    // Answer Studio owns retry/backoff. Preserve the old behavior: do not
    // immediately switch protocol for transient/auth failures in teacher flows.
    stopAutoFallbackStatuses: input.schemaName.startsWith("teacher_")
      ? [401, 403, 408, 429, 500, 502, 503, 504]
      : [],
  });
}

export function parseRecognitionModelText(text: string) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown;
}
