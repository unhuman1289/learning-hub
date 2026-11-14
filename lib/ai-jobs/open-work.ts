/** Only actionable v2 work consumes the lesson workload budget. Legacy reference
 * material, archived/paused notebooks and the first placement lesson are excluded. */
export const openWorkMinutesSql = `SELECT coalesce(sum(coalesce(l.est_minutes,json_extract(l.payload,'$.minutes'),0)),0) AS minutes
 FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id
 WHERE l.user_id=? AND l.completed_at IS NULL AND l.package_version IN ('2','3') AND s.status='active'
 AND NOT (l.slot='primary' AND l.kind IS 'diagnostic' AND (
   l.step_role IS 'placement' OR EXISTS (
     SELECT 1 FROM ai_jobs j WHERE j.id=l.origin_job_id AND j.learner_id=l.user_id
       AND j.subject_id=l.subject_id AND j.purpose='initial'
   )
 ))`;
