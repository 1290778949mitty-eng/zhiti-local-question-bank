"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- client-only vinext navigation */
import { useEffect, useRef, useState } from 'react';
import { fetchMe } from '../../lib/api-client';
import type { AuthUser } from '../../lib/types';
import { deduplicateStudioPages, emptyStudioDraft, validateStudioDraft, type StudioDraft, type StudioRecord } from '../../lib/answer-studio';
import { studioStorage } from '../../lib/answer-studio-storage';
import { cropStudioImage, readStudioFiles, resizeStudioImage } from '../../lib/answer-studio-images';
import { recognizeStudioDrawings } from '../../lib/answer-studio-drawings';
import { transcribeStudio, type StudioDrawingResult } from '../../lib/answer-studio-pipeline';
import { StudioDownloads, type StudioDownload } from '../../lib/answer-studio-downloads';
import { studioIncludesQuestionFigures, studioIssueCount, studioOutputBlocker, studioOutputs, studioTextReady, type StudioOutputMode } from '../../lib/answer-studio-output';
import './studio.css';

async function api<T>(url:string, body:unknown):Promise<T> {
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({error:`识别服务返回异常（${response.status}）`}));
  if(!response.ok)throw new Error(data.error||'识别失败');
  return data;
}

export default function AnswerStudioPage() {
  const [user,setUser]=useState<AuthUser|null>(null),[loaded,setLoaded]=useState(false);
  const [mode,setMode]=useState<'paired'|'answers'>('paired'),[title,setTitle]=useState('');
  const [questionFiles,setQuestionFiles]=useState<File[]>([]),[answerFiles,setAnswerFiles]=useState<File[]>([]);
  const [questionRange,setQuestionRange]=useState(''),[answerRange,setAnswerRange]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);
  const [saved,setSaved]=useState<StudioDraft|null>(null),[downloads,setDownloads]=useState<StudioDownload[]>([]);
  const [output,setOutput]=useState<StudioOutputMode>('full');
  const links=useRef(new StudioDownloads()),running=useRef(false);
  useEffect(()=>{
    let active=true;const urls=links.current;
    // React development refresh runs cleanup while preserving component state.
    // Clear any hrefs whose object URLs were revoked by that cleanup.
    setDownloads(urls.invalidate());
    void fetchMe().then(async result=>{
      if(!active)return;setUser(result.user);
      if(result.user){const draft=await studioStorage(result.user.id,'read');if(draft&&active){setSaved(draft);setMode(draft.inputMode||'paired');setTitle(draft.title);}}
    }).catch(e=>{if(active){setNotice(e instanceof Error?e.message:'登录状态读取失败');setFailed(true);}}).finally(()=>{if(active)setLoaded(true);});
    return()=>{active=false;urls.invalidate();};
  },[]);
  function changed(){setDownloads(links.current.invalidate());setSaved(null);setNotice('');setFailed(false);}
  function files(role:'question'|'answer',selected:FileList|null){
    changed();const list=Array.from(selected||[]);if(role==='question')setQuestionFiles(list);else setAnswerFiles(list);
    if(!title.trim()&&list[0])setTitle(list[0].name.replace(/\.[^.]+$/,''));
  }
  async function restore(file?:File){
    if(!file||!user||running.current)return;
    running.current=true;setBusy(true);
    try{
      const draft=validateStudioDraft(JSON.parse(await file.text()));
      await studioStorage(user.id,'write',draft);
      setDownloads(links.current.invalidate());setSaved(draft);setMode(draft.inputMode||'paired');setTitle(draft.title);
      setQuestionFiles([]);setAnswerFiles([]);setNotice('已恢复项目，可选择结果版本或继续转录。');setFailed(false);
    }catch(e){setNotice(e instanceof Error?e.message:'备份恢复失败');setFailed(true);}
    finally{running.current=false;setBusy(false);}
  }
  async function start(variant?:StudioOutputMode){
    if(running.current)return;
    running.current=true;setBusy(true);setFailed(false);setDownloads(links.current.invalidate());
    let latest:StudioDraft|null=null;
    try{
      if(!user)throw new Error('请先登录');
      if(!title.trim())throw new Error('请填写资料名称');
      const resume=!!saved;
      if(!resume&&(!answerFiles.length||(mode==='paired'&&!questionFiles.length)))throw new Error(mode==='paired'?'请上传原件和答案文件':'请上传答案文件');
      const draft=resume?structuredClone(saved):{...emptyStudioDraft(),title:title.trim(),inputMode:mode};
      if(variant){const blocker=studioOutputBlocker(draft,variant);if(blocker)throw new Error(blocker);}
      if(!resume){
        const input:[File[],'question'|'answer',string][]=mode==='paired'?[[questionFiles,'question',questionRange],[answerFiles,'answer',answerRange]]:[[answerFiles,'answer',answerRange]];
        for(const [selected,role,range] of input)draft.pages=deduplicateStudioPages([...draft.pages,...await readStudioFiles(selected,role,range,setNotice)]);
      }
      latest=draft;
      const checkpoint=async(value:StudioDraft)=>{latest=value;await studioStorage(user.id,'write',value);setSaved(value);};
      await checkpoint(draft);
      const result=await transcribeStudio(draft,{
        progress:setNotice,checkpoint,
        crop:(image,box)=>cropStudioImage(image,box,1200),
        recognize:async(page,context)=>(await api<{records:StudioRecord[]}>('/api/answer-studio/recognize',{image:await resizeStudioImage(page.image),role:page.role,answerOnly:draft.inputMode==='answers',lesson:draft.title,pageId:page.id,context})).records,
        drawings:(question,bases,evidence,context)=>recognizeStudioDrawings(question,bases,evidence,body=>api<StudioDrawingResult>('/api/answer-studio/drawings',body),undefined,context),
      },{drawings:variant==='full',includeQuestionFigures:variant==='full'&&studioIncludesQuestionFigures(draft)});
      latest=result;
      if(!variant){setNotice(`文字转录完成：${result.questions.length} 题。请选择结果版本；无图版本无需等待配图。`);return;}
      setNotice('正在生成 Word…');
      const {buildStudioWord}=await import('../../lib/answer-studio-export');
      const label=studioOutputs.find(item=>item.value===variant)!.label;
      const blob=await buildStudioWord(result,variant,{transcription:true,bestEffort:true});
      setDownloads(links.current.offer(blob,`${result.title}_${label}.docx`,'下载 Word'));
      const issueCount=studioIssueCount(result);
      setNotice(`${label}已生成：${result.questions.length} 题。${variant==='full'?'':'已跳过配图处理。'}${issueCount?`发现 ${issueCount} 个提示，已写入 Word。`:''}请下载 Word，在文档中检查和修改。`);
    }catch(e){setFailed(true);setNotice(e instanceof Error?e.message:'转录失败');}
    finally{
      if(latest)setDownloads(links.current.offer(new Blob([JSON.stringify(latest)],{type:'application/json'}),`${latest.title}_转录备份.json`,'下载项目备份'));
      running.current=false;setBusy(false);
    }
  }
  if(!loaded)return <main className="answer-studio"><p>正在读取…</p></main>;
  if(!user)return <main className="answer-studio"><h1>手写转录</h1><p>请先登录 Mitty 主站。</p><a href="/">返回主站</a></main>;
  return <main className="answer-studio answer-studio-simple">
    <header><div><a href="/">← 返回 Mitty 题库</a><h1>手写转录</h1><p>上传材料，自动转录并下载 Word 结果</p></div><small>{user.local?'本地管理员':user.email}</small></header>
    <section className="simple-panel">
      <fieldset className="studio-fields" disabled={busy}><legend>选择材料类型</legend>
        <div className="mode-choice">
          <label><input type="radio" name="studio-mode" checked={mode==='paired'} onChange={()=>{changed();setMode('paired');}}/>提供原题和答案</label><span>分别上传干净原题与手写答案</span>
          <label><input type="radio" name="studio-mode" checked={mode==='answers'} onChange={()=>{changed();setMode('answers');}}/>只有答案材料</label><span>上传带答案的讲义或答案页，有原题文字也会一并转录</span>
        </div>
        <label>资料名称<input value={title} onChange={e=>{changed();setTitle(e.target.value);}} placeholder="例如：第一讲 三角形的外心"/></label>
        {mode==='paired'&&<label>上传原件（PDF、PNG、JPG、WebP）<input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>files('question',e.target.files)}/>{!!questionFiles.length&&<small>已选择 {questionFiles.length} 个文件</small>}</label>}
        <label>上传手写答案（PDF、PNG、JPG、WebP）<input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>files('answer',e.target.files)}/>{!!answerFiles.length&&<small>已选择 {answerFiles.length} 个文件</small>}</label>
        <details><summary>只处理部分 PDF 页码</summary>{mode==='paired'&&<label>原件页码<input value={questionRange} placeholder="留空处理全部，例如 1-3,5" onChange={e=>{changed();setQuestionRange(e.target.value);}}/></label>}<label>答案页码<input value={answerRange} placeholder="留空处理全部，例如 1-3,5" onChange={e=>{changed();setAnswerRange(e.target.value);}}/></label></details>
      </fieldset>
      {(!saved||!studioTextReady(saved))&&<button className="primary simple-start" disabled={busy} onClick={()=>void start()}>{busy?'正在转录…':saved?'继续转录':'开始转录'}</button>}
      <p className={`studio-notice${failed?' studio-error':''}`} role="status">{notice||(saved?'已恢复本机上次任务；选择新文件可开始新任务。':'先识别文字，再选择下载版本；仅完整解题版需要处理配图。')}</p>
      {saved&&studioTextReady(saved)&&<section className="studio-results" aria-labelledby="studio-results-title">
        <h2 id="studio-results-title">转录结果 <span className={studioIssueCount(saved)?'studio-issue-count has-issues':'studio-issue-count'}>当前 {studioIssueCount(saved)} 个提示</span></h2>
        <p>已识别 {saved.questions.length} 题。三种版本共用转录内容，切换版本不会重新识别文字。</p>
        <p className={`studio-notice${studioIssueCount(saved)?' studio-error':''}`} role="status">{studioIssueCount(saved)?`当前记录 ${studioIssueCount(saved)} 个转录或格式提示；生成不会中止，具体问题会写入 Word。`:'当前没有记录到格式提示。'}</p>
        <fieldset className="studio-fields output-choices" disabled={busy}><legend className="output-legend">选择下载内容</legend>
          {studioOutputs.map(item=><label key={item.value} htmlFor={`studio-output-${item.value}`} aria-label={item.label} className={output===item.value?'output-choice selected':'output-choice'}>
            <input id={`studio-output-${item.value}`} type="radio" name="studio-output" value={item.value} checked={output===item.value} onChange={()=>{setOutput(item.value);setDownloads(links.current.invalidate());setNotice(item.value==='full'?'已选择完整解题版，生成时将处理尚未完成的配图。':'已选择无图版本，将跳过配图处理，直接生成 Word。');setFailed(false);}}/>
            <span><strong>{item.label}</strong><small>{item.value==='full'?(studioIncludesQuestionFigures(saved)?'原题、步骤解析、原题配图和解答辅助图。':'原题文字、步骤解析和解答辅助图；不另配原题图，保留辅助作图所依附的必要底图。'):item.description}</small></span>
          </label>)}
        </fieldset>
        {studioOutputBlocker(saved,output)&&<p className="studio-notice" role="status">{studioOutputBlocker(saved,output)}</p>}
        {!downloads.some(file=>file.label==='下载 Word')&&<button className="primary simple-start" disabled={busy||!!studioOutputBlocker(saved,output)} onClick={()=>void start(output)}>{busy?'正在生成…':output==='full'?'生成完整解题版':'生成无图 Word'}</button>}
        {downloads.filter(file=>file.label==='下载 Word').map(file=><a key={file.url} className="studio-download" href={file.url} download={file.name}>下载{studioOutputs.find(item=>item.value===output)!.label}</a>)}
      </section>}
      <details><summary>本地项目备份</summary>
        {saved&&<button disabled={busy} onClick={()=>setDownloads(links.current.offer(new Blob([JSON.stringify(saved)],{type:'application/json'}),`${saved.title}_转录备份.json`,'下载项目备份'))}>生成备份</button>}
        {downloads.filter(file=>file.label!=='下载 Word').map(file=><a key={file.url} href={file.url} download={file.name}>{file.label}</a>)}
        <label>恢复 JSON 备份<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void restore(file);}}/></label>
      </details>
      <small className="studio-privacy">所选材料会发送至已配置的 AI 服务。任务保存在当前浏览器，不跨设备同步；识别有疑问处会在 Word 中提示。</small>
    </section>
  </main>;
}
