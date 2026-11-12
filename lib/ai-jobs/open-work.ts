/** Only actionable v2 work consumes the lesson workload budget. Legacy reference
 * material and archived/paused notebooks remain saved but do not block a pilot. */
export const openWorkMinutesSql = `SELECT coalesce(sum(coalesce(l.est_minutes,json_extract(l.payload,'$.minutes'),0)),0) AS minutes
 FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id
 WHERE l.user_id=? AND l.completed_at IS NULL AND l.package_version IN ('2','3') AND s.status='active'`;
