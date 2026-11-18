"use client";

import { lazy, Suspense, useState, type KeyboardEvent } from "react";
import type { ItemView } from "../../../../lib/lesson-v2/store";
import { parseStructuredAnswer } from "../../../../lib/lesson-v2/answer";
import { SketchIcon } from "../../sketch-icons";
import { FigureImage } from "../figure-image";
const CodeInput = lazy(() => import("./code").then(module => ({ default: module.CodeInput })));

type StructuredItem = Extract<ItemView, { input: "cloze" | "match" | "order" | "label" | "table" | "code" }>;
type Props = { value: string; onChange: (value: string) => void; disabled: boolean };
type InputProps<T extends StructuredItem["input"]> = Props & { item: Extract<StructuredItem, { input: T }> };
const field = "min-h-11 min-w-0 border-b border-rule bg-transparent px-2 text-ink-paper outline-none focus:border-accent focus:ring-2 focus:ring-accent-paper/50 disabled:opacity-70";
const choice = "notebook-button notebook-choice min-w-0 flex-col items-start text-left";

function cells(value: string, count: number) {
  const saved = parseStructuredAnswer(value);
  return Array.from({ length: count }, (_, i) => Array.isArray(saved) && typeof saved[i] === "string" ? saved[i] as string : "");
}

function fill(props: Props, values: string[], i: number, value: string) {
  props.onChange(JSON.stringify(values.map((previous, index) => i === index ? value : previous)));
}

function ClozeInput(props: InputProps<"cloze">) {
  const { item, disabled } = props;
  const values = cells(props.value, item.fragments.length - 1);
  return <fieldset className="leading-10">
    <legend className="sr-only">Điền vào chỗ trống</legend>
    {item.fragments.map((fragment, index) => <span key={index}>{fragment}{index < values.length &&
      <input autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label={"Ô trống " + (index + 1)} className={field + " mx-1 w-28"} value={values[index]} disabled={disabled}
        maxLength={180} onChange={event => fill(props, values, index, event.target.value)} />}</span>)}
  </fieldset>;
}

function MatchInput({ item, value, onChange, disabled }: InputProps<"match">) {
  const [left, setLeft] = useState<string | null>(null);
  const saved = parseStructuredAnswer(value);
  const pairs = new Map(saved && typeof saved === "object" && !Array.isArray(saved) ? Object.entries(saved) : []);
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const group = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if (!group.length) return;
    const next = (group.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : group.length - 1)) % group.length;
    event.preventDefault();
    event.stopPropagation();
    group[next].focus();
  }
  return <fieldset className="grid grid-cols-2 gap-2 text-sm">
    <legend className="font-hand text-lg text-muted-paper">Chọn một vế ở mỗi bên.</legend>
    <div className="grid content-start gap-1" aria-label="Vế trái">
      {item.left.map((option, i) => <button type="button" key={option.id} disabled={disabled} aria-pressed={left === option.id} className={choice}
        onKeyDown={moveFocus} onClick={event => {
          setLeft(option.id);
          if (event.detail === 0) requestAnimationFrame(() => document.getElementById(item.id + "-right-0")?.focus());
        }}>
        <span>{i + 1}. {option.text}</span>
        {pairs.get(option.id) && <span className="block text-accent">Nối với {item.right.find(right => right.id === pairs.get(option.id))?.text}</span>}
      </button>)}
    </div>
    <div className="grid content-start gap-1" aria-label="Vế phải">
      {item.right.map((option, i) => <button type="button" key={option.id} id={item.id + "-right-" + i} disabled={disabled || left === null}
        aria-pressed={left !== null && pairs.get(left) === option.id} className={choice} onKeyDown={moveFocus} onClick={() => {
          if (left === null) return;
          const next = new Map([...pairs].filter(([key, right]) => key !== left && right !== option.id));
          if (pairs.get(left) !== option.id) next.set(left, option.id);
          onChange(JSON.stringify(Object.fromEntries(next)));
        }}>{option.text}</button>)}
    </div>
  </fieldset>;
}

function OrderInput({ item, value, onChange, disabled }: InputProps<"order">) {
  const saved = parseStructuredAnswer(value);
  const order = Array.isArray(saved) && saved.length === item.steps.length && new Set(saved).size === saved.length
    && saved.every(id => item.steps.some(step => step.id === id)) ? saved as string[] : item.steps.map(step => step.id);
  function move(index: number, offset: number) {
    const other = index + offset;
    if (disabled || other < 0 || other >= order.length) return;
    const next = [...order];
    [next[index], next[other]] = [next[other], next[index]];
    onChange(JSON.stringify(next));
  }
  return <fieldset>
    <legend className="font-hand text-lg text-muted-paper">Đưa các bước về đúng thứ tự.</legend>
    <ol className="grid gap-1">
      {order.map((id, index) => <li key={id} tabIndex={disabled ? undefined : 0}
        className="flex min-h-11 items-center gap-1 border-b border-rule text-sm"
        onKeyDown={event => {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          move(index, event.key === "ArrowUp" ? -1 : 1);
        }}>
        <span className="w-6 shrink-0 text-center text-accent">{index + 1}.</span>
        <span className="min-w-0 flex-1">{item.steps.find(step => step.id === id)?.text}</span>
        {[-1, 1].map(offset => <button type="button" key={offset} aria-label={offset < 0 ? "Đưa bước lên" : "Đưa bước xuống"}
          className="grid size-11 shrink-0 place-items-center text-accent disabled:opacity-35" disabled={disabled || !order[index + offset]}
          onClick={() => move(index, offset)}><SketchIcon name="chevron" size={17} className={offset < 0 ? "rotate-180" : undefined} /></button>)}
      </li>)}
    </ol>
    <button type="button" disabled={disabled} className="notebook-button notebook-secondary"
      onClick={() => onChange(JSON.stringify(order))}>Dùng thứ tự này</button>
  </fieldset>;
}

function LabelInput(props: InputProps<"label">) {
  const { item, disabled } = props;
  const values = cells(props.value, item.marks.length);
  return <fieldset>
    <legend className="sr-only">Gắn nhãn trên hình</legend>
    <FigureImage image={item.image} marks={item.marks} description={item.description} />
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-3">
      {values.map((value, index) => <label key={index} className="flex min-w-0 items-center gap-1 text-sm">
        <span className="shrink-0 font-hand text-lg text-accent">{index + 1}.</span>
        <input autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label={"Điểm " + (index + 1)} className={field + " w-full"} value={value} disabled={disabled} maxLength={180}
          onChange={event => fill(props, values, index, event.target.value)} />
      </label>)}
    </div>
  </fieldset>;
}

function TableInput(props: InputProps<"table">) {
  const { item, disabled } = props;
  const values = cells(props.value, item.headers.length * item.rowLabels.length);
  return <div className="overflow-x-auto">
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Bảng cần điền</caption>
      <thead><tr><td />{item.headers.map((header, index) => <th key={index} scope="col" className="border-b border-rule px-2 text-left">{header}</th>)}</tr></thead>
      <tbody>{item.rowLabels.map((label, row) => <tr key={row}>
        <th scope="row" className="border-b border-rule px-2 text-left font-normal">{label}</th>
        {item.headers.map((header, col) => {
          const index = row * item.headers.length + col;
          return <td key={col} className="border-b border-l border-rule">
            <input autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label={label + " · " + header} className={field + " w-full min-w-20 border-b-0"} value={values[index]} disabled={disabled}
              maxLength={180} onChange={event => fill(props, values, index, event.target.value)} />
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}

export function StructuredInput({ item, focusLine, active = true, ...props }: Props & { item: ItemView; focusLine?: { line: number; key: number }; active?: boolean }) {
  switch (item.input) {
    case "cloze": return <ClozeInput item={item} {...props} />;
    case "match": return <MatchInput item={item} {...props} />;
    case "order": return <OrderInput item={item} {...props} />;
    case "label": return <LabelInput item={item} {...props} />;
    case "table": return <TableInput item={item} {...props} />;
    case "code": return <Suspense fallback={<p role="status">Đang mở ô viết mã…</p>}><CodeInput item={item} focusLine={focusLine} active={active} {...props} /></Suspense>;
    default: return null;
  }
}
