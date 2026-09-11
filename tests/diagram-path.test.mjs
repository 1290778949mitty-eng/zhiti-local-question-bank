import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('native paths preserve fractional and off-canvas geometry without changing source data',async()=>{
  const result=await build({entryPoints:['lib/answer-studio-diagram.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const {studioDiagramVml,studioDiagramSvg}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for(const width of [100,500.25]) {
    const points=Array.from({length:121},(_,i)=>({x:-15.123+i*1.2345,y:20.25+Math.sin(i/20)*13.567}));
    const d={width,height:400.125,shapes:[{id:'curve',kind:'path',x:0,y:0,width:0,height:0,color:'#C00000',weight:2,dash:false,text:'',points}]};
    const before=JSON.stringify(d),xml=studioDiagramVml(d,'','curve');
    const segments=[...xml.matchAll(/<v:line[^>]*from="([^"]+)" to="([^"]+)"/g)];
    assert.equal(segments.length,points.length-1);
    segments.forEach((m,i)=>{const values=[...m[1].split(','),...m[2].split(',')].map(Number);[points[i].x,points[i].y,points[i+1].x,points[i+1].y].forEach((v,j)=>assert.ok(Math.abs(v-values[j])<1e-9));});
    assert.doesNotMatch(xml,/<v:shape\b/);
    assert.match(studioDiagramSvg(d),/points="-15.123,20.25/);
    assert.equal(JSON.stringify(d),before);
  }
  const dashed={width:100,height:100,shapes:[{kind:'path',x:0,y:0,width:0,height:0,color:'#C00000',weight:2,dash:true,text:'',points:[{x:0,y:0},{x:5,y:0},{x:20,y:0}]}]};
  const xml=studioDiagramVml(dashed,'','dash');
  assert.match(xml,/from="0,0" to="5,0"/);assert.match(xml,/from="5,0" to="9,0"/);assert.match(xml,/from="15,0" to="20,0"/);
});
