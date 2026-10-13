import type { EvidenceDb } from '../../evidence/submit.ts';
import { addDays } from '../../learner-model/rules.ts';
import { planContext, type PlanContext } from '../../contracts/ai-common.ts';
import { contextHash, learnerContext, skillContext, slots, safeText, type Job } from './common.ts';
export async function buildPlanContext(db: EvidenceDb, job: Job, environment: string): Promise<PlanContext> {
  const learner = await learnerContext(db, job.learner_id, environment);
  const { results: subjects = [] } = await db
    .prepare(
      // Daily jobs carry one notebook; jobs queued before that change still cover every active notebook.
      `SELECT * FROM subjects WHERE learner_id=? AND (?='daily' AND status='active' AND ai_enabled=1 AND (? IS NULL OR id=?)
         OR ?<>'daily' AND id=? AND status IN ('setup','active')) ORDER BY weight DESC,id LIMIT 30`,
    )
    .bind(job.learner_id, job.purpose, job.subject_id, job.subject_id, job.purpose, job.subject_id)
    .all<Record<string, unknown>>();
  const from = addDays(job.learning_day, -13);
  const { results: study = [] } = await db
    .prepare('SELECT day,sum(seconds)/60.0 AS minutes FROM study_time WHERE user_id=? AND day>=? AND day<=? GROUP BY day ORDER BY day')
    .bind(job.learner_id, from, job.learning_day)
    .all<{ day: string; minutes: number }>();
  const open = await db
    .prepare(
      "SELECT coalesce(sum(coalesce(est_minutes,json_extract(payload,'$.minutes'),0)),0) AS minutes FROM learning_lessons WHERE user_id=? AND completed_at IS NULL",
    )
    .bind(job.learner_id)
    .first<{ minutes: number }>();
  const extra = await db
    .prepare("SELECT count(*) AS n FROM learning_lessons WHERE user_id=? AND assigned_date=? AND slot='extra'")
    .bind(job.learner_id, job.learning_day)
    .first<{ n: number }>();
  const target = Number(learner.settings?.daily_target_minutes ?? 60);
  const cleanPreferences = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(cleanPreferences)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [safeText(k), cleanPreferences(x)]))
        : typeof v === 'string'
          ? safeText(v)
          : v;
  const context: Record<string, unknown> = {
    contract: 'plan-context/1',
    jobId: job.id,
    purpose: job.purpose,
    learningDay: job.learning_day,
    timezone: 'Europe/Berlin',
    contextHash: 'sha256:' + '0'.repeat(64),
    learner: {
      ...learner.public,
      targetMinutes: target,
      preferences: cleanPreferences(JSON.parse(String(learner.settings?.preferences ?? '{}'))),
      studyMinutes14d: study,
    },
    policy: {
      maxPrimaryPerSubjectPerDay: 1,
      maxReviewSetsPerSubjectPerDay: 1,
      extraLessonsLeftToday: Math.max(0, (learner.public.role === 'child' ? 2 : 4) - (extra?.n ?? 0)),
      maxOpenMinutes: target * 1.5,
      openMinutesNow: open?.minutes ?? 0,
      historyDays: 14,
      duplicateWindowDays: 90,
    },
    subjects: [],
    explorations: [],
    truncated: [],
  };
  const list: Record<string, unknown>[] = [];
  for (const s of subjects) {
    const id = String(s.id),
      sensitivity = s.sensitivity as 'normal' | 'clinical' | 'child_dev',
      data = await skillContext(db, job.learner_id, id);
    const { results: lessons = [] } = await db
      .prepare(
        "SELECT id,json_object('title',json_extract(payload,'$.title')) AS payload,assigned_date,kind,completed_at FROM learning_lessons WHERE user_id=? AND subject_id=? AND assigned_date>=? ORDER BY assigned_date,id",
      )
      .bind(job.learner_id, id, from)
      .all<Record<string, unknown>>();
    // All items of the recent lessons in one query: a Free invocation allows only ~50 D1 queries.
    const { results: allItems = [] } = await db
      .prepare(
        `SELECT i.lesson_id,i.item_id,i.activity,i.skill_ids,json_extract(i.payload,'$.prompt') AS prompt,i.flag,a.id AS attempt_id,a.attempt_no,a.support,g.result,g.errors
    FROM lesson_items i JOIN learning_lessons l ON l.id=i.lesson_id
    LEFT JOIN attempts a ON a.id=(SELECT id FROM attempts WHERE lesson_id=i.lesson_id AND item_id=i.item_id ORDER BY attempt_no DESC LIMIT 1)
    LEFT JOIN grades g ON g.id=a.current_grade_id WHERE l.user_id=? AND l.subject_id=? AND l.assigned_date>=? ORDER BY i.lesson_id,i.item_id`,
      )
      .bind(job.learner_id, id, from)
      .all<Record<string, unknown>>();
    const recent = [];
    for (const l of lessons) {
      const p = JSON.parse(String(l.payload));
      const items = allItems.filter((i) => i.lesson_id === l.id);
      recent.push({
        lessonId: l.id,
        assignedDay: l.assigned_date,
        kind: l.kind,
        title: safeText(p.title, sensitivity),
        completed: !!l.completed_at,
        items: items.map((i) => ({
          itemId: i.item_id,
          attemptId: i.attempt_id ?? null,
          activity: i.activity,
          skills: JSON.parse(String(i.skill_ids)),
          prompt: safeText(i.prompt, sensitivity).slice(0, 160),
          result: i.result ?? null,
          support: i.support ?? 'none',
          attemptNo: i.attempt_no ?? 0,
          errorLabels: JSON.parse(String(i.errors ?? '[]')).map((e: { label: string }) => safeText(e.label, sensitivity)),
          flag: i.flag ?? null,
        })),
      });
    }
    const { results: requests = [] } = await db
      .prepare(
        "SELECT id,kind,text,created_by FROM learner_requests WHERE learner_id=? AND subject_id=? AND status IN ('queued','in_job') AND (active_until IS NULL OR active_until>=?) ORDER BY created_at LIMIT 20",
      )
      .bind(job.learner_id, id, job.learning_day)
      .all<Record<string, unknown>>();
    const quality = await db
      .prepare(
        `SELECT
 (SELECT count(*) FROM grades g JOIN attempts a ON a.id=g.attempt_id WHERE a.learner_id=? AND a.subject_id=? AND g.grader='ai' AND g.created_at>=?) AS aiGraded,
 (SELECT count(*) FROM disputes d JOIN attempts a ON a.id=d.attempt_id WHERE d.learner_id=? AND a.subject_id=? AND d.created_at>=?) AS disputed,
 (SELECT count(*) FROM disputes d JOIN attempts a ON a.id=d.attempt_id WHERE d.learner_id=? AND a.subject_id=? AND d.created_at>=? AND d.status='overturned') AS overturned,
 (SELECT count(*) FROM lesson_items WHERE learner_id=? AND subject_id=? AND flag='key_issue') AS keyIssues`,
      )
      .bind(job.learner_id, id, from, job.learner_id, id, from, job.learner_id, id, from, job.learner_id, id)
      .first<{ aiGraded: number; disputed: number; overturned: number; keyIssues: number }>();
    list.push({
      subjectId: id,
      title: safeText(s.title, sensitivity),
      template: s.template,
      sensitivity,
      goal: safeText(s.goal, sensitivity),
      level: safeText(s.level, sensitivity),
      curriculum: safeText(s.curriculum, sensitivity),
      limits: JSON.parse(String(s.limits)),
      weight: s.weight,
      revision: s.revision,
      progressSummary: safeText(s.progress_summary, sensitivity),
      slot: await slots(db, job.learner_id, id, job.learning_day),
      skills: data.skills,
      errorPatterns: data.errors.map((e) => ({ ...e, examples: e.examples.map((x) => safeText(x, sensitivity)) })),
      recentLessons: recent,
      requests: requests.map((r) => ({
        requestId: r.id,
        kind: r.kind,
        text: safeText(r.text, sensitivity),
        by: r.created_by === job.learner_id ? 'learner' : 'guardian',
      })),
      gradingQuality14d: quality ?? { aiGraded: 0, disputed: 0, overturned: 0, keyIssues: 0 },
    });
  }
  context.subjects = list;
  // A request job carries one "Hỏi thêm" / "Xin thêm bài" request.
  if (job.purpose === 'request' && job.ref_id) {
    const request = await db
      .prepare(
        "SELECT id,kind,subject_id,text,urgency FROM learner_requests WHERE id=? AND learner_id=? AND kind IN ('explore','extra_practice') AND status IN ('queued','in_job')",
      )
      .bind(job.ref_id, job.learner_id)
      .first<{ id: string; kind: 'explore' | 'extra_practice'; subject_id: string | null; text: string; urgency: string }>();
    if (request)
      context.explorations = [
        { requestId: request.id, kind: request.kind, subjectId: request.subject_id, text: safeText(request.text), urgency: request.urgency },
      ];
  }
  // Prevent IDs/contact data from leaking in user-controlled strings, including preferences.
  const clean = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(clean)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]))
        : typeof value === 'string'
          ? value.replaceAll(job.learner_id, '[id riêng]')
          : value;
  const safe = clean(context) as Record<string, unknown>,
    truncated = safe.truncated as string[],
    safeSubjects = safe.subjects as typeof list;
  const bytesOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  let size = bytesOf(safe);
  // Aim for 32 KB (CPU on Workers Free); the 128 KB protocol limit stays the hard ceiling.
  const cap = 32 * 1024,
    hardCap = 128 * 1024,
    marks = new Set<string>();
  const mark = (value: string) => {
    if (marks.has(value)) return;
    size += bytesOf(value) + (truncated.length ? 1 : 0);
    truncated.push(value);
    marks.add(value);
  };
  // Count only the changed fragments. Re-serializing the entire context for each
  // dropped item made worst-case truncation quadratic on real Worker CPU.
  for (const s of safeSubjects)
    for (const l of s.recentLessons as { lessonId: string; items: { prompt: string }[] }[])
      for (const i of l.items) {
        if (size <= cap) break;
        size += bytesOf('') - bytesOf(i.prompt);
        i.prompt = '';
        mark('recentLessons:' + l.lessonId);
      }
  if (size > cap)
    for (const s of safeSubjects)
      for (const skill of s.skills as { skillId: string; maintained: boolean; exposure14d: unknown }[]) {
        if (size <= cap) break;
        if (skill.maintained) {
          size += bytesOf({}) - bytesOf(skill.exposure14d);
          skill.exposure14d = {};
          mark('exposure:' + skill.skillId);
        }
      }
  if (size > cap)
    for (const s of safeSubjects) {
      const patterns = s.errorPatterns as { status: string; patternId: string }[];
      for (let i = patterns.length - 1; i >= 0 && size > cap; i--)
        if (patterns[i].status === 'resolved') {
          const [e] = patterns.splice(i, 1);
          size -= bytesOf(e) + (patterns.length ? 1 : 0);
          mark('error:' + e.patternId);
        }
    }
  if (size > cap) {
    const planned = safeSubjects
      .flatMap((s) =>
        (s.skills as { status: string; skillId: string; pathOrder: number }[]).filter((sk) => sk.status === 'planned').map((sk) => ({ s, sk })),
      )
      .sort((a, b) => b.sk.pathOrder - a.sk.pathOrder || b.sk.skillId.localeCompare(a.sk.skillId));
    for (const { s, sk } of planned) {
      if (size <= cap) break;
      const skills = s.skills as (typeof sk)[],
        i = skills.indexOf(sk);
      if (i < 0) continue;
      skills.splice(i, 1);
      size -= bytesOf(sk) + (skills.length ? 1 : 0);
      mark('skill:' + sk.skillId);
    }
  }
  if (size > cap)
    for (const s of safeSubjects) {
      // Oldest finished lessons go last; the open lesson and the latest work stay.
      const lessons = s.recentLessons as { lessonId: string; completed: boolean }[];
      for (let i = 0; i < lessons.length - 3 && size > cap; )
        if (lessons[i].completed) {
          const [l] = lessons.splice(i, 1);
          size -= bytesOf(l) + 1;
          mark('lesson:' + l.lessonId);
        } else i++;
    }
  if (bytesOf(safe) > hardCap) throw new Error('Plan context exceeds safe size after documented truncation.');
  safe.contextHash = await contextHash({ ...safe, contextHash: undefined });
  return planContext.parse(safe);
}
