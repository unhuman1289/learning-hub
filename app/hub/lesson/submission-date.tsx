import type { SubmissionDates } from "../../../lib/lesson-v2/submission-dates";
import { clockTime, shortDay } from "../paper-bits";

export function SubmissionDate({ firstSubmittedAt, lastResubmittedAt }: SubmissionDates) {
  if (!firstSubmittedAt) return null;
  return <span className="block text-sm text-muted-paper">
    Nộp bài · <time dateTime={firstSubmittedAt}>{shortDay(firstSubmittedAt)} {clockTime(firstSubmittedAt)}</time>
    {lastResubmittedAt && <> · đã sửa · <time dateTime={lastResubmittedAt}>
      {shortDay(lastResubmittedAt) !== shortDay(firstSubmittedAt) && shortDay(lastResubmittedAt) + " "}{clockTime(lastResubmittedAt)}
    </time></>}
  </span>;
}
