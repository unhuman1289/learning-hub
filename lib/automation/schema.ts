import { z } from 'zod';
import { lessonContentSchema } from '../run-schema.ts';

const shortText = z.string().trim().min(1).max(200);
const runId = z.string().uuid();
const targetId = z.string().regex(/^tgt_[A-Za-z0-9_-]{12,80}$/);

export const startRunSchema = z.object({
  contractVersion: z.literal('1'),
  trigger: z.enum(['scheduled', 'manual']),
  runner: z.object({ name: shortText, version: shortText, model: shortText }).strict(),
}).strict();

const assignItem = z.object({
  targetId,
  action: z.literal('assign'),
  expectedCurrentLessonId: z.string().max(200).nullable(),
  lesson: lessonContentSchema,
}).strict();
const issueItem = z.object({ targetId, action: z.literal('issue'), reason: z.string().trim().min(1).max(1000) }).strict();
const noActionItem = z.object({ targetId, action: z.literal('no_action'), reason: z.string().trim().max(1000).optional() }).strict();

export const resultSchema = z.object({
  contractVersion: z.literal('1'),
  contextHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  summary: z.string().trim().max(5000),
  items: z.array(z.discriminatedUnion('action', [assignItem, issueItem, noActionItem])).max(50),
}).strict().superRefine((result, context) => {
  const ids = result.items.map((item) => item.targetId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Each target may appear only once.' });
  if (result.items.filter((item) => item.action === 'assign').length > 10) context.addIssue({ code: 'custom', message: 'A run may assign at most 10 lessons.' });
});

export const failRunSchema = z.object({ error: z.string().trim().min(1).max(1000) }).strict();
export const runIdParamSchema = runId;
export type StartRunInput = z.infer<typeof startRunSchema>;
export type AutomationResultInput = z.infer<typeof resultSchema>;

// Kept beside the zod validators and checked by contract tests so runners can
// validate payloads without importing application code.
export const automationJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Learning Hub Automation API v1',
  definitions: {
    start: { type: 'object', additionalProperties: false, required: ['contractVersion', 'trigger', 'runner'], properties: { contractVersion: { const: '1' }, trigger: { enum: ['scheduled', 'manual'] }, runner: { type: 'object', additionalProperties: false, required: ['name', 'version', 'model'], properties: { name: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', minLength: 1, maxLength: 200 }, model: { type: 'string', minLength: 1, maxLength: 200 } } } } },
    lessonPackage: {
      type: 'object', additionalProperties: false,
      required: ['title', 'objective', 'minutes', 'level', 'sections', 'diagram', 'exercise', 'questions', 'deliverable', 'sources', 'nextTopic'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 18000 }, objective: { type: 'string', minLength: 1, maxLength: 18000 }, minutes: { type: 'integer', minimum: 5, maximum: 240 }, level: { type: 'string', minLength: 1, maxLength: 18000 },
        sections: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['heading', 'text'], properties: { heading: { type: 'string', minLength: 1, maxLength: 18000 }, text: { type: 'string', minLength: 1, maxLength: 18000 } } } },
        diagram: { type: 'string', maxLength: 6000 }, exercise: { type: 'string', minLength: 1, maxLength: 18000 },
        questions: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['question', 'answer'], properties: { question: { type: 'string', minLength: 1, maxLength: 18000 }, answer: { type: 'string', minLength: 1, maxLength: 18000 } } } },
        deliverable: { type: 'string', minLength: 1, maxLength: 18000 },
        sources: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['title', 'url', 'readScope', 'retrievedAt', 'publishedAt'], properties: { title: { type: 'string', minLength: 1, maxLength: 18000 }, url: { type: 'string', format: 'uri', pattern: '^https://' }, readScope: { type: 'string', minLength: 1, maxLength: 18000 }, retrievedAt: { type: 'string', format: 'date-time' }, publishedAt: { type: ['string', 'null'], maxLength: 100 } } } },
        nextTopic: { type: 'string', minLength: 1, maxLength: 18000 },
      },
    },
    result: {
      type: 'object', additionalProperties: false, required: ['contractVersion', 'contextHash', 'summary', 'items'],
      properties: {
        contractVersion: { const: '1' }, contextHash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, summary: { type: 'string', maxLength: 5000 },
        items: { type: 'array', maxItems: 50, minContains: 0, maxContains: 10, contains: { properties: { action: { const: 'assign' } } }, items: { oneOf: [
          { type: 'object', additionalProperties: false, required: ['targetId', 'action', 'expectedCurrentLessonId', 'lesson'], properties: { targetId: { type: 'string', pattern: '^tgt_[A-Za-z0-9_-]{12,80}$' }, action: { const: 'assign' }, expectedCurrentLessonId: { type: ['string', 'null'], maxLength: 200 }, lesson: { $ref: '#/$defs/lessonPackage' } } },
          { type: 'object', additionalProperties: false, required: ['targetId', 'action', 'reason'], properties: { targetId: { type: 'string', pattern: '^tgt_[A-Za-z0-9_-]{12,80}$' }, action: { const: 'issue' }, reason: { type: 'string', minLength: 1, maxLength: 1000 } } },
          { type: 'object', additionalProperties: false, required: ['targetId', 'action'], properties: { targetId: { type: 'string', pattern: '^tgt_[A-Za-z0-9_-]{12,80}$' }, action: { const: 'no_action' }, reason: { type: 'string', maxLength: 1000 } } },
        ] } },
      },
    },
    context: { type: 'object', required: ['contractVersion', 'runId', 'contextHash', 'learningDay', 'timezone', 'cutoff', 'policy', 'targets'], properties: { contractVersion: { const: '1' }, runId: { type: 'string', format: 'uuid' }, contextHash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, learningDay: { type: 'string', format: 'date' }, timezone: { const: 'Europe/Berlin' }, cutoff: { type: 'string', format: 'date-time' }, policy: { type: 'object' }, targets: { type: 'array', maxItems: 50, items: { type: 'object' } } } },
  },
  $defs: { lessonPackage: { $ref: '#/definitions/lessonPackage' } },
};
