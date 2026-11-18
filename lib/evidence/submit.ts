import { parseDraft } from '../lesson-v2/actions.ts';
import {roadmapProgressWrite} from '../roadmap/progress.ts';
import { recomputeSubmission } from '../learner-model/recompute.ts';
import { ApiError } from '../api-error.ts';
import type { Db } from '../subjects/service.ts';
import type { LessonItemAny } from '../contracts/lesson-package-v3.ts';
import type { DraftAnswers, RevealLevel } from '../lesson-v2/actions.ts';
import { berlinDay } from '../daily-policy.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../automation/privacy.ts';
import { autoGrade, autoGradeStructured } from './autograde.ts';
import { hasLessonAnswer, parseStructuredAnswer } from '../lesson-v2/answer.ts';
import { evidenceStrength } from './strength.ts';
export type EvidenceDb = Db & { batch(statements: unknown[]): Promise<unknown> };
export type SubmissionInput = { clientSubmissionId: string; draftRevision: number; stage: string | null; itemIds: string[] | null; answers?: DraftAnswers };
const stages = ['retrieval', 'guided', 'independent', 'analyze', 'output', 'check'];
const makeId = (prefix: string) => prefix + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
export function parseSubmission(value: unknown): SubmissionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Dữ liệu nộp bài không hợp lệ.');
  const x = value as Record<string, unknown>;
  if (
    Object.keys(x).some((k) => !['clientSubmissionId', 'draftRevision', 'stage', 'itemIds', 'answers'].includes(k)) ||
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
    ...(x.answers === undefined ? {} : { answers: parseDraft({ revision: x.draftRevision, answers: x.answers }).answers }),
  };
}
async function requestHash(input: SubmissionInput) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
/**
 * Two-step correction (docs/plan/LOCAL-GRADER.md D21): after a first wrong answer the learner sees where the problem is,
 * not the fixed answer. The correction appears once a retry is still not right or the solution was opened (support=solution).
 */
export function hiddenCorrection(a: Record<string, unknown>, lessonSupport: Record<string, string>) {
  const wrong = a.result === 'incorrect' || a.result === 'partial';
  const revealed = (a.attempt_no as number) > 1 || a.support === 'solution' || lessonSupport[a.item_id as string] === 'solution';
  return wrong && !revealed ? { correction: null, correctionHidden: true } : { correctionHidden: false };
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
 g.result,g.score,g.feedback,g.correction,
 (SELECT json_object('id',d.id,'status',d.status,'note',d.resolution_note) FROM disputes d WHERE d.attempt_id=a.id ORDER BY d.created_at DESC LIMIT 1) AS dispute
 FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id WHERE a.submission_id=? AND a.learner_id=? ORDER BY a.rowid`,
    )
    .bind(id, learnerId)
    .all<Record<string, unknown>>();
  const lesson = await db
    .prepare('SELECT support FROM learning_lessons WHERE id=? AND user_id=?')
    .bind(row.lesson_id, learnerId)
    .first<{ support: string }>();
  const support = JSON.parse(lesson?.support ?? '{}') as Record<string, string>;
  return {
    ...row,
    id: String(row.id),
    attempts: results.map((a) => ({
      ...a,
      ...hiddenCorrection(a, support),
      attachmentIds: JSON.parse(a.attachment_ids as string),
      dispute: a.dispute ? (JSON.parse(a.dispute as string) as { id: string; status: string; note: string | null }) : null,
      strength: a.result ? evidenceStrength(a.result as 'correct', a.support as 'none', a.attempt_no as number) : null,
    })),
  };
}
/** Saved feedback history. A cancelled/pending retry never hides previously graded submissions. */
export async function readLessonSubmissions(db:Db,learnerId:string,lessonId:string){
 const owner=await db.prepare("SELECT id,support FROM learning_lessons WHERE id=? AND user_id=? AND package_version IN ('2','3')").bind(lessonId,learnerId).first<{id:string;support:string|null}>();
 if(!owner)throw new ApiError(404,'Không tìm thấy bài.');
 const support=JSON.parse(owner.support??'{}') as Record<string,string>;
 const {results:rows=[]}=await db.prepare(`SELECT s.id,s.stage,s.status,s.created_at,j.status AS job_status,CASE WHEN j.status='succeeded' THEN json_extract(j.outcome,'$.summary') END AS summary FROM submissions s LEFT JOIN ai_jobs j ON j.id=s.ai_job_id WHERE s.lesson_id=? AND s.learner_id=? AND (s.id IN (SELECT id FROM submissions WHERE lesson_id=s.lesson_id AND learner_id=s.learner_id ORDER BY created_at DESC,rowid DESC LIMIT 30) OR EXISTS(SELECT 1 FROM attempts a WHERE a.submission_id=s.id AND (SELECT count(*) FROM attempts b WHERE b.lesson_id=a.lesson_id AND b.item_id=a.item_id AND b.attempt_no>a.attempt_no)<2) OR EXISTS(SELECT 1 FROM attempts a WHERE a.submission_id=s.id AND a.current_grade_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM attempts b WHERE b.lesson_id=a.lesson_id AND b.item_id=a.item_id AND b.current_grade_id IS NOT NULL AND b.attempt_no>a.attempt_no))) ORDER BY s.created_at DESC,s.rowid DESC`).bind(lessonId,learnerId).all<Record<string,unknown>>();
 if(!rows.length)return [];
 const {results:attempts=[]}=await db.prepare(`SELECT a.submission_id,a.id,a.item_id,a.answer,a.attachment_ids,a.attempt_no,a.support,a.status,g.result,g.score,g.feedback,g.correction,
 (SELECT json_object('id',d.id,'status',d.status,'note',d.resolution_note) FROM disputes d WHERE d.attempt_id=a.id ORDER BY d.created_at DESC LIMIT 1) AS dispute
 FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id WHERE a.lesson_id=? AND a.learner_id=? AND a.submission_id IN (SELECT value FROM json_each(?)) ORDER BY a.rowid`).bind(lessonId,learnerId,JSON.stringify(rows.map(r=>r.id))).all<Record<string,unknown>>();
 return rows.map(row=>({...row,id:String(row.id),attempts:attempts.filter(a=>a.submission_id===row.id).map(a=>({...a,...hiddenCorrection(a,support),attachmentIds:JSON.parse(String(a.attachment_ids)),dispute:a.dispute?JSON.parse(String(a.dispute)):null}))}));
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
  const since = new Date(now.getTime() - 60000).toISOString();
  const [lesson, rate, { results: all = [] }, { results: latest = [] }] = await Promise.all([
    db
    .prepare(
      `SELECT l.subject_id,l.payload,l.draft,l.draft_revision,l.support,l.listen_log,l.kind,l.completed_at,s.sensitivity,
        (SELECT json_type(preferences,'$.replaceAudioWithText') FROM learner_settings WHERE user_id=l.user_id) AS text_preference
        FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id WHERE l.id=? AND l.user_id=? AND l.package_version IN ('2','3')`,
    )
    .bind(lessonId, learnerId)
    .first<{
      subject_id: string;
      payload: string;
      draft: string;
      draft_revision: number;
      support: string;
      listen_log: string;
      text_preference: string | null;
      kind: string;
      completed_at: string | null;
      sensitivity: 'normal' | 'clinical' | 'child_dev';
    }>(),
    db
    .prepare('SELECT COUNT(*) AS n FROM submissions WHERE learner_id=? AND created_at>?')
    .bind(learnerId, since)
    .first<{ n: number }>(),
    db
    .prepare('SELECT item_id,stage,payload,skill_ids,activity FROM lesson_items WHERE lesson_id=? AND learner_id=?')
    .bind(lessonId, learnerId)
    .all<{ item_id: string; stage: string; payload: string; skill_ids: string; activity: string }>(),
    db
    .prepare(
      `SELECT a.item_id,a.id,a.attempt_no,a.answer,a.attachment_ids,a.status,a.support,g.result,g.correction FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id
       WHERE a.lesson_id=? AND a.learner_id=? AND a.attempt_no=(SELECT max(attempt_no) FROM attempts b WHERE b.lesson_id=a.lesson_id AND b.item_id=a.item_id)`,
    )
    .bind(lessonId, learnerId)
    .all<{ item_id: string; id: string; attempt_no: number; answer: string; attachment_ids: string; status: string; support: string; result: string | null; correction: string | null }>(),
  ]);
  if (!lesson) throw new ApiError(404, 'Không tìm thấy bài.');
  if (lesson.completed_at) throw new ApiError(409, 'Bỏ dấu đã học trước khi nộp sửa lại.');
  if (lesson.draft_revision !== input.draftRevision) throw new ApiError(409, 'Nháp đã thay đổi. Lưu lại nháp trước khi nộp.');
  if ((rate?.n ?? 0) >= 30) throw new ApiError(429, 'Bạn vừa nộp nhiều lần. Thử lại sau một phút.');
  const wholeLesson = JSON.parse(lesson.payload).gradingMode === 'whole-lesson';
  if (wholeLesson && (input.stage || input.itemIds))
    throw new ApiError(400, 'Bài này cần nộp cả lượt ở cuối bài.');
  if (wholeLesson && latest.some(attempt => attempt.status === 'pending'))
    throw new ApiError(409, 'Lượt trước đang chờ chấm.');
  let selected = all.filter((row) => (!input.stage || row.stage === input.stage) && (!input.itemIds || input.itemIds.includes(row.item_id)));
  if (!selected.length || (input.itemIds && selected.length !== input.itemIds.length))
    throw new ApiError(400, 'Câu không thuộc bài hoặc giai đoạn này.');
  if (input.answers && Object.keys(input.answers).some(item => !all.some(row => row.item_id === item)))
    throw new ApiError(400, 'Nháp có câu không thuộc bài này.');
  const draft = input.answers ?? JSON.parse(lesson.draft) as DraftAnswers,
    support = JSON.parse(lesson.support) as Record<string, RevealLevel>;
  const plays = JSON.parse(lesson.listen_log) as Record<string, number>;
  if (wholeLesson) {
    selected = selected.filter(row => {
      const previous = latest.find(attempt => attempt.item_id === row.item_id);
      return !previous || (draft[row.item_id]?.answer ?? '') !== previous.answer ||
        JSON.stringify(draft[row.item_id]?.attachmentIds ?? []) !== previous.attachment_ids ||
        (support[row.item_id] === 'solution' && previous.support !== 'solution');
    });
    if (!selected.length) throw new ApiError(400, 'Chưa có câu mới hoặc câu đã sửa để nộp.');
  }
  const id = makeId('subm_'),
    stamp = now.toISOString();
  const attachmentIds = selected.flatMap(row => draft[row.item_id]?.attachmentIds ?? []);
  const { results: availablePhotos = [] } = attachmentIds.length
    ? await db.prepare('SELECT id FROM attachments WHERE learner_id=? AND deleted_at IS NULL AND expires_at>? AND id IN (SELECT value FROM json_each(?))')
      .bind(learnerId, stamp, JSON.stringify(attachmentIds)).all<{ id: string }>()
    : {};
  const ownedPhotos = new Set(availablePhotos.map(photo => photo.id));
  const gate = 'EXISTS(SELECT 1 FROM submissions WHERE id=?)';
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO submissions(id,learner_id,lesson_id,stage,client_submission_id,request_hash,status,created_at)
 SELECT ?,?,?,?,?,?,'grading',? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND draft_revision=? AND support=? AND listen_log=? AND completed_at IS NULL
   AND (SELECT json_type(preferences,'$.replaceAudioWithText') FROM learner_settings WHERE user_id=?) IS ?)
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
        lesson.listen_log,
        learnerId,
        lesson.text_preference,
        learnerId,
        since,
      ),
  ];
  if (input.answers) {
    statements.push(db.prepare(`UPDATE learning_lessons SET draft=?, draft_revision=draft_revision+1, updated=?
      WHERE id=? AND user_id=? AND ${gate}`)
      .bind(JSON.stringify(draft), stamp, lessonId, learnerId, id));
  }
  let pending = false;
  for (const row of selected) {
    const item = JSON.parse(row.payload) as LessonItemAny,
      answer = draft[row.item_id]?.answer ?? '',
      photos = draft[row.item_id]?.attachmentIds ?? [];
    const answered = hasLessonAnswer(item.input, answer) && !(item.input === 'code' && answer === item.starter);
    const skip = wholeLesson && support[row.item_id] === 'solution' && (item.input === 'short' || !answered);
    // Blank questions stay unanswered; their omission must not prevent submitting the rest.
    if (wholeLesson && !answered && !photos.length && !skip) continue;
    if (!skip && !(wholeLesson ? answered : hasLessonAnswer(item.input, answer)) && !photos.length) throw new ApiError(400, `Chưa có bài làm cho câu ${row.item_id}.`);
    if (item.attachment === 'required' && !photos.length) throw new ApiError(400, `Câu ${row.item_id} cần ảnh bài làm.`);
    if (item.attachment === 'none' && photos.length) throw new ApiError(400, `Câu ${row.item_id} không nhận ảnh.`);
    if (containsContactDetails(answer) || containsPossibleClinicalIdentifier(answer, lesson.sensitivity))
      throw new ApiError(400, 'Bài làm có thể chứa thông tin định danh. Hãy dùng ví dụ giả lập.');
    if (photos.some(photo => !ownedPhotos.has(photo))) throw new ApiError(400, 'Ảnh không thuộc người học hoặc đã hết hạn.');
    const previous = latest.find((attempt) => attempt.item_id === row.item_id);
    // Only a correction actually shown (or a manually revealed solution) counts as solution support.
    const shownCorrection = previous?.correction && previous.result !== 'correct' && !hiddenCorrection(previous, support).correctionHidden;
    const itemSupport = shownCorrection ? 'solution' : (support[row.item_id] ?? 'none');
    const stimulus = item.audio && lesson.text_preference !== 'true' && plays[row.item_id] > 0 ? 'audio' : 'text';
    const attemptId = makeId('att_'),
      gradeId = makeId('gr_'),
      number = (previous?.attempt_no ?? 0) + 1;
    const key = item.key;
    const grade = skip ? { result: 'incorrect', score: 0, feedback: 'Đã xem đáp án.' } : !photos.length && key && answer.trim()
      ? key.type === 'choice' || key.type === 'numeric' || key.type === 'text' || key.type === 'dictation'
        ? autoGrade(key, answer, item.audio?.lang) : autoGradeStructured(key, answer)
      : null;
    if (!grade) pending = true;
    statements.push(
      db
        .prepare(
          `INSERT INTO attempts(id,submission_id,learner_id,lesson_id,item_id,subject_id,skill_ids,activity,attempt_no,retry_of,answer,attachment_ids,support,context,status,current_grade_id,day,created_at,stimulus)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate}`,
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
          stimulus,
          id,
        ),
    );
    if (grade) {
      const choiceAnswer = item.input === 'choice' ? answer.trim() : '';
      const decoded = parseStructuredAnswer(choiceAnswer);
      const chosen = Array.isArray(decoded) ? decoded : [typeof decoded === 'string' ? decoded : choiceAnswer];
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
    roadmapProgressWrite(db,learnerId,lessonId,now,gate,[id]),
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
