"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, Paperclip } from "lucide-react";
import { MarginDate, RuledPage, Stamp, StickyNote, cx } from "../../components/notebook/paper";
import type { LessonSource } from "../lesson-content";
import { berlinKey, dateTimeOf, shortDate, staticSources, type Page } from "./model";
import { buttonClass, PageLabel } from "./ui";
import type { DailyApi } from "./use-daily";
import type { WorkspaceApi } from "./use-workspace";

export type Drafts = { values: Record<string, string>; set: (key: string, value: string | undefined) => void };

type Body = {
  objective: string;
  prerequisites: string[];
  sections: { heading: string; text: string }[];
  diagram?: string;
  exercise: string;
  deliverable: string;
  questions: { question: string; rubric: string }[];
  sources: LessonSource[];
  nextTopic?: string;
  note?: string;
};

export function LessonPage({ page, number, daily, workspace, drafts, readOnly = false }: { page: Page; number: number; daily: DailyApi; workspace: WorkspaceApi; drafts: Drafts; readOnly?: boolean }) {
  return page.kind === "daily"
    ? <DailyLessonPage page={page} number={number} daily={daily} drafts={drafts} readOnly={readOnly} />
    : <StaticLessonPage page={page} workspace={workspace} drafts={drafts} readOnly={readOnly} />;
}

function DailyLessonPage({ page, number, daily, drafts, readOnly }: { page: Extract<Page, { kind: "daily" }>; number: number; daily: DailyApi; drafts: Drafts; readOnly: boolean }) {
  const { lesson, archived } = page;
  const key = `d:${lesson.id}`;
  const value = readOnly ? lesson.response : drafts.values[key] ?? lesson.response;
  const unsaved = drafts.values[key] !== undefined && drafts.values[key] !== lesson.response;
  const busy = daily.busyId === lesson.id;
  const completed = !!lesson.completedAt;
  const [justCompleted, setJustCompleted] = useState(false);

  async function save(complete: boolean) {
    const ok = await daily.save(lesson, value, complete);
    if (ok) drafts.set(key, undefined);
    setJustCompleted(ok && complete && !completed);
  }

  const content = lesson.content;
  return (
    <LessonSheet
      key={lesson.id}
      meta={`Bài ${number} · ${content.level} · ${content.minutes} phút`}
      date={shortDate(lesson.assignedDate)}
      title={content.title}
      stamp={completed ? shortDate(berlinKey(lesson.completedAt!)) : null}
      stampPressed={justCompleted}
      body={{
        objective: content.objective,
        prerequisites: [],
        sections: content.sections,
        diagram: content.diagram,
        exercise: content.exercise,
        deliverable: content.deliverable,
        questions: content.questions.map((item) => ({ question: item.question, rubric: item.answer })),
        sources: content.sources,
        nextTopic: content.nextTopic,
      }}
      answer={
        <AnswerField
          id={key}
          label="Bài làm"
          hint="Viết câu trả lời, đầu ra và điều còn vướng bằng lời của bạn."
          value={value}
          readOnly={archived || readOnly}
          onChange={(next) => drafts.set(key, next)}
        />
      }
      actions={readOnly ? null : archived ? (
        <p className="leading-7 text-muted">Bài này đã được thay bằng bài mới và giữ lại trong sổ để ôn.</p>
      ) : (
        <ActionBar
          status={busy ? "Đang lưu…" : unsaved ? "Có thay đổi chưa lưu" : lesson.response ? `Đã lưu ${dateTimeOf(lesson.updated)}` : ""}
          error={daily.error}
        >
          <button type="button" disabled={busy || !unsaved} onClick={() => void save(completed)} className={buttonClass("secondary")}>Lưu bài làm</button>
          <button type="button" disabled={busy} onClick={() => void save(!completed)} className={buttonClass(completed ? "ghost" : "primary")}>
            {completed ? "Bỏ dấu đã học" : <><Check size={16} aria-hidden="true" /> Đã học xong</>}
          </button>
        </ActionBar>
      )}
      after={completed && !archived ? <p className="font-hand text-lg leading-7 text-ok">Đã học xong. Bài tiếp theo của sổ này sẽ có sau 3 giờ sáng.</p> : null}
    />
  );
}

function StaticLessonPage({ page, workspace, drafts, readOnly }: { page: Extract<Page, { kind: "static" }>; workspace: WorkspaceApi; drafts: Drafts; readOnly: boolean }) {
  const { lesson, detail } = page;
  const key = `n:${lesson.id}`;
  const value = drafts.values[key] ?? "";
  const completed = workspace.data.done.includes(lesson.id);
  const [message, setMessage] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);
  const saved = workspace.data.logs.filter((log) => log.kind === "Câu trả lời bài học" && log.body.startsWith(`${lesson.title}\n\n`));

  async function saveAnswer() {
    if (!value.trim()) return;
    const ok = await workspace.commit((current) => ({
      ...current,
      logs: [{ id: crypto.randomUUID(), kind: "Câu trả lời bài học", track: lesson.track, date: new Date().toISOString(), body: `${lesson.title}\n\n${value.trim()}` }, ...current.logs],
    }));
    if (ok) {
      drafts.set(key, undefined);
      setMessage("Đã lưu vào Ghi chú của sổ.");
    }
  }

  return (
    <LessonSheet
      key={lesson.id}
      meta={`Bài nền · ${lesson.level} · ${lesson.time} phút`}
      title={lesson.title}
      stamp={completed && !readOnly ? "" : null}
      stampPressed={justCompleted}
      body={{
        objective: detail?.objective ?? lesson.body,
        prerequisites: detail?.prerequisites ?? [],
        sections: detail?.sections ?? [{ heading: "Ý chính", text: lesson.body }, { heading: "Ví dụ", text: lesson.example }],
        diagram: detail?.diagram,
        exercise: detail?.exercise ?? lesson.question,
        deliverable: detail?.deliverable ?? lesson.answer,
        questions: detail?.questions ?? [
          { question: lesson.question, rubric: lesson.answer },
          { question: "Nêu một giới hạn hoặc điều cần kiểm tra tiếp theo.", rubric: "Nêu một dữ kiện còn thiếu, nguồn cần mở hoặc giả định cần kiểm tra trước khi kết luận." },
        ],
        sources: staticSources(lesson, detail),
        nextTopic: detail?.nextTopic,
        note: detail?.note,
      }}
      answer={readOnly ? null : (
        <>
          {saved.length > 0 && (
            <div className="mb-7">
              <PageLabel>Bài làm đã lưu ({saved.length})</PageLabel>
              {saved.map((log) => (
                <div key={log.id} className="relative border-l-2 border-rose-soft pl-3">
                  <MarginDate>{shortDate(berlinKey(log.date))}</MarginDate>
                  <p className="whitespace-pre-wrap break-words leading-7">{log.body.slice(lesson.title.length + 2)}</p>
                </div>
              ))}
            </div>
          )}
          <AnswerField id={key} label="Bài làm mới" hint="Mỗi lần lưu thêm một mục vào Ghi chú của sổ." value={value} onChange={(next) => { drafts.set(key, next || undefined); setMessage(""); }} />
        </>
      )}
      actions={readOnly ? null : (
        <ActionBar status={workspace.saving ? "Đang lưu…" : message || (value.trim() ? "Có bài làm chưa lưu" : "")} error={workspace.error}>
          <button type="button" disabled={!workspace.loaded || workspace.saving || !value.trim()} onClick={() => void saveAnswer()} className={buttonClass("secondary")}>Lưu bài làm</button>
          <button type="button" disabled={!workspace.loaded || workspace.saving} onClick={async () => { const ok = await workspace.toggleDone(lesson.id); setJustCompleted(ok && !completed); }} className={buttonClass(completed ? "ghost" : "primary")}>
            {completed ? "Bỏ dấu đã học" : <><Check size={16} aria-hidden="true" /> Đã học xong</>}
          </button>
        </ActionBar>
      )}
    />
  );
}

function LessonSheet({ meta, date, title, stamp, stampPressed = false, body, answer, actions, after }: {
  meta: string;
  date?: string;
  title: string;
  stamp: string | null;
  stampPressed?: boolean;
  body: Body;
  answer: ReactNode;
  actions: ReactNode;
  after?: ReactNode;
}) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  return (
    <div style={{ viewTransitionName: "lesson-page" }}>
    <RuledPage as="article" className="min-h-[70vh] pb-14 sm:pr-10">
      {stamp !== null && <Stamp date={stamp || undefined} pressed={stampPressed} className="absolute right-3 top-5 sm:right-8 sm:top-7" />}
      <div className="relative">
        {date && <MarginDate>{date}</MarginDate>}
        <p className="text-xs font-semibold uppercase leading-7 tracking-[0.12em] text-muted">{meta}</p>
      </div>
      <h1 className={cx("relative pt-7 font-print text-[1.375rem] font-medium leading-7 sm:top-2.5 sm:pt-0 sm:text-[2rem] sm:leading-[3.5rem]", stamp !== null && "pr-20 sm:pr-24")}>{title}</h1>

      <PageLabel className="mt-7">Mục tiêu</PageLabel>
      <p className="max-w-[68ch] leading-7">{body.objective}</p>

      {body.prerequisites.length > 0 && (
        <>
          <PageLabel className="mt-7">Trước khi bắt đầu</PageLabel>
          <ul className="max-w-[68ch] list-['–__'] pl-4 leading-7">{body.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}

      <div className="max-w-[68ch]">
        {body.sections.map((section) => (
          <section key={section.heading} className="mt-7">
            <h2 className="font-print text-xl font-medium leading-7">{section.heading}</h2>
            <p className="whitespace-pre-wrap leading-7">{section.text}</p>
          </section>
        ))}
      </div>

      {body.diagram && (
        <StickyNote>
          <p className="font-hand text-lg text-accent-hover">Sơ đồ</p>
          <pre className="overflow-x-auto whitespace-pre font-mono text-[13px] leading-6">{body.diagram}</pre>
        </StickyNote>
      )}

      <section className="mt-14 max-w-[68ch]">
        <h2 className="font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">Bài tập</h2>
        <p className="whitespace-pre-wrap leading-7">{body.exercise}</p>
        <StickyNote tone="paper" className="rotate-[0.4deg]">
          <p className="font-hand text-lg text-accent-hover">Đầu ra cần có</p>
          <p>{body.deliverable}</p>
        </StickyNote>
      </section>

      <section className="max-w-[68ch]">
        <h2 className="font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">Tự kiểm tra</h2>
        <p className="text-sm leading-7 text-muted">Trả lời trong đầu hoặc vào bài làm trước, rồi mới mở đáp án gợi ý.</p>
        <ol className="mt-7 grid gap-7">
          {body.questions.map((item, index) => (
            <li key={`${index}-${item.question}`} className="relative">
              <span aria-hidden="true" className="absolute right-full top-0 mr-3 font-hand text-xl leading-7 text-accent sm:mr-4">{index + 1}.</span>
              <p className="leading-7">{item.question}</p>
              <button
                type="button"
                aria-expanded={!!revealed[index]}
                onClick={() => setRevealed((current) => ({ ...current, [index]: !current[index] }))}
                className="min-h-7 text-sm font-semibold leading-7 text-accent hover:underline"
              >
                {revealed[index] ? "Ẩn đáp án gợi ý" : "Xem đáp án gợi ý"}
              </button>
              {revealed[index] && (
                <p className="border-l-2 border-accent pl-3 leading-7">
                  <span className="mr-2 font-hand text-lg text-accent">Gợi ý:</span>{item.rubric}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 max-w-[68ch]">
        {answer}
        {actions}
        {after}
      </section>

      {body.sources.length > 0 && (
        <section className="mt-14 max-w-[68ch]">
          <h2 className="flex items-center gap-2 font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent"><Paperclip size={20} aria-hidden="true" /> Kẹp tài liệu</h2>
          <ul className="grid gap-7">
            {body.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="pencil-underline inline-flex items-center gap-1 font-semibold leading-7 text-accent">
                  {source.title} <ArrowUpRight size={15} aria-hidden="true" />
                </a>
                <p className="text-[15px] leading-7">{source.readScope}</p>
                <p className="text-sm leading-7 text-muted">
                  {source.publishedAt ? `Xuất bản ${source.publishedAt} · ` : ""}
                  {source.retrievedAt ? `Đọc ngày ${new Date(source.retrievedAt).toLocaleDateString("vi-VN", { timeZone: "Europe/Berlin" })}` : "Chưa ghi ngày đọc"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.nextTopic && (
        <p className="mt-14 flex max-w-[68ch] items-start gap-2 leading-7">
          <span className="shrink-0 font-hand text-lg text-accent">Bài sau</span>
          <ArrowRight size={16} aria-hidden="true" className="mt-1.5 shrink-0 text-accent" />
          <span>{body.nextTopic}</span>
        </p>
      )}
      {body.note && <p className="mt-7 max-w-[68ch] text-sm leading-7 text-muted">{body.note}</p>}
    </RuledPage>
    </div>
  );
}

function AnswerField({ id, label, hint, value, readOnly, onChange }: { id: string; label: string; hint: string; value: string; readOnly?: boolean; onChange: (value: string) => void }) {
  const field = `answer-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  return (
    <div>
      <label htmlFor={field} className="block font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">{label}</label>
      <p id={`${field}-hint`} className="text-sm leading-7 text-muted">{hint}</p>
      <textarea
        id={field}
        aria-describedby={`${field}-hint`}
        value={value}
        readOnly={readOnly}
        maxLength={18000}
        rows={8}
        placeholder={readOnly ? "" : "Viết ở đây…"}
        onChange={(event) => onChange(event.target.value)}
        className="bg-lines mt-0 block min-h-56 w-full resize-y rounded-none border-0 border-l-2 border-rose-soft px-3 text-base text-ink placeholder:font-hand placeholder:text-lg placeholder:text-muted read-only:text-muted focus:border-accent"
      />
    </div>
  );
}

function ActionBar({ status, error, children }: { status: string; error: string; children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-3 mt-7 rounded-md border border-line bg-paper/95 px-3 py-3 shadow-page backdrop-blur-sm lg:bottom-4">
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <span role="status" className="text-sm text-muted">{status}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-accent-hover">{error}</p>}
    </div>
  );
}
