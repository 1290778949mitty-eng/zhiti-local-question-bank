export function standaloneWordQuestionImages(question) {
  const candidates = [...(question.contentImages ?? []), ...(question.diagramImage ? [question.diagramImage] : [])];
  const embeddedInRawStem = new Set(Object.values(question.stemDocxAssets ?? {}));
  return candidates.filter((source, index) => candidates.indexOf(source) === index && !embeddedInRawStem.has(source));
}
