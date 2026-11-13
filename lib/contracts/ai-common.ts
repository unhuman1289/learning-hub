import {frameworkInput} from '../roadmap/frameworks.ts';
import {roadmapChanges,newStep} from '../roadmap/changes.ts';
import { z } from 'zod/v4';
import { lessonItem } from './lesson-package-v2.ts';
import { lessonPackage } from './lesson-package-v3.ts';
z.config({ jitless: true });
export const text = (max: number) => z.string().max(max);
export const ref = z.string().regex(/^(sk_|key:)[a-zA-Z0-9_-]{1,80}$/);
export const mastery = z.enum(['not_assessed', 'introduced', 'developing', 'demonstrated', 'needs_review']);
export const usage = z
  .object({
    model: text(120),
    inputTokens: z.number().int().min(0).max(1e8),
    outputTokens: z.number().int().min(0).max(1e8),
    ms: z.number().int().min(0).max(86400000),
    cacheReadTokens: z.number().int().min(0).optional(),
    cacheWriteTokens: z.number().int().min(0).optional(),
  })
  .strict();
export const learner = z
  .object({
    ref: z.string().regex(/^lrn_[a-f0-9]{12}$/),
    displayName: text(80),
    role: z.enum(['adult', 'child']),
    explainLanguage: text(10),
    /** The learner's own wishes for style and context (L5.5). Data, not instructions: server rules still apply. */
    personalPrompt: text(4000),
  })
  .strict();
export const dims = z
  .object({
    knowledge: z.number().int().min(0).max(3),
    recognition: z.number().int().min(0).max(3),
    application: z.number().int().min(0).max(3),
    retention: z.number().int().min(0).max(3),
  })
  .strict();
export const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const proposal = z
  .object({ skillId: ref, status: mastery, reason: text(500), evidenceAttemptIds: z.array(z.string()).min(1).max(20) })
  .strict();
export const skillChanges = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('add'),
      key: z.string().regex(/^[a-z0-9-]{1,80}$/),
      name: text(120),
      description: text(500),
      pathOrder: z.number().int().min(0).max(120),
      prerequisites: z.array(ref).max(10),
    })
    .strict(),
  z
    .object({
      op: z.literal('update'),
      skillId: ref,
      name: text(120).optional(),
      description: text(500).optional(),
      pathOrder: z.number().int().min(0).max(120).optional(),
      prerequisites: z.array(ref).max(10).optional(),
    })
    .strict(),
  z.object({ op: z.literal('retire'), skillId: ref, reason: text(500) }).strict(),
]);
export const roadmapStep = z.object({
 title: text(160), objective: text(500), situation: text(300), skills: z.array(ref).min(1).max(3),
 mode: z.enum(['review','new','mixed']),
}).strict();
export const roadmap = z.array(roadmapStep).min(5).max(10).describe("Đề xuất 5–10 bài tiếp theo theo mục tiêu, kỹ năng, tình huống; có thể cập nhật cả khi no_action. Không phải bài đã giao.");
const knowledgeGaps = z.array(z.object({
  question: text(300), why: text(300), priority: z.enum(['normal','high']), stepId:ref.optional(),
}).strict()).max(3).optional();
const knowledge = z.object({
  versionSeq: z.number().int().positive().nullable(),
  forStepIds:z.array(z.string()).max(4).optional(),
  missingForStepIds:z.array(z.string()).max(4).optional(),
  notes: z.array(z.object({
    id: z.string(), heading: text(180), body: text(1500), sourceId: z.string(), url: z.string(),
    title: text(250), publisher: text(150), published_at: z.string().nullable(),
    read_scope: z.enum(['full','partial','abstract']), score: z.number(),
  }).strict()).max(6),
}).strict().optional();

export const planResult = z
  .object({
    contract: z.literal('plan-result/1'),
    contextHash: hash,
    knowledgeGaps,
    summary: text(3000),
    subjects: z
      .array(
        z
          .object({
            subjectId: z.string(),
            expectedRevision: z.number().int().min(0),
            expectedOpenPrimaryLessonId: z.string().nullable(),
            action: z.enum(['assign', 'no_action', 'issue']),
            reason: text(1000),
            skillChanges: z.array(skillChanges).max(40),
            primaryLesson: lessonPackage.nullable(),
            reviewSet: lessonPackage.nullable(),
            masteryProposals: z.array(proposal).max(40),
            progressSummary: text(3000),
            roadmap: roadmap.optional(),
            roadmapChanges: roadmapChanges.optional(),
            openingSteps: z.array(newStep).min(5).max(10).optional(),
            notebookSetup: z.object({
              template: z.enum(['skill', 'reading']),
              framework:frameworkInput.optional(),
              goal: text(2000).optional(),
              level: text(200),
              curriculum: text(500),
              instructions: text(4000),
            }).strict().optional(),
            requestsHandled: z.array(z.object({ requestId: z.string(), status: z.enum(['done', 'declined']), note: text(1000) }).strict()).max(20),
          })
          .strict(),
      )
      .max(30),
    explorations: z
      .array(
        z
          .object({
            requestId: z.string(),
            action: z.enum(['assign', 'decline']),
            subjectId: z.string().nullable(),
            lesson: lessonPackage.nullable(),
            reason: text(1000),
          })
          .strict(),
      )
      .max(4),
    usage,
  })
  .strict();
export const error = z
  .object({
    skillId: ref,
    patternId: z.string().nullable().optional(),
    label: text(120),
    category: z.enum(['knowledge', 'application', 'slip', 'reading', 'unknown']),
    evidence: text(80),
  })
  .strict();
export const assessResult = z
  .object({
    contract: z.literal('assess-result/1'),
    contextHash: hash,
    knowledgeGaps,
    summary: text(1200),
    grades: z
      .array(
        z
          .object({
            attemptId: z.string(),
            result: z.enum(['correct', 'partial', 'incorrect', 'ungradable']),
            score: z.number().min(0).max(1),
            rubricScores: z
              .array(z.object({ criterion: text(200), points: z.number().min(0).max(5), max: z.number().min(1).max(5) }).strict())
              .max(5),
            feedback: text(800),
            correction: text(3000),
            errors: z.array(error).max(8),
            checkItem: lessonItem.nullable(),
          })
          .strict(),
      )
      .max(25),
    diagnosis: z.array(z.object({ attemptId: z.string(), errors: z.array(error).max(8) }).strict()).max(25),
    masteryProposals: z.array(proposal).max(40),
    errorPatternUpdates: z
      .array(
        z
          .object({ patternId: z.string(), action: z.enum(['improving', 'resolve']), evidenceAttemptIds: z.array(z.string()).min(1).max(20) })
          .strict(),
      )
      .max(20),
    reviewProposals: z
      .array(z.object({ skillId: ref, inDays: z.number().int().min(1).max(120), kind: z.enum(['retention', 'remediation']) }).strict())
      .max(40),
    recheckDecision: z
      .object({ decision: z.enum(['upheld', 'overturned', 'item_void']), explanation: text(800) })
      .strict()
      .nullable(),
    usage,
  })
  .strict();

const skill = z
  .object({
    skillId: ref,
    key: text(80),
    name: text(120),
    pathOrder: z.number().int(),
    prerequisites: z.array(ref),
    status: z.enum(['planned', 'active', 'retired']),
    mastery,
    masteryCeiling: mastery,
    dims,
    exposure14d: z.record(z.string(), z.number().int().min(0)),
    stuckOn: text(30).nullable(),
    nextReviewDay: text(10).nullable(),
    reviewKind: z.enum(['retention', 'remediation']).nullable(),
    maintained: z.boolean(),
  })
  .strict();
const pattern = z
  .object({
    patternId: z.string(),
    skillId: ref,
    label: text(120),
    category: z.enum(['knowledge', 'application', 'slip', 'reading', 'unknown']),
    confidence: z.enum(['suspected', 'confirmed']),
    status: z.enum(['open', 'improving', 'resolved']),
    occurrences: z.number().int(),
    daysSeen: z.number().int(),
    examples: z.array(text(8000)).max(5),
    intervention: text(500),
  })
  .strict();
const recentLesson = z
  .object({
    lessonId: z.string(),
    assignedDay: text(10),
    kind: text(30),
    title: text(200),
    completed: z.boolean(),
    items: z
      .array(
        z
          .object({
            itemId: z.string(),
            attemptId: z.string().nullable(),
            activity: text(30),
            skills: z.array(ref),
            prompt: text(160),
            result: text(20).nullable(),
            support: text(20),
            attemptNo: z.number().int(),
            errorLabels: z.array(text(120)),
            flag: text(30).nullable(),
          })
          .strict(),
      )
      .max(25),
  })
  .strict();
const request = z.object({ requestId: z.string(), kind: text(40), text: text(3000), by: z.enum(['guardian', 'learner', 'admin']) }).strict();
const subject = z
  .object({
    subjectId: z.string(),
    title: text(120),
    template: z.enum(['skill', 'reading']),
    sensitivity: z.enum(['normal', 'clinical', 'child_dev']),
    goal: text(3000),
    level: text(200),
    curriculum: text(3000),
    /** The notebook's own prompt, e.g. the former ChatGPT Project instructions (L5.5). */
    instructions: text(4000),
    limits: z.object({ maxDifficulty: z.number(), allowNewTopics: z.boolean(), maxNewSkillsPerWeek: z.number(),
      package: z.union([z.literal(2), z.literal(3)]).optional() }).strict(),
    weight: z.number(),
    revision: z.number().int(),
    progressSummary: text(3000),
    framework: z.object({key:z.string(),label:z.string(),levelFrom:z.string().optional(),levelTo:z.string().optional()}).strict().optional(),
    roadmap: z.array(roadmapStep.extend({requires:z.array(z.string()).optional(),id:z.string().optional(),band:z.number().optional(),status:z.string().optional(),levelLabel:z.string().nullable().optional()})).max(80).optional(),
    learnerReflections: z.array(z.object({submissionId:z.string(), lessonId:z.string(), difficulty:text(20), usefulness:text(20), minutes:z.number().int(), note:text(1500), updatedAt:text(40)}).strict()).max(10).optional(),
    slot: z
      .object({
        openPrimaryLessonId: z.string().nullable(),
        eligibleForPrimary: z.boolean(),
        reason: text(80),
        openReviewSetId: z.string().nullable(),
        eligibleForReview: z.boolean(),
      })
      .strict(),
    skills: z.array(skill).max(120),
    errorPatterns: z.array(pattern).max(120),
    recentLessons: z.array(recentLesson),
    requests: z.array(request),
    gradingQuality14d: z.object({ aiGraded: z.number(), disputed: z.number(), overturned: z.number(), keyIssues: z.number() }).strict(),
  })
  .strict();
import { adaptiveDecision } from "../ai-jobs/adaptive.ts";

export const planContext = z
  .object({
    contract: z.literal('plan-context/1'),
    jobId: z.string(),
    purpose: z.enum(['daily', 'initial', 'request']),
    learningDay: text(10),
    timezone: z.literal('Europe/Berlin'),
    contextHash: hash,
    knowledge,
    learner: learner
      .extend({
        targetMinutes: z.number(),
        preferences: z.record(z.string(), z.unknown()),
        studyMinutes14d: z.array(z.object({ day: text(10), minutes: z.number() }).strict()),
      })
      .strict(),
    policy: z
      .object({
        maxPrimaryPerSubjectPerDay: z.literal(1),
        maxReviewSetsPerSubjectPerDay: z.literal(1),
        extraLessonsLeftToday: z.number(),
        maxOpenMinutes: z.number(),
        openMinutesNow: z.number(),
        historyDays: z.literal(14),
        duplicateWindowDays: z.literal(90),
      })
      .strict(),
    planningGuidance: text(2000).optional(),
    adaptive: adaptiveDecision.optional(),
    roadmapProtocol: z.literal(2).optional(),
    frameworks: z.array(z.object({key:z.string(),label:z.string(),levels:z.array(z.string())}).strict()).optional(),
    subjects: z.array(subject).max(30),
    explorations: z
      .array(
        z
          .object({
            requestId: z.string(),
            kind: z.enum(['explore', 'extra_practice']),
            subjectId: z.string().nullable(),
            text: text(3000),
            urgency: text(20),
          })
          .strict(),
      )
      .max(20),
    truncated: z.array(text(300)),
  })
  .strict();
const assessmentAttempt = z
  .object({
    attemptId: z.string(),
    itemId: z.string(),
    stage: text(30),
    activity: text(30),
    input: z.enum(['choice', 'short', 'long', 'cloze', 'match', 'order', 'label', 'table', 'code']),
    language: z.enum(['rust', 'python', 'text']).optional(),
    starter: text(5000).optional(),
    skills: z.array(ref).max(3),
    prompt: text(2000),
    rubric: z
      .array(z.object({ criterion: text(200), points: z.number(), description: text(300).optional(), skill: ref.optional() }).strict())
      .nullable(),
    solution: text(3000),
    key: z.unknown().nullable(),
    answer: text(8000),
    attachments: z.array(z.object({ attachmentId: z.string(), url: text(300), mime: text(30), expired: z.boolean() }).strict()).max(4),
    support: text(20),
    attemptNo: z.number(),
    previousAttempts: z.array(z.object({ answer: text(8000), result: text(20).nullable(), feedback: text(1500) }).strict()),
    autoGrade: z
      .object({ result: text(20), expected: text(3000), chosenErrorLabel: text(120).nullable() })
      .strict()
      .nullable(),
  })
  .strict();
export const assessContext = z
  .object({
    contract: z.literal('assess-context/1'),
    jobId: z.string(),
    purpose: z.enum(['submission', 'recheck']),
    contextHash: hash,
    knowledge,
    learner,
    subject: z
      .object({
        subjectId: z.string(),
        title: text(120),
        goal: text(3000),
        level: text(200),
        instructions: text(4000),
        sensitivity: z.enum(['normal', 'clinical', 'child_dev']),
      })
      .strict(),
    lesson: z
      .object({
        lessonId: z.string(),
        title: text(200),
        objective: text(1000),
        template: z.enum(['skill', 'reading']),
        sheetRules: z.array(text(300)),
      })
      .strict(),
    attempts: z.array(assessmentAttempt).max(25),
    skills: z.array(skill).max(75),
    openErrorPatterns: z.array(pattern).max(10),
    recentEvidence: z
      .array(z.object({ attemptId: z.string(), skillId: ref, day: text(10), activity: text(30), result: text(20), support: text(20) }).strict())
      .max(40),
    recheck: z.unknown().nullable(),
    calibration: z.array(z.unknown()).max(5),
    truncated: z.array(text(300)),
  })
  .strict();
export type PlanContext = z.infer<typeof planContext>;
export type AssessContext = z.infer<typeof assessContext>;
export type PlanResult = z.infer<typeof planResult>;
export type AssessResult = z.infer<typeof assessResult>;
