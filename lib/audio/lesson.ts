import type { PlanContext } from '../contracts/ai-common.ts';
import type { LessonPackage } from '../contracts/lesson-package-v3.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { audioVariant } from './hash.mjs';

export type LessonAudio = { hashF: string; hashM: string; durationMs: number };

export async function resolveLessonAudio(
  db: EvidenceDb, lesson: LessonPackage, tts: PlanContext['tts'], bucket?: Pick<R2Bucket, 'head'>,
) {
  const assets = new Map<string, LessonAudio>();
  if (lesson.contract !== 'lesson-package/3') return { lesson, assets };
  const dropped = new Set<string>();
  const readAsset = async (hash: string) => {
    const row = await db.prepare('SELECT duration_ms,bytes,r2_key FROM audio_assets WHERE hash=?')
      .bind(hash).first<{ duration_ms: number; bytes: number; r2_key: string }>();
    if (!row || !bucket || (await bucket.head(row.r2_key))?.size !== row.bytes) return null;
    return row;
  };
  for (const item of lesson.items) {
    if (!item.audio) continue;
    const pair = tts?.voices[item.audio.lang];
    if (pair && bucket) {
      const [{ hash: hashF }, { hash: hashM }] = await Promise.all([
        audioVariant(item.audio, pair, 'f'), audioVariant(item.audio, pair, 'm'),
      ]);
      const [f, m] = await Promise.all([readAsset(hashF), readAsset(hashM)]);
      if (f && m) {
        assets.set(item.id, { hashF, hashM, durationMs: Math.max(f.duration_ms, m.duration_ms) });
        continue;
      }
    }
    dropped.add(item.id);
  }
  if (!dropped.size) return { lesson, assets };
  return {
    lesson: {
      ...lesson,
      items: lesson.items.filter(item => !dropped.has(item.id)),
      stages: lesson.stages.map(stage => ({ ...stage, itemIds: stage.itemIds.filter(id => !dropped.has(id)) })),
    },
    assets,
  };
}

export function audioColumns(audio?: LessonAudio) {
  return [audio ? 'audio' : 'text', audio?.hashF ?? null, audio?.hashM ?? null] as const;
}
