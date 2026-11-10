export type FeedbackRecord={id:string;stage?:string|null;attempts:{item_id:string;result:string|null}[]};
/** Match by saved item ids so old stage labels and added check questions still work. */
export function feedbackForItems<T extends FeedbackRecord>(history:T[],itemIds:string[]){
 const ids=new Set(itemIds);return history.filter(s=>s.attempts.some(a=>ids.has(a.item_id))).map(s=>({...s,attempts:s.attempts.filter(a=>ids.has(a.item_id))}));
}
