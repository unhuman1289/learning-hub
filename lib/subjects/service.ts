import { ApiError } from '../api-error.ts';
import { checkTransition, type SubjectInput, type SubjectPatch } from './policy.ts';
import { insertSubjectSql, listSubjectsSql, newSubjectId, readSubjectSql, type SubjectLimits, type SubjectRow } from './sql.ts';

type Stmt = { bind(...values: unknown[]): Stmt; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>; run(): Promise<{ meta: { changes?: number } }> };
export type Db = { prepare(sql: string): Stmt };

export type SubjectView = {
  id: string; title: string; template: SubjectRow['template']; sensitivity: SubjectRow['sensitivity']; goal: string; level: string;
  curriculum: string; limits: SubjectLimits; weight: number; status: SubjectRow['status']; aiEnabled: boolean;
  legacyTrack: SubjectRow['legacy_track']; progressSummary: string; progressUpdatedAt: string | null; revision: number;
  roadmap?: {title:string;objective:string;situation:string;skills:string[];mode:string}[];
  skillCount: number; createdAt: string; updatedAt: string;
};

export function toView(row: SubjectRow & { skill_count?: number }): SubjectView {
  return {
    id: row.id, title: row.title, template: row.template, sensitivity: row.sensitivity, goal: row.goal, level: row.level,
    curriculum: row.curriculum, limits: JSON.parse(row.limits) as SubjectLimits, weight: row.weight, status: row.status,
    roadmap: JSON.parse(row.roadmap ?? '[]'),
    aiEnabled: row.ai_enabled === 1, legacyTrack: row.legacy_track, progressSummary: row.progress_summary,
    progressUpdatedAt: row.progress_updated_at, revision: row.revision, skillCount: Number(row.skill_count ?? 0),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const withSkillCount = (sql: string) => sql.replace('SELECT *', 'SELECT subjects.*, (SELECT COUNT(*) FROM skills WHERE skills.subject_id = subjects.id AND skills.status <> \'retired\') AS skill_count');

export async function listSubjects(db: Db, learnerId: string) {
  const { results = [] } = await db.prepare(withSkillCount(listSubjectsSql)).bind(learnerId).all<SubjectRow & { skill_count: number }>();
  return results.map(toView);
}

export async function getSubject(db: Db, learnerId: string, id: string) {
  const row = await db.prepare(withSkillCount(readSubjectSql)).bind(id, learnerId).first<SubjectRow & { skill_count: number }>();
  if (!row) throw new ApiError(404, 'Không tìm thấy sổ.');
  return row;
}

export async function createSubject(db: Db, learnerId: string, createdBy: string, input: SubjectInput, now = new Date()) {
  const id = newSubjectId();
  const stamp = now.toISOString();
  try {
    await db.prepare(insertSubjectSql).bind(id, learnerId, input.title, input.template, input.sensitivity, input.goal, input.level, input.curriculum,
      JSON.stringify(input.limits), input.weight, input.legacyTrack ? 'active' : 'setup', input.legacyTrack ?? null, createdBy, stamp, stamp).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, input.legacyTrack ? 'Sổ này đã có trên kệ.' : 'Đã có sổ cùng tên.');
    throw error;
  }
  return toView(await getSubject(db, learnerId, id));
}

const columns: Record<string, string> = {
  title: 'title', template: 'template', sensitivity: 'sensitivity', goal: 'goal', level: 'level', curriculum: 'curriculum',
  limits: 'limits', weight: 'weight', status: 'status', aiEnabled: 'ai_enabled',
};

/** Optimistic concurrency: the patch applies only to the revision the editor saw. */
export async function updateSubject(db: Db, learnerId: string, id: string, patch: SubjectPatch, now = new Date()) {
  const current = await getSubject(db, learnerId, id);
  if (current.revision !== patch.revision) throw new ApiError(409, 'Sổ đã thay đổi ở nơi khác. Tải lại rồi sửa tiếp.');
  checkTransition(current, patch);
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in patch)) continue;
    const value = (patch as Record<string, unknown>)[key];
    sets.push(`${column} = ?`);
    values.push(key === 'limits' ? JSON.stringify(value) : key === 'aiEnabled' ? (value ? 1 : 0) : value);
  }
  try {
    const result = await db.prepare(`UPDATE subjects SET ${sets.join(', ')}, revision = revision + 1, updated_at = ? WHERE id = ? AND learner_id = ? AND revision = ?`)
      .bind(...values, now.toISOString(), id, learnerId, patch.revision).run();
    if (!result.meta.changes) throw new ApiError(409, 'Sổ đã thay đổi ở nơi khác. Tải lại rồi sửa tiếp.');
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'Đã có sổ cùng tên.');
    throw error;
  }
  return toView(await getSubject(db, learnerId, id));
}
