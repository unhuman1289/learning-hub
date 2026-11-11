import { z } from 'zod/v4';
import type { EvidenceDb } from '../evidence/submit.ts';

export const adaptiveDecision = z.object({
  mode: z.enum(['learn', 'practice', 'personal', 'none']),
  minutes: z.union([z.literal(15), z.literal(45)]),
  step: z.object({ id: z.string(), title: z.string(), skills: z.array(z.string()) }).strict().nullable(),
  targetSkills: z.array(z.string()),
  needsScaffold: z.boolean(),
  reason: z.string(),
}).strict();

type Skill = { skillId: string; prerequisites: string[]; mastery: string; nextReviewDay: string | null; status: string };
type Pattern = { skillId: string; confidence: string; status: string };
type RoadmapStep = { title: string; skills: string[]; mode: string };
export async function decideAdaptivePlan(
  db: EvidenceDb,
  learnerId: string,
  subjectId: string,
  day: string,
  daily: boolean,
  requestMode: 'learn' | 'practice' | 'personal',
  roadmap: RoadmapStep[],
  skills: Skill[],
  errors: Pattern[],
): Promise<z.infer<typeof adaptiveDecision>> {
  const { results: introduced = [] } = await db.prepare(
    'SELECT roadmap_step_id AS id FROM learning_lessons WHERE user_id=? AND subject_id=? AND roadmap_step_id IS NOT NULL',
  ).bind(learnerId, subjectId).all<{ id: string }>();
  const existing = new Set(introduced.map(row => row.id));
  const next = roadmap.map((step, index) => ({ ...step, id: 'step_' + (index + 1) }))
    .find(step => step.mode !== 'review' && !existing.has(step.id));
  const step = next ? { id: next.id, title: next.title, skills: next.skills } : null;
  const live = skills.filter(skill => skill.status !== 'retired');
  const byId = new Map(live.map(skill => [skill.skillId, skill]));
  const confirmed = new Set(errors.filter(error => error.confidence === 'confirmed' && error.status !== 'resolved').map(error => error.skillId));
  const due = live.filter(skill => skill.nextReviewDay && skill.nextReviewDay <= day);
  const unlinked = Boolean(step && (!step.skills.length || step.skills.some(id => !byId.has(id))));
  const prerequisites = [...new Set(step?.skills.flatMap(id => byId.get(id)?.prerequisites ?? []))];
  const weak = prerequisites.filter(id => {
    const skill = byId.get(id);
    return !skill || skill.mastery !== 'demonstrated' || confirmed.has(id) || due.includes(skill);
  });
  const needsScaffold = unlinked || weak.length > 0;
  const mode = daily ? (step && !needsScaffold ? 'learn' : step || due.length ? 'practice' : 'none') : requestMode === 'learn' && !step ? 'none' : requestMode;
  const targetSkills = mode === 'none' ? [] : mode === 'learn' ? step?.skills ?? [] : [
    ...new Set([...weak.filter(id => byId.has(id)), ...confirmed, ...due.map(skill => skill.skillId),
      ...(step?.skills ?? []).filter(id => byId.has(id)), ...live.map(skill => skill.skillId)]),
  ].slice(0, 3);
  const reason = mode === 'learn'
    ? needsScaffold ? 'Bài mới có ví dụ để ôn lại kỹ năng nền.' : 'Đây là bước kế tiếp trong lộ trình.'
    : mode === 'practice' ? (needsScaffold ? 'Luyện kỹ năng nền và kiểm tra phần còn thiếu.' : 'Luyện theo kết quả gần đây.')
    : mode === 'personal' ? 'Luyện theo nội dung bạn chọn.' : 'Chưa có bước mới hoặc kỹ năng đến hạn ôn.';
  return { mode, minutes: daily ? 45 : 15, step, targetSkills, needsScaffold, reason };
}
