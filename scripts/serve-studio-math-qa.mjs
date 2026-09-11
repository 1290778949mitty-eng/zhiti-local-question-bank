// Explicit test-only local server. No access to secrets, accounts or database.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const built=await build({entryPoints:['scripts/studio-math-qa.tsx'],bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',outdir:'/tmp/studio-math-qa-assets',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},logLevel:'silent'});
const assets=new Map(built.outputFiles.map(file=>['/'+file.path.split('/').pop(),file.contents]));
const html='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>答案导出回归验证</title><link rel="stylesheet" href="/studio-math-qa.css"><style>body{margin:0;color:#24352f;font:16px/1.65 system-ui}main{max-width:900px;padding:24px;margin:auto}input{display:block;max-width:100%;margin:12px 0}button,a{min-height:44px;padding:10px 16px;border:1px solid #b8c9c0;border-radius:9px;background:#edf5f0;color:#24352f;font:inherit;white-space:nowrap}a{display:inline-block;margin-top:12px}button:disabled{opacity:.5}.actions{display:flex;gap:10px;flex-wrap:wrap}article{border-top:1px solid #ddd;padding:12px 0}h2{font-size:16px}.sample{overflow-x:auto;max-width:100%}.math-text{white-space:pre-wrap}*{box-sizing:border-box}h1{font-size:24px}</style><div id="root"></div><script type="module" src="/studio-math-qa.js"></script></html>';
const samplePath='/Users/hua/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_ql8mjcb54yhb22_02fd/temp/RWTemp/2026-09/c885b9ee520c2868aa85e47cd3c1756f/03【S9寒】创新(1)_仅解题步骤版.docx';
const sample=await readFile(samplePath);
const server=createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(req.url==='/sample.docx'){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.end(sample);return;}
  const data=assets.get(req.url);if(!data){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(data);
});
server.listen(3037,'127.0.0.1',()=>console.log('Local export QA: http://127.0.0.1:3037/'));
process.on('SIGINT',()=>server.close());
