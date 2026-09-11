import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
const require=createRequire(import.meta.url);
test('both studio exports preserve OMML, native geometry, media relationships and updated content',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'mitty-studio-export-'));
  try {
    const output=join(dir,'export.cjs');
    await build({entryPoints:['lib/answer-studio-export.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',alias:{docx:require.resolve('docx'),jszip:require.resolve('jszip')},external:[require.resolve('docx'),require.resolve('jszip')],outfile:output,logLevel:'silent'});
    const normalizer=join(dir,'normalize.cjs');
    await build({entryPoints:['lib/answer-studio-normalize.ts'],bundle:true,platform:'node',format:'cjs',outfile:normalizer,logLevel:'silent'});
    const {normalizeStudioTextFields}=require(normalizer);
    const {buildStudioWord,studioAnswerParagraphs}=require(output);
    assert.deepEqual(studioAnswerParagraphs('证明：(1)\n$x=2$\n（2）\n$y=3$'),[{text:'证明：',keepNext:true},{text:'(1) $x=2$',keepNext:false},{text:'（2） $y=3$',keepNext:false}]);
    assert.deepEqual(studioAnswerParagraphs('解：(1) 原文\n(2) 后文'),[{text:'解：',keepNext:true},{text:'(1) 原文',keepNext:false},{text:'(2) 后文',keepNext:false}]);
    const q={id:'q',lesson:'一',section:'例题精练',number:'3',stem:'原题 $\\angle A=90^\\circ$，$\\triangle ABC\\backsim\\triangle DEF$。',analysis:'第一步 $r=\\frac{5}{2}\\text{cm}$\n第二步 $S=\\pi r^2$',questionSources:[{pageId:'p',box:{x:0,y:0,width:100,height:100}}],answerIds:['a'],diagrams:[{id:'g',width:100,height:100,caption:'解答图',baseImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',warnings:[],shapes:[{id:'s',kind:'line',x:-10,y:0,width:100,height:100,weight:2,color:'#C00000',dash:true,text:'',points:[]}]}],warnings:[],resolutions:{},reviewed:true};
    const draft={version:1,title:'验证',pages:[],questions:[q],answers:[{id:'a'}]};
    for(const mode of ['full','answers']) {
      const zip=await JSZip.loadAsync(await (await buildStudioWord(draft,mode)).arrayBuffer()),xml=await zip.file('word/document.xml').async('string'),rels=await zip.file('word/_rels/document.xml.rels').async('string');
      assert.equal(xml.includes('>原题</w:t>'),mode==='full');assert.match(xml,/<m:f>/);assert.match(xml,/<v:line/);assert.match(xml,/第一步/);assert.match(xml,/第二步/);assert.doesNotMatch(xml,/<undefined>|STUDIO_DIAGRAM_|>circ<|>backsim<|>text</);
      for(const [,rid] of xml.matchAll(/<v:imagedata r:id="([^"]+)"/g)){assert.ok(rels.includes(`Id="${rid}"`));}
      assert.ok(Object.keys(zip.files).some(p=>p.startsWith('word/media/')));
      assert.match(await zip.file('word/settings.xml').async('string'),/<m:defJc m:val="left"\/>/);
      const paragraphs=[...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]);
      const caption=paragraphs.find(p=>p.includes('解答图'));
      assert.match(caption,/<w:keepNext\b/,'caption must stay with its drawing');
      for(const p of paragraphs.filter(p=>p.includes('w:val="StudioAnswer"'))) {
        assert.match(p,/<w:pPr>[\s\S]*?<w:rPr><w:color w:val="C00000"\/><\/w:rPr><\/w:pPr>/);
        for(const m of p.matchAll(/<m:r>[\s\S]*?<\/m:r>/g)) assert.match(m[0],/<w:color w:val="C00000"\/>/);
      }
      if(mode==='full')assert.match(xml,/<m:t(?:\s[^>]*)?>°<\/m:t>/);
    }
    q.analysis='已经修改 $x=2$\n$y=3$';
    for(const mode of ['full','answers']) {const zip=await JSZip.loadAsync(await (await buildStudioWord(draft,mode)).arrayBuffer());const xml=await zip.file('word/document.xml').async('string');assert.match(xml,/已经修改/);assert.doesNotMatch(xml,/第一步/);}
    q.answerOnly=true;q.stem='';q.questionSources=[];draft.inputMode='answers';
    await assert.rejects(()=>buildStudioWord(draft,'full'),/缺少原题文字/);
    const onlyZip=await JSZip.loadAsync(await (await buildStudioWord(draft,'answers')).arrayBuffer());
    assert.match(await onlyZip.file('word/document.xml').async('string'),/已经修改/);
    q.reviewed=false;await assert.rejects(()=>buildStudioWord(draft,'answers'));
    q.analysis='(1) $\\sin\\alpha=\\frac{1}{2}$\n(2) $\\begin{cases}x+y=3\\\\x-y=1\\end{cases}$\n$\\widehat{AB}=\\overparen{CD}$\n$EF\\xlongequal{//}CD$';
    const reviewZip=await JSZip.loadAsync(await(await buildStudioWord(draft,'answers',{reviewCopy:true})).arrayBuffer());
    const reviewXml=await reviewZip.file('word/document.xml').async('string');
    assert.match(reviewXml,/待校对样张/);assert.match(reviewXml,/不可作为完成稿/);assert.match(reviewXml,/<m:eqArr>/);assert.match(reviewXml,/<m:acc>/);assert.match(reviewXml,/<m:limUpp>/);
    assert.match(reviewXml,/<m:sty m:val="p"\/>[\s\S]*?>sin<\/m:t>/);
    for(const r of reviewXml.matchAll(/<m:r>[\s\S]*?<\/m:r>/g))if(/<m:t[^>]*>[0-9]/.test(r[0]))assert.match(r[0],/<m:sty m:val="p"\/>/);
    assert.equal(q.reviewed,false);await assert.rejects(()=>buildStudioWord(draft,'answers'));
    q.analysis='证明：(1)\n$x=2$\n(2)\n$y=3$';
    q.diagrams[0].shapes.push({id:'label',kind:'label',x:5,y:5,width:40,height:20,weight:1,color:'#C00000',dash:false,text:'A12点',points:[]});
    const layoutZip=await JSZip.loadAsync(await(await buildStudioWord(draft,'answers',{reviewCopy:true})).arrayBuffer());
    const layoutXml=await layoutZip.file('word/document.xml').async('string');
    for(const label of ['证明：','(1)','(2)']) {
      const p=[...layoutXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].find(m=>m[0].includes(`>${label}</w:t>`))?.[0];
      assert.ok(p);
      if(label==='证明：')assert.match(p,/<w:keepNext\b/);
      else {assert.match(p,/<w:tab\/>/);assert.match(p,/<m:oMath>/);assert.match(p,/w:hanging="420"/);}
    }
    assert.match(layoutXml,/<w:i w:val="false"\/>[^]*?<w:t xml:space="preserve">12点<\/w:t>/);
    q.analysis='$\\sqrt{10}$';q.answerPlacements=[{kind:'blank',placeholder:'____',answer:q.analysis}];q.drawingsChecked=true;
    const shortZip=await JSZip.loadAsync(await(await buildStudioWord(draft,'answers',{transcription:true})).arrayBuffer());
    const shortXml=await shortZip.file('word/document.xml').async('string');
    assert.equal([...shortXml.matchAll(/<m:rad>/g)].length,1,'standalone short answers are not duplicated');
    assert.match(shortXml,/<m:bar>/,'the answer retains its native underline');
    // A model's missing placeholder used to fail the entire page. Both export
    // variants must retain the recovered answer as native math, not silently
    // drop it or guess where to insert it in the source question.
    const recovered=normalizeStudioTextFields({...q,answerOnly:false,stem:'结果____。',analysis:'教师原文证明',answerPlacements:[{kind:'blank',placeholder:'',answer:'$\\sqrt{10}$'}]});
    const recoveredDraft={...draft,inputMode:'paired',questions:[recovered]};
    for(const mode of ['full','answers']){
      const zip=await JSZip.loadAsync(await(await buildStudioWord(recoveredDraft,mode,{transcription:true})).arrayBuffer());
      const xml=await zip.file('word/document.xml').async('string');
      assert.match(xml,/教师原文证明/);assert.equal([...xml.matchAll(/<m:rad>/g)].length,1);
      assert.match(xml,/短答案填入位置不明确/);assert.match(xml,/<v:line/);
      if(mode==='full'){
        const stemParagraph=[...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m=>m[0]).find(p=>p.includes('>结果'));
        assert.ok(stemParagraph);assert.doesNotMatch(stemParagraph,/<m:rad>/,'ambiguous placements must not insert the recovered answer into the source');
        assert.equal([...stemParagraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join(''),'结果____。');
      }
    }
    recovered.analysis=String.raw`$\therefore \angle FED=\angle FAD$
$\phantom{\therefore \angle FED}=\angle FAE=\angle FDE$`;
    for(const mode of ['full','answers']){
      const zip=await JSZip.loadAsync(await(await buildStudioWord(recoveredDraft,mode,{transcription:true})).arrayBuffer());
      const xml=await zip.file('word/document.xml').async('string');
      assert.equal([...xml.matchAll(/<m:phant>/g)].length,1);
      assert.match(xml,/<m:phantPr><m:show m:val="0"\/><\/m:phantPr>/);
      assert.match(xml,/<m:phant>[\s\S]*?<w:color w:val="C00000"\/>/);
      assert.doesNotMatch(xml,/\\phantom|STUDIO_MATH_/);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
