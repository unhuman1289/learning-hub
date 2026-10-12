import { canAdvance, cutoffFor, type LearningTrack } from '../daily-policy.ts';

export type ReplacementState = {
  targetId: string;
  userId: string;
  track: LearningTrack;
  eligible: boolean;
  eligibility: string;
  expectedCurrentLessonId: string | null;
  currentLessonId: string | null;
  assignedDate: string | null;
  completedAt: string | null;
};

export type ReplacementDecision = { assign: true; reason: 'eligible' } | { assign: false; reason: string };

export function decideReplacement(
  snapshot: ReplacementState,
  current: { lessonId: string | null; assignedDate: string | null; completedAt: string | null },
  day: string,
): ReplacementDecision {
  if (current.lessonId !== snapshot.expectedCurrentLessonId) return { assign: false, reason: 'Bài hiện tại đã đổi từ lúc tạo ngữ cảnh.' };
  if (current.lessonId !== snapshot.currentLessonId) return { assign: false, reason: 'Trạng thái bài hiện tại không khớp ngữ cảnh đã cấp.' };
  if (current.lessonId && !canAdvance({ assignedDate: current.assignedDate!, completedAt: current.completedAt }, day)) {
    if (!current.completedAt) return { assign: false, reason: 'Bài chưa hoàn thành; giữ nguyên bài và câu trả lời.' };
    if (current.assignedDate === day) return { assign: false, reason: 'Mảng này đã có bài hôm nay.' };
    if (current.completedAt >= cutoffFor(day)) return { assign: false, reason: 'Hoàn thành sau mốc 03:00; chờ ngày học tiếp theo.' };
    return { assign: false, reason: 'Bài hiện tại chưa đủ điều kiện thay thế.' };
  }
  if (snapshot.eligible) return { assign: true, reason: 'eligible' };
  return { assign: false, reason: snapshot.eligibility };
}
