import { ApiError } from '../api-error.ts';
import { berlinDay, cutoffFor } from '../daily-policy.ts';
import { validateLessonPackage } from './validate.ts';
import { insertLessonV2 } from './store.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
export async function importLesson(db: EvidenceDb, input: unknown, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Dữ liệu nhập không hợp lệ.');
  const x = input as { learnerId: string; subjectId: string; lesson: unknown; reviewed: boolean };
  if (typeof x.learnerId !== 'string' || !/^sub_[0-9a-f]{20}$/.test(x.subjectId ?? '') || x.reviewed !== true)
    throw new ApiError(400, 'Chọn người học, sổ và xác nhận đã duyệt nội dung.');
  const subject = await db
    .prepare('SELECT template,limits,sensitivity,status FROM subjects WHERE id=? AND learner_id=?')
    .bind(x.subjectId, x.learnerId)
    .first<{ template: string; limits: string; sensitivity: 'normal' | 'clinical' | 'child_dev'; status: string }>();
  if (!subject || subject.status !== 'active') throw new ApiError(404, 'Không tìm thấy sổ đang hoạt động.');
  const checked = validateLessonPackage(x.lesson, { maxDifficulty: JSON.parse(subject.limits).maxDifficulty, sensitivity: subject.sensitivity });
  if (!checked.lesson) return { issues: checked.issues };
  if (checked.lesson.template !== subject.template) return { issues: [{ path: '/template', code: 'schema', message: 'Khuôn bài không khớp sổ.' }] };
  const day = berlinDay(now),
    slot = checked.lesson.kind === 'review' ? 'review' : checked.lesson.kind === 'exploration' ? 'extra' : 'primary';
  const old = await db
    .prepare(
      'SELECT id,completed_at FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot=? ORDER BY assigned_date DESC,updated DESC LIMIT 1',
    )
    .bind(x.learnerId, x.subjectId, slot)
    .first<{ id: string; completed_at: string | null }>();
  if (old && (!old.completed_at || old.completed_at >= cutoffFor(day)))
    throw new ApiError(409, 'Bài hiện tại chưa xong trước 03:00. Giữ nguyên bài và đáp án.');
  // Resolve key refs to stable notebook-owned IDs, within the same assignment batch.
  const keyRefs = new Set([
    ...checked.lesson.targetSkills,
    ...checked.lesson.items.flatMap((i) => [...i.skills, ...(i.rubric ?? []).flatMap((r) => (r.skill ? [r.skill] : []))]),
    ...checked.lesson.reasonRefs.filter((r) => r.startsWith('key:') || r.startsWith('sk_')),
  ]);
  const refs = new Map<string, string>();
  for (const ref of keyRefs) {
    if (ref.startsWith('sk_')) {
      const row = await db
        .prepare('SELECT id FROM skills WHERE id=? AND subject_id=? AND learner_id=?')
        .bind(ref, x.subjectId, x.learnerId)
        .first<{ id: string }>();
      if (!row) return { issues: [{ path: '/targetSkills', code: 'unknown_reference', message: 'Kỹ năng không thuộc sổ.' }] };
      refs.set(ref, ref);
    } else {
      const found = await db
        .prepare('SELECT id FROM skills WHERE key=? AND subject_id=? AND learner_id=?')
        .bind(ref.slice(4), x.subjectId, x.learnerId)
        .first<{ id: string }>();
      if (found) {
        refs.set(ref, found.id);
        continue;
      }
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x.subjectId + ':' + ref));
      refs.set(ref, 'sk_' + Array.from(new Uint8Array(digest).slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join(''));
    }
  }
  const lesson = {
    ...checked.lesson,
    reasonRefs: checked.lesson.reasonRefs.map((r) => refs.get(r) ?? r),
    targetSkills: checked.lesson.targetSkills.map((r) => refs.get(r)!),
    items: checked.lesson.items.map((i) => ({
      ...i,
      skills: i.skills.map((r) => refs.get(r)!),
      rubric: i.rubric?.map((r) => ({ ...r, ...(r.skill ? { skill: refs.get(r.skill) ?? r.skill } : {}) })),
    })),
  };
  const id = 'les_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const extras = [...refs]
    .filter(([ref]) => ref.startsWith('key:'))
    .map(([ref, skillId], idx) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'[]','active','user',?,? WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=?)`,
        )
        .bind(
          skillId,
          x.subjectId,
          x.learnerId,
          ref.slice(4),
          ref.slice(4),
          'Kỹ năng từ bài đã được duyệt',
          idx,
          now.toISOString(),
          now.toISOString(),
          id,
        ),
    );
  await insertLessonV2(db, { id, learnerId: x.learnerId, subjectId: x.subjectId, day, lesson, now, guardCompletion: true, extraStatements: extras });
  return { lessonId: id, issues: [] };
}
