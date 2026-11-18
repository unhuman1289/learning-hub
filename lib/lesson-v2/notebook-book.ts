import { berlinDay } from '../daily-policy';
import { usesAdaptivePlan } from '../subjects/sql';
import type { EvidenceDb } from '../evidence/submit';
import { readNotebookLessons } from './notebook-list';

export async function readNotebookBook(
  db: EvidenceDb, learner: string, id: string,
  subject: { status: string; legacy_track: string | null },
  view: 'status' | 'history' | 'open' | 'default', offset: number, pilot?: string,
) {
  const statusOnly = view === 'status';
  const adaptive = usesAdaptivePlan(id, subject.legacy_track, pilot);
  const day = berlinDay();
  const [initial, nightly, rows] = await Promise.all([
    subject.status === 'setup' && offset === 0
      ? db.prepare("SELECT status FROM ai_jobs WHERE learner_id=? AND subject_id=? AND purpose='initial' ORDER BY created_at DESC LIMIT 1")
        .bind(learner, id).first<{ status: string }>()
      : null,
    adaptive ? db.prepare("SELECT status,outcome FROM ai_jobs WHERE learner_id=? AND subject_id=? AND adaptive=1 AND purpose='daily' AND learning_day=? ORDER BY created_at DESC LIMIT 1")
      .bind(learner,id,day).first<{ status: string; outcome: string | null }>() : null,
    statusOnly ? null : readNotebookLessons(db, learner, id, view === 'history', offset, view === 'open'),
  ]);
  return { ...rows, adaptive, day, nightly, initial, setup: subject.status === 'setup' };
}
