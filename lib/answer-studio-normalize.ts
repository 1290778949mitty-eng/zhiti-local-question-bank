import { hasStudioControlCharacters, type StudioAnswerPlacement, type StudioTable } from './answer-studio';

// A model may emit a valid JSON escape (e.g. \t) instead of the LaTeX
// backslash. Repair only unambiguous command suffixes inside explicit math;
// never reinterpret ordinary prose whitespace or guess mathematical content.
export function normalizeStudioMathEscapes(text: string) {
  return text.replace(/\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\([\s\S]*?\\\)/g, math => {
    const repaired=math
    .replace(/\\*nequiv\b/g, '\\parallel')
    .replace(/\\*\triangle\b/g, '\\triangle')
    .replace(/\\*\t(ext|imes|heta|frac)\b/g, '\\t$1')
    .replace(/\\*\f(rac)\b/g, '\\f$1')
    // eslint-disable-next-line no-control-regex -- Repair JSON backspace escapes, not word boundaries.
    .replace(/\\*\x08(ecause|eta|egin|ot|igodot)\b/g, '\\b$1')
    .replace(/\\*\r(ight)\b/g, '\\r$1')
    .replace(/\\*\n(eq)\b/g, '\\n$1');
    // In a standalone formula, a doubled command escape is JSON damage, not
    // a literal backslash followed by letters. Never decode environment row
    // separators or text arguments (which can legitimately contain slashes).
    // Detect environments after repairing a possibly damaged \begin escape.
    const cleaned=repaired.replace(/\\+\s*(?=\$)/g, '').replace(/\\+\s*$/, '');
    if (/\\+(?:begin|end|text|textrm|operatorname)\b/.test(cleaned)) return cleaned;
    // Collapse any number of duplicated command slashes. Environment row
    // separators are deliberately excluded above because `\\\\x` is data,
    // not a duplicated `\\x` command in that context.
    return cleaned.replace(/\\{2,}(?=[A-Za-z])/g, '\\');
  });
}

function validPlacement(value:unknown):value is StudioAnswerPlacement {
  if(!value||typeof value!=='object')return false;
  const p=value as Record<string,unknown>;
  return (p.kind==='choice'||p.kind==='blank')&&typeof p.placeholder==='string'&&!!p.placeholder.trim()&&typeof p.answer==='string'&&!!p.answer.trim();
}

/** Placement is optional layout metadata, never a reason to discard a page.
 * If one entry is unusable, decline the whole mapping to avoid shifting the
 * remaining answers into the wrong slots. Preserve recoverable literal answers
 * in the analysis instead, without guessing a placeholder or solving anything.
 */
function normalizeAnswerPlacements(value:unknown,analysis:string) {
  if(value==null)return {analysis,answerPlacements:[] as StudioAnswerPlacement[],warnings:[] as string[]};
  if(Array.isArray(value)&&value.every(validPlacement))return {analysis,answerPlacements:value,warnings:[] as string[]};
  const entries=Array.isArray(value)?value:[value];
  const answers=entries.flatMap(entry=>{
    const answer=entry&&typeof entry==='object'?(entry as Record<string,unknown>).answer:entry;
    if(typeof answer==='string'&&answer.trim())return [answer];
    if(typeof answer==='number'&&Number.isFinite(answer))return [String(answer)];
    return [];
  });
  // Compare whole lines, not substrings: answer "1" is not already recorded
  // merely because the proof contains a subpart number "(1)" or the value 10.
  const lines=new Set(analysis.split(/\r?\n/).map(line=>line.trim()));
  const extra=answers.filter(answer=>!lines.has(answer.trim()));
  return {
    analysis:[analysis,...extra].filter(text=>text.trim()).join('\n'),
    answerPlacements:[] as StudioAnswerPlacement[],
    warnings:[answers.length?'短答案填入位置不明确，已保留在解析中，未自动回填原题':'短答案信息不完整，原有解析已保留，请在 Word 中对照原件确认'],
  };
}

export function normalizeStudioTextFields<T extends {stem:string;analysis:string;warnings:string[];answerPlacements?:unknown}>(record:T) {
  const placement=normalizeAnswerPlacements(record.answerPlacements,record.analysis);
  const stem=normalizeStudioMathEscapes(record.stem),analysis=normalizeStudioMathEscapes(placement.analysis);
  const answerPlacements=placement.answerPlacements.map(p=>({...p,placeholder:normalizeStudioMathEscapes(p.placeholder),answer:normalizeStudioMathEscapes(p.answer)}));
  const tables:Array<StudioTable>=Array.isArray((record as T & {tables?:unknown}).tables)
    ? ((record as T & {tables?:unknown}).tables as StudioTable[]).map(table=>({...table,rows:table.rows.map(row=>row.map(cell=>normalizeStudioMathEscapes(cell))),warnings:[...table.warnings],red:table.red}))
    : [];
  const controlWarning='识别结果含异常控制字符，请对照原件修复公式';
  const warnings=[...new Set([...record.warnings,...placement.warnings])].filter(w=>w!==controlWarning);
  if([stem,analysis,...(answerPlacements||[]).map(p=>p.answer)].some(hasStudioControlCharacters))warnings.push(controlWarning);
  return {...record,stem,analysis,answerPlacements,tables,warnings};
}
