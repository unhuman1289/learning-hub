import type { LessonAudio } from '../audio/lesson.ts';
import {cutoffFor} from '../daily-policy.ts';
import { ApiError } from '../api-error.ts';
import type { AudioSpec, LessonItemAny, LessonPackage } from '../contracts/lesson-package-v3.ts';
import type { Db } from '../subjects/service.ts';

export type LessonSlot = 'primary' | 'review' | 'extra';
export type NewLessonV2 = {
  id?: string; learnerId: string; subjectId: string; day: string; lesson: LessonPackage;
  guardCompletion?: boolean; extraStatements?: unknown[]; reason?: string; originJobId?: string | null; now?: Date;
};

const slotFor = (kind: LessonPackage['kind']): LessonSlot => (kind === 'review' ? 'review' : kind === 'exploration' ? 'extra' : 'primary');
export const lessonVersion = (lesson: LessonPackage) => lesson.contract === 'lesson-package/3' ? '3' : '2';

/** "  Sửa câu:  Lena KANN … " and "sửa câu: lena kann …" hash the same; used to refuse repeated prompts (H5.5). */
export async function promptHash(prompt: string) {
  const normalized = prompt.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newLessonId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'les_' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores a validated lesson and its items in one batch. Invariants such as "one primary lesson per
 * notebook per day" are enforced by the partial unique index; a clash answers 409.
 */
export async function insertLessonV2(db: Db & { batch(statements: unknown[]): Promise<unknown> }, input: NewLessonV2) {
  const { lesson, learnerId, subjectId, day } = input;
  const id = input.id ?? newLessonId();
  const version = lessonVersion(lesson);
  const now = (input.now ?? new Date()).toISOString();
  const stageOf = new Map(lesson.stages.flatMap((stage) => stage.itemIds.map((itemId) => [itemId, stage.stage] as const)));
  const hashes = await Promise.all(lesson.items.map((item) => promptHash(item.prompt)));
  const statements = [
    db.prepare(`INSERT INTO learning_lessons (id, user_id, track, payload, assigned_date, completed_at, response, updated, subject_id,
        package_version, template, kind, slot, reason, reason_refs, est_minutes, origin_job_id)
      SELECT ?, ?, NULL, ?, ?, NULL, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (?=0 OR NOT EXISTS(SELECT 1 FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot=? AND (completed_at IS NULL OR completed_at>=?)))
        AND (?='2' OR EXISTS(SELECT 1 FROM subjects WHERE id=? AND learner_id=? AND status='active'))`)
      .bind(id, learnerId, JSON.stringify(lesson), day, now, subjectId, version, lesson.template, lesson.kind, slotFor(lesson.kind),
        (input.reason ?? lesson.why).slice(0, 400), JSON.stringify(lesson.reasonRefs), lesson.estMinutes, input.originJobId ?? null,input.guardCompletion?1:0,learnerId,subjectId,slotFor(lesson.kind),cutoffFor(day),version,subjectId,learnerId),
    ...lesson.items.map((item, index) => db.prepare(`INSERT INTO lesson_items (lesson_id, item_id, learner_id, subject_id, stage, activity, input_kind,
        skill_ids, difficulty, auto_gradable, prompt_hash, origin, payload, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'plan', ?, ? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=?)`)
      .bind(id, item.id, learnerId, subjectId, stageOf.get(item.id), item.activity, item.input, JSON.stringify(item.skills), item.difficulty,
        item.key ? 1 : 0, hashes[index], JSON.stringify(item), now,id)),
    ...(input.extraStatements??[]),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'Sổ này đã có bài cùng loại hôm nay.');
    throw error;
  }
  const saved=await db.prepare('SELECT id FROM learning_lessons WHERE id=? AND user_id=?').bind(id,learnerId).first();
  if(!saved)throw new ApiError(409,'Bài hiện tại chưa đủ điều kiện thay thế.');
  return id;
}

/** What a learner may see of an item before revealing hints or the solution, or before it is graded. */
type PublicAudio = Omit<AudioSpec, 'lines'> & { src?: { f: string; m: string }; durationMs?: number };
type PublicItem<T> = T extends LessonItemAny ? Omit<T, 'key' | 'hints' | 'solution' | 'explanation' | 'audio'> : never;
export type ItemView = PublicItem<LessonItemAny> & {
  audio?: PublicAudio;
  stage: string; hintCount: number; revealed: { hints: string[]; solution?: string; explanation?: string; solutionSeen: boolean }; flag: string | null;
};
export type Support = Record<string, 'hint1' | 'hint2' | 'solution'>;

export function itemView(item: LessonItemAny & { audio?: AudioSpec & Partial<LessonAudio> }, stage: string, support: Support[string] | undefined, graded: boolean, flag: string | null = null): ItemView {
  const { key: _key, hints, solution, explanation, audio, ...visible } = item;
  void _key;
  const level = graded ? 'solution' : support;
  const shownHints = level === 'solution' ? hints : level === 'hint2' ? hints.slice(0, 2) : level === 'hint1' ? hints.slice(0, 1) : [];
  // A distractor's error label tells which choices are wrong; it is shown only once the item is graded.
  if (!graded && visible.choices) visible.choices = visible.choices.map(({ errorLabel: _label, ...choice }) => (void _label, choice));
  return {
    ...visible, stage, hintCount: hints.length, flag,
    ...(audio ? { audio: {
      ...(audio.hashF && audio.hashM ? { src: { f: '/api/audio/' + audio.hashF, m: '/api/audio/' + audio.hashM } } : {}),
      lang: audio.lang, rate: audio.rate, maxPlays: audio.maxPlays,
      durationMs: audio.durationMs, transcript: audio.transcript,
    } } : {}),
    revealed: { hints: shownHints, solutionSeen: support === "solution", ...(level === 'solution' ? { solution, ...(explanation ? { explanation } : {}) } : {}) },
  };
}

type LessonRow = {
  id: string; subject_id: string; subject_title:string; payload: string; assigned_date: string; completed_at: string | null; updated: string; template: string;
  kind: string; slot: string; reason: string; est_minutes: number | null; draft: string; draft_revision: number; support: string; listen_log?: string; snoozed_until: string | null;
};
type ItemRow = { item_id: string; stage: string; payload: string; flag: string | null };

/** The learner-facing lesson strips answer keys and unrevealed help. */
export async function readLessonV2(db: Db, learnerId: string, lessonId: string, gradedItemIds: ReadonlySet<string> = new Set()) {
  const row = await db.prepare(`SELECT l.*,s.title AS subject_title FROM learning_lessons l
      JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id WHERE l.id=? AND l.user_id=? AND l.package_version IN ('2','3')`)
    .bind(lessonId, learnerId).first<LessonRow>();
  if (!row) throw new ApiError(404, 'Không tìm thấy bài.');
  const { results: items = [] } = await db.prepare('SELECT item_id, stage, payload, flag FROM lesson_items WHERE lesson_id = ? ORDER BY rowid').bind(lessonId).all<ItemRow>();
  const lesson = JSON.parse(row.payload) as LessonPackage;
  const support = JSON.parse(row.support) as Support;
  return {
    id: row.id, subjectId: row.subject_id, subjectTitle:row.subject_title, assignedDate: row.assigned_date, completedAt: row.completed_at, updated: row.updated,
    kind: row.kind, slot: row.slot, template: row.template, reason: row.reason, estMinutes: row.est_minutes, snoozedUntil: row.snoozed_until,
    title: lesson.title, objective: lesson.objective, why: lesson.why, level: lesson.level, sheet: lesson.sheet, sections: lesson.sections,
    diagram: lesson.diagram, output: lesson.output, sources: lesson.sources, nextTopic: lesson.nextTopic,
    ...(lesson.contract === 'lesson-package/3' ? { knowledge: lesson.knowledge } : {}),
    stages: lesson.stages.map((stage) => ({ stage: stage.stage, title: stage.title, itemIds: stage.itemIds })),
    items: items.map((item) => itemView(JSON.parse(item.payload) as LessonItemAny, item.stage, support[item.item_id], gradedItemIds.has(item.item_id), item.flag)),
    draft: JSON.parse(row.draft) as Record<string, { answer: string; attachmentIds?: string[] }>,
    draftRevision: row.draft_revision,
    listen_log: JSON.parse(row.listen_log ?? "{}") as Record<string, number>,
  };
}
