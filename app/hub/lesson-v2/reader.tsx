"use client";

import { lazy, Suspense, useEffect, useState } from "react";
const Tutor = lazy(() => import("../lesson/tutor"));
import { feedbackForItems } from "../../../lib/feedback-history";
import { formatChemicalText, isChemistryNotebook } from "../../../lib/chemistry";
import { hasLessonAnswer } from "../../../lib/lesson-v2/answer";
import { waitingForFeedback, useLessonSession, type Lesson } from "../lesson/use-session";
import { LessonFlow } from "../lesson/flow";
import { lessonGroups } from "../lesson/groups";
import { LessonItem } from "../lesson/item";
import { ListeningBrowserNotice, useListeningSettings } from "../lesson/listening";
import { recordPlay, type ListeningAudio } from "../lesson/listen-api";
import { LessonSummary } from "../lesson/summary";
import { Book } from "../notebook/book";
import { PaperConfirm } from "../paper-confirm";
import { pencil, pencilLink, shortDay } from "../paper-bits";
import { buttonClass } from "../ui";
import { words } from "../words";
import type { StudyDay } from "../../../lib/study-sql";
import type { Route } from "../use-route";
import type { Drafts } from "../lesson-page";
import { Feedback, type SubmissionView } from "./feedback";
import { knowledgeBlocks } from "./figures";
import { sheetBlocks } from "./sheet";
import { LessonReflection } from "./reflection";

if (typeof performance !== "undefined") performance.mark("f3:reader-evaluated");

export function LessonReader({
  id, ownerId, correction = false, learner, drafts, onLoaded, onCompleted, go,
}: {
  id: string;
  ownerId: string;
  learner: string | null;
  drafts: Drafts;
  correction?: boolean;
  onLoaded?: (id: string, subject: string, study: StudyDay) => void;
  go: (route: Route) => void;
  onCompleted?: () => Promise<void>;
}) {
  performance.mark("f3:reader-render-start");
  const session = useLessonSession({ id, ownerId, learner, drafts, onLoaded, onCompleted });
  const { lesson, child, answers, history, readonly, busy, pending, error, feedbackError, state } = session;
  const [grouped, setGrouped] = useState(false);
  useEffect(() => {
    if (!session.hadPrefetch) return;
    let idle = 0;
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        idle = window.requestIdleCallback ? window.requestIdleCallback(() => setGrouped(true)) : window.setTimeout(() => setGrouped(true), 0);
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [session.hadPrefetch]);
  const hasListening = lesson?.items.some(item => !!item.audio) ?? false;
  const settings = useListeningSettings(ownerId, hasListening && !readonly && !session.verification);
  const [listeningPlays, setListeningPlays] = useState<Record<string, number>>({});
  const [savingPlays, setSavingPlays] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState<string[]>([]);
  if (!lesson) return <p role={error ? "alert" : "status"} className="mx-auto max-w-4xl p-6">{error || "Đang mở bài…"}</p>;

  const formatText = isChemistryNotebook(lesson.subjectTitle ?? "") ? formatChemicalText : (text: string) => text;
  const subject = lesson.subjectTitle || lesson.title;
  const frozen = readonly || !!lesson.completedAt || !!session.verification;
  const answered = new Set(history.flatMap(submission => submission.attempts.map(attempt => attempt.item_id)));
  const hasAnswer = (item: Lesson["items"][number]) => {
    const answer = answers[item.id]?.answer ?? "";
    return !!answers[item.id]?.attachmentIds?.length ||
      (hasLessonAnswer(item.input, answer) && !(item.input === "code" && answer === item.starter));
  };
  const hasUnsubmittedWork = lesson.items.some(item => {
    const previous = feedbackForItems(history, [item.id])[0]?.attempts[0];
    const answer = answers[item.id]?.answer ?? "";
    if (item.revealed.solutionSeen && previous?.support !== "solution") return true;
    return hasAnswer(item) && (!previous || previous.answer !== answer ||
      JSON.stringify(previous.attachmentIds ?? []) !== JSON.stringify(answers[item.id]?.attachmentIds ?? []));
  });
  const canRetryGrading = lesson.items.some(item => {
    if (!hasAnswer(item)) return false;
    const submission = feedbackForItems(history, [item.id])[0];
    return submission?.attempts[0]?.status === "pending" && !waitingForFeedback(submission);
  });
  const blankCount = lesson.items.filter(item => !answered.has(item.id) && !item.revealed.solutionSeen && !hasAnswer(item)).length;
  const correctionIndex = correction ? lesson.items.findIndex(item =>
    ["incorrect", "partial"].includes(feedbackForItems(history, [item.id])[0]?.attempts[0]?.result ?? "")) : -1;
  const summaryIndex = lesson.items.length + 1;
  const firstUnanswered = lesson.items.findIndex(item => !item.revealed.solutionSeen && !answered.has(item.id));
  let initialItem = 0;
  if (lesson.completedAt) initialItem = summaryIndex;
  else if (pending) initialItem = summaryIndex;
  else if (correctionIndex >= 0) initialItem = correctionIndex + 1;
  else if (answered.size || lesson.items.some(item => item.revealed.solutionSeen || hasAnswer(item))) {
    const draftIndex = lesson.items.findIndex(item =>
      hasAnswer(item) && (!answered.has(item.id) || feedbackForItems(history, [item.id])[0]?.attempts[0]?.answer !== answers[item.id]?.answer));
    initialItem = draftIndex >= 0 ? draftIndex + 1 : firstUnanswered >= 0 ? firstUnanswered + 1 : summaryIndex;
  }
  if (session.hadPrefetch && initialItem === 0 && lesson.items.length) initialItem = 1;
  const reflection = !learner && lesson.completedAt
    ? history.find(entry => entry.attempts.length > 0 && entry.attempts.every(attempt => attempt.result))
    : undefined;
  const hasMaterials = lesson.sheet || lesson.sections.length || lesson.diagram || lesson.knowledge?.length || lesson.sources.length;
  const materials = !!hasMaterials && <details className="mb-5" data-lesson-notes>
    <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">Tài liệu bài học</summary>
    <LessonNotes lesson={lesson} formatText={formatText} />
  </details>;

  performance.mark("f3:reader-render-ready");
  return <Book id={lesson.subjectId} title={subject} page="lesson" go={go} focusedLesson>
    {session.offline && <p role="status" className="mb-1 bg-[#f5ebd8] px-3 py-1 text-sm text-[#6e4a10]">Mất mạng · Bài làm vẫn còn trên trang này.</p>}
    {session.verification === "loading" && <p role="status" className="mb-1 text-sm text-oak-ink">Đang cập nhật…</p>}
    {readonly && <p className="mb-1 font-hand text-lg text-oak-ink">Bạn đang xem bài của người học.</p>}
    {feedbackError && <p role="alert" className="mb-1 bg-paper px-3 py-2 text-ink-paper">
      {feedbackError} <button onClick={() => void session.refreshFeedback()} className={pencilLink}>{words.action.retry}</button>
    </p>}
    {error && !(session.offline && pending) && <p role="alert" className="mb-1 bg-paper px-3 py-2 text-brick">{error}</p>}
    {hasListening && <ListeningBrowserNotice />}
    <LessonFlow initialItem={initialItem} groups={session.hadPrefetch && !grouped ? lesson.items.map((_, i) => [i + 1]) : lessonGroups(lesson.items)} count={lesson.items.length} subject={subject} materials={materials}
      locked={busy || uploadingPhotos.length > 0 || !!session.verification || (session.hadPrefetch && !grouped)} status={state} hint={session.pageEdgeHint} onHintSeen={session.pageEdgeHintSeen}
      tutor={!frozen && lesson.items.length ? current => <Suspense fallback={null}><Tutor lessonId={id} items={lesson.items.map(item=>item.id)} number={current} child={child} /></Suspense> : undefined} page={(index, jump, active) => {
        if (index === 0) return <>
          <h1 tabIndex={-1} data-lesson-heading className="font-print text-4xl leading-tight">{lesson.title}</h1>
          <p className="mt-3">{lesson.objective}</p>
          <p className={pencil}>{lesson.estMinutes ? `${lesson.estMinutes} phút · ` : ""}{lesson.why}</p>
          {lesson.template === "reading" ? <LessonNotes lesson={lesson} formatText={formatText} /> : materials}
        </>;
        if (index === summaryIndex) return <>
          <LessonSummary child={child} displayName={session.displayName} offlinePending={session.offline && pending} items={lesson.items} answers={answers} history={history} lessonId={id} subjectId={lesson.subjectId} learner={learner} waiting={session.waitingForGrade} go={go}
            onQuestion={itemId => {
              const itemIndex = lesson.items.findIndex(item => item.id === itemId);
              if (itemIndex >= 0) jump(itemIndex + 1);
            }}
            progressKey={history.map(entry => entry.id + ":" + entry.job_status + ":" + entry.attempts.map(a => a.result + ":" + a.feedback).join("~")).join(",") + "|" + lesson.items.filter(item => item.revealed.solutionSeen).map(item => item.id).join(",")}
            completed={!!lesson.completedAt} justCompleted={session.justCompleted}>
            {!readonly && (pending || (!lesson.completedAt && (!history.length || hasUnsubmittedWork || canRetryGrading))) &&
              <button type="button" className={buttonClass("primary")} disabled={busy || !!session.verification || (session.waitingForGrade && !pending) || savingPlays.length > 0}
                onClick={() => void session.submit()}>
                {pending ? "Thử nộp lại" : "Nộp bài"}
              </button>}
            {lesson.items.some(item => item.attachment !== "none") && <details className="w-full text-sm text-muted-paper">
              <summary className={pencilLink + " min-h-11 content-center cursor-pointer"}>Quyền riêng tư của ảnh</summary>
              <p>Ảnh được giữ tối đa 30 ngày. Tránh chụp tên, địa chỉ hoặc giấy tờ.</p>
            </details>}
            {lesson.output && <p>{words.place.product} · {lesson.output}</p>}
            {!readonly && <button type="button" className={buttonClass(lesson.completedAt ? "ghost" : "primary")}
              disabled={busy || !!session.verification || !!pending || (!lesson.completedAt && (!history.length || hasUnsubmittedWork || session.waitingForGrade))} onClick={() => void session.complete().then(done => { if (done === false) jump(0); })}>
              {lesson.completedAt ? words.action.reopen : words.action.finish}
            </button>}
          </LessonSummary>
          <PaperConfirm open={session.confirmFinish && !busy && !pending}
            message={blankCount ? `Còn ${blankCount} câu chưa làm. Bạn vẫn muốn đánh dấu xong bài này?` : `Còn ${session.unanswered} câu chưa nộp. Bạn vẫn muốn đánh dấu xong bài này?`} confirmLabel={words.action.finish}
            onCancel={() => session.setConfirmFinish(false)} onConfirm={() => void session.complete(true)} />
          {reflection && <LessonReflection key={reflection.id} submissionId={reflection.id} lessonId={id} />}
        </>;

        const item = lesson.items[index - 1];
        const [current, ...previous] = feedbackForItems(history, [item.id]);
        const latest = current?.attempts[0];
        const awaiting = waitingForFeedback(current);
        const value = answers[item.id] ?? { answer: item.input === "code" ? item.starter : "" };
        const nextAudio: ListeningAudio | undefined = lesson.items[index]?.audio;
        const playSaving = savingPlays.includes(item.id);
        const listeningItem = { lessonId: id, itemId: item.id, readOnly: frozen };
        const listening = item.audio && settings.ready ? {
          ...settings,
          item: listeningItem,
          answered: !!latest,
          plays: Math.max(listeningPlays[item.id] ?? 0, lesson.listen_log[item.id] ?? 0),
          playSaving,
          onPlayed: async (slow: boolean) => {
            setSavingPlays(current => [...current, item.id]);
            try {
              const plays = await recordPlay(listeningItem, slow);
              if (plays !== null) setListeningPlays(previous => ({ ...previous, [item.id]: plays }));
            } finally {
              setSavingPlays(current => current.filter(id => id !== item.id));
            }
          },
          nextSrc: nextAudio?.src?.[settings.voice],
        } : undefined;
        return <div key={item.id}><LessonItem active={active} listening={listening} item={item} number={index} value={value} formatText={formatText}
          germanInput={/\b(?:deutsch|german)\b|tiếng đức/iu.test(subject)}
          disabled={playSaving || busy || !!session.verification || pending} readOnly={readonly || !!lesson.completedAt}
          onChange={answer => session.change(item.id, answer)} onReveal={level => void session.reveal(item.id, level)}
          onUploadState={uploading => setUploadingPhotos(photos => uploading ? [...photos, item.id] : photos.filter(id => id !== item.id))}
          feedbackResult={latest?.result} feedbackSupported={latest?.support === "solution"}
          feedbackPreview={latest?.feedback ? formatText(latest.feedback) : awaiting ? words.status.grading :
            latest?.result ? words.result[latest.result as keyof typeof words.result] : current ? words.status.gradeLater : undefined}
          feedback={current ? onCodeLine => <>
            <Feedback submission={current} items={[item]} onCodeLine={onCodeLine} readOnly={frozen} child={child}
              formatText={formatText} onRefresh={() => void session.refreshFeedback()} />
            <PreviousFeedback entries={previous} item={item} readOnly={frozen} formatText={formatText} />
          </> : undefined} />
        </div>;
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
