"use client";
import { useState, type ReactNode } from "react";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { Hints } from "./hints";
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
  return (
    <article className="space-y-4 border-b border-line bg-paper py-6">
      <h3 id={"prompt-" + item.id} className="whitespace-pre-wrap text-lg font-semibold leading-7">
        {number}. {formatText(item.prompt)}
      </h3>
      {item.instructions && <p>{formatText(item.instructions)}</p>}
      {item.input === "choice" ? (
        <fieldset aria-labelledby={"prompt-" + item.id}>
          <legend className="sr-only">Chọn đáp án</legend>
          {item.choices?.map((choice) => (
            <label key={choice.id} className="my-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line p-3 leading-7 has-[:checked]:border-accent has-[:checked]:bg-rose-soft">
              <input
                type="checkbox"
                className="mt-1.5 size-5 shrink-0 accent-accent"
                disabled={readOnly || disabled || uploading}
                checked={selected.includes(choice.id)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    answer: JSON.stringify(e.target.checked ? [...selected, choice.id] : selected.filter((x) => x !== choice.id)),
                  })
                }
              />
              <span>{formatText(choice.text)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div>
          <label htmlFor={fieldId} className="block text-sm font-medium">
            Bài làm của bạn
          </label>
          {item.input === "short" ? (
            <input
              id={fieldId}
              value={value.answer}
              disabled={readOnly || disabled || uploading}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              className="mt-2 min-h-11 w-full rounded border border-line bg-paper px-3"
            />
          ) : (
            <textarea
              id={fieldId}
              value={value.answer}
              disabled={readOnly || disabled || uploading}
              onChange={(e) => onChange({ ...value, answer: e.target.value })}
              maxLength={8000}
              rows={6}
              className="mt-2 w-full rounded border border-line bg-paper p-3"
            />
          )}
        </div>
      )}
      {item.attachment !== "none" && (
        <div>
          <label htmlFor={"photo-" + item.id} className="block text-sm">
            Ảnh bài làm {item.attachment === "required" ? "(cần có)" : "(tùy chọn)"}
          </label>
          <input
            id={"photo-" + item.id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={readOnly || disabled || uploading || (value.attachmentIds?.length ?? 0) >= 4}
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
          <p className="text-sm text-muted">Ảnh được giữ tối đa 30 ngày. Không chụp thông tin định danh.</p>
          {value.attachmentIds?.map((photo) => (
            <div key={photo} className="mt-2 flex items-center gap-2">
              <a href={"/api/uploads/" + photo} target="_blank" rel="noreferrer" className="underline">
                Xem ảnh đã đính kèm
              </a>
              {!readOnly && (
                <button disabled={disabled || uploading} onClick={() => onChange({ ...value, attachmentIds: value.attachmentIds?.filter((x) => x !== photo) })}>Gỡ khỏi câu</button>
              )}
            </div>
          ))}
        </div>
      )}
      {value.answer && formatText(value.answer)!==value.answer && <p className="text-sm text-muted">Công thức: {formatText(value.answer)}</p>}
      <Hints formatText={formatText} item={item} disabled={readOnly || disabled || uploading} onReveal={onReveal} />
      {!readOnly && <button type="button" disabled={!canSubmit || uploading} onClick={onSubmit}
        className="brick min-h-11 px-4 text-sm font-semibold disabled:opacity-50">{submitLabel ?? "Kiểm tra"}</button>}
      {feedback}
    </article>
  );
}
