import {readFileSync} from 'node:fs';
// Inspect a private receipt export; never infer user learning or a registered schedule.
const file=process.argv[2];if(!file)throw Error('Private pilot receipt JSON required');
const rows=JSON.parse(readFileSync(file,'utf8'));if(!Array.isArray(rows))throw Error('Expected receipt array');
const nights=new Set(),lessonIds=new Set();let unchanged=0;
for(const j of rows){if(j.status!=='succeeded')continue;const out=typeof j.outcome==='string'?JSON.parse(j.outcome):j.outcome??{};const ids=[...new Set([...(out.extraLessonIds??[]),...(out.subjects??[]).flatMap(s=>s.lessonIds??[])])];ids.forEach(id=>lessonIds.add(id));unchanged+=(out.subjects??[]).filter(s=>s.status==='no_action'&&!s.lessonIds?.length).length;
 if(j.purpose==='daily'&&j.trigger==='scheduled'&&j.finished_at){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date(j.finished_at)));if(hour>=3&&hour<5)nights.add(j.learning_day);}}
console.log(JSON.stringify({verifiedReceipts:rows.filter(j=>j.status==='succeeded').length,savedLessonIds:[...lessonIds],unchangedSubjects:unchanged,nightDays:[...nights].sort(),threeNightReceiptGate:nights.size>=3,scheduleRegistration:'requires actual ChatGPT task evidence',learningGate:'requires user learning and reviewed feedback; receipts do not prove this'},null,2));
