"use client";
import {useEffect,useRef} from "react";
/** Read saved server state only. Never lease jobs, resubmit or replace local drafts. */
export function useLiveRefresh(read:()=>Promise<unknown>, enabled=true, interval:number|null=15000){
 const latest=useRef(read);
 useEffect(()=>{latest.current=read;},[read]);
 useEffect(()=>{
  if(!enabled)return;
  let busy=false,disposed=false;
  const refresh=async()=>{if(disposed||busy||document.visibilityState!=="visible")return;busy=true;try{await latest.current();}catch{/* Last confirmed state remains visible; the reader reports its own errors. */}finally{busy=false;}};
  const timer=interval===null?undefined:window.setInterval(()=>void refresh(),interval);
  const visible=()=>void refresh();
  document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);
  if(interval===null)window.addEventListener("lh:lesson-changed",visible);
  return()=>{window.removeEventListener("lh:lesson-changed",visible);disposed=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);};
 },[enabled,interval]);
}
