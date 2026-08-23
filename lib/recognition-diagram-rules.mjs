import { correctionForCapturedRotation, isPhotographedDiagram } from "./image-processing-rules.mjs";
import { shouldAutoVectorizeDiagram } from "./vector-diagram-reconstruction.mjs";

export const MIN_RECOGNITION_DIAGRAM_EDGE = 20;

export function hasUsableRecognitionDiagramBox(box) {
  return Boolean(box && box.width >= MIN_RECOGNITION_DIAGRAM_EDGE && box.height >= MIN_RECOGNITION_DIAGRAM_EDGE);
}

export function recognitionDiagramCropOptions(quality) {
  return {
    photographed: isPhotographedDiagram(quality),
    rotation: correctionForCapturedRotation(quality?.rotation),
    kind: quality?.kind,
  };
}

export function shouldReconstructRecognizedDiagram(diagramImage, quality, enabled = true) {
  return Boolean(enabled && diagramImage && shouldAutoVectorizeDiagram(quality));
}
