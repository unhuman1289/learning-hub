import { berlinDay } from './daily-policy.ts';
import { readSubjectSkills } from './learner-model/recompute.ts';
import type { EvidenceDb } from './evidence/submit.ts';

const facetOf = (key: unknown) => /^([gpn])-/.exec(String(key ?? ''))?.[1]?.toUpperCase() ?? null;

/**
 * Read-only progress of one profile for ChatGPT Project v7's "Status" (L6.2): due skills, open errors, mastery by
 * G/P/N and the open lesson per active notebook. No answers, no ids beyond what the profile already has.
 */
export async function learnerStatus(db: EvidenceDb, learnerId: string, now = new Date()) {
  const today = berlinDay(now);
  const { results: subjects = [] } = await db
    .prepare("SELECT id,title FROM subjects WHERE learner_id=? AND status='active' AND system_kind IS NULL ORDER BY weight DESC,title")
    .bind(learnerId)
    .all<{ id: string; title: string }>();
  const out = [];
  for (const s of subjects.slice(0, 10)) {
    const { skills, errors } = await readSubjectSkills(db, learnerId, s.id);
    const open = await db
      .prepare(
        "SELECT json_extract(payload,'$.title') AS title FROM learning_lessons WHERE user_id=? AND subject_id=? AND completed_at IS NULL AND package_version='2' ORDER BY assigned_date DESC LIMIT 1",
      )
      .bind(learnerId, s.id)
      .first<{ title: string }>();
    const facets: Record<string, { demonstrated: number; total: number }> = {};
    for (const k of skills) {
      const f = facetOf(k.key);
      if (!f) continue;
      facets[f] ??= { demonstrated: 0, total: 0 };
      facets[f].total++;
      if (k.mastery === 'demonstrated') facets[f].demonstrated++;
    }
    out.push({
      notebook: s.title,
      openLesson: open?.title ?? null,
      due: skills
        .filter((k) => k.next_review_day && String(k.next_review_day) <= today)
        .map((k) => String(k.name))
        .slice(0, 15),
      needsReview: skills
        .filter((k) => k.mastery === 'needs_review')
        .map((k) => String(k.name))
        .slice(0, 15),
      openErrors: errors
        .filter((e) => e.status !== 'resolved')
        .slice(0, 8)
        .map((e) => ({ label: String(e.label), status: String(e.status), occurrences: Number(e.occurrences) })),
      facets,
    });
  }
  return { day: today, notebooks: out };
}
