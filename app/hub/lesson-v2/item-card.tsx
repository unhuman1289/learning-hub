"use client";
import { useState, type ReactNode } from "react";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { HintLinks, Revealed } from "./hints";
import { pencil, pencilLink } from "../paper-bits";
import { buttonClass } from "../ui";
import { uploadPhoto } from "./photo";
export function ItemCard({
  item,
  number,
  feedback,
  onSubmit,
  submitLabel,
  canSubmit,
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
  feedback?: ReactNode;
  onSubmit?: () => void;
  submitLabel?: string;
  canSubmit?: boolean;
  value: DraftAnswers[string];
  disabled: boolean;
  readOnly: boolean;
  onChange: (answer: DraftAnswers[string]) => void;
  onReveal: (level: "hint1" | "hint2" | "solution") => void;
}) {
  const [photoError, setPhotoError] = useState(""),
    [uploading, setUploading] = useState(false);
  let selected: string[] = [];
  try {
    const x = JSON.parse(value.answer || "[]");
    if (Array.isArray(x)) selected = x;
  } catch {}
  const fieldId = "answer-" + item.id;
  const locked = readOnly || disabled || uploading;
  return (
    <article className="pb-7">
      <h3 id={"question-" + item.id} className="whitespace-pre-wrap text-lg font-semibold leading-7">
        <span className="font-hand text-xl text-accent">{number}.</span> {formatText(item.prompt)}
      </h3>
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
      ) : (
        <div>
          <label htmlFor={fieldId} className="sr-only">Bài làm của bạn</label>
          {item.input === "short" ? (
            <input
              id={fieldId}
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
              value={value.answer}
              disabled={locked}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              rows={5}
              placeholder="Viết bài làm ở đây…"
              className="block w-full resize-y border-0 bg-transparent p-0 font-hand text-xl leading-7 text-ink placeholder:text-muted focus:border-b-2 focus:border-accent-paper max-h-[45dvh]"
            />
          )}
        </div>
      )}
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
      {value.answer && formatText(value.answer)!==value.answer && <p className={pencil}>Công thức: {formatText(value.answer)}</p>}
      <Revealed item={item} formatText={formatText} />
      {!readOnly && (
        // One action per question; hints and the solution are pencilled asides.
        <div className="flex min-h-14 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <button type="button" disabled={!canSubmit || uploading} onClick={onSubmit} className={buttonClass("secondary", "min-h-11")}>{submitLabel ?? "Kiểm tra"}</button>
          <HintLinks item={item} disabled={locked} onReveal={onReveal} />
        </div>
      )}
      {feedback}
    </article>
  );
}
