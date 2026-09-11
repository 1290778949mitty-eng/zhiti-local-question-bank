import type { StudioAnswerPlacement } from './answer-studio';
export type StudioTextPart={text:string;red:boolean;underline?:boolean};

// Restrict placement to visible empty slots, never a formula's ordinary parentheses.
const slotPattern=/\$\\underline\{(?:\\quad|\\qquad|\\;|\s)*\}\$|\\underline\{(?:\\quad|\\qquad|\\;|\s)*\}|\$?_{2,}\$?|[（(][ \t\u3000]*[）)]/g;
export function placeStudioAnswers(stem:string,placements:StudioAnswerPlacement[]=[]):{parts:StudioTextPart[];warnings:string[]} {
  const slots=[...stem.matchAll(slotPattern)];
  const parts:StudioTextPart[]=[];
  if(!placements.length)return {parts:[{text:stem,red:false}],warnings:[]};
  if(slots.length!==placements.length)return {parts:[{text:stem,red:false}],warnings:['答案与题干空位数量不一致，短答案保留在解析中，未自动填入']};
  let cursor=0;
  for(const [i,slot] of slots.entries()) {
    const p=placements[i],choice=/^[（(]/.test(slot[0]);
    if(choice!==(p.kind==='choice'))return {parts:[{text:stem,red:false}],warnings:['答案类型与空位不一致，未自动填入']};
    // A blank inside a larger formula is still a valid answer slot. Split the
    // formula into independent black/red/black math runs so the final answer
    // is editable and visibly filled without corrupting the surrounding TeX.
    const prefix=stem.slice(0,slot.index);
    if((prefix.match(/(?<!\\)\$/g)||[]).length%2){
      const close=stem.indexOf('$',slot.index!+slot[0].length);
      if(close<0)return {parts:[{text:stem,red:false}],warnings:['答案空位所在公式未闭合，原题和答案分别保留']};
      // Multiple blanks in one formula require a range-aware editor; refuse
      // that ambiguous case rather than shifting a later answer.
      const innerAfter=stem.slice(slot.index!+slot[0].length,close);
      if(slotPattern.test(innerAfter)) { slotPattern.lastIndex=0; return {parts:[{text:stem,red:false}],warnings:['同一复合公式含多个空位，未自动填入']}; }
      parts.push({text:stem.slice(cursor,slot.index!)+'$',red:false});
      parts.push({text:p.answer,red:true,underline:true});
      if(innerAfter)parts.push({text:`$${innerAfter}$`,red:false});
      cursor=close+1;
      continue;
    }
    parts.push({text:stem.slice(cursor,slot.index),red:false});
    if(choice)parts.push({text:slot[0][0],red:false},{text:p.answer,red:true},{text:slot[0].at(-1)!,red:false});
    else parts.push({text:p.answer,red:true,underline:true});
    cursor=slot.index!+slot[0].length;
  }
  parts.push({text:stem.slice(cursor),red:false});
  return {parts,warnings:[]};
}
