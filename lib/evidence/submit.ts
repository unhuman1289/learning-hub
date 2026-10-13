import { recomputeSubmission } from '../learner-model/recompute.ts';
import { ApiError } from '../api-error.ts';
import type { Db } from '../subjects/service.ts';
import type { LessonItem } from '../contracts/lesson-package-v2.ts';
import type { DraftAnswers, RevealLevel } from '../lesson-v2/actions.ts';
import { berlinDay } from '../daily-policy.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../automation/privacy.ts';
import { autoGrade } from './autograde.ts';
import { evidenceStrength } from './strength.ts';
export type EvidenceDb = Db & { batch(statements: unknown[]): Promise<unknown> };
export type SubmissionInput = { clientSubmissionId: string; draftRevision: number; stage: string | null; itemIds: string[] | null };
const stages = ['retrieval', 'guided', 'independent', 'analyze', 'output', 'check'];
const makeId = (prefix: string) => prefix + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
export function parseSubmission(value: unknown): SubmissionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Dữ liệu nộp bài không hợp lệ.');
  const x = value as Record<string, unknown>;
  if (
    Object.keys(x).some((k) => !['clientSubmissionId', 'draftRevision', 'stage', 'itemIds'].includes(k)) ||
    typeof x.clientSubmissionId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x.clientSubmissionId) ||
    !Number.isInteger(x.draftRevision) ||
    (x.draftRevision as number) < 0
  )
    throw new ApiError(400, 'Mã lượt nộp hoặc phiên bản nháp không hợp lệ.');
  if (x.stage !== undefined && x.stage !== null && (typeof x.stage !== 'string' || !stages.includes(x.stage)))
    throw new ApiError(400, 'Giai đoạn không hợp lệ.');
  if (
    x.itemIds !== undefined &&
    x.itemIds !== null &&
    (!Array.isArray(x.itemIds) ||
      !x.itemIds.length ||
      x.itemIds.length > 25 ||
      !x.itemIds.every((id) => typeof id === 'string' && /^i\d{1,2}$/.test(id)) ||
      new Set(x.itemIds).size !== x.itemIds.length)
  )
    throw new ApiError(400, 'Danh sách câu không hợp lệ.');
  return {
    clientSubmissionId: x.clientSubmissionId,
    draftRevision: x.draftRevision as number,
    stage: (x.stage as string) ?? null,
    itemIds: (x.itemIds as string[]) ?? null,
  };
}
async function requestHash(input: SubmissionInput) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function readSubmission(db: Db, learnerId: string, id: string) {
  const row = await db
    .prepare('SELECT id,lesson_id,stage,status,created_at,graded_at FROM submissions WHERE id=? AND learner_id=?')
    .bind(id, learnerId)
    .first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, 'Không tìm thấy lượt nộp.');
  const { results = [] } = await db
    .prepare(
      `SELECT a.id,a.item_id,a.answer,a.attachment_ids,a.attempt_no,a.retry_of,a.support,a.status,
 g.result,g.score,g.feedback,g.correction FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id WHERE a.submission_id=? AND a.learner_id=? ORDER BY a.rowid`,
    )
    .bind(id, learnerId)
    .all<Record<string, unknown>>();
  return {
    ...row,
    id: String(row.id),
    attempts: results.map((a) => ({
      ...a,
      attachmentIds: JSON.parse(a.attachment_ids as string),
      strength: a.result ? evidenceStrength(a.result as 'correct', a.support as 'none', a.attempt_no as number) : null,
    })),
  };
}
export async function submitLesson(db: EvidenceDb, learnerId: string, lessonId: string, input: SubmissionInput, now = new Date()) {
  const hash = await requestHash(input);
  const existing = await db
    .prepare('SELECT id,lesson_id,request_hash FROM submissions WHERE learner_id=? AND client_submission_id=?')
    .bind(learnerId, input.clientSubmissionId)
    .first<{ id: string; lesson_id: string; request_hash: string }>();
  if (existing) {
    if (existing.lesson_id !== lessonId || existing.request_hash !== hash) throw new ApiError(409, 'Mã lượt nộp đã dùng với dữ liệu khác.');
    return { ...(await readSubmission(db, learnerId, existing.id)), replayed: true };
  }
  const lesson = await db
    .prepare(
      `SELECT l.subject_id,l.draft,l.draft_revision,l.support,l.kind,l.completed_at,s.sensitivity FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id WHERE l.id=? AND l.user_id=? AND l.package_version='2'`,
    )
    .bind(lessonId, learnerId)
    .first<{
      subject_id: string;
      draft: string;
      draft_revision: number;
      support: string;
      kind: string;
      completed_at: string | null;
      sensitivity: 'normal' | 'clinical' | 'child_dev';
    }>();
  if (!lesson) throw new ApiError(404, 'Không tìm thấy bài.');
  if (lesson.completed_at) throw new ApiError(409, 'Bỏ dấu đã học trước khi nộp sửa lại.');
  if (lesson.draft_revision !== input.draftRevision) throw new ApiError(409, 'Nháp đã thay đổi. Lưu lại nháp trước khi nộp.');
  const since = new Date(now.getTime() - 60000).toISOString();
  const rate = await db
    .prepare('SELECT COUNT(*) AS n FROM submissions WHERE learner_id=? AND created_at>?')
    .bind(learnerId, since)
    .first<{ n: number }>();
  if ((rate?.n ?? 0) >= 30) throw new ApiError(429, 'Bạn vừa nộp nhiều lần. Thử lại sau một phút.');
  const { results: all = [] } = await db
    .prepare('SELECT item_id,stage,payload,skill_ids,activity FROM lesson_items WHERE lesson_id=? AND learner_id=?')
    .bind(lessonId, learnerId)
    .all<{ item_id: string; stage: string; payload: string; skill_ids: string; activity: string }>();
  const selected = all.filter((row) => (!input.stage || row.stage === input.stage) && (!input.itemIds || input.itemIds.includes(row.item_id)));
  if (!selected.length || (input.itemIds && selected.length !== input.itemIds.length))
    throw new ApiError(400, 'Câu không thuộc bài hoặc giai đoạn này.');
  const draft = JSON.parse(lesson.draft) as DraftAnswers,
    support = JSON.parse(lesson.support) as Record<string, RevealLevel>;
  const id = makeId('subm_'),
    stamp = now.toISOString();
  const gate = 'EXISTS(SELECT 1 FROM submissions WHERE id=?)';
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO submissions(id,learner_id,lesson_id,stage,client_submission_id,request_hash,status,created_at)
 SELECT ?,?,?,?,?,?,'grading',? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND draft_revision=? AND support=? AND completed_at IS NULL)
 AND (SELECT COUNT(*) FROM submissions WHERE learner_id=? AND created_at>?)<30`,
      )
      .bind(
        id,
        learnerId,
        lessonId,
        input.stage,
        input.clientSubmissionId,
        hash,
        stamp,
        lessonId,
        learnerId,
        input.draftRevision,
        lesson.support,
        learnerId,
        since,
      ),
  ];
  // Latest attempt of every selected item in one query (Free allows ~50 D1 queries per request).
  const { results: latest = [] } = await db
    .prepare(
      `SELECT a.item_id,a.id,a.attempt_no,g.result FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id
       WHERE a.lesson_id=? AND a.attempt_no=(SELECT max(attempt_no) FROM attempts b WHERE b.lesson_id=a.lesson_id AND b.item_id=a.item_id)`,
    )
    .bind(lessonId)
    .all<{ item_id: string; id: string; attempt_no: number; result: string | null }>();
  let pending = false;
  for (const row of selected) {
    const item = JSON.parse(row.payload) as LessonItem,
      answer = draft[row.item_id]?.answer ?? '',
      photos = draft[row.item_id]?.attachmentIds ?? [];
    if (!answer.trim() && !photos.length) throw new ApiError(400, `Chưa có bài làm cho câu ${row.item_id}.`);
    if (item.attachment === 'required' && !photos.length) throw new ApiError(400, `Câu ${row.item_id} cần ảnh bài làm.`);
    if (item.attachment === 'none' && photos.length) throw new ApiError(400, `Câu ${row.item_id} không nhận ảnh.`);
    if (containsContactDetails(answer) || containsPossibleClinicalIdentifier(answer, lesson.sensitivity))
      throw new ApiError(400, 'Bài làm có thể chứa thông tin định danh. Hãy dùng ví dụ giả lập.');
    for (const photo of photos) {
      const image = await db
        .prepare('SELECT id FROM attachments WHERE id=? AND learner_id=? AND deleted_at IS NULL AND expires_at>?')
        .bind(photo, learnerId, stamp)
        .first();
      if (!image) throw new ApiError(400, 'Ảnh không thuộc người học hoặc đã hết hạn.');
    }
    const previous = latest.find((attempt) => attempt.item_id === row.item_id);
    // A graded wrong answer shows the solution, so the retry after it counts as worked with the solution (E0).
    const itemSupport = previous?.result && previous.result !== 'correct' ? 'solution' : (support[row.item_id] ?? 'none');
    const attemptId = makeId('att_'),
      gradeId = makeId('gr_'),
      number = (previous?.attempt_no ?? 0) + 1;
    const grade = item.key && answer.trim() ? autoGrade(item.key, answer) : null;
    if (!grade) pending = true;
    statements.push(
      db
        .prepare(
          `INSERT INTO attempts(id,submission_id,learner_id,lesson_id,item_id,subject_id,skill_ids,activity,attempt_no,retry_of,answer,attachment_ids,support,context,status,current_grade_id,day,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate}`,
        )
        .bind(
          attemptId,
          id,
          learnerId,
          lessonId,
          row.item_id,
          lesson.subject_id,
          row.skill_ids,
          row.activity,
          number,
          previous?.id ?? null,
          answer,
          JSON.stringify(photos),
          itemSupport,
          lesson.kind === 'review' ? 'review' : 'lesson',
          grade ? 'graded' : 'pending',
          grade ? gradeId : null,
          berlinDay(now),
          stamp,
          id,
        ),
    );
    if (grade) {
      const chosen: string[] = item.input === 'choice' ? JSON.parse(answer) : [];
      const labels =
        grade.result === 'incorrect'
          ? (item.choices ?? [])
              .filter((c) => c.errorLabel && chosen.includes(c.id))
              .map((c) => ({ skillId: item.skills[0], label: c.errorLabel, category: 'unknown', evidence: answer.slice(0, 200) }))
          : [];
      statements.push(
        db
          .prepare(
            `INSERT INTO grades(id,attempt_id,grader,result,score,feedback,correction,errors,created_at) SELECT ?,?,'auto',?,?,?,?,?,? WHERE ${gate}`,
          )
          .bind(gradeId, attemptId, grade.result, grade.score, grade.feedback, item.solution, JSON.stringify(labels), stamp, id),
      );
    }
  }
  statements.push(
    db.prepare('UPDATE submissions SET status=?,graded_at=? WHERE id=?').bind(pending ? 'deferred' : 'graded', pending ? null : stamp, id),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'Có lượt nộp khác vừa ghi. Tải kết quả trước khi thử lại.');
    throw error;
  }
  const saved = await db
    .prepare('SELECT id,lesson_id,request_hash FROM submissions WHERE learner_id=? AND client_submission_id=?')
    .bind(learnerId, input.clientSubmissionId)
    .first<{ id: string; lesson_id: string; request_hash: string }>();
  if (!saved) throw new ApiError(409, 'Nháp hoặc gợi ý đã đổi khi nộp. Kiểm tra lại trước khi thử.');
  if (saved.request_hash !== hash || saved.lesson_id !== lessonId) throw new ApiError(409, 'Mã lượt nộp đã dùng với dữ liệu khác.');
  await recomputeSubmission(db, learnerId, saved.id, now);
  return { ...(await readSubmission(db, learnerId, saved.id)), replayed: saved.id !== id };
}
