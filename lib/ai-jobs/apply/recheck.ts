import type { EvidenceDb } from '../../evidence/submit.ts';
import type { AssessContext, AssessResult } from '../../contracts/ai-common.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../../automation/privacy.ts';
import type { Job } from '../context/common.ts';
import type { ValidationIssue } from './plan.ts';
import { checkGradeEvidence } from './evidence.ts';

/**
 * Applies an AI recheck (AI-API §8): upheld keeps the grade, overturned adds a new AI grade and
 * supersedes the old one (a wrong automatic key gets `key_issue`), item_void removes the item from evidence.
 * Skills are recomputed after the batch commits (see applyResult).
 */
export async function prepareRecheck(db: EvidenceDb, job: Job, context: AssessContext, result: AssessResult, token: string, now: Date) {
  const errors: ValidationIssue[] = [],
    statements: ReturnType<EvidenceDb['prepare']>[] = [],
    gradeIds: string[] = [];
  const issue = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const gate = 'EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)';
  const dispute = await db
    .prepare(
      `SELECT d.id,d.attempt_id,d.grade_id,d.status,a.lesson_id,a.item_id,a.answer,g.grader,g.result FROM disputes d
       JOIN attempts a ON a.id=d.attempt_id JOIN grades g ON g.id=d.grade_id WHERE d.id=? AND d.learner_id=?`,
    )
    .bind(job.ref_id, job.learner_id)
    .first<{
      id: string;
      attempt_id: string;
      grade_id: string;
      status: string;
      lesson_id: string;
      item_id: string;
      answer: string;
      grader: string;
      result: string;
    }>();
  const decision = result.recheckDecision;
  if (!dispute || (context.recheck as { disputeId?: string } | null)?.disputeId !== dispute.id)
    issue('/recheckDecision', 'unknown_reference', 'Phản đối không khớp ngữ cảnh.');
  if (!decision) issue('/recheckDecision', 'schema', 'Lượt chấm lại cần recheckDecision.');
  if (result.diagnosis.length || result.masteryProposals.length || result.reviewProposals.length || result.errorPatternUpdates.length)
    issue('/', 'schema', 'Lượt chấm lại chỉ gửi quyết định và (khi lật điểm) một điểm mới.');
  if (!dispute || !decision) return { errors, statements, gradeIds, skillIds: [], clipped: [], attemptGuards: [] };

  const attempt = context.attempts.find((a) => a.attemptId === dispute.attempt_id);
  const text = [decision.explanation, ...result.grades.flatMap((g) => [g.feedback, g.correction])].join('\n');
  if (containsContactDetails(text) || containsPossibleClinicalIdentifier(text, context.subject.sensitivity))
    issue('/recheckDecision', 'privacy', 'Lời giải thích có thể chứa định danh.');
  if (decision.decision === 'overturned') {
    const grade = result.grades[0];
    if (result.grades.length !== 1 || grade.attemptId !== dispute.attempt_id)
      issue('/grades', 'missing_grade', 'Lật điểm cần đúng một điểm mới cho câu bị phản đối.');
    else if (grade.result === dispute.result) issue('/grades/0', 'schema', 'Điểm mới phải khác điểm bị phản đối.');
    else if (grade.result === 'ungradable') issue('/grades/0', 'schema', 'Câu không chấm được thì dùng item_void.');
    else if (attempt?.rubric && grade.rubricScores.length !== attempt.rubric.length)
      issue('/grades/0/rubricScores', 'schema', 'Cần điểm cho từng tiêu chí rubric.');
  } else if (result.grades.length) issue('/grades', 'schema', 'Chỉ gửi điểm mới khi lật điểm.');
  if (errors.length) return { errors, statements, gradeIds, skillIds: attempt?.skills ?? [], clipped: [], attemptGuards: [] };

  const stamp = now.toISOString(),
    args = [job.id, token];
  // The dispute must still be waiting for this recheck; otherwise the whole batch aborts.
  statements.push(
    db
      .prepare(
        `INSERT INTO ai_apply_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM disputes WHERE id=? AND status='rechecking') THEN 1 ELSE 0 END WHERE ${gate}`,
      )
      .bind(token + ':dispute', dispute.id, ...args),
  );
  const status = decision.decision;
  let resolutionGrade: string | null = null;
  if (status === 'overturned') {
    const grade = result.grades[0],
      id = 'gr_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);
    const evidence = checkGradeEvidence(grade, dispute.answer, attempt?.attachments.some((img) => !img.expired) ?? false);
    if (evidence.invalid)
      issue('/grades/0/errors', 'schema', 'Trích dẫn bằng chứng phải có thật trong câu trả lời văn bản.');
    for (const error of grade.errors) {
      const text = error.label + error.evidence;
      if (containsContactDetails(text) || containsPossibleClinicalIdentifier(text, context.subject.sensitivity))
        issue('/grades/0/errors', 'privacy', 'Chẩn đoán lỗi có định danh.');
    }
    if (errors.length) return { errors, statements: [], gradeIds, skillIds: attempt?.skills ?? [], clipped: [], attemptGuards: [] };
    resolutionGrade = id;
    gradeIds.push(id);
    statements.push(
      db
        .prepare(
          `INSERT INTO grades(id,attempt_id,grader,job_id,result,score,rubric_scores,feedback,correction,errors,created_at) SELECT ?,?,'ai',?,?,?,?,?,?,?,? WHERE ${gate}`,
        )
        .bind(
          id,
          dispute.attempt_id,
          job.id,
          grade.result,
          grade.score,
          JSON.stringify(grade.rubricScores),
          evidence.feedback,
          grade.correction,
          JSON.stringify(evidence.errors),
          stamp,
          ...args,
        ),
      db.prepare(`UPDATE grades SET superseded_by=? WHERE id=? AND ${gate}`).bind(id, dispute.grade_id, ...args),
      db.prepare(`UPDATE attempts SET status='graded',current_grade_id=? WHERE id=? AND ${gate}`).bind(id, dispute.attempt_id, ...args),
    );
    if (dispute.grader === 'auto')
      statements.push(
        db
          .prepare(`UPDATE lesson_items SET flag='key_issue' WHERE lesson_id=? AND item_id=? AND learner_id=? AND flag IS NULL AND ${gate}`)
          .bind(dispute.lesson_id, dispute.item_id, job.learner_id, ...args),
      );
  } else if (status === 'upheld') {
    statements.push(db.prepare(`UPDATE attempts SET status='graded' WHERE id=? AND status='disputed' AND ${gate}`).bind(dispute.attempt_id, ...args));
  } else {
    statements.push(
      db.prepare(`UPDATE attempts SET status='void' WHERE id=? AND ${gate}`).bind(dispute.attempt_id, ...args),
      db
        .prepare(`UPDATE lesson_items SET flag='item_void' WHERE lesson_id=? AND item_id=? AND learner_id=? AND ${gate}`)
        .bind(dispute.lesson_id, dispute.item_id, job.learner_id, ...args),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE disputes SET status=?,resolution_grade_id=?,resolved_by='ai',resolution_note=?,resolved_at=? WHERE id=? AND status='rechecking' AND ${gate}`,
      )
      .bind(status, resolutionGrade, decision.explanation, stamp, dispute.id, ...args),
  );
  return { errors, statements, gradeIds, skillIds: attempt?.skills ?? [], clipped: [], attemptGuards: [] };
}
