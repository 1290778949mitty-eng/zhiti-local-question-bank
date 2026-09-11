import type { StudioDiagram, StudioQuestion } from './answer-studio';
import { studioDrawingMissing, type StudioDrawingContext, type StudioDrawingResult } from './answer-studio-pipeline';
import { studioDiagramSvg } from './answer-studio-diagram';
import { resizeStudioImage, studioDrawingContact } from './answer-studio-images';

type DrawingImages={contact:typeof studioDrawingContact;render:typeof resizeStudioImage};
export async function recognizeStudioDrawings(question:StudioQuestion,bases:StudioDiagram[],evidence:string[],call:(body:unknown)=>Promise<StudioDrawingResult>,images:DrawingImages={contact:studioDrawingContact,render:resizeStudioImage},context:StudioDrawingContext={answerOnly:false,hasSourceDiagrams:false}) {
  const input={stem:question.stem,analysis:question.analysis,bases:bases.map(d=>({width:d.width,height:d.height})),...context};
  let first=await call({...input,image:await images.contact(bases,evidence)});
  if(!first.diagrams.length&&studioDrawingMissing(question,bases,context,first)) first=await call({...input,image:await images.contact(bases,evidence),previous:first});
  if(!first.diagrams.length)return first;
  const previews=await Promise.all(first.diagrams.map(async(d,index)=>{
    const base=d.baseIndex>=0?bases[d.baseIndex]:undefined;
    if(d.baseIndex>=0&&!base)throw new Error('配图底图关系无效');
    const diagram:StudioDiagram={id:`preview-${index}`,caption:d.caption,baseImage:base?.baseImage||'',width:base?.width||500,height:base?.height||400,shapes:d.shapes,warnings:d.warnings};
    return images.render(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(studioDiagramSvg(diagram))}`);
  }));
  // A separate visual pass checks the rendered vectors, not merely the JSON.
  // Replace the candidate atomically; retain uncertainty rather than inventing
  // geometry from the problem statement.
  return call({...input,image:await images.contact(bases,evidence,previews),previous:first});
}
