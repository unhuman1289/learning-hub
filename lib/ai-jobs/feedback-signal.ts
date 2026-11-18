import type { EvidenceDb } from '../evidence/submit.ts';

/** Best-effort notification after the saved job is verified; polling remains the fallback. */
export async function notifySavedFeedback(namespace: DurableObjectNamespace | undefined, db: EvidenceDb, jobId: string) {
  if (!namespace) return;
  const job = await db.prepare("SELECT learner_id,context_snapshot FROM ai_jobs WHERE id=? AND kind='assess' AND status='succeeded'")
    .bind(jobId).first<{ learner_id: string; context_snapshot: string | null }>();
  if (!job?.context_snapshot) return;
  let lessonId: unknown;
  try { lessonId = JSON.parse(job.context_snapshot).lesson?.lessonId; } catch { return; }
  if (typeof lessonId !== 'string' || !/^les_[a-f0-9]{20}$/.test(lessonId)) return;
  const object = namespace.get(namespace.idFromName(job.learner_id + ':' + lessonId));
  await object.fetch('https://feedback.internal/saved', { method: 'POST' });
}
