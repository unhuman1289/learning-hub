import { itemPolicy, isMathFramework, type ItemKind } from '../subjects/item-kinds.ts';
import { lessonPackageV2 } from '../contracts/lesson-items.ts';
import { lessonPackageV3, type LessonItemAny, type LessonPackage } from '../contracts/lesson-package-v3.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../automation/privacy.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';
import {isChemicalFormula,isChemistryNotebook} from '../chemistry.ts';
import { parseNumericAnswer } from './numeric.ts';

/** One problem with a lesson package; codes match docs/hub2/AI-API.md §4. */
export type LessonIssue = { path: string; code: string; message: string };
export type ValidateOptions = {
  maxDifficulty?: number;
  minDifficulty?: number;
  sensitivity?: SubjectSensitivity;
  /** Lessons written by an AI runner follow the sizes in docs/plan/LOCAL-GRADER.md D20; hand-imported lessons keep 3–25. */
  aiSizes?: boolean;
  adaptive?: boolean;
  subjectTitle?: string;
  frameworkKey?: string;
  itemKinds?: ItemKind[];
};

/** D20: items per lesson written by an AI runner, and at most four open answers so grading stays quick. */
export const AI_ITEM_RANGE: Record<string, [number, number]> = {
  new: [8, 10],
  remediation: [8, 10],
  diagnostic: [5, 10],
  review: [5, 6],
  exploration: [5, 8],
  reading: [5, 8],
};
export const AI_MAX_OPEN_ITEMS = 4;

const MAX_BYTES = 96 * 1024;
const stagesFor = {
  skill: { allowed: ['retrieval', 'sheet', 'guided', 'independent'], withoutItems: ['sheet'] },
  reading: { allowed: ['read', 'analyze', 'output'], withoutItems: ['read'] },
} as const;

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const chineseWords = new Intl.Segmenter('zh-CN', { granularity: 'word' });

export function itemIssues(item: LessonItemAny, path: string, maxDifficulty: number): LessonIssue[] {
  const issues: LessonIssue[] = [];
  const issue = (field: string, code: string, message: string) => issues.push({ path: `${path}/${field}`, code, message });
  if (!item.key && !item.rubric) issue('key', 'schema', 'Each item needs a key (auto-graded) or a rubric (AI-graded).');
  if (item.difficulty > maxDifficulty)
    issue('difficulty', 'difficulty_limit', `Difficulty ${item.difficulty} exceeds the notebook limit ${maxDifficulty}.`);
  if (item.input === 'choice') {
    if (!item.choices) issue('choices', 'schema', 'A choice item needs choices.');
    if (item.key?.type !== 'choice') issue('key', 'schema', 'A choice item needs a choice key.');
  } else if (item.choices) issue('choices', 'schema', 'Only choice items have choices.');
  if (item.choices && new Set(item.choices.map((choice) => choice.id)).size !== item.choices.length)
    issue('choices', 'schema', 'Choice ids must be unique.');
  if (item.key?.type === 'choice') {
    if (item.input !== 'choice') issue('key', 'schema', 'A choice key needs input "choice".');
    const ids = new Set(item.choices?.map((choice) => choice.id));
    for (const id of item.key.correct) if (!ids.has(id)) issue('key/correct', 'schema', `Correct choice "${id}" is not among the choices.`);
  }
  if (item.key?.type === 'dictation' && item.input !== 'short')
    issue('input', 'schema', 'Câu chính tả dùng dạng trả lời ngắn.');
  if (item.audio) {
    const { lang, lines, rate } = item.audio;
    const band = item.difficulty;
    const expectedRate = band === 1 ? 0.8 : band <= 3 ? 0.9 : 1;
    if (rate !== expectedRate) issue('audio/rate', 'difficulty_limit', `Tốc độ đọc ở band ${band} là ${expectedRate}.`);
    if (band <= 3) {
      const limit = band === 1 ? 8 : 15;
      const turnLengths = lines.map(line => lang === 'zh-CN'
        ? [...chineseWords.segment(line.text)].filter(word => word.isWordLike).length
        : words(line.text));
      turnLengths.forEach((length, index) => {
        if (length > limit) issue(`audio/lines/${index}/text`, 'size_limit', `Mỗi lượt có tối đa ${limit} từ.`);
      });
      const totalWords = turnLengths.reduce((total, length) => total + length, 0);
      if (band === 1 && totalWords > 15 * 2.5 * expectedRate)
        issue('audio/lines', 'size_limit', 'Lời thoại band 1 dài tối đa khoảng 15 giây.');
    }
  }
  if (item.key?.type === 'numeric' && !parseNumericAnswer(item.key.value)) issue('key/value', 'schema', 'Numeric key value is not a number.');
  if (item.key?.type === 'table') item.key.cells.forEach((cell, index) => {
    if (cell.type === 'numeric' && !parseNumericAnswer(cell.value))
      issue(`key/cells/${index}/value`, 'schema', 'Numeric key value is not a number.');
  });
  if (item.key?.type === 'text' && item.key.accepted.length > 1 && item.key.accepted.some((answer) => words(answer) > 3)) {
    // Several accepted long answers means the answer is not unique: grade it with a rubric (LESSON-DESIGN §5.3).
    issue('key/accepted', 'schema', 'Text keys accept answers of at most 3 words, or a single exact sentence; use a rubric otherwise.');
  }
  return issues;
}

/** Validates a lesson package; returns the parsed package when there are no issues. */
export function validateLessonPackage(
  input: unknown,
  options: ValidateOptions = {},
): { lesson: LessonPackage; issues: [] } | { lesson: null; issues: LessonIssue[] } {
  const size = new TextEncoder().encode(JSON.stringify(input ?? null)).length;
  if (size > MAX_BYTES)
    return { lesson: null, issues: [{ path: '', code: 'size_limit', message: `Lesson package is ${size} bytes; the limit is ${MAX_BYTES}.` }] };
  const modern = typeof input === 'object' && input !== null && 'contract' in input && input.contract === 'lesson-package/3';
  const parsed = (modern ? lessonPackageV3 : lessonPackageV2).safeParse(input);
  if (!parsed.success) {
    return {
      lesson: null,
      issues: parsed.error.issues.map((problem) => ({ path: '/' + problem.path.join('/'), code: 'schema', message: problem.message })),
    };
  }
  const lesson = parsed.data;
  if (options.aiSizes && lesson.contract === 'lesson-package/3' && isMathFramework(options.frameworkKey)) {
    lesson.items = lesson.items.map(item => {
      if ((item.input !== 'short' && item.input !== 'long') || item.key?.type !== 'text' ||
          !item.key.accepted.some(answer => words(answer) > 3)) return item;
      const { key: _key, ...open } = item;
      void _key;

      return {
        ...open,
        rubric: item.rubric ?? [
          { criterion: 'Đáp ứng yêu cầu của đề bài', points: 1, skill: item.skills[0] },
          { criterion: 'Nội dung toán học đúng theo lời giải mẫu hoặc cách giải tương đương', points: 1, skill: item.skills[0] },
        ],
      };
    });
  }
  const items: LessonItemAny[] = lesson.items;
  const issues: LessonIssue[] = [];
  const issue = (path: string, code: string, message: string) => issues.push({ path, code, message });
  const maxDifficulty = options.maxDifficulty ?? 5;

  if (options.itemKinds) {
    const policy = itemPolicy(options.frameworkKey);
    if (new Set(items.map(item => item.input)).size < policy.minimum)
      issue('/items', 'item_kinds', 'Chuẩn học này cần ít nhất hai dạng câu.');
    items.forEach((item, index) => {
      if (!options.itemKinds?.includes(item.input))
        issue(`/items/${index}/input`, 'item_kinds', `Sổ này không dùng dạng câu "${item.input}".`);
    });
    if (!policy.codeKnowledge && lesson.contract === 'lesson-package/3')
      lesson.knowledge.forEach((block, index) => {
        if (block.kind === 'code') issue(`/knowledge/${index}`, 'item_kinds', 'Sổ ngôn ngữ không dùng khối mã.');
      });
  }
  const review = lesson.kind === 'review';
  const [minItems, maxItems] = options.adaptive ? [1, 25] : review ? [3, 10] : [3, 25];
  if (lesson.items.length < minItems || lesson.items.length > maxItems)
    issue('/items', 'schema', `A ${lesson.kind} lesson has ${minItems}–${maxItems} items.`);
  else if (options.aiSizes && !options.adaptive) {
    const [low, high] = AI_ITEM_RANGE[lesson.template === 'reading' && !review ? 'reading' : lesson.kind];
    if (lesson.items.length < low || lesson.items.length > high)
      issue(
        '/items',
        'size_limit',
        `A ${lesson.template === 'reading' ? 'reading' : lesson.kind} lesson has ${low}–${high} items (it has ${lesson.items.length}).`,
      );
    const open = items.filter((item) => !item.key).length;
    const limit = lesson.contract === 'lesson-package/3' && lesson.gradingMode === 'whole-lesson' ? 8 : AI_MAX_OPEN_ITEMS;
    if (open > limit)
      issue('/items', 'size_limit', `At most ${limit} open-answer items per lesson (it has ${open}).`);
  }
  if (review && !options.adaptive && lesson.estMinutes > 20) issue('/estMinutes', 'schema', 'A review set takes at most 20 minutes.');

  const ids = lesson.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) issue('/items', 'schema', 'Item ids must be unique.');

  const rules = stagesFor[lesson.template];
  const allowedStages: readonly string[] = review ? ['retrieval', 'independent'] : rules.allowed;
  const placed = new Map<string, number>();
  lesson.stages.forEach((stage, index) => {
    const path = `/stages/${index}`;
    if (!allowedStages.includes(stage.stage))
      issue(`${path}/stage`, 'schema', `Stage "${stage.stage}" is not allowed in a ${review ? 'review set' : `${lesson.template} lesson`}.`);
    if ((rules.withoutItems as readonly string[]).includes(stage.stage) && stage.itemIds.length)
      issue(`${path}/itemIds`, 'schema', `Stage "${stage.stage}" holds no items.`);
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

  if(isChemistryNotebook(options.subjectTitle??''))items.forEach((item,index)=>{
    if(item.key?.type==='text'&&item.key.accepted.some(isChemicalFormula)&&!item.key.caseSensitive)
      issue(`/items/${index}/key/caseSensitive`,'chemistry_case','Đáp án công thức phải phân biệt hoa/thường (Co khác CO).');
  });
  items.forEach((item, index) => {
    issues.push(...itemIssues(item, `/items/${index}`, maxDifficulty));
    if (item.difficulty < (options.minDifficulty ?? 1))
      issues.push({path:`/items/${index}/difficulty`,code:'difficulty_limit',message:'Câu quá dễ cho bước này.'});
  });

  const listeningItems = items.filter(item => item.audio);
  if (!(lesson.contract === 'lesson-package/3' && lesson.gradingMode === 'whole-lesson') && listeningItems.length && !listeningItems.some(item => item.key))
    issue('/items', 'schema', 'Bài có câu nghe cần ít nhất một câu nghe chấm tự động.');
  if (items.filter(item => item.key?.type === 'dictation').length > 2)
    issue('/items', 'size_limit', 'Mỗi bài có tối đa hai câu chính tả.');

  const learnerText = [
    lesson.title,
    lesson.objective,
    lesson.why,
    lesson.level,
    lesson.diagram ?? '',
    lesson.output ?? '',
    lesson.nextTopic,
    ...lesson.sections.flatMap((section) => [section.heading, section.text]),
    ...(lesson.sheet
      ? [
          lesson.sheet.explanation,
          ...lesson.sheet.rules,
          ...lesson.sheet.examples.flatMap((example) => [example.text, example.note ?? '']),
          ...lesson.sheet.mistakes,
          ...lesson.sheet.tips,
          ...lesson.sheet.checklist,
        ]
      : []),
    ...items.flatMap((item) => [
      item.prompt,
      ...(item.audio?.lines.map(line => line.text) ?? []),
      ...(item.key?.type === 'dictation' ? [item.key.text, item.key.pinyin ?? '', ...(item.key.variants?.flat() ?? [])] : []),
      item.instructions ?? '',
      item.explanation ?? '',
      item.solution,
      ...item.hints,
      ...(item.choices ?? []).flatMap((choice) => [choice.text, choice.errorLabel ?? '']),
      ...(item.rubric ?? []).flatMap((criterion) => [criterion.criterion, criterion.description ?? '']),
    ]),
    ...(lesson.contract === 'lesson-package/3' ? [
      JSON.stringify(lesson.knowledge),
      ...items.flatMap(item => {
        switch (item.input) {
          case 'cloze': return item.fragments;
          case 'match': return [...item.left, ...item.right].map(option => option.text);
          case 'order': return item.steps.map(step => step.text);
          case 'label': return [item.description];
          case 'table': return [...item.headers, ...item.rowLabels];
          case 'code': return [item.starter];
          default: return [];
        }
      }),
    ] : []),
    ...lesson.sources.flatMap((source) => [source.title, source.readScope]),
  ].join('\n');
  if (containsContactDetails(learnerText) || containsPossibleClinicalIdentifier(learnerText, options.sensitivity ?? 'normal')) {
    issue('', 'privacy', 'Lesson text may contain identifying contact or clinical details.');
  }

  return issues.length ? { lesson: null, issues } : { lesson, issues: [] };
}
