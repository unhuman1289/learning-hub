"use client";

import { notebookPages, type Page } from "./legacy-pages";
import { Book } from "./notebook/book";
import type {ShelfApi} from "./use-shelf";
import { SketchIcon } from "./sketch-icons";
import { MarginDate, RuledPage, StickyNote, cx } from "../../components/notebook/paper";
import { projects } from "../legacy-content";
import { googleDocs } from "../google-docs";
import { type FormRequest } from "./document-form";
import { LessonPage, type Drafts } from "./lesson-page";
import { coverTitle, shortDate, trackInfo, type TrackId } from "./model";
import { buttonClass, PageLabel, RouteLink } from "./ui";
import type { DailyApi } from "./use-daily";
import type { NotebookTab, Route } from "./use-route";
import type { WorkspaceApi } from "./use-workspace";

export function NotebookView({ track, tab, pageId, go, daily, workspace, drafts, openForm, shelf }: {
  shelf?:ShelfApi;
  track: TrackId;
  tab: NotebookTab;
  pageId?: string;
  go: (route: Route) => void;
  daily: DailyApi;
  workspace: WorkspaceApi;
  drafts: Drafts;
  openForm: (request: FormRequest) => void;
}) {
  const info = trackInfo(track);
  const subject=shelf?.subjects?.find(s=>s.legacyTrack===track);
  const child = shelf?.learners.find(learner => shelf.learner ? learner.id === shelf.learner : learner.relation === "self")?.role === "child";
  const readOnly = !!shelf?.learner || subject?.status === "archived";
  const { assigned, foundation, active } = notebookPages(track, daily.data);
  const all = [...assigned, ...foundation];
  const current: Page | undefined = all.find((page) => page.id === pageId)
    ?? (active ? assigned.find((page) => page.id === active.id) : undefined)
    ?? assigned[assigned.length - 1]
    ?? foundation[0];
  const number = current?.kind === "daily" ? assigned.indexOf(current) + 1 : 0;
  const toc = (
    <TableOfContents
      track={track}
      assigned={assigned}
      foundation={foundation}
      currentId={tab === "bai" || tab === "muc-luc" ? current?.id : undefined}
      go={go}
      doneIds={workspace.data.done}
      loading={!daily.data && !daily.error}
    />
  );

  return (
    <Book title={info.title} track={track} tab={tab} go={go}>
      <div className="relative rounded-[2px_6px_6px_6px] border border-line shadow-page">
        <CoverFlip key={track} title={coverTitle[track]} />
        {tab === "muc-luc" && toc}
        <div className="min-w-0">
          {tab === "bai" && (
            current
              ? <LessonPage key={current.id} page={current} number={number} daily={daily} workspace={workspace} drafts={drafts} readOnly={readOnly} />
              : <RuledPage className="min-h-[60vh]"><p className="font-hand text-2xl leading-[3.5rem] relative top-2.5 text-accent">Sổ còn trống.</p><p className="leading-7 text-muted">{daily.error ? "Chưa tải được bài học. Hãy thử tải lại trang." : "Bài đầu tiên sẽ hiện ở đây khi sẵn sàng."}</p></RuledPage>
          )}
          {tab === "muc-tieu" && <GoalsPage track={track} workspace={workspace} />}
          {tab === "tai-lieu" && <DocsPage track={track} workspace={workspace} openForm={openForm} readOnly={readOnly} child={!!child} />}
        </div>
      </div>
    </Book>
  );
}

function CoverFlip({ title }: { title: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-[min(100%,80vh)] [perspective:2200px] motion-reduce:hidden">
      <div className="relative h-full w-full origin-left animate-cover-open [transform-style:preserve-3d]">
        {/* Outside: marble board, cloth spine, name label. */}
        <div className="absolute inset-0 overflow-hidden rounded-r-[6px] bg-marble shadow-cover [backface-visibility:hidden] [background-size:220px_220px]">
          <div className="absolute inset-y-0 left-0 w-8 border-r border-black/40 bg-spine" />
          <div className="absolute left-1/2 top-[12%] w-[min(70%,18rem)] -translate-x-1/2 rounded-2xl border-4 border-label bg-label px-6 py-5 text-center text-label-ink shadow-[inset_0_0_0_2px_var(--color-label-ink)]">
            <p className="font-hand text-3xl">{title}</p>
            <p className="mt-2 border-b-2 border-label-ink" />
            <p className="mt-5 border-b-2 border-label-ink" />
          </div>
        </div>
        {/* Inside of the cover, seen while it swings over. */}
        <div className="absolute inset-0 rounded-l-[6px] bg-paper-2 shadow-[inset_-20px_0_30px_-20px_rgb(0_0_0/0.35)] [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </div>
    </div>
  );
}

function TableOfContents({ track, assigned, foundation, currentId, go, doneIds, loading }: {
  track: TrackId;
  assigned: Page[];
  foundation: Page[];
  currentId?: string;
  go: (route: Route) => void;
  doneIds: string[];
  loading: boolean;
}) {
  const row = (page: Page, date: string | null, done: boolean, archived: boolean) => {
    const on = page.id === currentId;
    return (
      <li key={page.id} className="relative">
        {date && <MarginDate>{date}</MarginDate>}
        <RouteLink
          route={{ view: "notebook", track, tab: "bai", page: page.id }}
          go={go}
          aria-current={on ? "page" : undefined}
          className={cx(
            "flex min-h-7 items-start justify-between gap-2 leading-7 transition-colors hover:text-accent-hover",
            on ? "font-semibold text-accent-hover" : archived ? "text-muted" : "text-ink",
          )}
        >
          <span className="pencil-underline min-w-0">{page.title}</span>
          {done && <span className="shrink-0 font-hand text-lg text-ok" aria-label="đã học">✓</span>}
        </RouteLink>
        {on && <span aria-hidden="true" className="absolute -left-3 top-2.5 h-2.5 w-2 bg-accent [clip-path:polygon(0_0,100%_50%,0_100%)] sm:-left-4" />}
      </li>
    );
  };

  return (
    <RuledPage className="h-full min-h-[60vh] sm:pr-5">
      <h2 className="font-hand text-[28px] leading-[3.5rem] relative top-2.5">Mục lục</h2>
      <PageLabel>Bài được giao</PageLabel>
      {loading ? <p className="leading-7 text-muted">Đang mở sổ…</p> : assigned.length ? (
        <ol>{assigned.map((page) => page.kind === "daily" && row(page, shortDate(page.lesson.assignedDate), !!page.lesson.completedAt, page.archived))}</ol>
      ) : <p className="leading-7 text-muted">Chưa có bài được giao.</p>}
      {foundation.length > 0 && (
        <>
          <PageLabel className="mt-7">Bài nền</PageLabel>
          <ol>{foundation.map((page) => row(page, null, doneIds.includes(page.id), false))}</ol>
        </>
      )}
      <p className="mt-7 text-sm leading-7 text-muted">Học xong bài đang mở thì sáng hôm sau sổ có bài mới.</p>
    </RuledPage>
  );
}

function GoalsPage({ track, workspace }: { track: TrackId; workspace: WorkspaceApi }) {
  const info = trackInfo(track);
  const trackProjects = projects.filter((project) => project.track === track);
  return (
    <RuledPage className="min-h-[60vh]">
      <h2 className="font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">Mục tiêu</h2>
      <p className="max-w-[68ch] font-print text-xl leading-7">{info.sub}</p>
      {track === "Deutsch" && (
        <p className="mt-7 max-w-[68ch] leading-7">A2 tự đánh giá → B2 trong một năm cho công việc và chứng chỉ → C2 dài hạn. Ưu tiên viết và nói; A2 cần đối chiếu bằng bài mẫu.</p>
      )}
      {trackProjects.map((project) => {
        const doneCount = project.phases.filter((_, index) => workspace.data.done.includes(`${project.id}-${index}`)).length;
        return (
          <section key={project.id} className="mt-14 max-w-[72ch]">
            <p className="text-xs font-semibold uppercase leading-7 tracking-[0.12em] text-muted">{project.tag} · {doneCount}/{project.phases.length} mốc</p>
            <h3 className="font-print text-2xl font-medium leading-[3.5rem] relative top-2.5">{project.title}</h3>
            <p className="leading-7">{project.goal}</p>
            <label className="mt-7 flex flex-wrap items-center gap-3 text-sm leading-7 text-muted">
              Ngày bắt đầu
              <input
                type="date"
                disabled={!workspace.loaded}
                value={workspace.data.starts[project.id] || ""}
                onChange={(event) => void workspace.commit((current) => ({ ...current, starts: { ...current.starts, [project.id]: event.target.value } }))}
                className="border-0 border-b-2 border-rule bg-transparent px-1 text-base text-ink focus:border-accent"
              />
            </label>
            <ol className="mt-7 grid gap-7">
              {project.phases.map(([phase, description], index) => {
                const id = `${project.id}-${index}`;
                const checked = workspace.data.done.includes(id);
                return (
                  <li key={phase}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!workspace.loaded}
                        onChange={() => void workspace.toggleDone(id)}
                        className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span>
                        <span className={cx("block font-semibold leading-7", checked && "text-muted line-through decoration-accent/60")}>{phase}</span>
                        <span className="block leading-7 text-muted">{description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
            <StickyNote tone="paper">
              <p><strong className="font-hand text-lg font-normal text-accent-hover">Cần làm rõ: </strong>{project.open}</p>
              <p className="mt-2 text-muted">{project.boundary}</p>
            </StickyNote>
          </section>
        );
      })}
    </RuledPage>
  );
}

function DocsPage({ track, workspace, openForm, readOnly, child }: { track: TrackId; workspace: WorkspaceApi; openForm: (request: FormRequest) => void; readOnly: boolean; child: boolean }) {
  const docs = googleDocs.filter((doc) => doc.track === track);
  const notes = readOnly || child ? [] : workspace.data.notes.filter((note) => note.track === track);
  return (
    <RuledPage className="min-h-[60vh]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">Tài liệu</h2>
        {!readOnly && !child && <button type="button" disabled={!workspace.loaded} onClick={() => openForm({ track })} className={buttonClass("secondary")}><SketchIcon name="plus" size={16} /> Thêm tài liệu</button>}
      </div>
      {!child && <p className="max-w-[68ch] text-sm leading-7 text-muted">Bản đầy đủ nằm trên Google Drive. Ở đây chỉ giữ đường dẫn.</p>}
      <ul className="mt-7 grid max-w-[72ch] gap-7">
        {docs.map((doc) => (
          <li key={doc.id}>
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold leading-7 text-accent hover:underline">{doc.title.replace("Learning Hub — ", "")} <SketchIcon name="external" size={15} /></a>
            <p className="leading-7 text-muted">{doc.description}</p>
          </li>
        ))}
        {notes.map((note) => (
          <li key={note.id}>
            <div className="flex flex-wrap items-center gap-x-3">
              {note.url
                ? <a href={note.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold leading-7 text-accent hover:underline">{note.title} <SketchIcon name="external" size={15} /></a>
                : <span className="font-semibold leading-7">{note.title}</span>}
              <button type="button" onClick={() => openForm({ track, note })} className={buttonClass("secondary")}>Sửa</button>
            </div>
            {note.body && <p className="whitespace-pre-wrap break-words leading-7">{note.body}</p>}
          </li>
        ))}
      </ul>
      {!docs.length && !notes.length && <p className="leading-7 text-muted">Chưa có tài liệu.</p>}
    </RuledPage>
  );
}
