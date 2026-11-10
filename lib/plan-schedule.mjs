const berlinTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function isBerlinPlanTime(value){
 const date=value instanceof Date?value:new Date(value);
 return Number.isFinite(date.getTime())&&berlinTime.format(date)==='00:00';
}
