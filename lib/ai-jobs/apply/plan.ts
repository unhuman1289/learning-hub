import type { EvidenceDb } from '../../evidence/submit.ts';
import type { PlanContext, PlanResult } from '../../contracts/ai-common.ts';
import { validateLessonPackage } from '../../lesson-v2/validate.ts';
import { promptHash, newLessonId } from '../../lesson-v2/store.ts';
import { cutoffFor } from '../../daily-policy.ts';
import { addDays, clampMastery } from '../../learner-model/rules.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../../automation/privacy.ts';
import { sha256Hex } from '../../auth/automation.ts';
import type { Job } from '../context/common.ts';
import { prepareExplorations } from './explorations.ts';
export type ValidationIssue = { path: string; code: string; message: string };
export async function preparePlan(db: EvidenceDb, job: Job, context: PlanContext, result: PlanResult, token: string, now: Date) {
  const errors: ValidationIssue[] = [],
    statements: ReturnType<EvidenceDb['prepare']>[] = [],
    outcomes: { subjectId: string; status: string; lessonIds: string[]; reason: string }[] = [];
  const issue = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const ids = result.subjects.map((s) => s.subjectId),
    expected = context.subjects.map((s) => s.subjectId);
  if (ids.length !== new Set(ids).size || ids.length !== expected.length || expected.some((id) => !ids.includes(id)))
    issue('/subjects', 'unknown_reference', 'Mỗi sổ trong ngữ cảnh phải xuất hiện đúng một lần.');
  const extra = await prepareExplorations(db, job, context, result, token, now, issue);
  let newMinutes = extra.minutes;
  const savedIds: string[] = [...extra.savedIds];
  statements.push(...extra.statements);
  for (const [index, s] of result.subjects.entries()) {
    const path = '/subjects/' + index,
      c = context.subjects.find((x) => x.subjectId === s.subjectId);
    if (!c) {
      issue(path, 'unknown_reference', 'Sổ không thuộc ngữ cảnh.');
      continue;
    }
    if (context.adaptive && job.purpose === 'request') {
      if (s.action !== 'no_action' || s.primaryLesson || s.reviewSet || s.skillChanges.length ||
          s.roadmap || s.notebookSetup || s.requestsHandled.length || s.masteryProposals.length)
        issue(path, 'schema', 'Bài xin thêm chỉ được ghi qua yêu cầu của lượt này.');
      outcomes.push({ subjectId: s.subjectId, status: 'no_action', lessonIds: [], reason: context.adaptive.reason });
      continue;
    }
    const current = await db
      .prepare('SELECT revision,status,ai_enabled FROM subjects WHERE id=? AND learner_id=?')
      .bind(s.subjectId, job.learner_id)
      .first<{ revision: number; status: string; ai_enabled: number }>();
    const slot = await db
      .prepare(
        "SELECT id FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot='primary' AND completed_at IS NULL ORDER BY assigned_date DESC,updated DESC LIMIT 1",
      )
      .bind(job.learner_id, s.subjectId)
      .first<{ id: string }>();
    if (
      !current ||
      current.revision !== s.expectedRevision ||
      s.expectedRevision !== c.revision ||
      s.expectedOpenPrimaryLessonId !== c.slot.openPrimaryLessonId ||
      (slot?.id ?? null) !== s.expectedOpenPrimaryLessonId
    ) {
      outcomes.push({ subjectId: s.subjectId, status: 'stale', lessonIds: [], reason: 'Sổ hoặc bài đang học đã thay đổi.' });
      continue;
    }
    if (context.adaptive) {
      if (s.roadmap || s.reviewSet || s.requestsHandled.length) issue(path, 'schema', 'Giữ lộ trình và chỉ giao đúng bài của lượt này.');
      if (s.primaryLesson && (job.purpose !== 'daily' || !current.ai_enabled || current.status !== 'active' ||
          (context.adaptive.mode === 'learn' ? s.primaryLesson.kind !== 'new' :
            context.adaptive.mode !== 'practice' || !['review', 'remediation'].includes(s.primaryLesson.kind))))
        issue(path + '/primaryLesson', 'schema', 'Bài chính phải đúng quyết định của Hub.');
    }
    const setup = s.notebookSetup;
    if (setup && (job.purpose !== 'initial' || current.status !== 'setup' ||
        s.action !== 'assign' || !s.roadmap || s.primaryLesson?.kind !== 'diagnostic'))
      issue(path + '/notebookSetup', 'schema', 'Chỉ điền thiết lập cho sổ mới cùng lộ trình và bài đầu tiên.');
    if (s.action === 'issue') {
      outcomes.push({ subjectId: s.subjectId, status: 'rejected', lessonIds: [], reason: s.reason });
      continue;
    }
    if (s.action === 'no_action' && (s.primaryLesson || s.reviewSet || s.skillChanges.length))
      issue(path, 'schema', 'no_action không được kèm bài hoặc thay đổi kỹ năng.');
    const text = [
      s.reason,
      s.progressSummary,
      ...(setup ? [setup.goal ?? '', setup.level, setup.curriculum, setup.instructions] : []),
      ...(s.roadmap??[]).flatMap(step=>[step.title,step.objective,step.situation]),
      ...s.skillChanges.flatMap((x) => ['name' in x ? x.name : '', 'description' in x ? x.description : '', 'reason' in x ? x.reason : '']),
      ...s.masteryProposals.map((x) => x.reason),
      ...s.requestsHandled.map((x) => x.note),
    ].join('\n');
    if (containsContactDetails(text) || containsPossibleClinicalIdentifier(text, c.sensitivity))
      issue(path, 'privacy', 'Nội dung có thể chứa định danh.');
    if (job.purpose === 'daily' && (current.status !== 'active' || current.ai_enabled !== 1))
      issue(path, 'not_eligible', 'Sổ không bật cập nhật hàng ngày.');
    if (!['setup', 'active'].includes(current.status)) issue(path, 'not_eligible', 'Sổ đã tạm dừng hoặc lưu trữ.');
    const skillMap = new Map(c.skills.map((sk) => [sk.skillId, sk])),
      keyMap = new Map(c.skills.map((sk) => [sk.key, sk.skillId]));
    const added = s.skillChanges.filter((x) => x.op === 'add');
    const week = await db
      .prepare("SELECT count(*) AS n FROM skills WHERE subject_id=? AND origin='ai' AND created_at>=?")
      .bind(s.subjectId, addDays(job.learning_day, -6))
      .first<{ n: number }>();
    if (job.purpose !== 'initial' && (added.length > c.limits.maxNewSkillsPerWeek - (week?.n ?? 0) || (added.length && !c.limits.allowNewTopics)))
      issue(path + '/skillChanges', 'skill_graph', 'Vượt giới hạn kỹ năng mới.');
    if (job.purpose === 'initial' && (added.length < 8 || added.length > 40 || s.primaryLesson?.kind !== 'diagnostic'))
      issue(path, 'skill_graph', 'Sổ mới cần 8–40 kỹ năng và bài chẩn đoán.');
    const seenKeys = new Set<string>();
    for (const a of added) {
      if (a.op !== 'add') continue;
      if (keyMap.has(a.key) || seenKeys.has(a.key)) issue(path + '/skillChanges', 'skill_graph', 'Kỹ năng trùng key.');
      seenKeys.add(a.key);
      const id = 'sk_' + (await sha256Hex(s.subjectId + ':key:' + a.key)).slice(0, 20);
      keyMap.set(a.key, id);
      skillMap.set(id, {
        skillId: id,
        key: a.key,
        name: a.name,
        pathOrder: a.pathOrder,
        prerequisites: a.prerequisites,
        status: 'active',
        mastery: 'not_assessed',
        masteryCeiling: 'not_assessed',
        dims: { knowledge: 0, recognition: 0, application: 0, retention: 0 },
        exposure14d: {},
        stuckOn: null,
        nextReviewDay: null,
        reviewKind: null,
        maintained: false,
      });
    }
    const resolve = (ref: string) => (ref.startsWith('key:') ? keyMap.get(ref.slice(4)) : skillMap.has(ref) ? ref : undefined);
    for (const change of s.skillChanges) {
      if (change.op !== 'add' && !skillMap.has(change.skillId)) issue(path + '/skillChanges', 'unknown_reference', 'Kỹ năng không thuộc sổ.');
      if (change.op === 'update' && skillMap.has(change.skillId)) Object.assign(skillMap.get(change.skillId)!, change);
      if (change.op === 'retire' && skillMap.has(change.skillId)) skillMap.get(change.skillId)!.status = 'retired';
    }
    const graph = new Map([...skillMap].map(([id, sk]) => [id, sk.prerequisites.map((ref) => resolve(ref))]));
    if (graph.size > 120 || [...graph.values()].flat().some((x) => !x))
      issue(path + '/skillChanges', 'skill_graph', 'Đồ thị kỹ năng vượt 120 nút hoặc có tham chiếu lạ.');
    const done = new Set<string>(),
      visiting = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (done.has(id)) return true;
      visiting.add(id);
      for (const next of graph.get(id) ?? []) if (next && !visit(next)) return false;
      visiting.delete(id);
      done.add(id);
      return true;
    };
    if ([...graph.keys()].some((id) => !visit(id))) issue(path + '/skillChanges', 'skill_graph', 'Có vòng trong điều kiện học trước.');
    const gate =
      'EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?) AND EXISTS(SELECT 1 FROM subjects WHERE id=? AND learner_id=? AND revision=? AND updated_at=?)';
    const gateValues = [job.id, token, s.subjectId, job.learner_id, s.expectedRevision + 1, now.toISOString()];
    const sqlEligibility = s.primaryLesson
      ? `AND NOT EXISTS(SELECT 1 FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot='primary' AND (completed_at IS NULL OR completed_at>=? OR assigned_date=?))`
      : '';
    statements.push(
      db
        .prepare(
          `UPDATE subjects SET revision=revision+1,progress_summary=?,progress_updated_at=?,updated_at=?,status=CASE WHEN status='setup' THEN 'active' ELSE status END WHERE id=? AND learner_id=? AND revision=? ${context.adaptive && s.primaryLesson ? "AND status='active' AND ai_enabled=1" : ''} AND coalesce((SELECT id FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot='primary' AND completed_at IS NULL ORDER BY assigned_date DESC,updated DESC LIMIT 1),'')=? AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?) ${sqlEligibility}`,
        )
        .bind(
          s.progressSummary,
          now.toISOString(),
          now.toISOString(),
          s.subjectId,
          job.learner_id,
          s.expectedRevision,
          job.learner_id,
          s.subjectId,
          s.expectedOpenPrimaryLessonId ?? '',
          job.id,
          token,
          ...(s.primaryLesson ? [job.learner_id, s.subjectId, cutoffFor(job.learning_day), job.learning_day] : []),
        ),
    );
    if (s.roadmap) {
      if(s.roadmap.some(step=>step.skills.some(ref=>!resolve(ref)))) issue(path+'/roadmap','unknown_reference','Lộ trình tham chiếu kỹ năng ngoài sổ.');
      statements.push(db.prepare(`UPDATE subjects SET roadmap=? WHERE ${gate}`).bind(JSON.stringify(s.roadmap.map(step=>({...step,skills:step.skills.map(ref=>resolve(ref))}))),...gateValues));
    }
    for (const change of s.skillChanges) {
      if (change.op === 'add')
        statements.push(
          db
            .prepare(
              `INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,'active','ai',?,? WHERE ${gate}`,
            )
            .bind(
              keyMap.get(change.key),
              s.subjectId,
              job.learner_id,
              change.key,
              change.name,
              change.description,
              change.pathOrder,
              JSON.stringify(change.prerequisites.map(resolve)),
              now.toISOString(),
              now.toISOString(),
              ...gateValues,
            ),
        );
      else if (change.op === 'retire')
        statements.push(
          db
            .prepare(`UPDATE skills SET status='retired',updated_at=? WHERE id=? AND learner_id=? AND ${gate}`)
            .bind(now.toISOString(), change.skillId, job.learner_id, ...gateValues),
        );
      else
        statements.push(
          db
            .prepare(
              `UPDATE skills SET name=coalesce(?,name),description=coalesce(?,description),path_order=coalesce(?,path_order),prerequisites=coalesce(?,prerequisites),updated_at=? WHERE id=? AND learner_id=? AND ${gate}`,
            )
            .bind(
              change.name ?? null,
              change.description ?? null,
              change.pathOrder ?? null,
              change.prerequisites ? JSON.stringify(change.prerequisites.map(resolve)) : null,
              now.toISOString(),
              change.skillId,
              job.learner_id,
              ...gateValues,
            ),
        );
    }
    const lessonIds = [],
      assignedPrompts = new Set<string>();
    for (const [field, packageInput] of [
      ['primaryLesson', s.primaryLesson],
      ['reviewSet', s.reviewSet],
    ] as const) {
      if (!packageInput) continue;
      const checked = validateLessonPackage(packageInput, { maxDifficulty: c.limits.maxDifficulty, sensitivity: c.sensitivity, subjectTitle:c.title, aiSizes: true, adaptive: !!context.adaptive });
      for (const e of checked.issues) issue(path + '/' + field + e.path, e.code, e.message);
      if (!checked.lesson) continue;
      const l = checked.lesson,
        slotKind = field === 'reviewSet' ? 'review' : 'primary';
      if ((field === 'reviewSet' && l.kind !== 'review') || (field === 'primaryLesson' && (l.kind === 'exploration' || (!context.adaptive && l.kind === 'review'))))
        issue(path + '/' + field, 'schema', 'Loại bài không khớp slot.');
      if (context.adaptive?.mode === 'learn' && !context.adaptive.targetSkills.some(id => l.targetSkills.includes(id) ||
          l.targetSkills.some(ref => c.skills.find(skill => 'key:' + skill.key === ref)?.skillId === id)))
        issue(path + '/' + field, 'schema', 'Bài cần bám kỹ năng trong bước tiếp theo.');
      if (field === 'primaryLesson' && !c.slot.eligibleForPrimary) issue(path + '/' + field, 'not_eligible', 'Bài trước chưa xong trước 00:00.');
      if (field === 'reviewSet' && !c.slot.eligibleForReview) issue(path + '/' + field, 'slot_taken', 'Bộ ôn đang mở hoặc đã giao hôm nay.');
      const used = l.items
        .flatMap((i) => [...i.skills, ...(i.rubric ?? []).flatMap((r) => (r.skill ? [r.skill] : []))])
        .concat(
          l.targetSkills,
          l.reasonRefs.filter((x) => x.startsWith('sk_') || x.startsWith('key:')),
        );
      if (
        used.some((ref) => !resolve(ref)) ||
        l.reasonRefs.filter((x) => x.startsWith('err_')).some((ref) => !c.errorPatterns.some((p) => p.patternId === ref))
      )
        issue(path + '/' + field, 'unknown_reference', 'Bài tham chiếu kỹ năng/lỗi ngoài ngữ cảnh.');
      for (const sk of c.skills.filter((x) => x.stuckOn)) {
        const matching = l.items.filter((i) => i.skills.some((r) => resolve(r) === sk.skillId));
        if (matching.length && matching.filter((i) => i.activity === sk.stuckOn).length > matching.length / 3)
          issue(path + '/' + field, 'repetition', 'Quá nhiều câu dùng dạng hoạt động đã bị kẹt.');
      }
      const hashes = await Promise.all(l.items.map((i) => promptHash(i.prompt)));
      if (new Set(hashes).size !== hashes.length) issue(path + '/' + field, 'duplicate_item', 'Bài chứa đề trùng.');
      for (const hash of hashes) {
        if (assignedPrompts.has(hash)) issue(path + '/' + field, 'duplicate_item', 'Đề trùng giữa bài chính và bộ ôn.');
        assignedPrompts.add(hash);
        const old = await db
          .prepare('SELECT 1 AS found FROM lesson_items WHERE learner_id=? AND subject_id=? AND prompt_hash=? AND created_at>=? LIMIT 1')
          .bind(job.learner_id, s.subjectId, hash, addDays(job.learning_day, -89))
          .first();
        if (old) issue(path + '/' + field, 'duplicate_item', 'Đề đã dùng trong 90 ngày.');
      }
      newMinutes += l.estMinutes;
      const id = newLessonId();
      lessonIds.push(id);
      savedIds.push(id);
      const resolved = {
        ...l,
        targetSkills: l.targetSkills.map((x) => resolve(x)!),
        reasonRefs: l.reasonRefs.map((x) => resolve(x) ?? x),
        items: l.items.map((i) => ({
          ...i,
          skills: i.skills.map((x) => resolve(x)!),
          rubric: i.rubric?.map((r) => ({ ...r, ...(r.skill ? { skill: resolve(r.skill) } : {}) })),
        })),
      };
      const guards = `${gate} AND NOT EXISTS(SELECT 1 FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot=? AND (completed_at IS NULL OR assigned_date=? ${slotKind === 'primary' ? 'OR completed_at>=?' : ''}))`;
      const guardParams = [
        ...gateValues,
        job.learner_id,
        s.subjectId,
        slotKind,
        job.learning_day,
        ...(slotKind === 'primary' ? [cutoffFor(job.learning_day)] : []),
      ];
      statements.push(
        db
          .prepare(
            `INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,package_version,template,kind,slot,reason,reason_refs,est_minutes,origin_job_id,roadmap_step_id) SELECT ?,?,?,?,?,?,'2',?,?,?,?,?,?,?,? WHERE ${guards}`,
          )
          .bind(
            id,
            job.learner_id,
            s.subjectId,
            JSON.stringify(resolved),
            job.learning_day,
            now.toISOString(),
            l.template,
            l.kind,
            slotKind,
            context.adaptive?.reason ?? l.why,
            JSON.stringify(resolved.reasonRefs),
            l.estMinutes,
            job.id,
            l.kind === 'new' ? context.adaptive?.step?.id ?? null : null,
            ...guardParams,
          ),
      );
      for (const [i, item] of resolved.items.entries())
        statements.push(
          db
            .prepare(
              `INSERT INTO lesson_items(lesson_id,item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,difficulty,auto_gradable,prompt_hash,origin,payload,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'plan',?,? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=?) AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
            )
            .bind(
              id,
              item.id,
              job.learner_id,
              s.subjectId,
              l.stages.find((st) => st.itemIds.includes(item.id))!.stage,
              item.activity,
              item.input,
              JSON.stringify(item.skills),
              item.difficulty,
              item.key ? 1 : 0,
              hashes[i],
              JSON.stringify(item),
              now.toISOString(),
              id,
              job.id,
              token,
            ),
        );
    }
    for (const p of s.masteryProposals) {
      if (!skillMap.has(p.skillId)) issue(path + '/masteryProposals', 'unknown_reference', 'Kỹ năng ngoài ngữ cảnh.');
      for (const id of p.evidenceAttemptIds) {
        if (!c.recentLessons.some((l) => l.items.some((i) => i.attemptId === id)))
          issue(path + '/masteryProposals', 'unknown_reference', 'Bằng chứng không nằm trong ngữ cảnh.');
        const r = await db
          .prepare(
            "SELECT 1 AS ok FROM attempts WHERE id=? AND learner_id=? AND status='graded' AND EXISTS(SELECT 1 FROM json_each(skill_ids) WHERE value=?)",
          )
          .bind(id, job.learner_id, p.skillId)
          .first();
        if (!r) issue(path + '/masteryProposals', 'unknown_reference', 'Bằng chứng không thuộc kỹ năng.');
      }
      const ceiling = c.skills.find((sk) => sk.skillId === p.skillId)?.masteryCeiling ?? 'not_assessed',
        clamped = clampMastery(p.status, ceiling);
      statements.push(
        db
          .prepare(
            `UPDATE skill_states SET mastery=?,mastery_source='ai',mastery_reason=?,revision=revision+1 WHERE skill_id=? AND learner_id=? AND ${gate}`,
          )
          .bind(clamped.mastery, p.reason, p.skillId, job.learner_id, ...gateValues),
      );
    }
    if (job.purpose === 'initial' && current.status === 'setup' && s.primaryLesson) {
      statements.push(db.prepare(
        `UPDATE subjects SET ai_enabled=CASE WHEN legacy_track IS NULL THEN 1 ELSE ai_enabled END,
           template=coalesce(?,template),
           goal=CASE WHEN goal=opening_brief THEN coalesce(nullif(?,''),goal) ELSE goal END,
           level=coalesce(nullif(level,''),?,level), curriculum=coalesce(nullif(curriculum,''),?,curriculum),
           instructions=coalesce(nullif(instructions,''),?,instructions)
         WHERE id=? AND learner_id=? AND ${gate}
           AND EXISTS(SELECT 1 FROM learning_lessons WHERE origin_job_id=? AND user_id=? AND subject_id=? AND slot='primary')`,
      ).bind(setup?.template ?? null, setup?.goal?.trim() ?? null, setup?.level.trim() ?? null, setup?.curriculum.trim() ?? null, setup?.instructions.trim() ?? null,
        s.subjectId, job.learner_id, ...gateValues, job.id, job.learner_id, s.subjectId));
    }
    for (const r of s.requestsHandled) {
      if (!c.requests.some((x) => x.requestId === r.requestId)) issue(path + '/requestsHandled', 'unknown_reference', 'Yêu cầu ngoài ngữ cảnh.');
      statements.push(
        db
          .prepare(`UPDATE learner_requests SET status=?,response_note=?,processed_at=? WHERE id=? AND learner_id=? AND ${gate}`)
          .bind(r.status, r.note, now.toISOString(), r.requestId, job.learner_id, ...gateValues),
      );
    }
    outcomes.push({ subjectId: s.subjectId, status: s.action === 'no_action' ? 'no_action' : 'applied', lessonIds, reason: s.reason });
  }
  if (!context.adaptive && newMinutes > 0 && context.policy.openMinutesNow + newMinutes > context.policy.maxOpenMinutes)
    issue('/subjects', 'over_budget', 'Bài đang mở và bài mới vượt 1,5 lần thời gian mục tiêu.');
  return { errors, statements, outcomes, savedIds, newMinutes };
}
