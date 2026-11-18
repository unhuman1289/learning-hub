import type { EvidenceDb } from '../evidence/submit.ts';

export type CalibrationBindings = { OPENAI_ENABLED?: string; AI_QUEUE?: {send(body: unknown): Promise<unknown>} };
type CalibrationJob = { id: string; kind: 'calibrate'; status: string; calls: number; schedule_key: string | null; lease_token: string | null; lease_expires_at: string | null };

/** Concurrent requests share the one active job; a schedule key also fences cron replay. */
export async function enqueueCalibration(db: EvidenceDb, env: CalibrationBindings, scheduleKey: string | null = null, now = new Date()) {
  if (env.OPENAI_ENABLED !== 'true' || !env.AI_QUEUE) throw new Error('Chưa bật xử lý hiệu chuẩn.');
  const id = 'cal_' + crypto.randomUUID(), stamp = now.toISOString();
  if (scheduleKey) {
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO calibration_schedules(schedule_key,job_id)
        VALUES(?,coalesce((SELECT id FROM calibration_jobs WHERE status IN ('queued','leased') LIMIT 1),?))`).bind(scheduleKey,id),
      db.prepare(`INSERT OR IGNORE INTO calibration_jobs(id,kind,status,schedule_key,created_at,updated_at)
        SELECT job_id,'calibrate','queued',?,?,? FROM calibration_schedules WHERE schedule_key=?`)
        .bind(scheduleKey,stamp,stamp,scheduleKey),
    ]);
  } else {
    await db.prepare(`INSERT OR IGNORE INTO calibration_jobs(id,kind,status,created_at,updated_at)
      VALUES(?,'calibrate','queued',?,?)`).bind(id, stamp, stamp).run();
  }
  const job = scheduleKey
    ? await db.prepare('SELECT j.* FROM calibration_jobs j JOIN calibration_schedules s ON s.job_id=j.id WHERE s.schedule_key=?').bind(scheduleKey).first<CalibrationJob>()
    : await db.prepare("SELECT * FROM calibration_jobs WHERE id=? OR (kind='calibrate' AND status IN ('queued','leased')) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1").bind(id,id).first<CalibrationJob>();
  if (!job) throw new Error('Chưa tạo được lượt hiệu chuẩn.');
  if (job.status === 'queued') await env.AI_QUEUE.send({ calibrationJobId: job.id }).catch(() => {});
  return job;
}

export async function claimCalibration(db: EvidenceDb, id: string, now = new Date()) {
  const token = crypto.randomUUID(), stamp = now.toISOString();
  const result = await db.prepare(`UPDATE calibration_jobs SET status='leased',lease_token=?,lease_expires_at=?,updated_at=?
    WHERE id=? AND status='queued' AND calls=0`).bind(token, new Date(+now + 30 * 60_000).toISOString(), stamp, id).run();
  return result.meta.changes ? token : null;
}

/** Every actual network attempt must first claim a durable slot under its current lease. */
export async function reserveCalibrationCall(db: EvidenceDb, id: string, token: string, now = new Date()) {
  const result = await db.prepare(`UPDATE calibration_jobs SET calls=calls+1,updated_at=?
    WHERE id=? AND status='leased' AND lease_token=? AND lease_expires_at>? AND calls<8`)
    .bind(now.toISOString(), id, token, now.toISOString()).run();
  if (!result.meta.changes) throw new Error('Đã hết giới hạn 8 lời gọi hoặc lượt hiệu chuẩn không còn hiệu lực.');
}
