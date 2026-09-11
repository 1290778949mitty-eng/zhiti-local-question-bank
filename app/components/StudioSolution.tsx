"use client";
import { useEffect, useState } from "react";
import type { StudioQuestion } from "../../lib/answer-studio";
import { studioDiagramSvg } from "../../lib/answer-studio-diagram";
import { MathText } from "./MathText";

export function StudioSolution({source}:{source:StudioQuestion}) {
  const [images,setImages]=useState<Record<string,string>>({});
  useEffect(()=>{let live=true;void Promise.all(source.diagrams.filter(d=>d.baseImage.startsWith('/api/assets/')).map(async d=>{
    const response=await fetch(d.baseImage);if(!response.ok)throw new Error('图片读取失败');
    const blob=await response.blob();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});return [d.id,data];
  })).then(pairs=>{if(live)setImages(Object.fromEntries(pairs));}).catch(()=>{});return()=>{live=false;};},[source]);
  return <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}><MathText text={source.analysis}/>{source.diagrams.map(d=><figure key={d.id} style={{margin:'16px 0'}}>{d.baseImage.startsWith('/api/assets/')&&!images[d.id]?<p>正在读取解答图…</p>:<img loading="lazy" style={{maxWidth:'100%',maxHeight:330}} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(studioDiagramSvg({...d,baseImage:images[d.id]||d.baseImage}))}`} alt={d.caption||'解答图'}/>}<figcaption>{d.caption}</figcaption></figure>)}</div>;
}
