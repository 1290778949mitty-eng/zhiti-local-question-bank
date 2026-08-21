import type { ImageLayout, Question } from "./types";
import { automaticQuestionImageLayout } from "./question-presentation-rules.mjs";

const geometrySignals = /(?:△|∠|三角形|四边形|平行四边形|梯形|菱形|正方形|长方形|圆|弧|切线|弦|几何|全等|相似|勾股|线段|垂直|平行)/;

export function questionImages(question: Question) {
  const images = [...(question.contentImages ?? []), ...(question.diagramImage ? [question.diagramImage] : [])];
  return images.filter((image, index) => images.indexOf(image) === index);
}

export function isGeometryQuestion(question: Question) {
  const context = `${question.stem} ${(question.tags ?? []).join(" ")}`;
  return questionImages(question).length === 1 && geometrySignals.test(context);
}

export function resolveQuestionImageLayout(question: Question): ImageLayout {
  const imageCount = questionImages(question).length;
  const paragraphCount = question.stemParagraphs?.filter((paragraph) => paragraph.trim()).length ?? question.stem.split(/\r?\n/).filter((paragraph) => paragraph.trim()).length;
  const automaticLayout = automaticQuestionImageLayout({ imageCount, stemLength: question.stem.length, paragraphCount });
  if (automaticLayout && (question.stemDocxXml?.length || !question.imageLayout)) return automaticLayout;
  if (isGeometryQuestion(question)) return "right";
  return question.imageLayout ?? automaticLayout ?? "right";
}
