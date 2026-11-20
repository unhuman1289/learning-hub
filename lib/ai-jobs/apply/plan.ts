import { openAiGermanVoices } from '../../audio/openai-voices.ts';
import { audioColumns, resolveLessonAudio } from '../../audio/lesson.ts';
import {applyRoadmapChanges,listSteps} from '../../roadmap/store.ts';
import { RoadmapChangeError } from '../../roadmap/changes.ts';
import { listeningLanguage } from '../../subjects/item-kinds.ts';
import {frameworkFor,inferFramework} from '../../roadmap/frameworks.ts';
import {checkRoadmapLesson,guardRoadmapIntroduction,openRoadmapStep} from '../../roadmap/lesson.ts';
import type { EvidenceDb } from '../../evidence/submit.ts';
import type { PlanContext, PlanResult } from '../../contracts/ai-common.ts';
import { listeningIssues, validateLessonPackage } from '../../lesson-v2/validate.ts';
import { promptHash, newLessonId } from '../../lesson-v2/store.ts';
import { cutoffFor } from '../../daily-policy.ts';
import { addDays, clampMastery } from '../../learner-model/rules.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../../automation/privacy.ts';
import { sha256Hex } from '../../auth/automation.ts';
import type { Job } from '../context/common.ts';
import { prepareExplorations } from './explorations.ts';
import { primaryBlocksDailySql, primarySnapshotSql } from '../daily-eligibility.ts';
import { adaptivePrimaryKinds } from '../adaptive.ts';
export type ValidationIssue = { path: string; code: string; message: string };
export async function preparePlan(db: EvidenceDb, job: Job, context: PlanContext, result: PlanResult, token: string, now: Date, deferReplan = false, audioBucket?: Pick<R2Bucket, 'head'>, ttsSubjectIds: readonly string[] = []) {
  const errors: ValidationIssue[] = [],
    statements: ReturnType<EvidenceDb['prepare']>[] = [],
    applyGuards: ReturnType<EvidenceDb['prepare']>[] = [],
    outcomes: { subjectId: string; status: string; lessonIds: string[]; reason: string }[] = [];
  const issue = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const ids = result.subjects.map((s) => s.subjectId),
    expected = context.subjects.map((s) => s.subjectId);
  if (ids.length !== new Set(ids).size || ids.length !== expected.length || expected.some((id) => !ids.includes(id)))
    issue('/subjects', 'unknown_reference', 'Mỗi sổ trong ngữ cảnh phải xuất hiện đúng một lần.');
  const extra = await prepareExplorations(db, job, context, result, token, now, issue, audioBucket);
  const savedIds: string[] = [...extra.savedIds];
  statements.push(...extra.statements);
  applyGuards.push(...extra.guards);
  for (const [index, s] of result.subjects.entries()) {
    const path = '/subjects/' + index,
      c = context.subjects.find((x) => x.subjectId === s.subjectId);
    if (!c) {
      issue(path, 'unknown_reference', 'Sổ không thuộc ngữ cảnh.');
      continue;
    }
    const modern=context.roadmapProtocol===2;
    const initial=modern&&job.purpose==='initial';
    if (!modern&&(s.roadmapChanges||s.openingSteps||s.notebookSetup?.framework)) issue(path,'schema','Runner chưa hỗ trợ lộ trình mới.');
    if (context.adaptive && job.purpose === 'request' && !modern) {
      if (s.action !== 'no_action' || s.primaryLesson || s.reviewSet || s.skillChanges.length ||
          s.roadmap || s.notebookSetup || s.requestsHandled.length || s.masteryProposals.length)
        issue(path, 'schema', 'Bài xin thêm chỉ được ghi qua yêu cầu của lượt này.');
      outcomes.push({ subjectId: s.subjectId, status: 'unchanged', lessonIds: [], reason: context.adaptive.reason });
      continue;
    }
    const current = await db
      .prepare('SELECT revision,status,ai_enabled,framework,legacy_track FROM subjects WHERE id=? AND learner_id=?')
      .bind(s.subjectId, job.learner_id)
      .first<{ revision: number; status: string; ai_enabled: number; framework: string | null; legacy_track: string | null }>();
    const useSubmission = job.purpose === 'daily' && (current?.legacy_track === null || !!job.adaptive);
    const snapshotSql = primarySnapshotSql(useSubmission);
    const slot = await db.prepare(snapshotSql).bind(job.learner_id, s.subjectId).first<{ id: string }>();
    if (
      !current ||
      current.revision !== s.expectedRevision ||
      s.expectedRevision !== c.revision ||
      s.expectedOpenPrimaryLessonId !== c.slot.openPrimaryLessonId ||
      (slot?.id ?? null) !== s.expectedOpenPrimaryLessonId
    ) {
      // Only a dropped primary/review lesson is stale; a subject this result leaves untouched (e.g. a request job whose
      // lesson comes through explorations) is simply not acted on.
      const dropped = Boolean(s.primaryLesson || s.reviewSet);
      outcomes.push({
        subjectId: s.subjectId, status: dropped ? 'stale' : 'unchanged', lessonIds: [],
        reason: dropped ? 'Sổ hoặc bài đang học đã thay đổi.' : 'Không đổi gì ở sổ này.',
      });
      continue;
    }
    if(modern&&job.purpose==='request'&&(s.action!=='no_action'||s.primaryLesson||s.reviewSet||s.notebookSetup||s.requestsHandled.length||s.masteryProposals.length))
      issue(path,'schema','Bài xin thêm chỉ được ghi qua yêu cầu của lượt này.');
    if (context.adaptive) {
      if (s.roadmap || s.reviewSet || s.requestsHandled.length) issue(path, 'schema', 'Giữ lộ trình và chỉ giao đúng bài của lượt này.');
      if (s.primaryLesson) {
        const kinds = job.purpose === 'daily' && current.ai_enabled && current.status === 'active'
          ? adaptivePrimaryKinds(context.adaptive.mode) : [];
        if (!kinds.includes(s.primaryLesson.kind))
          issue(path + '/primaryLesson/kind', 'schema', kinds.length ? `Bài chính cần kind ${kinds.join(' hoặc ')}.` : 'Lượt này không giao bài chính.');
      }
    }
    const setup = s.notebookSetup;
    if (setup && (job.purpose !== 'initial' || current.status !== 'setup' ||
        s.action !== 'assign' || !(s.roadmap || s.openingSteps) || s.primaryLesson?.kind !== 'diagnostic'))
      issue(path + '/notebookSetup', 'schema', 'Chỉ điền thiết lập cho sổ mới cùng lộ trình và bài đầu tiên.');
    const task=context.adaptive?.roadmapTask;
    if(initial&&(!s.openingSteps||!setup?.framework||s.primaryLesson?.kind!=='diagnostic'))
      issue(path,'schema','Sổ mới cần chuẩn học, 5–10 bước và một bài xếp chỗ.');
    if(modern&&s.roadmap)issue(path+'/roadmap','schema','Dùng thao tác trên từng bước.');
    if(modern&&!initial&&task==='replan'&&!deferReplan&&!s.openingSteps)issue(path+'/openingSteps','schema','Cần lập lại 5–10 bước.');
    if(modern&&!initial&&task!=='replan'&&s.openingSteps)issue(path+'/openingSteps','schema','Chỉ lập bước đầu khi Hub yêu cầu.');
    if(modern&&task==='extend'&&(s.roadmapChanges?.filter(change=>change.op==='append').length??0)<3)
      issue(path+'/roadmapChanges','schema','Cần thêm ít nhất ba bước.');
    const optionalEdits=modern&&job.purpose==='request'&&task==='none';
    if(modern&&task==='none'&&!optionalEdits&&s.roadmapChanges?.length)
      issue(path+'/roadmapChanges','schema','Chưa cần thay đổi lộ trình.');
    if(optionalEdits&&s.roadmapChanges?.length&&!result.explorations.some(e=>
      e.action==='assign'&&e.lesson&&context.explorations.some(r=>r.requestId===e.requestId&&r.subjectId===s.subjectId)))
      issue(path+'/roadmapChanges','roadmap','Đề xuất chỉnh bước phải đi cùng một bài đã soạn.');
    const targetStep=context.adaptive?.step?.id;
    if(job.purpose==='request'&&targetStep&&s.roadmapChanges?.some(change=>'stepId' in change&&change.stepId===targetStep))
      issue(path+'/roadmapChanges','roadmap','Giữ bước đang dùng để soạn bài này.');
    if(optionalEdits&&s.skillChanges.some(change=>change.op!=='add'))
      issue(path+'/skillChanges','skill_graph','Giữ nguyên kỹ năng hiện có trong lượt xin bài.');
    if (s.action === 'issue') {
      outcomes.push({ subjectId: s.subjectId, status: 'rejected', lessonIds: [], reason: s.reason });
      continue;
    }
    if (s.action === 'no_action' && (s.primaryLesson || s.reviewSet || (s.skillChanges.length&&!(modern&&(s.roadmapChanges?.length||s.openingSteps)))))
      issue(path, 'schema', 'no_action không được kèm bài hoặc thay đổi kỹ năng.');
    const text = [
      s.reason,
      s.progressSummary,
      ...(setup ? [setup.goal ?? '', setup.level, setup.curriculum, setup.instructions] : []),
      ...(s.roadmap??[]).flatMap(step=>[step.title,step.objective,step.situation]),
      ...[...(s.openingSteps??[]),...(s.roadmapChanges??[]).map(change=>'step' in change?change.step:'fields' in change?change.fields:{situation:change.reason})]
       .flatMap(step=>[step.title??'',step.objective??'',step.situation??'']),
      setup?.framework?.custom??'',
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
    if (job.purpose !== 'initial' && (added.length > Math.max(0, c.limits.maxNewSkillsPerWeek - (week?.n ?? 0)) || (added.length && !c.limits.allowNewTopics)))
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
    const primaryBlocker = primaryBlocksDailySql(useSubmission);
    const sqlEligibility = s.primaryLesson
      ? `AND NOT EXISTS(SELECT 1 FROM learning_lessons l WHERE user_id=? AND subject_id=? AND slot='primary' AND (${primaryBlocker}))`
      : '';
    statements.push(
      db
        .prepare(
          `UPDATE subjects SET revision=revision+1,progress_summary=?,progress_updated_at=?,updated_at=?,status=CASE WHEN status='setup' THEN 'active' ELSE status END WHERE id=? AND learner_id=? AND revision=? ${context.adaptive && s.primaryLesson ? "AND status='active' AND ai_enabled=1" : ''} AND coalesce((${snapshotSql}),'')=? AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?) ${sqlEligibility}`,
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
          ...(s.primaryLesson ? [job.learner_id, s.subjectId, job.learning_day, cutoffFor(job.learning_day)] : []),
        ),
    );
    if (s.roadmap) {
      if((await listSteps(db,job.learner_id,s.subjectId)).length)issue(path+'/roadmap','schema','Sổ đã có bước ổn định.');
      if(s.roadmap.some(step=>step.skills.some(ref=>!resolve(ref)))) issue(path+'/roadmap','unknown_reference','Lộ trình tham chiếu kỹ năng ngoài sổ.');
      statements.push(db.prepare(`UPDATE subjects SET roadmap=? WHERE id=? AND learner_id=? AND ${gate}`).bind(JSON.stringify(s.roadmap.map(step=>({...step,skills:step.skills.map(ref=>resolve(ref))}))),s.subjectId,job.learner_id,...gateValues));
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
    const selected = initial || (task === 'replan' && !deferReplan)
      ? (setup?.framework ? frameworkFor(setup.framework,c.title,c.goal,c.curriculum) : inferFramework(c.title,c.goal,c.curriculum))
      : undefined;
    const stepFramework = current.framework ? c.framework?.key : selected?.key ?? c.framework?.key;
    const language = listeningLanguage(stepFramework);
    const requireListening = ttsSubjectIds.includes(s.subjectId) && !!language && Object.hasOwn(openAiGermanVoices, language);
    let resultingSteps: Awaited<ReturnType<typeof listSteps>>|undefined;
    if(modern&&(s.openingSteps||s.roadmapChanges?.length)){
      try{
        const changes=s.openingSteps?s.openingSteps.map(step=>({op:'append' as const,step})):s.roadmapChanges!;
        const edit=await applyRoadmapChanges(db,{learnerId:job.learner_id,subjectId:s.subjectId,changes,jobId:job.id,
          stamp:now.toISOString(),gate,bind:gateValues,resolveSkill:ref=>{const id=resolve(ref);return id&&skillMap.get(id)?.status!=='retired'?id:undefined;},
          initialize:!!s.openingSteps,replan:task==='replan',requireListening,
          mastered:new Set(c.skills.filter(skill=>skill.mastery==='demonstrated').map(skill=>skill.skillId))});
        resultingSteps=edit.steps;
        statements.push(...edit.statements);
        for(const step of edit.guards)
          applyGuards.push(db.prepare(`INSERT INTO ai_apply_guards(token,valid)
            SELECT ?,EXISTS(SELECT 1 FROM roadmap_steps WHERE id=? AND learner_id=? AND subject_id=? AND revision=? AND status='planned')
            WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`)
            .bind(token+':step:'+step.id,step.id,job.learner_id,s.subjectId,step.revision,job.id,token));
        if(task==='replan')statements.push(db.prepare(`UPDATE subjects SET roadmap_replan=0 WHERE id=? AND learner_id=? AND ${gate}`).bind(s.subjectId,job.learner_id,...gateValues));
      } catch (error) {
        if (!(error instanceof RoadmapChangeError)) throw error;
        issue(path + '/roadmapChanges', 'roadmap', error.message);
      }
    }
    if(selected){
      statements.push(db.prepare(`UPDATE subjects SET framework=coalesce(framework,?),topic_key=coalesce(topic_key,?) WHERE id=? AND learner_id=? AND ${gate}`)
        .bind(JSON.stringify(selected),selected.topicKey,s.subjectId,job.learner_id,...gateValues));
    }
    const lessonIds = [],
      assignedPrompts = new Set<string>();
    for (const [field, packageInput] of [
      ['primaryLesson', s.primaryLesson],
      ['reviewSet', s.reviewSet],
    ] as const) {
      if (!packageInput) continue;
      const listening = context.adaptive?.listening;
      const draftIssues = listeningIssues(packageInput.items, listening, c.framework?.key);
      for (const problem of draftIssues) issue(path + '/' + field + problem.path, problem.code, problem.message);
      if (draftIssues.length) continue;
      const audio = await resolveLessonAudio(db, packageInput, context.tts, audioBucket);
      const checked = validateLessonPackage(audio.lesson, { listening, maxDifficulty: context.adaptive?.difficulty?.max ?? c.limits.maxDifficulty, minDifficulty: context.adaptive?.difficulty?.min, sensitivity: c.sensitivity, subjectTitle:c.title, frameworkKey:c.framework?.key, itemKinds:c.limits.itemKinds, aiSizes: true, adaptive: !!context.adaptive });
      for (const e of checked.issues) issue(path + '/' + field + e.path, e.code, e.message);
      if (!checked.lesson) continue;
      if(modern&&checked.lesson.template==='reading'&&context.knowledge?.missingForStepIds?.includes(context.adaptive?.step?.id??''))
        issue(path+'/'+field+'/template','roadmap','Bước chưa có nguồn. Hãy soạn bài kỹ năng.');
      const l = checked.lesson,
        slotKind = field === 'reviewSet' ? 'review' : 'primary';
      if ((field === 'reviewSet' && l.kind !== 'review') || (field === 'primaryLesson' && (l.kind === 'exploration' || (!context.adaptive && l.kind === 'review'))))
        issue(path + '/' + field, 'schema', 'Loại bài không khớp slot.');
      if (context.adaptive?.mode === 'learn' && !context.adaptive.targetSkills.some(id => l.targetSkills.includes(id) ||
          l.targetSkills.some(ref => c.skills.find(skill => 'key:' + skill.key === ref)?.skillId === id)))
        issue(path + '/' + field, 'schema', 'Bài cần bám kỹ năng trong bước tiếp theo.');
      if (field === 'primaryLesson' && !c.slot.eligibleForPrimary) issue(path + '/' + field, 'not_eligible', useSubmission ? 'Bài chính đã có hoặc bài chính trước đó chưa được nộp trước 00:00.' : 'Bài trước chưa xong trước 00:00.');
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
      const {results: previousPrompts = []} = await db.prepare(
        'SELECT DISTINCT prompt_hash FROM lesson_items WHERE learner_id=? AND subject_id=? AND created_at>=? AND prompt_hash IN (SELECT value FROM json_each(?))',
      ).bind(job.learner_id, s.subjectId, addDays(job.learning_day, -89), JSON.stringify(hashes)).all<{prompt_hash:string}>();
      const previousHashes = new Set(previousPrompts.map(row => row.prompt_hash));
      for (const [itemIndex, hash] of hashes.entries()) {
        const itemPath = `${path}/${field}/items/${itemIndex}/prompt`;
        if (assignedPrompts.has(hash)) {
          issue(itemPath, 'duplicate_item', 'Câu trùng trong lượt soạn này. Đổi tình huống hoặc dạng bài.');
          continue;
        }
        assignedPrompts.add(hash);
        if (previousHashes.has(hash)) issue(itemPath, 'duplicate_item', 'Câu đã dùng trong 90 ngày. Đổi tình huống hoặc dạng bài, giữ kỹ năng cần luyện.');
      }
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
      const stepRole=initial?'placement':context.adaptive?.stepRole??(l.kind==='new'&&context.adaptive?.step?.id.includes(':s')?'intro':null);
      const stepId=stepRole&&stepRole!=='placement'?context.adaptive?.step?.id??null:l.kind==='new'?context.adaptive?.step?.id??null:null;
      const reasonRefs=context.adaptive?.reasonCode?[...new Set([...resolved.reasonRefs,context.adaptive.reasonCode])]:resolved.reasonRefs;
      if(modern)checkRoadmapLesson(resolved,context.adaptive,resultingSteps,initial,c.limits.maxDifficulty,msg=>issue(path+'/'+field,'roadmap',msg));
      const guards = `${gate} AND NOT EXISTS(SELECT 1 FROM learning_lessons l WHERE user_id=? AND subject_id=? AND slot=? AND (${slotKind === 'primary' ? primaryBlocker : 'completed_at IS NULL OR assigned_date=?'}))`;
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
            `INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,package_version,template,kind,slot,reason,reason_refs,est_minutes,origin_job_id,roadmap_step_id,step_role) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guards}`,
          )
          .bind(
            id,
            job.learner_id,
            s.subjectId,
            JSON.stringify(resolved),
            job.learning_day,
            now.toISOString(),
            '3',
            l.template,
            l.kind,
            slotKind,
            context.adaptive?.reason ?? l.why,
            JSON.stringify(reasonRefs),
            l.estMinutes,
            job.id,
            stepId, stepRole,
            ...guardParams,
          ),
      );
      if(modern&&stepRole==='intro'&&stepId)applyGuards.push(guardRoadmapIntroduction(db,job.learner_id,s.subjectId,stepId,job.id,token));
      if(stepRole==='intro'&&stepId)statements.push(openRoadmapStep(db,job.learner_id,s.subjectId,stepId,id,now.toISOString()));
      for (const [i, item] of resolved.items.entries())
        statements.push(
          db
            .prepare(
              `INSERT INTO lesson_items(lesson_id,item_id,learner_id,subject_id,stage,activity,input_kind,skill_ids,difficulty,auto_gradable,prompt_hash,origin,payload,created_at,stimulus,audio_hash_f,audio_hash_m) SELECT ?,?,?,?,?,?,?,?,?,?,?,'plan',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=?) AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
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
              JSON.stringify('audio' in item && item.audio ? { ...item, audio: { ...item.audio, ...audio.assets.get(item.id) } } : item),
              now.toISOString(),
              ...audioColumns(audio.assets.get(item.id)),
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
  return { errors, statements, guards:applyGuards, outcomes, savedIds };
}
