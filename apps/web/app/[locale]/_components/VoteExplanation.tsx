"use client";
import { useEffect, useState } from "react";
type Result = { status:string; limited?:boolean; output?:{ro:string;en:string;evidence:{source:number;quote:string}[]}; sources?:{url:string;label:string}[] };
export function VoteExplanation({id,locale}:{id:string;locale:string}) {
  const [result,setResult]=useState<Result>({status:"loading"});
  const en=locale==="en";
  useEffect(()=>{
    const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>; let tries=0;
    const url=`/api/votes/${encodeURIComponent(id)}/explanation`;
    setResult({status:"loading"});
    async function load(method:string) {
      try {
        const response=await fetch(url,{method,signal:controller.signal});
        const value:Result=await response.json(); if(controller.signal.aborted)return;
        if(["pending","generating"].includes(value.status)&&tries>=10) {setResult({status:"unavailable"});return;}
        setResult(value);
        if(["pending","generating"].includes(value.status)&&tries++<10) timer=setTimeout(()=>void load("GET"),3000);
      } catch {if(!controller.signal.aborted)setResult({status:"unavailable"});}
    }
    void load("POST"); return()=>{controller.abort();clearTimeout(timer);};
  },[id]);
  if(result.status==="hidden")return null;
  return <aside className="mt-4 max-w-4xl rounded-md border border-blue-100 bg-blue-50/60 p-4" aria-live="polite">
    <span className="text-xs font-semibold text-blue-800">{en?"Made with AI":"Generat cu AI"} · {result.status==="reviewed"?(en?"Reviewed":"Revizuit"):(en?"Unreviewed":"Nerevizuit")}</span>
    {result.output ? <><p className="mt-2 text-sm leading-6 text-slate-800">{en?result.output.en:result.output.ro}</p>
      {result.limited&&<p className="mt-2 text-xs text-amber-800">{en?"Limited evidence: full legal text unavailable for this vote.":"Dovezi limitate: textul juridic integral nu este disponibil pentru acest vot."}</p>}
      <details className="mt-2 text-xs text-slate-600"><summary>{en?"Supporting sources":"Surse justificative"}</summary>{result.output.evidence.map((e,i)=><blockquote key={i} className="mt-2 border-l-2 pl-2"><p>{e.quote}</p><a className="underline" href={result.sources?.[e.source]?.url} target="_blank" rel="noreferrer">{result.sources?.[e.source]?.label}</a></blockquote>)}</details>
    </> : <p className="mt-2 text-sm text-slate-600">{["loading","pending","generating"].includes(result.status)?(en?"Preparing a short explanation…":"Se pregătește o scurtă explicație…"):(en?"Explanation unavailable. The official vote and sources remain available below.":"Explicație indisponibilă. Votul oficial și sursele sunt disponibile mai jos.")}</p>}
  </aside>;
}
