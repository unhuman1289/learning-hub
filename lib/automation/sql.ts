export type SqlStatement = { sql: string; args: unknown[] };

export type ReplacementSqlInput = {
  runId: string;
  clientId: string;
  targetId: string;
  userId: string;
  track: string;
  expectedCurrentLessonId: string | null;
  lessonId: string;
  lessonJson: string;
  day: string;
  cutoff: string;
  now: string;
  canAssign: boolean;
  reason: string;
};

export function replacementStatements(input: ReplacementSqlInput): SqlStatement[] {
  const { runId, clientId, targetId, userId, track, expectedCurrentLessonId, lessonId, lessonJson, day, cutoff, now, canAssign, reason } = input;
  const statements: SqlStatement[] = [];
  if (canAssign) {
    statements.push({
      sql: `INSERT OR IGNORE INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated)
        SELECT ?,?,?,?,?,NULL,'',? WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND client_id=? AND status='context_served' AND expires_at>?)
        AND EXISTS(SELECT 1 FROM run_targets WHERE run_id=? AND target_id=? AND eligible=1 AND current_lesson_id IS ?)
        AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM learning_slots WHERE user_id=? AND track=?)) OR EXISTS(
          SELECT 1 FROM learning_slots s JOIN learning_lessons l ON l.user_id=s.user_id AND l.id=s.lesson_id
          WHERE s.user_id=? AND s.track=? AND s.lesson_id=? AND l.completed_at IS NOT NULL AND l.completed_at<? AND l.assigned_date!=?
        )) AND NOT EXISTS(SELECT 1 FROM learning_lessons WHERE user_id=? AND track=? AND assigned_date=?)`,
      args: [lessonId, userId, track, lessonJson, day, now, runId, clientId, now, runId, targetId, expectedCurrentLessonId, expectedCurrentLessonId, userId, track, userId, track, expectedCurrentLessonId, cutoff, day, userId, track, day],
    });
    statements.push({
      sql: `INSERT INTO learning_slots(user_id,track,lesson_id,revision)
        SELECT ?,?,?,COALESCE((SELECT revision+1 FROM learning_slots WHERE user_id=? AND track=?),0)
        WHERE EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND track=? AND assigned_date=?)
        AND EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND client_id=? AND status='context_served' AND expires_at>?)
        ON CONFLICT(user_id,track) DO UPDATE SET lesson_id=excluded.lesson_id,revision=learning_slots.revision+1`,
      args: [userId, track, lessonId, userId, track, lessonId, userId, track, day, runId, clientId, now],
    });
  }
  statements.push({
    sql: `INSERT OR IGNORE INTO run_items(run_id,target_id,action,outcome,reason,lesson_id,payload)
      SELECT ?,?, 'assign',CASE WHEN EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND track=? AND assigned_date=?) THEN 'assigned' ELSE 'kept' END,
      CASE WHEN EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND track=? AND assigned_date=?) THEN 'Assigned; the previous lesson remains in history.' ELSE ? END,
      CASE WHEN EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND track=? AND assigned_date=?) THEN ? ELSE NULL END,?
      WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND status='context_served')`,
    args: [runId, targetId,
      lessonId, userId, track, day, lessonId, userId, track, day, reason,
      lessonId, userId, track, day, lessonId, lessonJson, runId],
  });
  return statements;
}

export function noActionStatement(runId: string, targetId: string, reason: string): SqlStatement {
  return { sql: "INSERT OR IGNORE INTO run_items(run_id,target_id,action,outcome,reason,lesson_id,payload) VALUES(?,?,'no_action','no_action',?,NULL,NULL)", args: [runId, targetId, reason] };
}

export function issueStatement(runId: string, targetId: string, reason: string, payload: string): SqlStatement {
  return { sql: "INSERT OR IGNORE INTO run_items(run_id,target_id,action,outcome,reason,lesson_id,payload) VALUES(?,?,'issue','issue',?,NULL,?)", args: [runId, targetId, reason, payload] };
}
