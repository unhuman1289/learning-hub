import type {EvidenceDb} from '../evidence/submit.ts';
import {roadmapProgressWrite} from '../roadmap/progress.ts';
import {addDays} from '../learner-model/rules.ts';
import { ApiError } from '../api-error.ts';
import { berlinDay } from '../daily-policy.ts';
import type { LessonItem } from '../contracts/lesson-items.ts';
import type { Db } from '../subjects/service.ts';
import type { Support } from './store.ts';

export type DraftAnswers = Record<string, { answer: string; attachmentIds?: string[] }>;
export type RevealLevel = 'hint1' | 'hint2' | 'solution';

const levels: RevealLevel[] = ['hint1', 'hint2', 'solution'];
const ITEM_ID = /^i\d{1,2}$/;
const ATTACHMENT_ID = /^img_[0-9a-f]{20}$/;
const MAX_ANSWER = 8000;

const bad = (message: string) => new ApiError(400, message);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function lessonRow(db: Db, learnerId: string, lessonId: string) {
  const row = await db.prepare(`SELECT id, draft, draft_revision, support FROM learning_lessons WHERE id = ? AND user_id = ? AND package_version IN ('2','3')`)
    .bind(lessonId, learnerId).first<{ id: string; draft: string; draft_revision: number; support: string }>();
  if (!row) throw new ApiError(404, 'Không tìm thấy bài.');
  return row;
}

async function itemIds(db: Db, lessonId: string) {
  const { results = [] } = await db.prepare('SELECT item_id FROM lesson_items WHERE lesson_id = ?').bind(lessonId).all<{ item_id: string }>();
  return new Set(results.map((row) => row.item_id));
}

export function parseDraft(body: unknown): { revision: number; answers: DraftAnswers } {
  if (!isRecord(body) || !Number.isInteger(body.revision) || (body.revision as number) < 0 || !isRecord(body.answers)) throw bad('Nháp không hợp lệ.');
  const entries = Object.entries(body.answers);
  if (entries.length > 25) throw bad('Nháp có quá nhiều câu.');
  const answers: DraftAnswers = {};
  for (const [itemId, value] of entries) {
    if (!ITEM_ID.test(itemId) || !isRecord(value) || typeof value.answer !== 'string' || value.answer.length > MAX_ANSWER) throw bad(`Câu trả lời ${itemId} không hợp lệ.`);
    const attachmentIds = value.attachmentIds;
    if (attachmentIds !== undefined && (!Array.isArray(attachmentIds) || attachmentIds.length > 4 || !attachmentIds.every((id) => typeof id === 'string' && ATTACHMENT_ID.test(id)))) {
      throw bad(`Ảnh của câu ${itemId} không hợp lệ.`);
    }
    answers[itemId] = attachmentIds?.length ? { answer: value.answer, attachmentIds: attachmentIds as string[] } : { answer: value.answer };
  }
  return { revision: body.revision as number, answers };
}

/** Replaces the whole draft when the editor saw the current revision; otherwise 409 (another device saved first). */
export async function saveDraft(db: Db, learnerId: string, lessonId: string, input: { revision: number; answers: DraftAnswers }, now = new Date()) {
  await lessonRow(db, learnerId, lessonId);
  const known = await itemIds(db, lessonId);
  const unknown = Object.keys(input.answers).find((itemId) => !known.has(itemId));
  if (unknown) throw bad(`Bài không có câu ${unknown}.`);
  const result = await db.prepare(`UPDATE learning_lessons SET draft = ?, draft_revision = draft_revision + 1, updated = ?
      WHERE id = ? AND user_id = ? AND package_version IN ('2','3') AND draft_revision = ?`)
    .bind(JSON.stringify(input.answers), now.toISOString(), lessonId, learnerId, input.revision).run();
  if (!result.meta.changes) throw new ApiError(409, 'Nháp đã được lưu từ thiết bị khác. Tải lại để xem bản mới nhất; câu đang viết vẫn còn trên trang.');
  return { revision: input.revision + 1 };
}

/**
 * Opens the next hint or the solution. The support level is written before the content is returned,
 * so a reveal is always recorded (it decides how strong the evidence is, DATA-MODEL §3.1), and it never goes down.
 */
export async function reveal(db: Db, learnerId: string, lessonId: string, itemId: string, level: unknown) {
  if (!levels.includes(level as RevealLevel)) throw bad('Mức gợi ý không hợp lệ.');
  const row = await lessonRow(db, learnerId, lessonId);
  const itemRow = await db.prepare('SELECT payload FROM lesson_items WHERE lesson_id = ? AND item_id = ?').bind(lessonId, itemId).first<{ payload: string }>();
  if (!itemRow) throw new ApiError(404, 'Không tìm thấy câu.');
  const item = JSON.parse(itemRow.payload) as LessonItem;
  const wanted = level as RevealLevel;
  if (wanted === 'hint1' && item.hints.length < 1) throw bad('Câu này không có gợi ý.');
  if (wanted === 'hint2' && item.hints.length < 2) throw bad('Câu này không có gợi ý thứ hai.');

  const support = JSON.parse(row.support) as Support;
  const current = support[itemId];
  const next = current && levels.indexOf(current) > levels.indexOf(wanted) ? current : wanted;
  if (next !== current) {
    support[itemId] = next;
    // Compare-and-set on the stored JSON so two quick reveals cannot overwrite each other.
    const result = await db.prepare(`UPDATE learning_lessons SET support = ? WHERE id = ? AND user_id = ? AND support = ?`)
      .bind(JSON.stringify(support), lessonId, learnerId, row.support).run();
    if (!result.meta.changes) return reveal(db, learnerId, lessonId, itemId, level);
  }
  const shown = next === 'solution' ? item.hints : next === 'hint2' ? item.hints.slice(0, 2) : item.hints.slice(0, 1);
  return { support: next, hints: shown, ...(next === 'solution' ? { solution: item.solution, ...(item.explanation ? { explanation: item.explanation } : {}) } : {}) };
}

/** "Để mai": hides the lesson from today's desk until the next Berlin day. */
export async function snooze(db: Db, learnerId: string, lessonId: string, now = new Date()) {
  await lessonRow(db, learnerId, lessonId);
  const tomorrow = addDays(berlinDay(now),1);
  await db.prepare('UPDATE learning_lessons SET snoozed_until = ? WHERE id = ? AND user_id = ?').bind(tomorrow, lessonId, learnerId).run();
  return { snoozedUntil: tomorrow };
}

/** Completion is a learner action, independent of grades; uses the current server timestamp. */
export async function completeLesson(db:EvidenceDb,learnerId:string,id:string,completed:boolean,expectedUpdated:string,now=new Date()){
 const stamp=now.toISOString();
 const write=db.prepare("UPDATE learning_lessons SET completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,?) ELSE NULL END,updated=? WHERE id=? AND user_id=? AND package_version IN ('2','3') AND updated=?").bind(completed?1:0,stamp,stamp,id,learnerId,expectedUpdated);
 const [result]=await db.batch(completed?[write,roadmapProgressWrite(db,learnerId,id,now,'updated=?',[stamp])]:[write]) as {meta:{changes:number}}[];
 if(!result.meta.changes)throw new ApiError(409,'Bài đã đổi. Tải lại trước khi đánh dấu.');
 const row=await db.prepare('SELECT completed_at,updated,subject_id FROM learning_lessons WHERE id=? AND user_id=?').bind(id,learnerId).first<{completed_at:string|null;updated:string;subject_id:string|null}>();
 return {completedAt:row!.completed_at,updated:row!.updated,completed};
}
