import { berlinDay, cutoffFor, learningTracks, canAdvance, type LearningTrack } from '../daily-policy.ts';
import type { JournalDb } from '../run-journal.ts';
import type { ReplacementState } from './replacement.ts';
import { containsPossibleClinicalIdentifier, redactContactDetails } from './privacy.ts';
import { loadTrackSensitivity } from './sensitivity.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';

type UserRow = { id: string };
type LessonRow = { id: string; user_id: string; track: LearningTrack; payload: string; assigned_date: string; completed_at: string | null; response: string; updated: string; automation_reviewed_at: string | null };
type SlotRow = { user_id: string; track: LearningTrack; lesson_id: string; revision: number };
type LessonContent = { title: string; level: string; objective: string; nextTopic: string; questions: { question: string }[] };

export type AutomationTarget = ReplacementState & {
  learner: { ref: string };
  goal?: { level: string; goal: string } | null;
  currentLesson: null | (LessonContent & { id: string; assignedDate: string; completedAt: string | null });
  newAnswers: { lessonId: string; text: string; submittedAt: string; truncated: boolean }[];
  recentLessonTitles: string[];
};

export type PublicAutomationTarget = {
  targetId: string;
  learner: { ref: string };
  track: LearningTrack;
  eligible: boolean;
  eligibility: string;
  goal?: { level: string; goal: string } | null;
  currentLesson: null | (LessonContent & { id: string; assignedDate: string; completedAt: string | null });
  newAnswers: { lessonId: string; text: string; submittedAt: string; truncated: boolean }[];
  recentLessonTitles: string[];
};

export type AutomationContext = {
  contractVersion: '1';
  runId: string;
  contextHash: string;
  learningDay: string;
  timezone: 'Europe/Berlin';
  cutoff: string;
  policy: { maxAssignmentsPerRun: 10; lessonPackage: 'lesson-package/1'; sources: { httpsOnly: true; min: 1; max: 8 } };
  targets: PublicAutomationTarget[];
};

function parseContent(row: LessonRow, sensitivity: SubjectSensitivity): LessonContent {
  const value: unknown = JSON.parse(row.payload);
  if (!value || typeof value !== 'object') throw new Error('Stored lesson payload is invalid.');
  const content = value as Record<string, unknown>;
  if (typeof content.title !== 'string' || typeof content.level !== 'string' || typeof content.objective !== 'string' || typeof content.nextTopic !== 'string' || !Array.isArray(content.questions)) {
    throw new Error('Stored lesson payload is invalid.');
  }
  const safeText = (value: string, max: number) => sanitizeText(value, sensitivity, max);
  const questions = content.questions.filter((item): item is { question: string } => !!item && typeof item === 'object' && 'question' in item && typeof item.question === 'string').map(({ question }) => ({ question: safeText(question, 2000) }));
  return { title: safeText(content.title, 500), level: safeText(content.level, 100), objective: safeText(content.objective, 2000), nextTopic: safeText(content.nextTopic, 1000), questions };
}

function sanitizeText(text: string, sensitivity: SubjectSensitivity, max: number) {
  if (containsPossibleClinicalIdentifier(text, sensitivity)) return '[Content withheld: it may contain identifiable clinical information.]';
  return redactContactDetails(text).slice(0, max);
}

function sanitizedAnswer(text: string, sensitivity: SubjectSensitivity) {
  const possiblePatientData = containsPossibleClinicalIdentifier(text, sensitivity);
  if (possiblePatientData) return { text: '[Answer withheld: it may contain identifiable clinical information.]', truncated: false, withheldForPrivacy: true };
  const redacted = sanitizeText(text, sensitivity, Number.MAX_SAFE_INTEGER);
  return { text: redacted.slice(0, 4000), truncated: redacted.length > 4000, withheldForPrivacy: false };
}

async function learnerRef(id: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return `lrn_${Array.from(new Uint8Array(digest).slice(0, 6), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function buildAutomationContext(db: JournalDb, runId: string, now = new Date()): Promise<{ context: AutomationContext; targets: AutomationTarget[] }> {
  const day = berlinDay(now);
  const cutoff = cutoffFor(day);
  const users = (await db.prepare("SELECT id FROM user WHERE status='active' ORDER BY created_at,id").all<UserRow>()).results;
  const lessons = (await db.prepare('SELECT id,user_id,track,payload,assigned_date,completed_at,response,updated,automation_reviewed_at FROM learning_lessons WHERE package_version=\'1\' ORDER BY assigned_date DESC,updated DESC,id DESC').all<LessonRow>()).results;
  const slots = (await db.prepare('SELECT user_id,track,lesson_id,revision FROM learning_slots ORDER BY user_id,track').all<SlotRow>()).results;
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const slotByKey = new Map(slots.map((slot) => [`${slot.user_id}\u0000${slot.track}`, slot]));
  const refs = new Map<string, string>();
  const sensitivityOf = await loadTrackSensitivity(db);
  const targets: AutomationTarget[] = [];

  for (const user of users) {
    refs.set(user.id, await learnerRef(user.id));
    for (const track of learningTracks) {
      const slot = slotByKey.get(`${user.id}\u0000${track}`);
      const sensitivity = sensitivityOf(user.id, track);
      const current = slot ? lessonById.get(slot.lesson_id) : undefined;
      if (slot && !current) throw new Error('Learning slot references a missing lesson.');
      const eligible = canAdvance(current ? { assignedDate: current.assigned_date, completedAt: current.completed_at } : undefined, day);
      const eligibility = !current ? 'no_current_lesson' : eligible ? 'completed_before_cutoff' : !current.completed_at ? 'not_completed' : current.assigned_date === day ? 'already_assigned_today' : 'completed_after_cutoff';
      const history = lessons.filter((lesson) => lesson.user_id === user.id && lesson.track === track);
      const unseen = history.filter((lesson) => lesson.completed_at && !lesson.automation_reviewed_at).slice(0, 3);
      const state: ReplacementState = {
        targetId: `tgt_${crypto.randomUUID().replaceAll('-', '')}`,
        userId: user.id,
        track,
        eligible,
        eligibility,
        expectedCurrentLessonId: current?.id ?? null,
        currentLessonId: current?.id ?? null,
        assignedDate: current?.assigned_date ?? null,
        completedAt: current?.completed_at ?? null,
      };
      targets.push({
        ...state,
        learner: { ref: refs.get(user.id)! },
        goal: null,
        currentLesson: current ? { ...parseContent(current, sensitivity), id: current.id, assignedDate: current.assigned_date, completedAt: current.completed_at } : null,
        newAnswers: unseen.map((lesson) => ({ lessonId: lesson.id, ...sanitizedAnswer(lesson.response, sensitivity), submittedAt: lesson.completed_at! })),
        recentLessonTitles: history.filter((lesson) => lesson.id !== current?.id).slice(0, 3).map((lesson) => parseContent(lesson, sensitivity).title),
      });
    }
  }

  const publicTargets: PublicAutomationTarget[] = targets.map((target) => ({
    targetId: target.targetId,
    learner: target.learner,
    track: target.track,
    eligible: target.eligible,
    eligibility: target.eligibility,
    ...(target.goal === undefined ? {} : { goal: target.goal }),
    currentLesson: target.currentLesson,
    newAnswers: target.newAnswers,
    recentLessonTitles: target.recentLessonTitles,
  }));
  const contextWithoutHash = {
    contractVersion: '1' as const,
    runId,
    learningDay: day,
    timezone: 'Europe/Berlin' as const,
    cutoff,
    policy: { maxAssignmentsPerRun: 10 as const, lessonPackage: 'lesson-package/1' as const, sources: { httpsOnly: true as const, min: 1 as const, max: 8 as const } },
    targets: publicTargets,
  };
  const serialized = JSON.stringify(contextWithoutHash);
  if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) throw new Error('Automation context exceeds the 64 KB contract limit.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { context: { ...contextWithoutHash, contextHash: `sha256:${hash}` }, targets };
}
