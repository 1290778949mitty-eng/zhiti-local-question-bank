import { ImportedXmlComponent, TextRun, type ParagraphChild } from 'docx';
import { splitMathText } from './answer-studio-math-text';
import { needsWordMathEquation } from './math-notation.mjs';
import { mathOmml } from './math-omml';
import { xmlSafeText } from './xml-text';
// Match the Normal and StudioAnswer paragraph styles (11 pt).
const BODY_SIZE=22;
const BODY_FONT={ascii:'Times New Roman',hAnsi:'Times New Roman',eastAsia:'Songti SC',cs:'Times New Roman',hint:'eastAsia'} as const;
type RunStyle={bold?:boolean;color?:string;italicMath?:boolean;underline?:boolean};
class NativeMathXml extends ImportedXmlComponent {
  static equation(source:string,style:RunStyle):ParagraphChild {
    // docx 9.x returns a nameless XML-document container, not its root element.
    // Insert the real oMath child; emitting the container produces <undefined>.
    let xml=mathOmml(style.underline?`\\underline{${source}}`:source);
    if(style.color)xml=xml.replace(/<m:r>(<m:rPr>[\s\S]*?<\/m:rPr>)?/g,`<m:r>$1<w:rPr><w:color w:val="${style.color}"/></w:rPr>`);
    const parsed=ImportedXmlComponent.fromXmlString(`<m:oMath>${xml}</m:oMath>`) as NativeMathXml;
    const element=parsed.root[0];
    if(!(element instanceof ImportedXmlComponent))throw new Error('原生公式 XML 根节点无效');
    return element as unknown as ParagraphChild;
  }
}
function textRuns(text:string,style:RunStyle={}) {
  return xmlSafeText(text).split(/([A-Za-z]+)/g).filter(Boolean).map(piece=>new TextRun({text:piece,size:BODY_SIZE,bold:style.bold,color:style.color,
    underline:style.underline?{}:undefined,italics:style.italicMath!==false&&(/^[A-Z]{1,4}$/.test(piece)||/^[a-z]$/.test(piece)),font:BODY_FONT}));
}
export function richText(text:string,style:RunStyle={},onMathError?:(error:unknown)=>void):ParagraphChild[] {
  return splitMathText(text).flatMap(segment=>{
    if(segment.kind!=='math'||!needsWordMathEquation(segment.value,segment.explicit))return textRuns(segment.value,style);
    try{return [NativeMathXml.equation(segment.value.trim(),style)];}
    catch(error){
      if(!onMathError)throw error;
      onMathError(error);
      // Isolate a failure to this equation, not all the other equations or
      // prose in its paragraph. Keep the unrecognized source for correction.
      return textRuns(`〔公式待核对：${segment.value}〕`,style);
    }
  });
}
