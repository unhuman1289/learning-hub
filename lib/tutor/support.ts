import { recordSupport } from '../lesson-v2/actions.ts';
import type { Db } from '../subjects/service.ts';

export async function onTutorTurn(db: Db, { learnerId, lessonId, itemId }: { learnerId: string; lessonId: string; itemId: string }) {
  await recordSupport(db, learnerId, lessonId, itemId, 'hint1', true);
}
