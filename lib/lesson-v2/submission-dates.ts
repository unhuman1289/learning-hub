export type SubmissionDates = {
  firstSubmittedAt: string | null;
  lastResubmittedAt: string | null;
};

// Use all submissions, including those outside the bounded feedback history.
export const submissionDatesColumns = `min(created_at) AS firstSubmittedAt,
  CASE WHEN count(*) > 1 THEN max(created_at) END AS lastResubmittedAt`;
