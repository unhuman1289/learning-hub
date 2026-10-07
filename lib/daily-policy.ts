export const learningTracks = ['Deutsch','AI','MTB','Cardio','Bột'] as const;
export type LearningTrack = typeof learningTracks[number];
export function berlinDay(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const v = (key:string) => p.find(x=>x.type===key)!.value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}
export function cutoffFor(day:string) {
  const guess = new Date(`${day}T03:00:00Z`);
  const zone = new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',timeZoneName:'shortOffset'}).formatToParts(guess).find(x=>x.type==='timeZoneName')!.value;
  const hours = Number(zone.replace('GMT',''));
  return new Date(guess.getTime()-hours*3600000).toISOString();
}
export function canAdvance(current:{assignedDate:string,completedAt:string|null}|undefined,day:string) {
  return !current || (current.assignedDate!==day && !!current.completedAt && current.completedAt<cutoffFor(day));
}
