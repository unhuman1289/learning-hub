"use client";
import { renderEmphasis } from "../inline-emphasis";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { HintNote, RevealedSolution } from "../lesson-v2/hints";
import { pencil, pencilLink, ResultStamp } from "../paper-bits";
import { uploadPhoto } from "../lesson-v2/photo";
import { germanCharacters, hasVietnameseTyping } from "../lesson-v2/keyboard";
import { LessonAudio, type ListeningControls } from "./audio";
import { StructuredInput } from "../lesson-v2/inputs/structured";
export function LessonItem({
  active = true,
  item,
  listening,
  number,
  germanInput = false,
  feedback,
  feedbackPreview,
  feedbackResult,
  feedbackSupported,
  onUploadState,
  value,
  disabled,
  readOnly,
  onChange,
  onReveal,
  formatText = (text:string)=>text,
}: {
  active?: boolean;
  formatText?:(text:string)=>string;
  item: ItemView;
  listening?: ListeningControls;
  number: number;
  germanInput?: boolean;
  feedback?: (onCodeLine?: (line: number) => void) => ReactNode;
  feedbackPreview?: string;
  feedbackResult?: string | null;
  feedbackSupported?: boolean;
  onUploadState: (uploading: boolean) => void;
  value: DraftAnswers[string];
  disabled: boolean;
  readOnly: boolean;
  onChange: (answer: DraftAnswers[string]) => void;
  onReveal: (level: "hint1" | "hint2" | "solution") => void;
}) {
  const [photoError, setPhotoError] = useState(""),
    [uploading, setUploading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [focusLine, setFocusLine] = useState<{ line: number; key: number }>();
  const answerField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const result = useRef<HTMLDivElement>(null);
  const lastResult = useRef(feedbackResult);
  useEffect(() => {
    if (!active) return;
    if (lastResult.current === feedbackResult) return;
    lastResult.current = feedbackResult;
    result.current?.scrollIntoView({ block: "nearest" });
  }, [active, feedbackResult]);

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
  return (
    <article className="lesson-item grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 data-question-number={number} id={"question-" + item.id} tabIndex={-1}
          className="min-w-0 scroll-mt-24 whitespace-pre-wrap break-words font-print text-[1.65rem] leading-tight">
          <span className="font-hand text-xl text-accent-paper">{number}.</span> {formatText(item.prompt)}
        </h2>
        <HintNote item={item} disabled={locked} onReveal={onReveal} active={active} formatText={formatText} />
      </div>
      {item.instructions && <p className="text-muted-paper">{formatText(item.instructions)}</p>}
      {item.audio && (listening ? <LessonAudio audio={item.audio} {...listening} active={active} /> :
        <p role="status" className="text-sm text-muted-paper">Đang mở phần nghe…</p>)}
      {item.input === "choice" ? (
        <fieldset aria-labelledby={"question-" + item.id}>
          <legend className="sr-only">Chọn đáp án</legend>
          {item.choices?.map((choice) => (
            // Marked the way one does in a notebook: a pen tick in a circle, the chosen line underlined.
            <label key={choice.id} className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-rule py-2">
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
        <div className="min-w-0">
          <label htmlFor={fieldId} className="sr-only">Bài làm của bạn</label>
          {item.input === "short" ? (
            <input
              id={fieldId}
              ref={element => { answerField.current = element; }}
              autoComplete="off"
              lang={germanInput ? "de" : undefined}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value.answer}
              disabled={locked}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              placeholder="Viết câu trả lời…"
              className="block min-h-11 w-full border-0 bg-transparent p-0 font-hand text-xl leading-7 text-ink-paper placeholder:text-muted-paper focus:border-b-2 focus:border-accent-paper"
            />
          ) : (
            <textarea
              id={fieldId}
              ref={element => { answerField.current = element; }}
              autoComplete="off"
              lang={germanInput ? "de" : undefined}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value.answer}
              disabled={locked}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              rows={5}
              placeholder="Viết bài làm ở đây…"
              className="block w-full resize-y [field-sizing:content] min-h-28 border-0 bg-transparent p-0 font-hand text-xl leading-7 text-ink-paper placeholder:text-muted-paper focus:border-b-2 focus:border-accent-paper max-h-[45dvh]"
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
      ) : <StructuredInput item={item} value={value.answer} disabled={locked} focusLine={focusLine} active={active}
        onChange={answer => onChange({ ...value, answer })} />}
      {item.attachment !== "none" && (
        <div className="flex flex-wrap items-start gap-3 text-sm">
          <label className="relative inline-flex h-24 w-24 cursor-pointer items-center justify-center rounded border border-dashed border-accent-paper bg-[#fffdf7] px-2 text-center font-hand text-base text-ink-paper focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-paper has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            Nộp ảnh bài làm
          <input
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Nộp ảnh bài làm"
            id={"photo-" + item.id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={locked || (value.attachmentIds?.length ?? 0) >= 4}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              setUploading(true);
              onUploadState(true);
              setPhotoError("");
              try {
                const photo = await uploadPhoto(file);
                onChange({ ...value, attachmentIds: [...(value.attachmentIds ?? []), photo.id] });
              } catch (error) {
                setPhotoError((error as Error).message);
              } finally {
                setUploading(false);
                onUploadState(false);
                input.value = "";
              }
            }}
          />
          </label>
          {uploading && <p role="status" className="grid h-24 w-24 place-items-center rounded border border-rule bg-[#f3efe6]">Đang gửi…</p>}
          {photoError && <p role="alert">{photoError}</p>}
          {value.attachmentIds?.map((photo) => (
            <figure key={photo} className="w-24">
              {/* Private, authenticated image; it must not pass through a public image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={"/api/uploads/" + photo} alt="Ảnh bài làm đã gửi" className="h-24 w-24 rounded border border-rule object-cover" />
              <figcaption className="flex items-center justify-between gap-2">
                <a href={"/api/uploads/" + photo} target="_blank" rel="noreferrer" className={pencilLink} aria-label="Xem ảnh đã đính kèm">Xem</a>
                {!readOnly && <button type="button" className={pencilLink} disabled={disabled || uploading} onClick={() => {
                  const remaining = value.attachmentIds?.filter(id => id !== photo);
                  onChange({ ...value, attachmentIds: remaining?.length ? remaining : undefined });
                }}>Gỡ</button>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {(item.input === "short" || item.input === "long") && value.answer && formatText(value.answer)!==value.answer && <p className={pencil}>Công thức: {formatText(value.answer)}</p>}
      {(feedback || item.revealed.solution) && <div className="min-w-0 border-y border-rule py-2">
        <div ref={result} role="status" className="scroll-mt-24 flex flex-wrap items-baseline gap-x-2 font-hand text-lg">
          {feedbackResult && <ResultStamp result={feedbackResult} className={feedbackSupported ? "opacity-60" : undefined} />}
          <span>{feedbackSupported && feedbackResult === "correct"
            ? "Đã xem lời giải, không tính điểm."
            : renderEmphasis(feedbackPreview ?? "")}</span>
        </div>
        <RevealedSolution item={item} formatText={formatText} />
        {feedback && <details open={showFeedback} onToggle={event => setShowFeedback(event.currentTarget.open)}>
          <summary className={pencilLink + " min-h-11 content-center cursor-pointer"}>Chi tiết lời phê</summary>
          {showFeedback && feedback(item.input === "code" ? jumpToLine : undefined)}
        </details>}
      </div>}
    </article>
  );
}
