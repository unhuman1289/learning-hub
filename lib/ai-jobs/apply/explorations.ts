import type { EvidenceDb } from '../../evidence/submit.ts';
import type { PlanContext, PlanResult } from '../../contracts/ai-common.ts';
import { validateLessonPackage } from '../../lesson-v2/validate.ts';
import { newLessonId, promptHash } from '../../lesson-v2/store.ts';
import { addDays } from '../../learner-model/rules.ts';
import { containsContactDetails } from '../../automation/privacy.ts';
import { sha256Hex } from '../../auth/automation.ts';
import { DEFAULT_LIMITS } from '../../subjects/sql.ts';
import type { Job } from '../context/common.ts';

type Issue = (path: string, code: string, message: string) => void;
type Statement = ReturnType<EvidenceDb['prepare']>;

/** The learner's "Khám phá" notebook: created by the server on first use, never planned daily. */
export async function exploreSubjectId(learnerId: string) {
  return 'sub_' + (await sha256Hex('explore:' + learnerId)).slice(0, 20);
}

/**
 * Exploration and extra-practice lessons (PLAN H6.4): an `extra` slot in the chosen notebook, or in
 * "Khám phá" when the request names none. Each request is answered once: assigned or declined with a reason.
 */
export async function prepareExplorations(db: EvidenceDb, job: Job, context: PlanContext, result: PlanResult, token: string, now: Date, issue: Issue) {
  const statements: Statement[] = [],
    savedIds: string[] = [];
  let minutes = 0;
  const gate = 'EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)',
    args = [job.id, token],
    stamp = now.toISOString();
  const answered = new Set(result.explorations.map((e) => e.requestId));
  if (answered.size !== result.explorations.length) issue('/explorations', 'schema', 'Mỗi yêu cầu chỉ trả lời một lần.');
  for (const request of context.explorations)
    if (!answered.has(request.requestId)) issue('/explorations', 'missing_answer', 'Cần giao bài hoặc từ chối mỗi yêu cầu trong ngữ cảnh.');
  const assigned = result.explorations.filter((e) => e.action === 'assign');
  if (assigned.length > context.policy.extraLessonsLeftToday) issue('/explorations', 'over_budget', 'Hết lượt bài thêm hôm nay; để yêu cầu chờ đến mai.');

  for (const [index, e] of result.explorations.entries()) {
    const path = '/explorations/' + index,
      request = context.explorations.find((r) => r.requestId === e.requestId);
    if (!request) {
      issue(path, 'unknown_reference', 'Yêu cầu ngoài ngữ cảnh.');
      continue;
    }
    if (containsContactDetails(e.reason)) issue(path + '/reason', 'privacy', 'Lý do có thể chứa định danh.');
    if (e.action === 'decline') {
      if (e.lesson) issue(path + '/lesson', 'schema', 'Từ chối thì không kèm bài.');
      statements.push(
        db
          .prepare(`UPDATE learner_requests SET status='declined',response_note=?,processed_at=? WHERE id=? AND learner_id=? AND status IN ('queued','in_job') AND ${gate}`)
          .bind(e.reason, stamp, e.requestId, job.learner_id, ...args),
      );
      continue;
    }
    if (!e.lesson) {
      issue(path + '/lesson', 'schema', 'Giao bài cần kèm bài.');
      continue;
    }
    // extra_practice stays in its notebook; a question goes to the named notebook or to "Khám phá".
    const subjectId = request.kind === 'extra_practice' ? request.subjectId : e.subjectId;
    const known = subjectId ? context.subjects.find((s) => s.subjectId === subjectId) : null;
    if (subjectId && !known) {
      issue(path + '/subjectId', 'unknown_reference', 'Sổ không thuộc ngữ cảnh.');
      continue;
    }
    const explore = !subjectId,
      targetId = subjectId ?? (await exploreSubjectId(job.learner_id));
    const checked = validateLessonPackage(e.lesson, {
      maxDifficulty: known?.limits.maxDifficulty ?? DEFAULT_LIMITS.maxDifficulty,
      sensitivity: known?.sensitivity ?? 'normal',
      subjectTitle:known?.title,
    });
    for (const problem of checked.issues) issue(path + '/lesson' + problem.path, problem.code, problem.message);
    if (!checked.lesson) continue;
    const lesson = checked.lesson;
    const kinds = request.kind === 'explore' ? ['exploration'] : ['new', 'remediation', 'review', 'exploration'];
    if (!kinds.includes(lesson.kind)) issue(path + '/lesson/kind', 'schema', `Yêu cầu này cần bài loại ${kinds.join(' hoặc ')}.`);

    // Skills: a known notebook resolves its own; "Khám phá" creates up to 3 skills from `key:` references.
    const skillIds = new Map<string, string>();
    if (known)
      for (const sk of known.skills) {
        skillIds.set(sk.skillId, sk.skillId);
        skillIds.set('key:' + sk.key, sk.skillId);
      }
    else {
      const { results = [] } = await db
        .prepare('SELECT id,key FROM skills WHERE subject_id=? AND learner_id=?')
        .bind(targetId, job.learner_id)
        .all<{ id: string; key: string }>();
      for (const sk of results) {
        skillIds.set(sk.id, sk.id);
        skillIds.set('key:' + sk.key, sk.id);
      }
    }
    const refs = [...new Set(lesson.items.flatMap((i) => i.skills).concat(lesson.targetSkills))];
    const created: { id: string; key: string }[] = [];
    for (const ref of refs) {
      if (skillIds.has(ref)) continue;
      if (!explore || !ref.startsWith('key:')) {
        issue(path + '/lesson', 'unknown_reference', `Kỹ năng ${ref} không thuộc sổ.`);
        continue;
      }
      const id = 'sk_' + (await sha256Hex(targetId + ':key:' + ref.slice(4))).slice(0, 20);
      skillIds.set(ref, id);
      created.push({ id, key: ref.slice(4) });
    }
    if (created.length > 3) issue(path + '/lesson', 'skill_graph', 'Bài khám phá tạo tối đa 3 kỹ năng mới.');

    const hashes = await Promise.all(lesson.items.map((i) => promptHash(i.prompt)));
    for (const hash of hashes) {
      const old = await db
        .prepare('SELECT 1 AS found FROM lesson_items WHERE learner_id=? AND subject_id=? AND prompt_hash=? AND created_at>=? LIMIT 1')
        .bind(job.learner_id, targetId, hash, addDays(job.learning_day, -89))
        .first();
      if (old) issue(path + '/lesson', 'duplicate_item', 'Đề đã dùng trong 90 ngày.');
    }

    if (explore)
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO subjects(id,learner_id,title,template,sensitivity,goal,level,curriculum,limits,weight,status,ai_enabled,system_kind,created_by,created_at,updated_at)
             SELECT ?,?,'Khám phá','reading','normal','Trả lời câu hỏi của người học','','',?,1,'active',0,'explore','system',?,? WHERE ${gate}`,
          )
          .bind(targetId, job.learner_id, JSON.stringify(DEFAULT_LIMITS), stamp, stamp, ...args),
      );
    for (const sk of created)
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at)
             SELECT ?,?,?,?,?,'',0,'[]','active','ai',?,? WHERE ${gate}`,
          )
          .bind(sk.id, targetId, job.learner_id, sk.key, sk.key.replaceAll('-', ' '), stamp, stamp, ...args),
      );
    const id = newLessonId(),
      resolve = (ref: string) => skillIds.get(ref) ?? ref;
    const resolved = {
      ...lesson,
      targetSkills: lesson.targetSkills.map(resolve),
      reasonRefs: lesson.reasonRefs.map(resolve),
      items: lesson.items.map((i) => ({
        ...i,
        skills: i.skills.map(resolve),
        rubric: i.rubric?.map((r) => ({ ...r, ...(r.skill ? { skill: resolve(r.skill) } : {}) })),
      })),
    };
    minutes += lesson.estMinutes;
    savedIds.push(id);
    statements.push(
      db
        .prepare(
          `INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,package_version,template,kind,slot,reason,reason_refs,est_minutes,origin_job_id)
           SELECT ?,?,?,?,?,?,'2',?,?,'extra',?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM subjects WHERE id=? AND learner_id=?)`,
        )
        .bind(
          id,
          job.learner_id,
          targetId,
          JSON.stringify(resolved),
          job.learning_day,
          stamp,
          lesson.template,
          lesson.kind,
          lesson.why,
          JSON.stringify(resolved.reasonRefs),
          lesson.estMinutes,
          job.id,
          ...args,
          targetId,
          job.learner_id,
        ),
    );
    for (const [i, item] of resolved.items.entries())
      statements.push(
        db
          .prepare(
            `INSERT INTO lesson_items(lesson_id,item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,difficulty,auto_gradable,prompt_hash,origin,payload,created_at)
             SELECT ?,?,?,?,?,?,?,?,?,?,?,'plan',?,? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=?) AND ${gate}`,
          )
          .bind(
            id,
            item.id,
            job.learner_id,
            targetId,
            lesson.stages.find((st) => st.itemIds.includes(item.id))!.stage,
            item.activity,
            item.input,
            JSON.stringify(item.skills),
            item.difficulty,
            item.key ? 1 : 0,
            hashes[i],
            JSON.stringify(item),
            stamp,
            id,
            ...args,
          ),
      );
    statements.push(
      db
        .prepare(
          `UPDATE learner_requests SET status='done',result_lesson_id=?,response_note=?,processed_at=? WHERE id=? AND learner_id=? AND status IN ('queued','in_job') AND EXISTS(SELECT 1 FROM learning_lessons WHERE id=?) AND ${gate}`,
        )
        .bind(id, e.reason, stamp, e.requestId, job.learner_id, id, ...args),
    );
  }
  return { statements, savedIds, minutes };
}
