import { ApiError } from '../api-error.ts';
import { learningTracks, type LearningTrack } from '../daily-policy.ts';
import { DEFAULT_LIMITS, legacyTrackDefaults, type SubjectLimits, type SubjectSensitivity, type SubjectStatus, type SubjectTemplate } from './sql.ts';

/** Fields a learner (adult), guardian or admin may set; AI jobs never write these (docs/hub2 README §4). */
export type SubjectInput = {
  title: string; template: SubjectTemplate; sensitivity: SubjectSensitivity; goal: string; level: string;
  curriculum: string; limits: SubjectLimits; weight: number; legacyTrack?: LearningTrack;
};
export type SubjectPatch = Partial<SubjectInput & { status: SubjectStatus; aiEnabled: boolean; instructions: string }> & { revision: number };

const templates = new Set(['skill', 'reading']);
const sensitivities = new Set(['normal', 'clinical', 'child_dev']);
const statuses = new Set(['setup', 'active', 'paused', 'archived']);

const bad = (message: string) => new ApiError(400, message);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function text(value: unknown, field: string, max: number, min = 0) {
  if (typeof value !== 'string') throw bad(`${field} phải là chữ.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw bad(min ? `${field} cần ${min}–${max} ký tự.` : `${field} tối đa ${max} ký tự.`);
  return trimmed;
}

function int(value: unknown, field: string, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw bad(`${field} cần là số nguyên ${min}–${max}.`);
  return value as number;
}

export function parseLimits(value: unknown): SubjectLimits {
  if (value === undefined) return { ...DEFAULT_LIMITS };
  if (!isRecord(value)) throw bad('Giới hạn không hợp lệ.');
  const unknownKey = Object.keys(value).find((key) => !(key in DEFAULT_LIMITS));
  if (unknownKey) throw bad(`Giới hạn không có trường ${unknownKey}.`);
  const limits = { ...DEFAULT_LIMITS, ...value };
  if (typeof limits.allowNewTopics !== 'boolean') throw bad('allowNewTopics phải là true hoặc false.');
  return {
    maxDifficulty: int(limits.maxDifficulty, 'Độ khó tối đa', 1, 5),
    allowNewTopics: limits.allowNewTopics,
    maxNewSkillsPerWeek: int(limits.maxNewSkillsPerWeek, 'Số kỹ năng mới mỗi tuần', 0, 10),
  };
}

export function parseSubjectInput(body: unknown): SubjectInput {
  if (!isRecord(body)) throw bad('Dữ liệu sổ không hợp lệ.');
  // Re-shelving one of the five prepared notebooks keeps its foundation lessons, template and sensitivity.
  if (body.legacyTrack !== undefined) {
    if (!(learningTracks as readonly unknown[]).includes(body.legacyTrack)) throw bad('Mảng có sẵn không hợp lệ.');
    const track = body.legacyTrack as LearningTrack;
    return {
      ...parseSubjectInput({ ...body, legacyTrack: undefined, title: body.title ?? track, ...legacyTrackDefaults[track] }),
      legacyTrack: track,
    };
  }
  const template = body.template ?? 'skill';
  const sensitivity = body.sensitivity ?? 'normal';
  if (!templates.has(template as string)) throw bad('Khuôn bài phải là skill hoặc reading.');
  if (!sensitivities.has(sensitivity as string)) throw bad('Mức nhạy cảm không hợp lệ.');
  return {
    title: text(body.title, 'Tên sổ', 80, 1),
    template: template as SubjectTemplate,
    sensitivity: sensitivity as SubjectSensitivity,
    goal: text(body.goal ?? '', 'Mục tiêu', 2000),
    level: text(body.level ?? '', 'Trình độ', 200),
    curriculum: text(body.curriculum ?? '', 'Chương trình', 500),
    limits: parseLimits(body.limits),
    weight: body.weight === undefined ? 3 : int(body.weight, 'Ưu tiên', 1, 5),
  };
}

const patchable = new Set(['title', 'template', 'sensitivity', 'goal', 'level', 'curriculum', 'instructions', 'limits', 'weight', 'status', 'aiEnabled', 'revision']);

export function parseSubjectPatch(body: unknown): SubjectPatch {
  if (!isRecord(body)) throw bad('Dữ liệu sổ không hợp lệ.');
  const unknownKey = Object.keys(body).find((key) => !patchable.has(key));
  if (unknownKey) throw bad(`Không sửa được trường ${unknownKey}.`);
  const patch: SubjectPatch = { revision: int(body.revision, 'revision', 0, Number.MAX_SAFE_INTEGER) };
  if ('title' in body) patch.title = text(body.title, 'Tên sổ', 80, 1);
  if ('template' in body) { if (!templates.has(body.template as string)) throw bad('Khuôn bài phải là skill hoặc reading.'); patch.template = body.template as SubjectTemplate; }
  if ('sensitivity' in body) { if (!sensitivities.has(body.sensitivity as string)) throw bad('Mức nhạy cảm không hợp lệ.'); patch.sensitivity = body.sensitivity as SubjectSensitivity; }
  if ('goal' in body) patch.goal = text(body.goal, 'Mục tiêu', 2000);
  if ('level' in body) patch.level = text(body.level, 'Trình độ', 200);
  if ('curriculum' in body) patch.curriculum = text(body.curriculum, 'Chương trình', 500);
  // The notebook's own prompt for the AI that writes and grades its lessons (L5.5).
  if ('instructions' in body) patch.instructions = text(body.instructions, 'Prompt của sổ', 4000);
  if ('limits' in body) patch.limits = parseLimits(body.limits);
  if ('weight' in body) patch.weight = int(body.weight, 'Ưu tiên', 1, 5);
  if ('status' in body) { if (!statuses.has(body.status as string)) throw bad('Trạng thái không hợp lệ.'); patch.status = body.status as SubjectStatus; }
  if ('aiEnabled' in body) { if (typeof body.aiEnabled !== 'boolean') throw bad('aiEnabled phải là true hoặc false.'); patch.aiEnabled = body.aiEnabled; }
  if (Object.keys(patch).length === 1) throw bad('Không có gì để sửa.');
  return patch;
}

/**
 * A new notebook stays in `setup` until it has a skill map (from the AI `initial` job) or an adult
 * activates it by hand; AI may only be enabled on an active notebook.
 */
export function checkTransition(current: { status: SubjectStatus; ai_enabled: number }, patch: SubjectPatch) {
  const status = patch.status ?? current.status;
  const aiEnabled = patch.aiEnabled ?? current.ai_enabled === 1;
  if (aiEnabled && status !== 'active') throw bad('Chỉ bật AI cho sổ đang hoạt động.');
}
