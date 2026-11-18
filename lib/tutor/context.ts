import { answerFragments } from './leak.ts';
import { safeText } from '../automation/privacy.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';

/** Build model input from the lesson, keeping hidden answers exclusively in the Worker. */
export async function tutorContext(db: EvidenceDb, id: string) {
  const row = await db.prepare(`SELECT t.learner_id,t.item_id,t.question,l.id AS lesson_id,l.payload AS lesson,l.draft,l.support,
    s.display_name,coalesce(s.tutor_enabled,1) AS enabled,l.completed_at,i.flag,
    (SELECT sensitivity FROM subjects WHERE id=l.subject_id AND learner_id=l.user_id) AS sensitivity
    FROM tutor_turns t JOIN learning_lessons l ON l.id=t.lesson_id AND l.user_id=t.learner_id
    JOIN lesson_items i ON i.lesson_id=t.lesson_id AND i.item_id=t.item_id AND i.learner_id=t.learner_id
    LEFT JOIN learner_settings s ON s.user_id=t.learner_id WHERE t.id=? AND t.status='queued'`)
    .bind(id).first<{learner_id:string;item_id:string;question:string;lesson_id:string;lesson:string;draft:string;support:string;display_name:string|null;enabled:number;completed_at:string|null;flag:string|null;sensitivity:SubjectSensitivity|null}>();
  if (!row || !row.enabled || row.completed_at || row.flag === 'item_void') return null;
  const name = row.display_name?.trim() ?? '';
  const clean = (value: unknown) => {
    const text = safeText(value, row.sensitivity ?? 'normal');
    return name ? text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), '{ten}') : text;
  };
  const lesson = JSON.parse(row.lesson) as Record<string, unknown>;
  const draft = JSON.parse(row.draft || '{}') as Record<string,{answer?:string}>;
  const support = JSON.parse(row.support || '{}') as Record<string,string>;
  const {results: items = []} = await db.prepare(`SELECT i.item_id,i.payload,i.input_kind,i.flag,
    (SELECT json_object('answer',a.answer,'result',g.result,'feedback',g.feedback,'attempt_no',a.attempt_no,'support',a.support)
     FROM attempts a JOIN grades g ON g.id=a.current_grade_id
     WHERE a.lesson_id=i.lesson_id AND a.item_id=i.item_id AND a.learner_id=i.learner_id
     ORDER BY a.attempt_no DESC,a.rowid DESC LIMIT 1) AS grade
    FROM lesson_items i WHERE i.lesson_id=? AND i.learner_id=? ORDER BY i.rowid`).bind(row.lesson_id,row.learner_id)
    .all<{item_id:string;payload:string;input_kind:string;flag:string|null;grade:string|null}>();
  const protectedAnswers = {texts:[] as string[],labels:[] as string[]};
  const visibleFields = ['instructions','fragments','left','right','steps','image','description','marks','headers','rowLabels','language','starter','lines'];
  const entries = items.filter(item => item.flag !== 'item_void').map((entry, index) => {
    const item=JSON.parse(entry.payload) as Record<string,unknown>;
    const grade=entry.grade ? JSON.parse(entry.grade) as Record<string,unknown> : null;
    // The lesson route does not mark graded items as solution-revealed.
    const revealed = support[entry.item_id] === 'solution';
    if (!revealed) { const f=answerFragments(item); protectedAnswers.texts.push(...f.texts); protectedAnswers.labels.push(...f.labels); }
    const details=Object.fromEntries(visibleFields.filter(key=>item[key] !== undefined).map(key=>[key,item[key]]));
    const choices=Array.isArray(item.choices) ? item.choices.map(choice=>({id:choice.id,text:choice.text})) : [];
    return { number:index+1, id:entry.item_id, type:entry.input_kind, prompt:clean(item.prompt), choices:clean(JSON.stringify(choices)),
      details:clean(JSON.stringify(details)), answer:clean(draft[entry.item_id]?.answer ?? grade?.answer),
      result:clean(grade?.result), feedback:clean(grade?.feedback), ...(revealed ? {solution:clean(item.solution)} : {}) };
  });
  // Prefer nearby items when the lesson is unusually large, while retaining every question.
  const selected=entries.findIndex(item=>item.id===row.item_id);
  const context={lesson:{title:clean(lesson.title),objective:clean(lesson.objective),items:entries}, selectedItem:row.item_id,question:clean(row.question)};
  const farthest=[...entries.keys()].sort((a,b)=>Math.abs(b-selected)-Math.abs(a-selected));
  // UTF-8 bytes provide a conservative, model-independent budget for Vietnamese text.
  const size=()=>new TextEncoder().encode(JSON.stringify(context.lesson, (_key, value) => value === '' || value === '[]' || value === '{}' ? undefined : value)).length;
  for (const index of farthest) {
    if (size() <= 5000) break;
    const item=entries[index];
    // Keep a short label for distant questions before touching the selected item.
    item.details=''; item.feedback=''; item.answer=''; item.choices='';
    item.prompt=item.prompt.slice(0,index === selected ? 500 : 40);
    if (item.solution) item.solution=item.solution.slice(0,40);
  }
  for (const item of entries) for (const [key, value] of Object.entries(item))
    if (value === '' || value === '[]' || value === '{}') delete (item as Record<string, unknown>)[key];
  return {learnerId:row.learner_id, displayName:name, answerFragments:protectedAnswers, context};
}
