import { cropDataUrl } from "./image-tools";
import { hasUsableRecognitionDiagramBox, recognitionDiagramCropOptions } from "./recognition-diagram-rules.mjs";
import type { RecognitionQuestionResult } from "./recognition-contract";
import type { Question } from "./types";

export { shouldReconstructRecognizedDiagram } from "./recognition-diagram-rules.mjs";

export async function extractRecognizedDiagram(image: string, result: Pick<RecognitionQuestionResult, "diagram_bbox" | "diagram_quality" | "warnings">) {
  const warnings = [...result.warnings]; let diagramImage: string | undefined;
  if (hasUsableRecognitionDiagramBox(result.diagram_bbox)) {
    try { diagramImage = await cropDataUrl(image, result.diagram_bbox!, recognitionDiagramCropOptions(result.diagram_quality)); }
    catch { warnings.push("配图自动裁剪失败，请手动框选或重新截图补充"); }
  }
  const fields: Partial<Question> = { diagramImage, diagramSource: diagramImage ? "extracted" : undefined, diagramQuality: result.diagram_quality ?? undefined };
  return { diagramImage, warnings, fields };
}
