"use client";

import { useCallback, useEffect, useState } from "react";
import { House, ShieldCheck } from "lucide-react";
import AuthControls from "../components/auth-controls";
import { ProfileControls } from "../components/profile-controls";
import { Beam, HouseLogo } from "../components/notebook/house";
import { cx } from "../components/notebook/paper";
import { tasks } from "./content";
import { Desk } from "./hub/desk";
import { DocumentForm, type FormRequest } from "./hub/document-form";
import type { Drafts } from "./hub/lesson-page";
import { NotebookView } from "./hub/notebook-view";
import { AdminView } from "./hub/pages";
import { StudyMeter } from "./hub/study-meter";
import { useStudyClock } from "./hub/use-study-clock";
import { RouteLink, buttonClass } from "./hub/ui";
import { useDaily } from "./hub/use-daily";
import { useRoute, type Route } from "./hub/use-route";
import { useWorkspace, type WorkspaceApi } from "./hub/use-workspace";
import { useShelf } from "./hub/use-shelf";
import { NewNotebookDialog } from "./hub/new-notebook";
import {LessonReader} from "./hub/lesson-v2/reader";
import { SubjectView } from "./hub/subject-view";
import { isTrack, trackInfo } from "./hub/model";

export default function Home({ userEmail, userName, userRole,hub2Enabled=false,profileMode=false,profileAvatar="" }: { userEmail: string; userName: string; userRole: string;hub2Enabled?:boolean;profileMode?:boolean;profileAvatar?:string }) {
  const isAdmin = userRole === "admin";
  const { route, go } = useRoute();
  const workspace = useWorkspace();
  const daily = useDaily();
  // Whose shelf the desk shows: the signed-in account, or (guardian/admin) another learner, read-only.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewedDaily = useDaily(viewingId, viewingId !== null);
  const shelf = useShelf(viewingId);
  const [newNotebook, setNewNotebook] = useState(false);
  const viewedRole = viewingId ? shelf.learners.find((item) => item.id === viewingId)?.role : shelf.self?.role;
  // Children study in notebooks a guardian opens for them; adults, guardians and admins may open one.
  const canOpenNotebook = viewingId === null ? shelf.self?.role !== "child" && !!shelf.self : viewedRole !== undefined;
  const [form, setForm] = useState<FormRequest | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const drafts: Drafts = {
    values: draftValues,
    set: useCallback((key: string, value: string | undefined) => setDraftValues((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    }), []),
  };
  const closeForm = useCallback(() => setForm(null), []);
  const unsaved = Object.keys(draftValues).length > 0 || workspace.dirty;

  // Drafts survive moving between notebooks; only leaving the site asks first.
  useEffect(() => {
    function leave(event: BeforeUnloadEvent) {
      if (!unsaved) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [unsaved]);

  useWebMcp(workspace);
  // Time with a notebook open counts as study time; nothing has to be logged by hand.
  const [lessonClock,setLessonClock]=useState<{id:string;subjectId:string}|null>(null);
  const onLessonLoaded=useCallback((id:string,subjectId:string)=>setLessonClock({id,subjectId}),[]);
  const clock = useStudyClock(viewingId===null&&route.view==='lesson'&&lessonClock?.id===route.id?lessonClock.subjectId:(route.view === "notebook" ? route.track : route.view === "book" && viewingId === null ? route.id : null));
  const labelFor = (key: string) => (isTrack(key) ? trackInfo(key).title : shelf.subjects?.find((item) => item.id === key)?.title ?? "Sổ khác");

  const name = userName.trim() || userEmail.split("@")[0];
  const nav: { route: Route; label: string; icon: typeof House; on: boolean }[] = [
    { route: { view: "desk" }, label: "Bàn học", icon: House, on: route.view === "desk" || route.view === "notebook" || route.view === "book" || route.view === "lesson" },
    ...(isAdmin ? [{ route: { view: "admin" } as Route, label: "Quản trị", icon: ShieldCheck, on: route.view === "admin" }] : []),
  ];

  return (
    <div className="min-h-dvh">
      {/* Oak plank ceiling with a beam: the top of the study. */}
      <header className="sticky top-0 z-20 text-oak-ink" style={{ viewTransitionName: "site-header" }}>
        <div className="bg-oak">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <RouteLink route={{ view: "desk" }} go={go} aria-label="Bàn học" className="flex items-center gap-2.5 rounded-md">
            <HouseLogo className="size-11 drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)]" />
            <span className="hidden leading-none sm:grid">
              <span className="font-print text-xl font-medium">Phòng học cả nhà</span>
            </span>
          </RouteLink>
          {nav.length >= 2 && <nav aria-label="Điều hướng chính" className="ml-4 hidden gap-1 lg:flex">
            {nav.map((item) => (
              <RouteLink key={item.label} route={item.route} go={go} aria-current={item.on ? "page" : undefined} className={cx("rounded-full px-4 py-2 text-sm", item.on ? "bg-paper/85 font-semibold text-accent-paper shadow-[0_1px_2px_rgb(40_24_8/0.25)]" : "hover:bg-paper/40")}>
                {item.label}
              </RouteLink>
            ))}
          </nav>}
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <SaveIndicator workspace={workspace} />
            <StudyMeter clock={clock} labelFor={labelFor} />
            {profileMode ? <ProfileControls name={name} manage={isAdmin} initialAvatar={profileAvatar} settingsLearner={shelf.learners.find(l=>l.relation==="self")?.id} /> : <AuthControls name={name} email={userEmail} />}
          </div>
        </div>
        </div>
        <Beam />
      </header>

      <main data-age={shelf.learners.find(l => viewingId ? l.id === viewingId : l.relation === "self")?.role} className={cx("px-4 pt-6 sm:px-6 lg:pb-16 lg:pt-8", nav.length >= 2 ? "pb-32" : "pb-8")}>
        {route.view === "desk" && (
          <Desk
            name={name}
            go={go}
            daily={viewingId ? viewedDaily : daily}
            shelf={shelf}
            viewing={{ learners: shelf.learners, id: viewingId, set: setViewingId }}
            canOpenNotebook={canOpenNotebook}
            onNewNotebook={() => setNewNotebook(true)}
            hub2={hub2Enabled}
          />
        )}
        {hub2Enabled&&route.view==="lesson"&&<LessonReader key={route.id+String(viewingId)+String(route.correction)} id={route.id} correction={route.correction} learner={viewingId} child={shelf.learners.some(l => l.relation === "self" && l.role === "child")} drafts={drafts} go={go} onLoaded={onLessonLoaded} onCompleted={daily.load}/>}
        {route.view === "book" && <SubjectView id={route.id} page={route.page} shelf={shelf} canEdit={canOpenNotebook} canManage={isAdmin} go={go} hub2={hub2Enabled} />}
        {route.view === "notebook" && <NotebookView track={route.track} tab={route.tab} pageId={route.page} go={go} daily={daily} workspace={workspace} drafts={drafts} openForm={setForm} shelf={shelf} canEdit={canOpenNotebook} canManage={isAdmin} hub2={hub2Enabled} />}
        {route.view === "admin" && (isAdmin ? <AdminView daily={daily} workspace={workspace} hub2={hub2Enabled} profileMode={profileMode} /> : <p className="mx-auto max-w-4xl text-muted">Trang này chỉ dành cho quản trị viên.</p>)}
      </main>

      <SaveProblem workspace={workspace} />

      {nav.length >= 2 && <nav aria-label="Điều hướng chính" style={{ viewTransitionName: "site-nav" }} className="bg-oak fixed inset-x-0 bottom-0 z-20 flex justify-around border-t-4 border-oak-dark px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 text-oak-ink shadow-[0_-6px_12px_-6px_rgb(40_24_8/0.4)] lg:hidden">
        {nav.map(({ route: target, label, icon: Icon, on }) => (
          <RouteLink key={label} route={target} go={go} aria-current={on ? "page" : undefined} className={cx("grid min-h-12 min-w-20 justify-items-center gap-0.5 rounded-md px-3 py-1 text-xs", on ? "bg-paper/85 font-semibold text-accent-paper" : "opacity-80")}>
            <Icon size={20} aria-hidden="true" />
            {label}
          </RouteLink>
        ))}
      </nav>}

      {form && <DocumentForm request={form} workspace={workspace} onClose={closeForm} />}
      {newNotebook && (
        <NewNotebookDialog
          shelf={shelf}
          forName={viewingId ? shelf.learners.find((item) => item.id === viewingId)?.name ?? null : null}
          onClose={() => setNewNotebook(false)}
          onCreated={(subject) => {
            setNewNotebook(false);
            if (viewingId) return;
            go(subject.legacyTrack ? { view: "notebook", track: subject.legacyTrack, tab: "bai" } : { view: "book", id: subject.id });
          }}
        />
      )}
    </div>
  );
}

function SaveIndicator({ workspace }: { workspace: WorkspaceApi }) {
  const text = !workspace.loaded && !workspace.error ? "Đang mở…" : workspace.saving ? "Đang lưu…" : "";
  return text ? <span role="status" className="hidden text-sm opacity-80 sm:inline">{text}</span> : null;
}

/** Visible until shared notes are confirmed saved; nothing is shown as saved before the server answers. */
function SaveProblem({ workspace }: { workspace: WorkspaceApi }) {
  if (!workspace.error && !(workspace.dirty && !workspace.saving)) return null;
  const notLoaded = !workspace.loaded;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-md border border-accent bg-paper px-4 py-3 text-sm text-ink-paper shadow-page lg:bottom-6">
      <span className="min-w-0 flex-1">
        {notLoaded ? `Chưa tải được dữ liệu sổ: ${workspace.error}` : workspace.error ? `Chưa lưu được thay đổi: ${workspace.error}` : "Có thay đổi chưa lưu."}
      </span>
      {!notLoaded && <button type="button" onClick={() => void workspace.save()} className={buttonClass("primary", "min-h-11 px-3")}>Lưu lại</button>}
      <button type="button" onClick={() => void workspace.load()} className={buttonClass("ghost", "min-h-11")}>{notLoaded ? "Thử lại" : "Mở bản đã lưu"}</button>
    </div>
  );
}

/** Browser agent tools (WebMCP). Staged changes still need a visible save. */
function useWebMcp(workspace: WorkspaceApi) {
  const { latest, loaded, commit } = workspace;
  useEffect(() => {
    const ctx = (document as Document & { modelContext?: { registerTool: (tool: unknown, opts: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "read_learning_state",
        description: "Read current learning progress and draft status.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({ loaded, done: latest.current.done, notes: latest.current.notes.length, logs: latest.current.logs.length }),
      },
      {
        name: "stage_completed_tasks",
        description: "Mark known learning task IDs complete in the visible draft. Use the save button in the interface to persist.",
        inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 } }, required: ["ids"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const ids = (input as { ids?: unknown })?.ids;
          if (!Array.isArray(ids) || !ids.length || ids.length > 8 || !ids.every((id) => typeof id === "string" && tasks.some((task) => task.id === id))) throw Error("Invalid task IDs");
          if (!loaded) throw Error("Workspace not loaded");
          await commit((current) => ({ ...current, done: [...new Set([...current.done, ...ids])] }), false);
          return { completed: ids, persisted: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(ctx.registerTool(tool, { signal: lifecycle.signal })).catch(console.error);
      } catch (cause) {
        console.error(cause);
      }
    }
    return () => lifecycle.abort();
  }, [latest, loaded, commit]);
}
