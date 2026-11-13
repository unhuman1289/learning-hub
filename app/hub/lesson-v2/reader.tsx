"use client";

import { feedbackForItems } from "../../../lib/feedback-history";
import { formatChemicalText, isChemistryNotebook } from "../../../lib/chemistry";
import { hasLessonAnswer } from "../../../lib/lesson-v2/answer";
import { waitingForFeedback, useLessonSession, type Lesson } from "../lesson/use-session";
import { LessonFlow } from "../lesson/flow";
import { LessonItem } from "../lesson/item";
import { LessonSummary } from "../lesson/summary";
import { Book } from "../notebook/book";
import { PaperConfirm } from "../paper-confirm";
import { pencil, pencilLink, shortDay } from "../paper-bits";
import { buttonClass } from "../ui";
import { words } from "../words";
import type { Route } from "../use-route";
import type { Drafts } from "../lesson-page";
import { Feedback, type SubmissionView } from "./feedback";
import { knowledgeBlocks } from "./figures";
import { sheetBlocks } from "./sheet";
import { LessonReflection } from "./reflection";

export function LessonReader({
  id, ownerId, child = false, correction = false, learner, drafts, onLoaded, onCompleted, go,
}: {
  id: string;
  ownerId: string;
  learner: string | null;
  drafts: Drafts;
  child?: boolean;
  correction?: boolean;
  onLoaded?: (id: string, subject: string) => void;
  go: (route: Route) => void;
  onCompleted?: () => Promise<void>;
}) {
  const session = useLessonSession({ id, ownerId, learner, drafts, onLoaded, onCompleted });
  const { lesson, answers, history, readonly, busy, pending, error, feedbackError, state } = session;
  if (!lesson) return <p role={error ? "alert" : "status"} className="mx-auto max-w-4xl p-6">{error || "Đang mở bài…"}</p>;

  const formatText = isChemistryNotebook(lesson.subjectTitle ?? "") ? formatChemicalText : (text: string) => text;
  const subject = lesson.subjectTitle || lesson.title;
  const frozen = readonly || !!lesson.completedAt;
  const answered = new Set(history.flatMap(submission => submission.attempts.map(attempt => attempt.item_id)));
  const hasAnswer = (item: Lesson["items"][number]) =>
    hasLessonAnswer(item.input, answers[item.id]?.answer ?? "") || !!answers[item.id]?.attachmentIds?.length;
  const correctionIndex = correction ? lesson.items.findIndex(item =>
    ["incorrect", "partial"].includes(feedbackForItems(history, [item.id])[0]?.attempts[0]?.result ?? "")) : -1;
  const summaryIndex = lesson.items.length + 1;
  const firstUnanswered = lesson.items.findIndex(item => !item.revealed.solutionSeen && !answered.has(item.id));
  let initialPage = 0;
  if (lesson.completedAt) initialPage = summaryIndex;
  else if (pending) initialPage = lesson.items.findIndex(item => item.id === pending) + 1;
  else if (correctionIndex >= 0) initialPage = correctionIndex + 1;
  else if (answered.size || lesson.items.some(item => item.revealed.solutionSeen || hasAnswer(item))) {
    const draftIndex = lesson.items.findIndex(item =>
      hasAnswer(item) && (!answered.has(item.id) || feedbackForItems(history, [item.id])[0]?.attempts[0]?.answer !== answers[item.id]?.answer));
    initialPage = draftIndex >= 0 ? draftIndex + 1 : firstUnanswered >= 0 ? firstUnanswered + 1 : summaryIndex;
  }
  const reflection = !learner && lesson.completedAt
    ? history.find(entry => entry.attempts.length > 0 && entry.attempts.every(attempt => attempt.result))
    : undefined;
  const notes = <LessonNotes lesson={lesson} formatText={formatText} />;

  return <Book id={lesson.subjectId} title={subject} page="lesson" go={go} focusedLesson>
    {readonly && <p className="mb-1 font-hand text-lg text-oak-ink">Bạn đang xem bài của người học.</p>}
    {feedbackError && <p role="alert" className="mb-1 bg-paper px-3 py-2 text-ink-paper">
      {feedbackError} <button onClick={() => void session.refreshFeedback()} className={pencilLink}>{words.action.retry}</button>
    </p>}
    {error && <p role="alert" className="mb-1 bg-paper px-3 py-2 text-brick">{error}</p>}
    <LessonFlow initialPage={initialPage} count={lesson.items.length} subject={subject} notes={notes} reference={lesson.objective}
      locked={busy || !!pending} status={state} page={(index, jump) => {
        if (index === 0) return <>
          <h1 tabIndex={-1} data-lesson-heading className="font-print text-4xl leading-tight">{lesson.title}</h1>
          <p className="mt-3">{lesson.objective}</p>
          <p className={pencil}>{lesson.estMinutes ? `${lesson.estMinutes} phút · ` : ""}{lesson.why}</p>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">Ghi nhớ và nguồn</summary>
            {notes}
          </details>
        </>;
        if (index === summaryIndex) return <>
          <LessonSummary lessonId={id} subjectId={lesson.subjectId} learner={learner} waiting={session.waitingForGrade} go={go}
            onQuestion={itemId => {
              const itemIndex = lesson.items.findIndex(item => item.id === itemId);
              if (itemIndex >= 0) jump(itemIndex + 1);
            }}
            progressKey={history.map(entry => entry.id).join(",") + "|" + lesson.items.filter(item => item.revealed.solutionSeen).map(item => item.id).join(",")}
            completed={!!lesson.completedAt} justCompleted={session.justCompleted}>
            {lesson.output && <p>{words.place.product} · {lesson.output}</p>}
            {!readonly && <button type="button" className={buttonClass(lesson.completedAt ? "ghost" : "primary")}
              disabled={busy || !!pending} onClick={() => void session.complete().then(done => { if (done === false) jump(0); })}>
              {lesson.completedAt ? words.action.reopen : words.action.finish}
            </button>}
          </LessonSummary>
          <PaperConfirm open={session.confirmFinish && !busy && !pending}
            message="Bạn vẫn muốn đánh dấu xong bài này?" confirmLabel={words.action.finish}
            onCancel={() => session.setConfirmFinish(false)} onConfirm={() => void session.complete(true)} />
          {reflection && <LessonReflection key={reflection.id} submissionId={reflection.id} lessonId={id} />}
        </>;

        const item = lesson.items[index - 1];
        const [current, ...previous] = feedbackForItems(history, [item.id]);
        const latest = current?.attempts[0];
        const awaiting = waitingForFeedback(current);
        const value = answers[item.id] ?? { answer: item.input === "code" ? item.starter : "" };
        const changed = !latest || latest.answer !== value.answer || !!value.attachmentIds?.length;
        const canSubmit = pending === item.id || (!pending && !awaiting && hasAnswer(item) && (changed || !latest?.result));
        return <LessonItem key={item.id} item={item} value={value} formatText={formatText}
          germanInput={/\b(?:deutsch|german)\b|tiếng đức/iu.test(subject)} hasAnswer={hasAnswer(item)}
          disabled={busy || (!!pending && pending !== item.id)} retrySubmission={pending === item.id} readOnly={frozen}
          onChange={answer => session.change(item.id, answer)} onReveal={level => void session.reveal(item.id, level)}
          onSubmit={() => void session.submit(item.id)} canSubmit={canSubmit} awaitingFeedback={awaiting && pending !== item.id}
          submitLabel={pending === item.id ? "Thử lại" : current ? words.action.recheck : words.action.check}
          gradeLater={awaiting && session.gradeLater} feedbackResult={latest?.result} feedbackSupported={latest?.support === "solution"}
          feedbackPreview={latest?.feedback ? formatText(latest.feedback) : awaiting ? words.status.grading :
            latest?.result ? words.result[latest.result as keyof typeof words.result] : current ? words.status.gradeLater : undefined}
          feedback={current ? onCodeLine => <>
            <Feedback submission={current} items={[item]} onCodeLine={onCodeLine} readOnly={frozen} child={child}
              formatText={formatText} onRefresh={() => void session.refreshFeedback()} />
            <PreviousFeedback entries={previous} item={item} readOnly={frozen} formatText={formatText} />
          </> : undefined} />;
      }} />
  </Book>;
}

function LessonNotes({ lesson, formatText }: { lesson: Lesson; formatText: (text: string) => string }) {
  const blocks = [...(lesson.sheet ? sheetBlocks(lesson.sheet, formatText) : []), ...knowledgeBlocks(lesson.knowledge ?? [])];
  return <div className="mt-4 grid gap-3">
    {blocks.map(block => <div key={block.id}>{block.node}</div>)}
    {lesson.sections.map((section, index) => <section key={index}>
      <h2 className="font-hand text-xl">{section.heading}</h2>
      <p className="whitespace-pre-wrap break-words">{formatText(section.text)}</p>
    </section>)}
    {lesson.diagram && <pre className="overflow-x-auto whitespace-pre text-sm">{lesson.diagram}</pre>}
    {lesson.sources.map((source, index) => <p key={index} className="text-sm text-muted-paper">
      <a href={source.url} target="_blank" rel="noreferrer" className={pencilLink}>{source.title}</a> · Đã đọc · {shortDay(source.retrievedAt)}
      <span className="block">{source.readScope}</span>
    </p>)}
  </div>;
}

function PreviousFeedback({ entries, item, readOnly, formatText }: {
  entries: SubmissionView[];
  item: Lesson["items"][number];
  readOnly: boolean;
  formatText: (text: string) => string;
}) {
  if (!entries.length) return null;
  return <details>
    <summary className={pencilLink + " min-h-11 content-center cursor-pointer"}>Lần trước</summary>
    {entries.map(submission => <Feedback earlier key={submission.id} submission={submission} items={[item]}
      readOnly={readOnly} formatText={formatText} />)}
  </details>;
}
