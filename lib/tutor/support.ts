import type { Db } from '../subjects/service.ts';

export async function onTutorTurn(db: Db, turn: { learnerId: string; lessonId: string; itemId: string }) {
  void db;
  void turn;
  // TODO(T1/L3): use recordSupport() to record hint1 for a turn accepted before submission,
  // including items without hints. Preserve stronger support already recorded for the item.
}
