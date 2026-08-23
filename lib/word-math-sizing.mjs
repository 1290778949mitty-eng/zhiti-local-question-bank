const NESTED_FRACTION_SIZE = 26;
const DEEP_FRACTION_SIZE = 30;

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

function addMathRunSize(runXml, size) {
  if (/<w:sz\b/.test(runXml)) return runXml;
  const sizeXml = `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
  if (/<w:rPr\b[^>]*\/>/.test(runXml)) return runXml.replace(/<w:rPr\b[^>]*\/>/, `<w:rPr>${sizeXml}</w:rPr>`);
  if (/<w:rPr\b[^>]*>/.test(runXml)) return runXml.replace(/<\/w:rPr>/, `${sizeXml}</w:rPr>`);
  const properties = `<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return runXml.replace(/^(<m:r\b[^>]*>)/, `$1${properties}`);
}

function mathControlProperties(size) {
  return `<m:ctrlPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:eastAsia="Songti SC"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></m:ctrlPr>`;
}

function addFractionControlSizes(equationXml, size) {
  if (/<m:fPr\b/.test(equationXml)) return equationXml;
  const controls = mathControlProperties(size);
  return equationXml
    .replace(/<m:f>/g, `<m:f><m:fPr><m:type m:val="bar"/>${controls}</m:fPr>`)
    .replace(/<\/m:num>/g, `${controls}</m:num>`)
    .replace(/<\/m:den>/g, `${controls}</m:den>`);
}

export function enlargeNestedWordMath(documentXml) {
  return documentXml.replace(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g, (equationXml) => {
    const depth = wordMathFractionDepth(equationXml);
    // Imported Word equations may already carry deliberate fraction formatting.
    if (depth < 2 || /<m:fPr\b/.test(equationXml)) return equationXml;
    const size = depth >= 3 ? DEEP_FRACTION_SIZE : NESTED_FRACTION_SIZE;
    const sizedRuns = equationXml.replace(/<m:r\b[^>]*>[\s\S]*?<\/m:r>/g, (runXml) => addMathRunSize(runXml, size));
    return addFractionControlSizes(sizedRuns, size);
  });
}
