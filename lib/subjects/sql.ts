import type { LearningTrack } from '../daily-policy.ts';

export type SubjectTemplate = 'skill' | 'reading';
export type SubjectSensitivity = 'normal' | 'clinical' | 'child_dev';
export type SubjectStatus = 'setup' | 'active' | 'paused' | 'archived';
export type SubjectLimits = { maxDifficulty: number; allowNewTopics: boolean; maxNewSkillsPerWeek: number };

export type SubjectRow = {
  id: string; learner_id: string; title: string; template: SubjectTemplate; sensitivity: SubjectSensitivity;
  goal: string; level: string; curriculum: string; limits: string; weight: number; status: SubjectStatus;
  ai_enabled: number; legacy_track: LearningTrack | null; progress_summary: string; roadmap?: string; progress_updated_at: string | null;
  revision: number; created_by: string; created_at: string; updated_at: string;
};

export const DEFAULT_LIMITS: SubjectLimits = { maxDifficulty: 3, allowNewTopics: true, maxNewSkillsPerWeek: 5 };

/** How each legacy track maps onto a notebook; mirrors the backfill in drizzle/0007_subjects.sql. */
export const legacyTrackDefaults: Record<LearningTrack, { template: SubjectTemplate; sensitivity: SubjectSensitivity }> = {
  Deutsch: { template: 'skill', sensitivity: 'normal' },
  AI: { template: 'reading', sensitivity: 'normal' },
  MTB: { template: 'reading', sensitivity: 'clinical' },
  Cardio: { template: 'reading', sensitivity: 'clinical' },
  Bột: { template: 'reading', sensitivity: 'child_dev' },
};

export function newSubjectId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'sub_' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const listSubjectsSql = `SELECT * FROM subjects WHERE learner_id = ? AND status <> 'archived' ORDER BY weight DESC, created_at, title`;
export const readSubjectSql = 'SELECT * FROM subjects WHERE id = ? AND learner_id = ?';
export const insertSubjectSql = `INSERT INTO subjects
 (id, learner_id, title, template, sensitivity, goal, level, curriculum, limits, weight, status, ai_enabled, legacy_track, created_by, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`;
export const readGuardianSql = 'SELECT 1 AS ok FROM guardians WHERE guardian_id = ? AND learner_id = ?';
export const listWardsSql = 'SELECT learner_id FROM guardians WHERE guardian_id = ? ORDER BY learner_id';
