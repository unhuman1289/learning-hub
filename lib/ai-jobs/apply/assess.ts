import type { EvidenceDb } from '../../evidence/submit.ts';
import type { AssessContext, AssessResult } from '../../contracts/ai-common.ts';
import { itemIssues } from '../../lesson-v2/validate.ts';
import { lessonItem } from '../../contracts/lesson-items.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../../automation/privacy.ts';
import type { Job } from '../context/common.ts';
import {roadmapProgressWrite} from '../../roadmap/progress.ts';
import { prepareJobStates } from '../../learner-model/job-state.ts';
import type { ValidationIssue } from './plan.ts';
import { checkGradeEvidence } from './evidence.ts';
import { matchRubricScores, rubricIssues } from './rubric.ts';
import { promptHash } from '../../lesson-v2/store.ts';
export async function prepareAssess(db: EvidenceDb, job: Job, context: AssessContext, result: AssessResult, token: string, now: Date) {
  const errors: ValidationIssue[] = [],
    statements: ReturnType<EvidenceDb['prepare']>[] = [],
    gradeIds: string[] = [],
    skillIds = new Set<string>();
  const issue = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const gate = 'EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)';
  const all = context.attempts,
    open = all.filter((a) => !a.autoGrade),
    seen = new Set<string>();
  let checks = 0;
  const original = await db
    .prepare('SELECT payload FROM learning_lessons WHERE id=? AND user_id=?')
    .bind(context.lesson.lessonId, job.learner_id)
    .first<{ payload: string }>();
  const appended = JSON.parse(original!.payload),
    checkIds = new Set<string>();
  if (result.recheckDecision || job.purpose === 'recheck')
    issue('/recheckDecision', 'unknown_reference', 'Luồng phản đối/chấm lại được triển khai ở H6; không sửa grade hiện tại bằng job submission.');
  for (const [index, g] of result.grades.entries()) {
    const path = '/grades/' + index,
      a = all.find((x) => x.attemptId === g.attemptId);
    if (!a || seen.has(g.attemptId)) {
      issue(path, 'unknown_reference', 'Câu không thuộc ngữ cảnh hoặc bị chấm hai lần.');
      continue;
    }
    seen.add(a.attemptId);
    for (const sk of a.skills) skillIds.add(sk);
    if (a.autoGrade) {
      issue(path, 'auto_grade_locked', 'Không sửa điểm chấm tự động.');
      continue;
    }
    const current = await db
      .prepare('SELECT status,current_grade_id,answer FROM attempts WHERE id=? AND learner_id=?')
      .bind(a.attemptId, job.learner_id)
      .first<{ status: string; current_grade_id: string | null; answer: string }>();
    if (!current || current.status !== 'pending' || current.current_grade_id) {
      issue(path, 'unknown_reference', 'Câu đã thay đổi hoặc không còn chờ chấm.');
      continue;
    }
    if (
      containsContactDetails(g.feedback + '\n' + g.correction) ||
      containsPossibleClinicalIdentifier(g.feedback + '\n' + g.correction, context.subject.sensitivity)
    )
      issue(path, 'privacy', 'Lời phê có thể chứa định danh.');
    const solutionSeen = appended.gradingMode === 'whole-lesson' && a.support === 'solution';
    errors.push(...rubricIssues(g, a, path));
    if (g.errors.filter(e => e.category === 'extra').length > 2)
      issue(path + '/errors', 'schema', 'Tối đa hai lỗi ngoài rubric.');
    const evidence = checkGradeEvidence(g, current.answer, a.attachments.some((img) => !img.expired));
    if (evidence.invalid)
      issue(path + '/errors', 'schema', 'Trích dẫn bằng chứng phải có thật trong câu trả lời văn bản.');
    for (const e of g.errors) {
      if (
        !a.skills.includes(e.skillId) ||
        (e.patternId && !context.openErrorPatterns.some((p) => p.patternId === e.patternId && p.skillId === e.skillId))
      )
        issue(path + '/errors', 'unknown_reference', 'Lỗi không thuộc kỹ năng/ngữ cảnh.');
      if (containsContactDetails(e.label + e.evidence) || containsPossibleClinicalIdentifier(e.label + e.evidence, context.subject.sensitivity))
        issue(path + '/errors', 'privacy', 'Chẩn đoán lỗi có định danh.');
    }
    const id = 'gr_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);
    gradeIds.push(id);
    // Current-grade NULL is rechecked in the same batch: an older lease cannot replace a new grade.
    statements.push(
      db
        .prepare(
          `INSERT INTO grades(id,attempt_id,grader,job_id,result,score,rubric_scores,feedback,correction,errors,created_at) SELECT ?,?,'ai',?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND learner_id=? AND status='pending' AND current_grade_id IS NULL)`,
        )
        .bind(
          id,
          a.attemptId,
          job.id,
          solutionSeen ? 'incorrect' : g.result,
          solutionSeen ? 0 : g.score,
          JSON.stringify(solutionSeen ? [] : matchRubricScores(g, a)),
          solutionSeen ? 'Đã xem lời giải. ' + evidence.feedback : evidence.feedback,
          g.correction,
          JSON.stringify(solutionSeen ? [] : evidence.errors),
          now.toISOString(),
          job.id,
          token,
          a.attemptId,
          job.learner_id,
        ),
    );
    statements.push(
      db
        .prepare(
          `UPDATE attempts SET status='graded',current_grade_id=? WHERE id=? AND learner_id=? AND status='pending' AND current_grade_id IS NULL AND EXISTS(SELECT 1 FROM grades WHERE id=?) AND ${gate}`,
        )
        .bind(id, a.attemptId, job.learner_id, id, job.id, token),
    );
    if (g.checkItem && appended.gradingMode !== 'whole-lesson') {
      checks++;
      const checked = lessonItem.safeParse(g.checkItem);
      if (!checked.success) issue(path + '/checkItem', 'schema', 'Câu kiểm tra không hợp lệ.');
      if (g.checkItem.skills.some((sk) => !a.skills.includes(sk)))
        issue(path + '/checkItem', 'unknown_reference', 'Câu kiểm tra chỉ dùng kỹ năng của câu đã chấm.');
      if (checkIds.has(g.checkItem.id)) issue(path + '/checkItem', 'duplicate_item', 'Hai câu kiểm tra trùng ID.');
      checkIds.add(g.checkItem.id);
      const old = await db
        .prepare('SELECT 1 AS found FROM lesson_items WHERE lesson_id=? AND item_id=?')
        .bind(context.lesson.lessonId, g.checkItem.id)
        .first();
      if (old) issue(path + '/checkItem', 'duplicate_item', 'ID câu kiểm tra đã tồn tại.');
      const limit = await db
        .prepare('SELECT limits FROM subjects WHERE id=? AND learner_id=?')
        .bind(context.subject.subjectId, job.learner_id)
        .first<{ limits: string }>();
      errors.push(...itemIssues(g.checkItem, path + '/checkItem', JSON.parse(limit!.limits).maxDifficulty));
      if (g.checkItem.difficulty > JSON.parse(limit!.limits).maxDifficulty)
        issue(path + '/checkItem', 'difficulty_limit', 'Câu kiểm tra vượt mức sổ.');
      const text = [
        g.checkItem.prompt,
        g.checkItem.instructions ?? '',
        g.checkItem.explanation ?? '',
        g.checkItem.solution,
        ...g.checkItem.hints,
        ...(g.checkItem.rubric ?? []).flatMap((r) => [r.criterion, r.description ?? '']),
        ...(g.checkItem.choices ?? []).flatMap((c) => [c.text, c.errorLabel ?? '']),
      ].join('\n');
      if (containsContactDetails(text) || containsPossibleClinicalIdentifier(text, context.subject.sensitivity))
        issue(path + '/checkItem', 'privacy', 'Câu kiểm tra chứa định danh.');
      if (!g.checkItem.key && !g.checkItem.rubric) issue(path + '/checkItem', 'schema', 'Câu kiểm tra cần key hoặc rubric.');
      appended.items.push(g.checkItem);
      let stage = appended.stages.find((s: { stage: string }) => s.stage === 'check');
      if (!stage) {
        stage = { stage: 'check', itemIds: [] };
        appended.stages.push(stage);
      }
      stage.itemIds.push(g.checkItem.id);
      statements.push(
        db
          .prepare(
            `INSERT INTO lesson_items(lesson_id,item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,difficulty,auto_gradable,prompt_hash,origin,payload,created_at) SELECT ?,?,?,?,'check',?,?,?,?,?,?,'assess_check',?,? WHERE ${gate}`,
          )
          .bind(
            context.lesson.lessonId,
            g.checkItem.id,
            job.learner_id,
            context.subject.subjectId,
            g.checkItem.activity,
            g.checkItem.input,
            JSON.stringify(g.checkItem.skills),
            g.checkItem.difficulty,
            g.checkItem.key ? 1 : 0,
            await promptHash(g.checkItem.prompt),
            JSON.stringify(g.checkItem),
            now.toISOString(),
            job.id,
            token,
          ),
      );
    }
  }
  if (checks)
    statements.push(
      db
        .prepare(`UPDATE learning_lessons SET payload=?,updated=? WHERE id=? AND user_id=? AND payload=? AND ${gate}`)
        .bind(JSON.stringify(appended), now.toISOString(), context.lesson.lessonId, job.learner_id, original!.payload, job.id, token),
    );
  if (checks > 2) issue('/grades', 'schema', 'Tối đa hai câu kiểm tra lại mỗi lần nộp.');
  if (open.some((a) => !seen.has(a.attemptId))) issue('/grades', 'missing_grade', 'Thiếu điểm câu mở.');
  const diagnosed = new Set<string>();
  for (const d of result.diagnosis) {
    const a = all.find((x) => x.attemptId === d.attemptId);
    if (!a?.autoGrade || a.autoGrade.result === 'correct' || diagnosed.has(d.attemptId))
      issue('/diagnosis', 'auto_grade_locked', 'Chẩn đoán chỉ dành cho câu tự động trong ngữ cảnh.');
    diagnosed.add(d.attemptId);
    if (a?.autoGrade) {
      const raw = await db
        .prepare('SELECT answer FROM attempts WHERE id=? AND learner_id=?')
        .bind(a.attemptId, job.learner_id)
        .first<{ answer: string }>();
      for (const e of d.errors) {
        if (containsContactDetails(e.label + e.evidence) || containsPossibleClinicalIdentifier(e.label + e.evidence, context.subject.sensitivity))
          issue('/diagnosis', 'privacy', 'Chẩn đoán lỗi chứa định danh.');
        if (
          !a.skills.includes(e.skillId) ||
          (e.patternId && !context.openErrorPatterns.some((p) => p.patternId === e.patternId && p.skillId === e.skillId))
        )
          issue('/diagnosis', 'unknown_reference', 'Chẩn đoán ngoài ngữ cảnh.');
        if (!e.evidence.trim() || !raw?.answer.includes(e.evidence)) issue('/diagnosis', 'schema', 'Bằng chứng phải có trong câu trả lời.');
      }
      statements.push(
        db
          .prepare(`INSERT INTO attempt_diagnoses(id,attempt_id,job_id,learner_id,errors,created_at) SELECT ?,?,?,?,?,? WHERE ${gate}`)
          .bind('diag_' + crypto.randomUUID(), a.attemptId, job.id, job.learner_id, JSON.stringify(d.errors), now.toISOString(), job.id, token),
      );
    }
  }
  const validEvidence = (attemptId: string, skillId: string) =>
    context.attempts.some(
      (a) =>
        a.attemptId === attemptId &&
        a.skills.includes(skillId) &&
        (!!a.autoGrade || result.grades.some((g) => g.attemptId === attemptId && g.result !== 'ungradable')),
    ) || context.recentEvidence.some((e) => e.attemptId === attemptId && e.skillId === skillId);
  const evidenceIds = new Set([...all.map((a) => a.attemptId), ...context.recentEvidence.map((e) => e.attemptId)]);
  for (const p of result.masteryProposals) {
    if (!context.skills.some((s) => s.skillId === p.skillId) || p.evidenceAttemptIds.some((id) => !validEvidence(id, p.skillId)))
      issue('/masteryProposals', 'unknown_reference', 'Đề xuất phải dựa vào kỹ năng và bằng chứng có trong ngữ cảnh.');
  }
  for (const p of result.reviewProposals)
    if (!context.skills.some((s) => s.skillId === p.skillId)) issue('/reviewProposals', 'unknown_reference', 'Kỹ năng ngoài ngữ cảnh.');
  for (const p of result.errorPatternUpdates)
    if (!context.openErrorPatterns.some((e) => e.patternId === p.patternId) || p.evidenceAttemptIds.some((id) => !evidenceIds.has(id)))
      issue('/errorPatternUpdates', 'unknown_reference', 'Mẫu lỗi/bằng chứng ngoài ngữ cảnh.');
  statements.push(
    db
      .prepare(
        `UPDATE submissions SET status=CASE WHEN EXISTS(SELECT 1 FROM attempts WHERE submission_id=submissions.id AND status='pending') THEN 'deferred' ELSE 'graded' END,graded_at=? WHERE id=? AND learner_id=? AND ${gate}`,
      )
      .bind(now.toISOString(), job.ref_id, job.learner_id, job.id, token),
  );
  const state = errors.length ? { statements: [], guards: [], clipped: [] } : await prepareJobStates(db, job, context, result, token, now);
  return {
    errors,
    statements: [...statements, ...state.statements, roadmapProgressWrite(db,job.learner_id,context.lesson.lessonId,now,gate,[job.id,token])],
    gradeIds,
    skillIds: [...skillIds],
    stateGuards: state.guards,
    clipped: state.clipped,
    lessonGuard: checks ? { id: context.lesson.lessonId, payload: original!.payload } : null,
    attemptGuards: result.grades.map((g) => g.attemptId),
  };
}
