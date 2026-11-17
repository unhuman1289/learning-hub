import { safeText } from '../automation/privacy.ts';
import { contextExcerpt } from '../knowledge/service.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';

/** Rebuild the context from the current lesson; never include another item or answer key. */
export async function tutorContext(db: EvidenceDb, id: string) {
  const row = await db.prepare(`SELECT t.learner_id,t.question,l.subject_id,l.payload AS lesson,l.draft,l.roadmap_step_id,
    i.payload AS item,s.display_name,coalesce(s.tutor_enabled,1) AS enabled,l.completed_at,i.flag,
    (SELECT sensitivity FROM subjects WHERE id=l.subject_id AND learner_id=l.user_id) AS sensitivity
    FROM tutor_turns t JOIN learning_lessons l ON l.id=t.lesson_id AND l.user_id=t.learner_id
    JOIN lesson_items i ON i.lesson_id=t.lesson_id AND i.item_id=t.item_id AND i.learner_id=t.learner_id
    LEFT JOIN learner_settings s ON s.user_id=t.learner_id WHERE t.id=? AND t.status='queued'`)
    .bind(id).first<{learner_id:string;question:string;subject_id:string;lesson:string;draft:string;roadmap_step_id:string|null;item:string;display_name:string|null;enabled:number;completed_at:string|null;flag:string|null;sensitivity:SubjectSensitivity|null}>();
  if (!row || !row.enabled || row.completed_at || row.flag === 'item_void') return null;
  const sensitivity = row.sensitivity ?? 'normal';
  const clean = (v: unknown) => safeText(v, sensitivity);
  const lesson = JSON.parse(row.lesson) as Record<string, unknown>;
  const item = JSON.parse(row.item) as {id:string;prompt?:string;choices?:{id:string;text:string}[]} & Record<string, unknown>;
  const draft = JSON.parse(row.draft) as Record<string,{answer?:string}>;
  const notes = await contextExcerpt(db, { subjectId: row.subject_id, query: [lesson.title, lesson.objective, item.prompt].join(' '), forStepIds: row.roadmap_step_id ? [row.roadmap_step_id] : undefined });
  // Only learner-facing knowledge fields are selected; item keys, solutions and rubrics are never serialized.
  const knowledge = [lesson.sheet, lesson.sections, lesson.knowledge].filter(Boolean);
  // Structured exercises need their visible fragments/options, but never keys or rubrics.
  const visibleFields = ['input','instructions','fragments','left','right','steps','image','description','marks','headers','rowLabels','language','starter','lines'];
  const details = Object.fromEntries(visibleFields.filter(key => item[key] !== undefined).map(key => [key, item[key]]));
  return { learnerId: row.learner_id, context: {
    nickname: clean(row.display_name || 'Người học'), question: clean(row.question), prompt: clean(item.prompt),
    choices: (item.choices ?? []).map(choice => ({id:choice.id, text:clean(choice.text)})),
    details: clean(JSON.stringify(details)), draft: clean(draft[item.id]?.answer), knowledge: clean(JSON.stringify(knowledge)),
    notes: notes ? notes.notes.map(note => ({heading:clean(note.heading), body:clean(note.body)})) : [],
  }};
}
