import { z } from 'zod/v4';

const cefr = ['A1.1','A1.2','A2.1','A2.2','B1','B2','C1','C2'];
export const frameworks = [
  {key:'de-cefr',label:'Tiếng Đức · CEFR',kind:'international',levels:cefr,topicKey:'de-cefr'},
  {key:'en-cefr',label:'Tiếng Anh · CEFR',kind:'international',levels:cefr,topicKey:'en-cefr'},
  {key:'vn-gdpt-2018-toan',label:'Toán · GDPT 2018',kind:'national',levels:Array.from({length:12},(_,i)=>'Lớp '+(i+1)),topicKey:'vn-gdpt-toan'},
  {key:'rust-core',label:'Rust',kind:'milestones',levels:['Cú pháp','Hàm','Kiểu','Ownership','Borrowing','Lifetimes','Traits','Xử lý lỗi','Modules','Async'],topicKey:'rust'},
  {key:'python-core',label:'Python',kind:'milestones',levels:['Cú pháp','Luồng điều khiển','Hàm','Cấu trúc dữ liệu','Tệp','Module','Kiểm thử'],topicKey:'python'},
  {key:'milestones',label:'Theo kỹ năng',kind:'milestones',levels:[],topicKey:null},
] as const;
export const frameworkInput=z.strictObject({
 key:z.enum(['de-cefr','en-cefr','vn-gdpt-2018-toan','rust-core','python-core','milestones','custom']),
 levelFrom:z.string().trim().min(1).max(80).optional(),
 levelTo:z.string().trim().min(1).max(80).optional(),
 custom:z.string().trim().min(1).max(80).optional(),
}).refine(input=>input.key==='custom'?Boolean(input.custom):input.custom===undefined);
type FrameworkInput=z.infer<typeof frameworkInput>;

export function frameworkFor(input:FrameworkInput,title:string,brief:string,curriculum:string){
 const requirements=curriculum+' '+brief;
 const grade=/(?:lớp|toán)\s*(1[0-2]|[1-9])\b/iu.exec(title+' '+requirements)?.[1];
 if(/gdpt|giáo dục phổ thông/iu.test(requirements)&&/toán/iu.test(title+' '+requirements))
  input={key:'vn-gdpt-2018-toan',...(grade?{levelFrom:'Lớp '+grade}:{})};
 if(input.key==='custom'){
  const label=input.custom!;
  const slug=label.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
  return {...input,label,kind:'custom',topicKey:slug?'custom:'+slug:null};
 }
 const entry=frameworks.find(item=>item.key===input.key)!;
 return {...input,label:entry.label,kind:entry.kind,topicKey:entry.key==='vn-gdpt-2018-toan'&&grade?entry.topicKey+'-'+grade:entry.topicKey};
}

export function inferFramework(title:string,brief='',curriculum=''){
 const words=title+' '+brief+' '+curriculum;
 const key=/toán/iu.test(title)&&/gdpt|lớp|toán\s*\d/iu.test(words)?'vn-gdpt-2018-toan':
  /\brust\b/i.test(title)?'rust-core':/\bpython\b/i.test(title)?'python-core':
  /deutsch|tiếng đức|german/iu.test(title)?'de-cefr':/english|tiếng anh/iu.test(title)?'en-cefr':'milestones';
 return frameworkFor({key},title,brief,curriculum);
}
