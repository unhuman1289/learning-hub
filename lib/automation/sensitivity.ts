import type { LearningTrack } from '../daily-policy.ts';
import { legacyTrackDefaults, type SubjectSensitivity } from '../subjects/sql.ts';
import type { JournalDb } from '../run-journal.ts';

/**
 * Which privacy filter applies to a learner's legacy track: the notebook's own `sensitivity`
 * (docs/hub2 DATA-MODEL §2.1), falling back to the track default when no notebook row exists.
 */
export async function loadTrackSensitivity(db: JournalDb) {
  const rows = (await db.prepare('SELECT learner_id, legacy_track, sensitivity FROM subjects WHERE legacy_track IS NOT NULL')
    .all<{ learner_id: string; legacy_track: LearningTrack; sensitivity: SubjectSensitivity }>()).results ?? [];
  const byKey = new Map(rows.map((row) => [`${row.learner_id}\u0000${row.legacy_track}`, row.sensitivity]));
  return (userId: string, track: LearningTrack): SubjectSensitivity =>
    byKey.get(`${userId}\u0000${track}`) ?? legacyTrackDefaults[track]?.sensitivity ?? 'normal';
}
