const WORD_MATH_PROPERTIES = `<m:mathPr><m:mathFont m:val="Cambria Math"/><m:brkBin m:val="before"/><m:brkBinSub m:val="--"/><m:smallFrac m:val="off"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/><m:defJc m:val="centerGroup"/><m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr>`;

export function ensureWordMathSettings(settingsXml) {
  if (/<m:mathPr\b/.test(settingsXml)) {
    if (/<m:smallFrac\b/.test(settingsXml)) return settingsXml.replace(/<m:smallFrac\b[^>]*\/?\s*>/, '<m:smallFrac m:val="off"/>');
    return settingsXml.replace(/<\/m:mathPr>/, '<m:smallFrac m:val="off"/></m:mathPr>');
  }
  return settingsXml.replace(/<\/w:settings>/, `${WORD_MATH_PROPERTIES}</w:settings>`);
}

export function wordMathFractionDepth(equationXml) {
  let depth = 0; let maximum = 0;
  for (const match of equationXml.matchAll(/<\/?m:f(?:\s[^>]*)?>/g)) {
    if (match[0].startsWith("</")) depth = Math.max(0, depth - 1);
    else { depth += 1; maximum = Math.max(maximum, depth); }
  }
  return maximum;
}

/** @deprecated Compatibility entry point; no longer changes equation sizes.
 * Equations inherit their paragraph's base font size. Word itself lays out
 * fractions and scripts; do not inject 26/30 half-point runs or controls based
 * on nesting depth. Original imported OMML remains untouched as well.
 */
export function enlargeNestedWordMath(documentXml) {
  return documentXml;
}
