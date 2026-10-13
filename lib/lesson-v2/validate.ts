import { lessonPackageV2, type LessonItem, type LessonPackageV2 } from '../contracts/lesson-package-v2.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../automation/privacy.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';
import { parseNumericAnswer } from './numeric.ts';

/** One problem with a lesson package; codes match docs/hub2/AI-API.md §4. */
export type LessonIssue = { path: string; code: string; message: string };
export type ValidateOptions = { maxDifficulty?: number; sensitivity?: SubjectSensitivity };

const MAX_BYTES = 96 * 1024;
const stagesFor = {
  skill: { allowed: ['retrieval', 'sheet', 'guided', 'independent'], withoutItems: ['sheet'] },
  reading: { allowed: ['read', 'analyze', 'output'], withoutItems: ['read'] },
} as const;

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

export function itemIssues(item: LessonItem, path: string, maxDifficulty: number): LessonIssue[] {
  const issues: LessonIssue[] = [];
  const issue = (field: string, code: string, message: string) => issues.push({ path: `${path}/${field}`, code, message });
  if (!item.key && !item.rubric) issue('key', 'schema', 'Each item needs a key (auto-graded) or a rubric (AI-graded).');
  if (item.difficulty > maxDifficulty) issue('difficulty', 'difficulty_limit', `Difficulty ${item.difficulty} exceeds the notebook limit ${maxDifficulty}.`);
  if (item.input === 'choice') {
    if (!item.choices) issue('choices', 'schema', 'A choice item needs choices.');
    if (item.key?.type !== 'choice') issue('key', 'schema', 'A choice item needs a choice key.');
  } else if (item.choices) issue('choices', 'schema', 'Only choice items have choices.');
  if (item.choices && new Set(item.choices.map((choice) => choice.id)).size !== item.choices.length) issue('choices', 'schema', 'Choice ids must be unique.');
  if (item.key?.type === 'choice') {
    if (item.input !== 'choice') issue('key', 'schema', 'A choice key needs input "choice".');
    const ids = new Set(item.choices?.map((choice) => choice.id));
    for (const id of item.key.correct) if (!ids.has(id)) issue('key/correct', 'schema', `Correct choice "${id}" is not among the choices.`);
  }
  if (item.key?.type === 'numeric' && !parseNumericAnswer(item.key.value)) issue('key/value', 'schema', 'Numeric key value is not a number.');
  if (item.key?.type === 'text' && item.key.accepted.length > 1 && item.key.accepted.some((answer) => words(answer) > 3)) {
    // Several accepted long answers means the answer is not unique: grade it with a rubric (LESSON-DESIGN §5.3).
    issue('key/accepted', 'schema', 'Text keys accept answers of at most 3 words, or a single exact sentence; use a rubric otherwise.');
  }
  return issues;
}

/** Validates a lesson package; returns the parsed package when there are no issues. */
export function validateLessonPackage(input: unknown, options: ValidateOptions = {}): { lesson: LessonPackageV2; issues: [] } | { lesson: null; issues: LessonIssue[] } {
  const size = new TextEncoder().encode(JSON.stringify(input ?? null)).length;
  if (size > MAX_BYTES) return { lesson: null, issues: [{ path: '', code: 'size_limit', message: `Lesson package is ${size} bytes; the limit is ${MAX_BYTES}.` }] };
  const parsed = lessonPackageV2.safeParse(input);
  if (!parsed.success) {
    return { lesson: null, issues: parsed.error.issues.map((problem) => ({ path: '/' + problem.path.join('/'), code: 'schema', message: problem.message })) };
  }
  const lesson = parsed.data;
  const issues: LessonIssue[] = [];
  const issue = (path: string, code: string, message: string) => issues.push({ path, code, message });
  const maxDifficulty = options.maxDifficulty ?? 5;

  const review = lesson.kind === 'review';
  const [minItems, maxItems] = review ? [3, 10] : [3, 25];
  if (lesson.items.length < minItems || lesson.items.length > maxItems) issue('/items', 'schema', `A ${lesson.kind} lesson has ${minItems}–${maxItems} items.`);
  if (review && lesson.estMinutes > 20) issue('/estMinutes', 'schema', 'A review set takes at most 20 minutes.');

  const ids = lesson.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) issue('/items', 'schema', 'Item ids must be unique.');

  const rules = stagesFor[lesson.template];
  const allowedStages: readonly string[] = review ? ['retrieval', 'independent'] : rules.allowed;
  const placed = new Map<string, number>();
  lesson.stages.forEach((stage, index) => {
    const path = `/stages/${index}`;
    if (!allowedStages.includes(stage.stage)) issue(`${path}/stage`, 'schema', `Stage "${stage.stage}" is not allowed in a ${review ? 'review set' : `${lesson.template} lesson`}.`);
    if ((rules.withoutItems as readonly string[]).includes(stage.stage) && stage.itemIds.length) issue(`${path}/itemIds`, 'schema', `Stage "${stage.stage}" holds no items.`);
    for (const id of stage.itemIds) {
      if (!ids.includes(id)) issue(`${path}/itemIds`, 'unknown_reference', `Stage refers to unknown item "${id}".`);
      placed.set(id, (placed.get(id) ?? 0) + 1);
    }
  });
  if (new Set(lesson.stages.map((stage) => stage.stage)).size !== lesson.stages.length) issue('/stages', 'schema', 'Each stage appears once.');
  for (const id of ids) if (placed.get(id) !== 1) issue('/stages', 'schema', `Item "${id}" must be in exactly one stage.`);

  if (lesson.template === 'skill' && (lesson.kind === 'new' || lesson.kind === 'remediation' || lesson.kind === 'diagnostic') && !lesson.sheet) {
    issue('/sheet', 'schema', 'New and remediation skill lessons need a knowledge sheet.');
  }
  if (lesson.template === 'reading') {
    if (!lesson.sections.length) issue('/sections', 'schema', 'A reading lesson needs sections.');
    if (!lesson.output?.trim()) issue('/output', 'schema', 'A reading lesson needs a concrete output.');
    if (!lesson.sources.length) issue('/sources', 'schema', 'A reading lesson needs opened sources.');
  }

  lesson.items.forEach((item, index) => issues.push(...itemIssues(item, `/items/${index}`, maxDifficulty)));

  const learnerText = [
    lesson.title, lesson.objective, lesson.why, lesson.level, lesson.diagram ?? '', lesson.output ?? '', lesson.nextTopic,
    ...lesson.sections.flatMap((section) => [section.heading, section.text]),
    ...(lesson.sheet ? [lesson.sheet.explanation, ...lesson.sheet.rules, ...lesson.sheet.examples.flatMap((example) => [example.text, example.note ?? ""]), ...lesson.sheet.mistakes, ...lesson.sheet.tips, ...lesson.sheet.checklist] : []),
    ...lesson.items.flatMap((item) => [item.prompt, item.instructions ?? '', item.explanation ?? '', item.solution, ...item.hints, ...(item.choices ?? []).flatMap((choice) => [choice.text, choice.errorLabel ?? '']), ...(item.rubric ?? []).flatMap((criterion) => [criterion.criterion, criterion.description ?? ''])]),
    ...lesson.sources.flatMap((source) => [source.title, source.readScope]),
  ].join('\n');
  if (containsContactDetails(learnerText) || containsPossibleClinicalIdentifier(learnerText, options.sensitivity ?? 'normal')) {
    issue('', 'privacy', 'Lesson text may contain identifying contact or clinical details.');
  }

  return issues.length ? { lesson: null, issues } : { lesson, issues: [] };
}
