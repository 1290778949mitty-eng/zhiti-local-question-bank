export function recognitionReasoningEffort(value = process.env.OPENAI_RECOGNITION_REASONING_EFFORT || "low") {
  return ["none", "low", "medium", "high", "xhigh", "max"].includes(value) ? value : "low";
}
