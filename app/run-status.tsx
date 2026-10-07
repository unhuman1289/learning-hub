'use client';
import {useState} from 'react';
import {Download,AlertCircle} from 'lucide-react';
import type {DailyView,RunEntry} from '../lib/daily-types';
const format=(value:string)=>new Date(value).toLocaleString('vi-VN',{timeZone:'Europe/Berlin'});
const statusText={started:'Đang chạy',finished:'Đã kết thúc',failed:'Có lỗi'};
const outcomeText={updated:'Bài mới',kept:'Giữ bài',skipped:'Chưa gán',error:'Có lỗi'};
export default function RunStatus({data,onBackup}:{data:DailyView,onBackup:(createdAt:string)=>void}){
 const [downloading,setDownloading]=useState(false),[error,setError]=useState('');
 const {health,backup}=data;
 const warning=health.stale||health.latestFailed||!!health.stalledRunId;
 async function download(){
  setDownloading(true);setError('');
  try{
   const response=await fetch('/api/export',{cache:'no-store'});
   const snapshot=await response.json() as {error?:string,format:number,tables?:Record<string,unknown>,exportedAt:string};
   if(!response.ok)throw Error(snapshot.error||'Không tải được bản sao lưu.');
   if(snapshot.format!==2||!snapshot.tables)throw Error('Máy chủ chưa trả bản sao lưu đầy đủ.');
   const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=`learning-hub-backup-${snapshot.exportedAt.slice(0,10)}.json`;a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);onBackup(snapshot.exportedAt);
  }catch(e){setError((e as Error).message);}finally{setDownloading(false);}
 }
 return <div className="run-status">
  {warning&&<div className="run-warning" role="status"><AlertCircle size={20} aria-hidden="true"/><div><strong>{health.stalledRunId?'Một lượt chạy chưa kết thúc sau 2 giờ':health.latestFailed?'Lượt cập nhật gần nhất có lỗi':health.lastSuccessfulAt?'Hơn 26 giờ chưa có lượt cập nhật thành công':'Chưa ghi nhận lượt cập nhật thành công'}</strong><p>Bài đang học và câu trả lời được giữ nguyên. Xem nhật ký bên dưới để biết mảng nào được thay, giữ hoặc gặp lỗi.</p></div></div>}
  <div className="run-overview"><div><p>{health.lastSuccessfulAt?`Lượt thành công gần nhất: ${format(health.lastSuccessfulAt)} (Berlin)`:'Nhật ký bắt đầu từ bản cập nhật này; dữ liệu cũ vẫn được giữ.'}</p><p className="muted">{backup.lastCreatedAt?`Bản sao gần nhất được tạo: ${format(backup.lastCreatedAt)}`:'Chưa tạo bản sao đầy đủ từ trang này.'}{backup.due?' · Đến lúc sao lưu tuần này.':''}</p></div><button className="backup-button" onClick={download} disabled={downloading}><Download size={16} aria-hidden="true"/>{downloading?'Đang tạo bản sao…':'Tải bản sao lưu'}</button></div>
  <p className="backup-help">Bản sao gồm bài, câu trả lời, ghi chú, tiến độ và nhật ký cập nhật. Giữ file ở nơi riêng tư. Trình duyệt của bạn quyết định nơi lưu file.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  <details className="run-history"><summary>Nhật ký cập nhật ({data.runs.length} lượt gần nhất)</summary><div>{data.runs.length?data.runs.map(run=><RunDetails run={run} key={run.id}/>):<p className="empty">Chưa có lượt trong nhật ký mới. Lượt 03:00 tiếp theo sẽ ghi bắt đầu và kết thúc.</p>}</div></details>
 </div>;
}
function RunDetails({run}:{run:RunEntry}){
 return <article className="run-entry"><div className="run-entry-heading"><strong>{statusText[run.status]}</strong><time dateTime={run.startedAt}>{format(run.startedAt)} (Berlin)</time></div><p>{run.origin==='manual'?'Kiểm tra thủ công':run.origin==='scheduled'?'Tác vụ theo lịch':'Dữ liệu cũ'}{run.finishedAt?` · Kết thúc ${format(run.finishedAt)}`:''}</p>{run.summary&&<p>{run.summary}</p>}{run.error&&<p className="run-error">{run.error}</p>}<ul>{run.items.map(item=><li key={item.track}><div><strong>{item.track}</strong><span>{outcomeText[item.outcome]}</span></div><p>{item.reason}</p>{!!item.sources.length&&<details><summary>Nguồn đề xuất ({item.sources.length})</summary><ul>{item.sources.map((source,index)=><li key={index}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p>{source.readScope}</p></li>)}</ul></details>}</li>)}</ul>{!run.items.length&&<p className="muted">Chưa có kết quả theo mảng. Chưa xác nhận đã cập nhật bài.</p>}</article>;
}
