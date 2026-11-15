import { z } from 'zod/v4';

// Workers disallow runtime code generation. Keep schema validation on Zod's interpreter.
z.config({ jitless: true });

/**
 * lesson-package/2: one lesson with individually graded items (docs/hub2/AI-API.md §6.1).
 * The schema checks shape and sizes; lib/lesson-v2/validate.ts checks rules across fields.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const skillRef = z.string().regex(/^(sk_[A-Za-z0-9]{6,40}|key:[a-z0-9-]{1,80})$/);

export const lessonKinds = ['new', 'remediation', 'review', 'exploration', 'diagnostic'] as const;
export const activities = ['recall', 'recognize', 'correct', 'transform', 'apply', 'explain', 'create', 'investigate'] as const;
export const stageNames = ['retrieval', 'sheet', 'guided', 'independent', 'read', 'analyze', 'output', 'check'] as const;

export const choiceKey = z.object({ type: z.literal('choice'), correct: z.array(z.string().regex(/^[a-f]$/)).min(1).max(6) }).strict();
export const numericKey = z.object({
  type: z.literal('numeric'), value: z.string().trim().min(1).max(40), tolerance: z.number().min(0).max(1e6), unit: z.string().max(20).nullable(),
}).strict();
export const textKey = z.object({ type: z.literal('text'), accepted: z.array(text(200)).min(1).max(10), caseSensitive: z.boolean() }).strict();
export const dictationKey = z.object({
  type: z.literal('dictation'),
  text: text(600),
  pinyin: text(2400).regex(/^(?:[a-zü:]+[0-5])(?:\s+[a-zü:]+[0-5])*$/iu).optional(),
  ignore: z.array(z.enum(['case', 'punctuation'])).max(2),
  variants: z.array(z.array(text(600)).min(2)).optional(),
}).strict();
export const answerKey = z.discriminatedUnion('type', [choiceKey, numericKey, textKey, dictationKey]);

export const rubricCriterion = z.object({
  criterion: text(200), points: z.number().int().min(1).max(5), description: z.string().max(300).optional(), skill: skillRef.optional(),
}).strict();

export const lessonItem = z.object({
  id: z.string().regex(/^i\d{1,2}$/),
  activity: z.enum(activities),
  input: z.enum(['choice', 'short', 'long']),
  skills: z.array(skillRef).min(1).max(3),
  difficulty: z.number().int().min(1).max(5),
  prompt: text(2000),
  instructions: z.string().max(1000).optional(),
  choices: z.array(z.object({ id: z.string().regex(/^[a-f]$/), text: text(300), errorLabel: z.string().max(120).optional() }).strict()).min(2).max(6).optional(),
  key: answerKey.optional(),
  rubric: z.array(rubricCriterion).min(2).max(5).optional(),
  hints: z.array(text(500)).max(2),
  solution: text(3000),
  explanation: z.string().max(1000).optional(),
  attachment: z.enum(['none', 'optional', 'required']),
}).strict();

export const knowledgeSheet = z.object({
  rules: z.array(text(300)).min(1).max(10),
  explanation: text(4000),
  examples: z.array(z.object({ text: text(500), correct: z.boolean(), note: z.string().max(300).optional() }).strict()).max(8),
  mistakes: z.array(text(300)).max(8),
  tips: z.array(text(300)).max(8),
  checklist: z.array(text(200)).max(8),
}).strict();

export const lessonSource = z.object({
  title: text(300),
  url: z.url().startsWith('https://').max(2000),
  readScope: text(500),
  retrievedAt: z.iso.datetime(),
  publishedAt: z.string().max(100).nullable(),
}).strict();

export const lessonPackageV2 = z.object({
  contract: z.literal('lesson-package/2'),
  kind: z.enum(lessonKinds),
  template: z.enum(['skill', 'reading']),
  title: text(200),
  objective: text(1000),
  why: text(400),
  reasonRefs: z.array(z.string().regex(/^(sk_|err_|key:)[A-Za-z0-9_-]{1,80}$/)).max(20),
  estMinutes: z.number().int().min(5).max(90),
  level: z.string().max(200),
  targetSkills: z.array(skillRef).min(1).max(10),
  sheet: knowledgeSheet.nullable(),
  sections: z.array(z.object({ heading: text(200), text: text(6000) }).strict()).max(8),
  diagram: z.string().max(6000).nullable(),
  stages: z.array(z.object({ stage: z.enum(stageNames), title: z.string().max(80).optional(), itemIds: z.array(z.string().regex(/^i\d{1,2}$/)).max(25) }).strict()).min(1).max(6),
  items: z.array(lessonItem).min(1).max(25),
  output: z.string().max(2000).nullable(),
  sources: z.array(lessonSource).max(8),
  nextTopic: text(500),
}).strict();

export type LessonPackageV2 = z.infer<typeof lessonPackageV2>;
export type LessonItem = z.infer<typeof lessonItem>;
export type AnswerKey = z.infer<typeof answerKey>;
