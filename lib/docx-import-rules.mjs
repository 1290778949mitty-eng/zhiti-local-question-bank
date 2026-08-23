const OPTION_LABEL = /([A-F])[.．、]\s*/g;

export function isDocxOptionBlock(value) {
  if (typeof value !== "string") return false;
  const match = OPTION_LABEL.exec(value);
  OPTION_LABEL.lastIndex = 0;
  return Boolean(match && value.slice(0, match.index).trim() === "");
}

export function splitDocxOptionBlocks(values) {
  const found = new Map();
  for (const value of values) {
    if (!isDocxOptionBlock(value)) continue;
    const matches = Array.from(value.matchAll(OPTION_LABEL));
    for (let index = 0; index < matches.length; index += 1) {
      const label = matches[index][1];
      const start = (matches[index].index ?? 0) + matches[index][0].length;
      const end = matches[index + 1]?.index ?? value.length;
      const option = value.slice(start, end).trim();
      if (option && !found.has(label)) found.set(label, option);
    }
  }
  return ["A", "B", "C", "D", "E", "F"].flatMap((label) => found.has(label) ? [found.get(label)] : []);
}

export function normalizedDocxPageLookup(value) {
  return String(value ?? "")
    .replace(/\$[^$]*\$/g, "")
    .replace(/[\s\u3000，。；：,.!?！？（）()【】“”‘’．、]/g, "");
}
