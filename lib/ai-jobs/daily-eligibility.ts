// The caller aliases the lesson as l. Older whole-lesson packages already rejected partial submissions.
export const wholeLessonSubmissionSql = `SELECT min(s.created_at) FROM submissions s
  WHERE s.lesson_id=l.id AND s.learner_id=l.user_id
    AND (s.stage='whole-lesson' OR (s.stage IS NULL AND json_extract(l.payload,'$.gradingMode')='whole-lesson'))`;

export function primarySnapshotSql(useSubmission: boolean) {
  const filter = useSubmission ? "package_version IN ('2','3')" : 'completed_at IS NULL';
  return `SELECT id FROM learning_lessons WHERE user_id=? AND subject_id=? AND slot='primary'
    AND ${filter} ORDER BY assigned_date DESC,updated DESC,id DESC LIMIT 1`;
}

// The day and cutoff parameters are bound in that order.
export function primaryBlocksDailySql(useSubmission: boolean) {
  if (!useSubmission) return "(l.assigned_date>=? OR coalesce(l.completed_at, '9999')>=?)";
  return `l.id=(SELECT p.id FROM learning_lessons p WHERE p.user_id=l.user_id AND p.subject_id=l.subject_id
      AND p.slot='primary' AND p.package_version IN ('2','3') ORDER BY p.assigned_date DESC,p.updated DESC,p.id DESC LIMIT 1)
    AND (l.assigned_date>=? OR coalesce((${wholeLessonSubmissionSql}), '9999')>=?)`;
}
