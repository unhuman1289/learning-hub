import type { EvidenceDb } from '../evidence/submit.ts';
import { recomputeSkill } from './recompute.ts';
export async function refreshSkills(db: EvidenceDb, now: Date) {
  const { results = [] } = await db
    .prepare("SELECT s.id,s.learner_id FROM skills s JOIN subjects n ON n.id=s.subject_id WHERE s.status='active' AND n.status='active'")
    .all<{ id: string; learner_id: string }>();
  for (const s of results) await recomputeSkill(db, s.learner_id, s.id, now);
  await db.prepare('UPDATE attachments SET deleted_at=? WHERE deleted_at IS NULL AND expires_at<=?').bind(now.toISOString(), now.toISOString()).run();
}
