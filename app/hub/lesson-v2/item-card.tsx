"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { HintNote, RevealedSolution } from "./hints";
import { pencil, pencilLink, ResultStamp } from "../paper-bits";
import { CheckStamp } from "../notebook/check-stamp";
import { PaperDialog } from "../paper-dialog";
import { SketchIcon } from "../sketch-icons";
import { words } from "../words";
import { uploadPhoto } from "./photo";
import { germanCharacters, hasVietnameseTyping } from "./keyboard";
import { StructuredInput } from "./inputs/structured";
export function ItemCard({
  item,
  number,
  germanInput = false,
  feedback,
  feedbackPreview,
  feedbackResult,
  feedbackSupported,
  gradeLater,
  onSubmit,
  submitLabel,
  canSubmit,
  hasAnswer,
  value,
  disabled,
  readOnly,
  onChange,
  onReveal,
  formatText = (text:string)=>text,
}: {
  formatText?:(text:string)=>string;
  item: ItemView;
  number: number;
  germanInput?: boolean;
  feedback?: (onCodeLine?: (line: number) => void) => ReactNode;
  feedbackPreview?: string;
  feedbackResult?: string | null;
  feedbackSupported?: boolean;
  gradeLater?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
  canSubmit?: boolean;
  hasAnswer: boolean;
  value: DraftAnswers[string];
  disabled: boolean;
  readOnly: boolean;
  onChange: (answer: DraftAnswers[string]) => void;
  onReveal: (level: "hint1" | "hint2" | "solution") => void;
}) {
  const [photoError, setPhotoError] = useState(""),
    [uploading, setUploading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  // A long question on a phone can push the result below the page; bring it into view when it changes.
  const answerField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const resultRow = useRef<HTMLDivElement>(null);
  const shownResult = useRef(feedbackResult);
  useEffect(() => {
    if (shownResult.current === feedbackResult) return;
    shownResult.current = feedbackResult;
    resultRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [feedbackResult]);
  const [focusLine, setFocusLine] = useState<{line: number; key: number}>();
  function jumpToLine(line: number) {
    setShowFeedback(false);
    setFocusLine(previous => ({ line, key: (previous?.key ?? 0) + 1 }));
  }
  let selected: string[] = [];
  try {
    const x = JSON.parse(value.answer || "[]");
    if (Array.isArray(x)) selected = x;
  } catch {}
  const fieldId = "answer-" + item.id;
  const locked = readOnly || disabled || uploading;
  // A pending submission locks editing, but its own check button can replay the saved request.
  const checkLocked = readOnly || uploading || (disabled && !canSubmit);
  const compact = item.attachment === "none" ? item.input : undefined;
  return (
    <article className="spread-question" data-compact={compact}>
      <div className="flex items-start justify-between gap-3">
        <h3 id={"question-" + item.id} tabIndex={-1} className="min-w-0 whitespace-pre-wrap break-words text-lg font-semibold leading-[var(--paper-line-height)]">
          <span className="font-hand text-xl text-accent">{number}.</span> {formatText(item.prompt)}
        </h3>
        <HintNote item={item} disabled={locked} onReveal={onReveal} formatText={formatText} />
      </div>
      {item.instructions && <p className="text-muted">{formatText(item.instructions)}</p>}
      {item.input === "choice" ? (
        <fieldset aria-labelledby={"question-" + item.id}>
          <legend className="sr-only">Chọn đáp án</legend>
          {item.choices?.map((choice) => (
            // Marked the way one does in a notebook: a pen tick in a circle, the chosen line underlined.
            <label key={choice.id} className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="peer sr-only"
                disabled={locked}
                checked={selected.includes(choice.id)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    answer: JSON.stringify(e.target.checked ? [...selected, choice.id] : selected.filter((x) => x !== choice.id)),
                  })
                }
              />
              <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-muted/50 font-hand text-lg leading-none text-transparent peer-checked:border-brick peer-checked:text-brick peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">✓</span>
              <span className="decoration-brick decoration-2 underline-offset-4 peer-checked:underline">{formatText(choice.text)}</span>
            </label>
          ))}
        </fieldset>
      ) : item.input === "short" || item.input === "long" ? (
        <div className="spread-answer">
          <label htmlFor={fieldId} className="sr-only">Bài làm của bạn</label>
          {item.input === "short" ? (
            <input
              id={fieldId}
              ref={element => { answerField.current = element; }}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoComplete="off"
              value={value.answer}
              disabled={locked}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              placeholder="Viết câu trả lời…"
              className="block min-h-11 w-full border-0 bg-transparent p-0 font-hand text-xl leading-7 text-ink placeholder:text-muted focus:border-b-2 focus:border-accent-paper"
            />
          ) : (
            <textarea
              id={fieldId}
              ref={element => { answerField.current = element; }}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoComplete="off"
              value={value.answer}
              disabled={locked}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              rows={5}
              placeholder="Viết bài làm ở đây…"
              className="block w-full resize-y border-0 bg-transparent p-0 font-hand text-xl leading-7 text-ink placeholder:text-muted focus:border-b-2 focus:border-accent-paper max-h-[45dvh]"
            />
          )}
          {germanInput && !locked && <>
            <div role="group" aria-label="Ký tự tiếng Đức" className="flex flex-wrap gap-x-1">
              {germanCharacters.map(character => (
                <button key={character} type="button" aria-label={"Chèn " + character}
                  className={pencilLink + " inline-grid min-h-11 min-w-11 place-items-center text-lg"}
                  onPointerDown={event => event.preventDefault()}
                  onClick={() => {
                    const field = answerField.current;
                    if (!field) return;
                    const start = field.selectionStart ?? value.answer.length;
                    const end = field.selectionEnd ?? start;
                    const answer = value.answer.slice(0, start) + character + value.answer.slice(end);
                    if (answer.length > field.maxLength) return;
                    onChange({ ...value, answer });
                    field.focus();
                    requestAnimationFrame(() => field.setSelectionRange(start + 1, start + 1));
                  }}>{character}</button>
              ))}
            </div>
            {hasVietnameseTyping(value.answer) && <p role="status" className="text-sm text-muted">Có dấu tiếng Việt. Bạn thử đổi sang bàn phím tiếng Đức.</p>}
          </>}
        </div>
      ) : <StructuredInput item={item} value={value.answer} disabled={locked} focusLine={focusLine}
        onChange={answer => onChange({ ...value, answer })} />}
      {item.attachment !== "none" && (
        <div className="text-sm">
          <label htmlFor={"photo-" + item.id} className="block text-muted">
            Ảnh bài làm {item.attachment === "required" ? "(cần có)" : "(tuỳ chọn)"} · giữ tối đa 30 ngày, đừng chụp tên, địa chỉ hay giấy tờ
          </label>
          <input
            id={"photo-" + item.id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={locked || (value.attachmentIds?.length ?? 0) >= 4}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setPhotoError("");
              try {
                const photo = await uploadPhoto(file);
                onChange({ ...value, attachmentIds: [...(value.attachmentIds ?? []), photo.id] });
              } catch (error) {
                setPhotoError((error as Error).message);
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
          {uploading && <p role="status">Đang gửi ảnh…</p>}
          {photoError && <p role="alert">{photoError}</p>}
          {value.attachmentIds?.map((photo) => (
            <p key={photo} className="flex items-center gap-3">
              <a href={"/api/uploads/" + photo} target="_blank" rel="noreferrer" className={pencilLink}>Xem ảnh đã đính kèm</a>
              {!readOnly && (
                <button className={pencilLink} disabled={disabled || uploading} onClick={() => onChange({ ...value, attachmentIds: value.attachmentIds?.filter((x) => x !== photo) })}>Gỡ</button>
              )}
            </p>
          ))}
        </div>
      )}
      {(item.input === "short" || item.input === "long") && value.answer && formatText(value.answer)!==value.answer && <p className={pencil}>Công thức: {formatText(value.answer)}</p>}
      {!readOnly && <div className="spread-check"><CheckStamp label={submitLabel ?? words.action.check} disabled={checkLocked}
        canSubmit={!!canSubmit} hasAnswer={hasAnswer}
        onSubmit={onSubmit} /></div>}
      <div ref={resultRow} className="grid min-h-[calc(2*var(--paper-line-height))] content-center">
        {(feedback || item.revealed.solution) && <button type="button" className="min-h-11 w-full text-left font-hand text-lg text-brick hover:underline"
          aria-haspopup="dialog" onClick={() => setShowFeedback(true)}>
          <span className="flex min-w-0 items-start gap-2">
            {gradeLater && <SketchIcon name="hourglass" size={20} className="shrink-0" />}
            {feedbackResult && <ResultStamp result={feedbackResult} className={feedbackSupported ? "shrink-0 opacity-60" : "shrink-0"} />}
            <span className="line-clamp-2 min-w-0 leading-snug">{feedbackSupported && feedbackResult === "correct" ? "Đã xem lời giải, không tính điểm." : item.revealed.solutionSeen && item.revealed.solution ? `Đã xem lời giải · ${formatText(item.revealed.solution)}` : gradeLater ? "Chờ chấm" : feedbackPreview || "Xem lời phê"}</span>
          </span>
        </button>}
      </div>
      {showFeedback && <PaperDialog title={words.feedback.grade} labelId={`feedback-${item.id}`} onClose={() => setShowFeedback(false)}>
        <RevealedSolution item={item} formatText={formatText} />
        {gradeLater && <p className={pencil}>{words.status.gradeLater}</p>}
        {feedback?.(item.input === 'code' ? jumpToLine : undefined)}
      </PaperDialog>}
    </article>
  );
}
