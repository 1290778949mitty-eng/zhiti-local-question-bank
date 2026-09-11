// Curated fixture adapter, not a production recognition path. Reads a browser-exported
// draft and applies an explicit human review file; never edits a generated DOCX.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const [input,reviewFile,output]=process.argv.slice(2);
if(!input||!reviewFile||!output)throw new Error('Usage: node scripts/prepare-answer-studio-review.mjs draft.json review.json output.json');
const draft=JSON.parse(await readFile(input,'utf8')),review=JSON.parse(await readFile(reviewFile,'utf8'));
const require=createRequire(import.meta.url);
const sharp=require(process.env.STUDIO_SHARP_PATH||'sharp');
for(const item of review.questions){
  const q=draft.questions.find(q=>q.section===item.section&&q.number===item.number);
  if(!q)throw new Error(`Missing question ${item.section} ${item.number}`);
  if(item.analysis!==undefined)q.analysis=item.analysis;
  for(const replacement of item.textReplacements||[]) {
    if(!q.analysis.includes(replacement.from))throw new Error('Reviewed source text no longer matches');
    q.analysis=q.analysis.replace(replacement.from,replacement.to);
  }
  if(item.diagrams){
    for(const spec of item.diagrams){
      const d=q.diagrams[spec.index];if(!d)throw new Error('Missing diagram');
      if(spec.crop){
        const page=draft.pages.find(p=>p.id===q.questionSources[0].pageId),image=Buffer.from(page.image.split(',')[1],'base64');
        const meta=await sharp(image).metadata(),b=spec.crop;
        const extracted=await sharp(image).extract({left:Math.floor(meta.width*b.x/1000),top:Math.floor(meta.height*b.y/1000),width:Math.floor(meta.width*b.width/1000),height:Math.floor(meta.height*b.height/1000)}).resize({width:600,withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
        d.baseImage=`data:image/png;base64,${extracted.data.toString('base64')}`;d.width=extracted.info.width;d.height=extracted.info.height;d.baseSource={pageId:page.id,box:b};
      }
      if(spec.shapes)d.shapes=spec.shapes.map((s,i)=>({id:`review-${i}`,kind:'line',x:0,y:0,width:0,height:0,color:'#C00000',weight:2.5,dash:true,text:'',points:[],...s}));
      if(spec.caption!==undefined)d.caption=spec.caption;
      if(spec.labelsHeight)d.shapes=d.shapes.map(s=>s.kind==='label'?{...s,height:spec.labelsHeight,width:Math.max(s.width,spec.labelsHeight)}:s);
    }
  }
  q.reviewed=false;
  q.resolutions={...q.resolutions,'尚未检查解答图与辅助线':item.note};
}
draft.updatedAt=Date.now();
await writeFile(output,JSON.stringify(draft));
console.log(`Prepared ${review.questions.length} reviewed source records; still requires UI confirmation.`);
