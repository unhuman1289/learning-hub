"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Flag,
  House,
  Leaf,
  NotebookPen,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import AuthControls from "../components/auth-controls";
import DailyLearning from "./daily-learning";
import { googleDocs, googleDocsFolder } from "./google-docs";
import { getLessonDetail, type LessonDetail, type LessonSource } from "./lesson-content";
import { lessons, projects, tasks, tracks } from "./content";

type TrackDefinition = (typeof tracks)[number];
type Lesson = (typeof lessons)[number];
type Note = { id: string; title: string; url: string; track: string; body: string };
type Log = { id: string; kind: string; track: string; date: string; body: string; due?: string; minutes?: number };
type Data = { done: string[]; notes: Note[]; logs: Log[]; starts: Record<string, string>; daily: number };
type View = "today" | "learn" | "library";

const empty: Data = { done: [], notes: [], logs: [], starts: {}, daily: 240 };
const nav = [
  ["today", "Hôm nay", "Today", "Heute", House],
  ["learn", "Học", "Learn", "Lernen", BookOpen],
  ["library", "Tài liệu", "Library", "Bibliothek", NotebookPen],
] as const;

const taskLesson: Record<string, string> = {
  a1: "swarm",
  a2: "deploy",
  m1: "seq",
  c1: "mitral",
  c2: "mitral",
  d1: "email",
  d2: "speaking",
  b1: "play",
};

export default function Home({ userEmail, userRole }: { userEmail: string; userRole: string }) {
  const [view, setView] = useState<View>("today");
  const [lang, setLang] = useState(1);
  const [filter, setFilter] = useState("Tất cả");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Data>(empty);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dailyDraft, setDailyDraft] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [draft, setDraft] = useState("");
  const [rubricOpen, setRubricOpen] = useState(false);
  const [answerMessage, setAnswerMessage] = useState("");
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [track, setTrack] = useState("AI");
  const [kind, setKind] = useState("Buổi học");
  const [due, setDue] = useState("");
  const [minutes, setMinutes] = useState(30);
  const latest = useRef<Data>(empty);
  const readiness = useRef(false);
  readiness.current = loaded;

  const t = (vi: string, en: string, de: string) => [vi, en, de][lang - 1];

  useEffect(() => {
    const syncLessonFromUrl = () => {
      const id = new URLSearchParams(window.location.search).get("lesson");
      const match = lessons.find((lesson) => lesson.id === id) ?? null;
      setSelected(match);
      if (match) setView("learn");
    };
    syncLessonFromUrl();
    window.addEventListener("popstate", syncLessonFromUrl);
    return () => window.removeEventListener("popstate", syncLessonFromUrl);
  }, []);

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
        execute: () => ({ loaded: readiness.current, done: latest.current.done, notes: latest.current.notes.length, logs: latest.current.logs.length }),
      },
      {
        name: "stage_completed_tasks",
        description: "Mark known learning task IDs complete in the visible draft. Use Save changes in the interface to persist.",
        inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 } }, required: ["ids"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const ids = (input as { ids?: unknown })?.ids;
          if (!Array.isArray(ids) || !ids.length || ids.length > 8 || !ids.every((id) => typeof id === "string" && tasks.some((task) => task.id === id))) throw Error("Invalid task IDs");
          if (!readiness.current) throw Error("Workspace not loaded");
          const next = { ...latest.current, done: [...new Set([...latest.current.done, ...ids])] };
          update(next);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
  }, []);

  useEffect(() => {
    if (!form) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector("[role=dialog]") as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setForm(false);
      if (event.key === "Tab" && dialog) {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled),input,textarea,select,a[href]"));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [form]);

  useEffect(() => {
    function leave(event: BeforeUnloadEvent) {
      if (dirty || draft.trim()) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, draft]);

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const result = await response.json() as { data?: Data; revision: number; error: string };
      if (!response.ok) throw Error(result.error);
      const next = result.data ? { ...empty, ...result.data } : empty;
      latest.current = next;
      setData(next);
      setRevision(result.revision);
      setLoaded(true);
      setDirty(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  function update(next: Data) {
    latest.current = next;
    setData(next);
    setDirty(true);
  }

  async function save(snapshot = latest.current): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, data: snapshot }),
      });
      const result = await response.json() as { data?: Data; revision: number; error: string };
      if (!response.ok) throw Error(result.error);
      setRevision(result.revision);
      if (latest.current === snapshot) setDirty(false);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    const current = latest.current;
    update({ ...current, done: current.done.includes(id) ? current.done.filter((item) => item !== id) : [...current.done, id] });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...latest.current }, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "learning-hub-draft.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  function openForm(type: string) {
    setKind(type);
    setTitle("");
    setUrl("");
    setBody("");
    setEditing("");
    setDue("");
    setMinutes(30);
    setForm(true);
  }

  function add() {
    if (!body.trim() && kind !== "Tài liệu") return;
    if (kind === "Tài liệu") {
      if (!title.trim()) return;
      if (url) {
        try {
          const parsed = new URL(url);
          if (!["https:", "http:"].includes(parsed.protocol)) throw Error();
        } catch {
          setError("Đường dẫn cần bắt đầu bằng https:// hoặc http://");
          return;
        }
      }
      const note = { id: editing || crypto.randomUUID(), title: title.trim(), url, track, body };
      const current = latest.current;
      update({ ...current, notes: editing ? current.notes.map((item) => item.id === editing ? note : item) : [note, ...current.notes] });
    } else {
      const log: Log = { id: crypto.randomUUID(), kind, track, date: new Date().toISOString(), body, due: due || undefined, minutes: kind === "Buổi học" ? minutes : undefined };
      update({ ...latest.current, logs: [log, ...latest.current.logs] });
    }
    setForm(false);
    setError("");
  }

  function openLesson(lesson: Lesson) {
    setSelected(lesson);
    setView("learn");
    setRubricOpen(false);
    setAnswerMessage("");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("lesson", lesson.id);
    window.history.replaceState({}, "", nextUrl);
  }

  function closeLesson() {
    if (draft.trim() && !window.confirm("Câu trả lời này chưa được lưu. Đóng bài học?")) return;
    setSelected(null);
    setDraft("");
    setAnswerMessage("");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("lesson");
    window.history.replaceState({}, "", nextUrl);
  }

  async function saveLessonAnswer() {
    if (!selected || !draft.trim()) return;
    const log: Log = {
      id: crypto.randomUUID(),
      kind: "Câu trả lời bài học",
      track: selected.track,
      date: new Date().toISOString(),
      body: `${selected.title}\n\n${draft.trim()}`,
    };
    const next = { ...latest.current, logs: [log, ...latest.current.logs] };
    update(next);
    const saved = await save(next);
    if (saved) {
      setDraft("");
      setAnswerMessage("Câu trả lời đã được lưu vào nhật ký chung.");
    }
  }

  async function saveLessonCompletion() {
    if (!selected) return;
    const current = latest.current;
    const next = {
      ...current,
      done: current.done.includes(selected.id) ? current.done.filter((id) => id !== selected.id) : [...current.done, selected.id],
    };
    update(next);
    await save(next);
  }

  function goView(next: View): boolean {
    if ((selected && draft.trim() || dailyDraft) && !window.confirm("Câu trả lời chưa được lưu. Rời phần đang học và bỏ bản nháp?")) return false;
    setSelected(null);
    setDraft("");
    setDailyDraft(false);
    setView(next);
    setSearch("");
    setFilter("Tất cả");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("lesson");
    window.history.replaceState({}, "", nextUrl);
    return true;
  }

  const visible = (item: { track: string; title: string }) =>
    (filter === "Tất cả" || item.track === filter) && (!search || item.title.toLowerCase().includes(search.toLowerCase()));
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const studiedToday = data.logs
    .filter((log) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(log.date)) === todayKey)
    .reduce((total, log) => total + (log.minutes || 0), 0);
  const date = new Intl.DateTimeFormat(lang === 1 ? "vi-VN" : lang === 2 ? "en-GB" : "de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date());
  const activeNav = nav.find((item) => item[0] === view);
  const activeLabel = selected?.title ?? (activeNav ? activeNav[lang] as string : "Hôm nay");

  return (
    <div className="shell">
      <aside>
        <button className="brand" onClick={() => goView("today")}>
          <span className="brand-icon"><House size={21} /></span>
          <span>Learning Hub<small>CẢ NHÀ CÙNG HỌC</small></span>
        </button>
        <div className="private"><span /> {t("Không gian học chung", "Shared learning space", "Gemeinsamer Lernraum")}</div>
        <nav aria-label="Điều hướng chính">
          {nav.map(([id, vi, en, de, Icon]) => (
            <button key={id} className={view === id && !selected ? "active" : ""} onClick={() => goView(id)}>
              <Icon size={19} /><span>{t(vi, en, de)}</span>{view === id && !selected && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="side-tracks">
          <p>{t("CÁC MẢNG HỌC", "LEARNING TRACKS", "LERNBEREICHE")}</p>
          {tracks.map((item) => (
            <button key={item.id} onClick={() => { if (goView("learn")) setFilter(item.id); }}>
              <i style={{ background: item.color }} />{item.id === "AI" ? "AI & Coding" : item.id === "MTB" ? "MTB & Sequencing" : item.id === "Bột" ? "Bột & Gia đình" : item.id}
            </button>
          ))}
        </div>
        <div className="side-bottom"><Leaf size={22} /><p>Học có hướng.<br />Lớn lên cùng nhau.</p><small>Tiến độ dùng chung</small></div>
      </aside>

      <div className="main">
        <header>
          <div className="crumb">Learning Hub <span>/</span> {activeLabel}</div>
          <div className="controls">
            <AuthControls email={userEmail} />
            <select aria-label="Ngôn ngữ giao diện" value={lang} onChange={(event) => setLang(Number(event.target.value))}>
              <option value={1}>VI</option><option value={2}>EN</option><option value={3}>DE</option>
            </select>
          </div>
        </header>

        <main>
          <div className="status">
            <span role="status">{!loaded ? error ? "Chưa tải được dữ liệu" : "Đang tải dữ liệu…" : saving ? "Đang lưu…" : dirty ? "Có thay đổi chưa lưu" : "Dữ liệu đã đồng bộ"}</span>
            <div>
              {dirty && <button disabled={saving || !loaded} onClick={() => void save()}>Lưu thay đổi</button>}
              <button className="icon-button" aria-label="Xuất bản sao ghi chú hiện tại" onClick={exportData}><Download size={16} /></button>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error} {error === "Sign in required" && <Link href="/login">Đăng nhập Learning Hub</Link>}
              <button onClick={() => void load()}>Tải lại dữ liệu</button><button onClick={exportData}>Xuất bản nháp</button>
            </div>
          )}

          {selected ? (
            <LessonReader
              lesson={selected}
              detail={getLessonDetail(selected.id)}
              completed={data.done.includes(selected.id)}
              busy={saving}
              answer={draft}
              answerMessage={answerMessage}
              rubricOpen={rubricOpen}
              onBack={closeLesson}
              onAnswer={setDraft}
              onReveal={() => setRubricOpen((open) => !open)}
              onSaveAnswer={() => void saveLessonAnswer()}
              onToggleComplete={() => void saveLessonCompletion()}
            />
          ) : view === "today" ? (
            <>
              <div className="heading dashboard-heading">
                <p className="eyebrow">{date}</p>
                <h1>Mỗi ngày, một bước rõ ràng.</h1>
                <p>Bắt đầu từ bài đang học, tiếp tục ở đúng chỗ đã dừng. Bài tập đã chuẩn bị sẵn; câu trả lời và tiến độ chỉ đổi khi có tương tác.</p>
              </div>
              <DailyLearning isAdmin={userRole === "admin"} onUnsavedChange={setDailyDraft} />

              <section className="today-top dashboard-progress">
                <div className="focus">
                  <div className="section-line"><span className="eyebrow">HÔM NAY</span><span className="pill">Europe/Berlin</span></div>
                  <h2>Thời gian học đã ghi</h2>
                  <div className="study-time"><strong>{studiedToday}<small> / 240 phút mục tiêu chung</small></strong><progress max={240} value={Math.min(studiedToday, 240)} /></div>
                  <p className="muted">Chỉ cộng thời gian trong các buổi học đã ghi, không lấy thời lượng gợi ý của bài làm thay số thực tế.</p>
                  <button className="primary" disabled={!loaded} onClick={() => openForm("Buổi học")}><Plus size={16} /> Ghi buổi học</button>
                </div>
                <div className="rhythm">
                  <span className="eyebrow">MỤC TIÊU HỌC CHUNG</span>
                  <h2>4 <span>giờ / ngày</span></h2>
                  <p>Chia thành các khoảng ngắn. Mỗi người có thể tiếp tục ở cùng những mảng và bài học.</p>
                  <div className="rhythm-divider" />
                  <strong>{data.done.length}<small> mục đã đánh dấu xong</small></strong>
                  <button onClick={() => goView("learn")}>Xem giáo trình và mục tiêu <ArrowUpRight size={17} /></button>
                </div>
              </section>

              <section className="dashboard-goals">
                <div className="section-line"><div><h2>Hai đầu ra đang theo đuổi</h2><p className="muted">Cùng học; mỗi người có thể đóng góp vào các bước khác nhau.</p></div><button className="text-button" onClick={() => goView("learn")}>Mở mục tiêu <ArrowUpRight size={16} /></button></div>
                <div className="goal-list">
                  {projects.map((project) => {
                    const done = project.phases.filter((_, index) => data.done.includes(`${project.id}-${index}`)).length;
                    return (
                      <button className="goal-row" key={project.id} onClick={() => { goView("learn"); setFilter(project.track); }}>
                        <span className="goal-icon"><Flag size={18} /></span>
                        <span className="goal-copy"><strong>{project.title}</strong><small>{project.goal}</small></span>
                        <span className="pill">{done}/{project.phases.length} mốc</span><ArrowUpRight size={16} />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="dashboard-journal">
                <div className="section-line"><div><h2>Ghi chép và ôn tập</h2><p className="muted">Câu trả lời bài học, buổi học, quan sát và câu hỏi nghiên cứu đã lưu.</p></div><button className="text-button" disabled={!loaded} onClick={() => openForm("Review tuần")}><Plus size={16} /> Ghi lại</button></div>
                <div className="journal-tools">
                  {["Review tuần", "Quan sát Bột", "Lỗi tiếng Đức", "Quyết định dự án"].map((item) => (
                    <button key={item} disabled={!loaded} onClick={() => { if (item.includes("Bột")) setTrack("Bột"); if (item.includes("Đức")) setTrack("Deutsch"); openForm(item); }}><Plus size={14} />{item}</button>
                  ))}
                </div>
                {data.logs.length ? (
                  <div className="library-list journal-list">
                    {data.logs.slice(0, 5).map((log) => <LogEntry key={log.id} log={log} isReviewed={data.done.includes(log.id)} onToggle={() => toggle(log.id)} />)}
                    {data.logs.length > 5 && <details className="older-logs"><summary>Xem thêm {data.logs.length - 5} ghi chép</summary>{data.logs.slice(5).map((log) => <LogEntry key={log.id} log={log} isReviewed={data.done.includes(log.id)} onToggle={() => toggle(log.id)} />)}</details>}
                  </div>
                ) : <p className="empty">Chưa có ghi chép. Sau khi làm bài, lưu một câu trả lời hoặc ghi điều còn vướng.</p>}
              </section>
            </>
          ) : view === "learn" ? (
            <>
              <div className="heading">
                <h1>Học</h1>
                <p>Giáo trình được chuẩn bị trước. Mở bài, làm câu hỏi, xem rubric tự kiểm tra rồi lưu câu trả lời hoặc đánh dấu hoàn thành.</p>
              </div>
              <Filters tracks={tracks} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} />
              <div className="path-diagram"><span>Kiến thức nền</span><ChevronRight /><span>Ví dụ</span><ChevronRight /><span>Thực hành</span><ChevronRight /><span>Ôn lại / áp dụng vào dự án</span></div>
              <section className="curriculum-section">
                <div className="section-line"><div><h2>Bài học</h2><p className="muted">Bài được lưu sẵn; tương tác chỉ cập nhật tiến độ và câu trả lời.</p></div><span className="pill">{lessons.filter(visible).length} bài</span></div>
                <div className="curriculum-list">
                  {lessons.filter(visible).map((lesson) => {
                    const detail = getLessonDetail(lesson.id);
                    return (
                      <Link className="curriculum-row" key={lesson.id} href={`/?lesson=${encodeURIComponent(lesson.id)}`} onClick={(event) => { event.preventDefault(); openLesson(lesson); }}>
                        <span className="curriculum-state">{data.done.includes(lesson.id) ? <Check size={17} /> : <BookOpen size={17} />}</span>
                        <span className="curriculum-copy">
                          <small>{lesson.track} · {lesson.level} · {lesson.time} phút</small>
                          <strong>{lesson.title}</strong>
                          <span>{detail?.objective ?? lesson.body}</span>
                        </span>
                        <span className="curriculum-status">{data.done.includes(lesson.id) ? "Đã xong" : "Mở bài"}<ArrowUpRight size={16} /></span>
                      </Link>
                    );
                  })}
                </div>
                {!lessons.filter(visible).length && <p className="empty">Không tìm thấy bài phù hợp.</p>}
              </section>

              <section className="practice-bank">
                <div className="section-line"><div><h2>Bài thực hành ngắn</h2><p className="muted">Các bài tùy chọn nằm ở đây; Dashboard chỉ ưu tiên bài học hiện tại.</p></div></div>
                <div className="task-list">
                  {tasks.filter(visible).map((task) => (
                    <div className="task" key={task.id}>
                      <button disabled={!loaded} className={`check ${data.done.includes(task.id) ? "checked" : ""}`} aria-label={`${data.done.includes(task.id) ? "Bỏ đánh dấu" : "Đánh dấu xong"}: ${task.title}`} onClick={() => toggle(task.id)}><Check size={15} /></button>
                      <div><span className="label" style={{ color: tracks.find((item) => item.id === task.track)?.color }}>{task.track} · {task.minutes} phút</span><h3>{task.title}</h3><p>{task.deliver}</p></div>
                      <button className="icon-button" aria-label="Mở bài học liên quan" onClick={() => { const lesson = lessons.find((item) => item.id === taskLesson[task.id]); if (lesson) openLesson(lesson); }}><ArrowUpRight size={18} /></button>
                    </div>
                  ))}
                </div>
              </section>

              {projects.filter((project) => filter === "Tất cả" || project.track === filter).map((project) => (
                <section className="project" key={project.id}>
                  <div className="section-line"><span className="label">{project.tag}</span><span className="pill">{project.phases.filter((_, index) => data.done.includes(`${project.id}-${index}`)).length}/{project.phases.length} mốc</span></div>
                  <h2>{project.title}</h2><p className="project-goal">{project.goal}</p>
                  <label className="start">Ngày bắt đầu <input disabled={!loaded} type="date" value={data.starts[project.id] || ""} onChange={(event) => update({ ...latest.current, starts: { ...latest.current.starts, [project.id]: event.target.value } })} /></label>
                  <div className="phases">{project.phases.map(([phase, description], index) => (
                    <div key={phase} className={data.done.includes(`${project.id}-${index}`) ? "complete" : ""}>
                      <div className="phase-head"><span>0{index + 1}</span><button disabled={!loaded} className={`check ${data.done.includes(`${project.id}-${index}`) ? "checked" : ""}`} onClick={() => toggle(`${project.id}-${index}`)} aria-label={`Hoàn thành ${phase}`}><Check size={16} /></button></div>
                      <h3>{phase}</h3><p>{description}</p>
                    </div>
                  ))}</div>
                  <div className="project-notes"><p><strong>Cần làm rõ</strong> {project.open}</p><p>{project.boundary}</p></div>
                  <button className="text-button" onClick={() => { setTrack(project.track); openForm("Quyết định dự án"); }}><Plus size={16} /> Ghi quyết định / câu hỏi mở</button>
                </section>
              ))}

              {(filter === "Tất cả" || filter === "Deutsch") && <section className="language-goal"><h2>Deutsch: A2 → B2 → C2</h2><p>B2 trong một năm cho công việc và chứng chỉ; C2 là mục tiêu dài hạn. A2 là tự đánh giá, cần đối chiếu bằng bài mẫu. Ưu tiên viết và nói.</p><Link className="text-button" href="/?lesson=email" onClick={(event) => { event.preventDefault(); const lesson = lessons.find((item) => item.id === "email"); if (lesson) openLesson(lesson); }}>Mở bài viết email <ArrowUpRight size={16} /></Link></section>}
              <section className="track-summary"><h2>Năm mảng học dùng chung</h2><div className="track-grid">{tracks.map((item) => <button className="track-card" key={item.id} style={{ "--track": item.color } as CSSProperties} onClick={() => { setFilter(item.id); setSearch(""); }}><span className="label">{item.id}</span><h3>{item.title}</h3><p>{item.sub}</p><span className="track-foot">{lessons.filter((lesson) => lesson.track === item.id).length} bài học <ArrowUpRight size={16} /></span></button>)}</div></section>
            </>
          ) : (
            <>
              <div className="heading heading-action"><div><h1>Tài liệu</h1><p>Docs giữ bản dài để chỉnh sửa; Hub giữ liên kết, ghi chú ngắn và tiến độ học.</p></div><button className="primary" disabled={!loaded} onClick={() => openForm("Tài liệu")}><Plus size={17} /> Thêm tài liệu</button></div>
              <Filters tracks={tracks} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} />
              <div className="docs-guide"><BookOpen size={25} /><div><h3>Một bản gốc, một nơi chỉnh sửa.</h3><p>Trong Docs: câu hỏi → sơ đồ → tóm tắt bằng lời mình → nguồn đã đọc → câu hỏi mở → bước tiếp theo. Đồng bộ Docs hai chiều chưa được bật; nội dung và tiến độ ở hai nơi hiện cập nhật riêng.</p></div></div>
              <section className="google-docs-catalog">
                <div className="section-line"><div><h2>Google Docs</h2><p className="muted">Các sổ học đã tạo; quyền truy cập vẫn do Drive quản lý.</p></div><a href={googleDocsFolder} target="_blank" rel="noopener noreferrer">Mở thư mục <ArrowUpRight size={16} /></a></div>
                <div className="google-docs-grid">{googleDocs.filter(visible).map((doc) => <a className="google-doc-card" key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"><span className="label">{doc.track}</span><h3>{doc.title.replace("Learning Hub — ", "")}</h3><p>{doc.description}</p><span>Mở Google Docs <ArrowUpRight size={16} /></span></a>)}</div>
              </section>
              <div className="library-list">{data.notes.filter(visible).map((note) => <article key={note.id}><span className="label">{note.track}</span><h2>{note.title}</h2><p className="prewrap">{note.body}</p><div>{note.url && <a href={note.url} target="_blank" rel="noopener noreferrer">Mở tài liệu <ArrowUpRight size={15} /></a>}<button onClick={() => { setKind("Tài liệu"); setEditing(note.id); setTitle(note.title); setUrl(note.url); setBody(note.body); setTrack(note.track); setForm(true); }}>Chỉnh sửa</button></div></article>)}</div>
              {!data.notes.filter(visible).length && !googleDocs.filter(visible).length && <div className="empty large"><BookOpen size={32} /><h3>Thư viện đang chờ ghi chú đầu tiên.</h3><p>Thêm link Docs, paper đã đọc hoặc ghi chú ngắn. Mỗi nguồn mới nên ghi rõ phần đã xem và ngày truy cập.</p></div>}
            </>
          )}

          {!selected && <footer className="page-footer"><span>Learning Hub · Cả nhà cùng học</span><span>Kiến thức, ghi chú và tiến độ dùng chung</span></footer>}
        </main>
      </div>

      {form && (
        <div className="overlay" onClick={() => setForm(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="form-title" onClick={(event) => event.stopPropagation()}>
            <button className="close" aria-label="Đóng" onClick={() => setForm(false)}><X /></button>
            <h1 id="form-title">{kind}</h1>
            <label>Mảng học<select value={track} onChange={(event) => setTrack(event.target.value)}>{tracks.map((item) => <option key={item.id}>{item.id}</option>)}</select></label>
            {kind === "Tài liệu" && <><label>Tên tài liệu<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></label><label>Link Google Docs / nguồn gốc<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/…" maxLength={2000} /></label></>}
            <label>{kind === "Tài liệu" ? "Ghi chú: câu hỏi, nội dung chính, bước tiếp theo" : "Nội dung"}<textarea value={body} maxLength={10000} onChange={(event) => setBody(event.target.value)} placeholder={kind === "Review tuần" ? "Đã hiểu:\nĐã làm:\nCòn vướng / bước tiếp theo:" : kind === "Quyết định dự án" ? "Hiện trạng:\nĐã quyết định:\nCâu hỏi mở:\nBước tiếp theo:" : kind.includes("Bột") ? "Ngày / bối cảnh:\nQuan sát cụ thể:\nĂn · ngủ · vận động · giao tiếp:\nĐiều muốn thử tiếp:" : "Ví dụ → thử → điều hiểu được → bước tiếp theo"} /></label>
            {kind === "Buổi học" && <label>Thời lượng thực tế (phút)<input type="number" min={1} max={1440} value={minutes} onChange={(event) => setMinutes(Math.min(1440, Math.max(1, Number(event.target.value) || 1)))} /></label>}
            {kind !== "Tài liệu" && <label>Ngày ôn (tùy chọn)<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>}
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={!loaded || (kind === "Tài liệu" ? !title.trim() : !body.trim())} onClick={add}>Thêm vào bản nháp</button>
            <p className="muted small">Sau khi thêm, bấm “Lưu thay đổi” để đồng bộ. Không nhập dữ liệu định danh bệnh nhân.</p>
          </section>
        </div>
      )}
    </div>
  );
}

function LessonReader({
  lesson,
  detail,
  completed,
  busy,
  answer,
  answerMessage,
  rubricOpen,
  onBack,
  onAnswer,
  onReveal,
  onSaveAnswer,
  onToggleComplete,
}: {
  lesson: Lesson;
  detail: LessonDetail | null;
  completed: boolean;
  busy: boolean;
  answer: string;
  answerMessage: string;
  rubricOpen: boolean;
  onBack: () => void;
  onAnswer: (value: string) => void;
  onReveal: () => void;
  onSaveAnswer: () => void;
  onToggleComplete: () => void;
}) {
  const sections = detail?.sections ?? [
    { heading: "Ý chính", text: lesson.body },
    { heading: "Ví dụ", text: lesson.example },
  ];
  const questions = detail?.questions ?? [
    { question: lesson.question, rubric: lesson.answer },
    { question: "Nêu một giới hạn hoặc điều cần kiểm tra tiếp theo.", rubric: "Nêu một dữ kiện còn thiếu, nguồn cần mở hoặc giả định cần kiểm tra trước khi kết luận." },
  ];
  const sources: LessonSource[] = detail?.sources ?? (lesson.source ? [{
    title: lesson.sourceName,
    url: lesson.source,
    readScope: "Liên kết có trong bản xuất hiện tại; phạm vi đọc chưa được ghi nhận trong bài này.",
    retrievedAt: "",
    publishedAt: null,
  }] : []);

  return (
    <article className="lesson-reader">
      <div className="reader-top"><button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Quay lại Học</button><span className="label">{lesson.track} · {lesson.level} · {lesson.time} phút</span></div>
      <h1>{lesson.title}</h1>
      <section className="reader-objective"><strong>Mục tiêu bài học</strong><p>{detail?.objective ?? lesson.body}</p></section>
      <div className="reader-columns">
        <div className="reader-main">
          {detail?.prerequisites.length ? <section className="reader-prerequisites"><h2>Trước khi bắt đầu</h2><ul>{detail.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          <div className="reader-prose">{sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.text}</p></section>)}</div>
          {detail?.diagram && <figure className="reader-diagram"><figcaption>Sơ đồ tư duy</figcaption><pre>{detail.diagram}</pre></figure>}
          <section className="reader-exercise"><h2>Thực hành</h2><p>{detail?.exercise ?? lesson.question}</p><div className="reader-output"><strong>Đầu ra cần có</strong><p>{detail?.deliverable ?? lesson.answer}</p></div></section>
          <section className="reader-quiz">
            <div className="section-line"><div><h2>Tự kiểm tra</h2><p className="muted">Trả lời trước, rồi mở rubric. Hub không tự chấm và không suy đoán mức hiểu.</p></div></div>
            <ol>{questions.map((item, index) => <li key={`${index}-${item.question}`}><p>{item.question}</p>{rubricOpen && <div className="feedback"><strong>Rubric tự kiểm tra</strong><p>{item.rubric}</p></div>}</li>)}</ol>
            <button className="text-button" onClick={onReveal}>{rubricOpen ? "Ẩn rubric" : "Mở rubric sau khi đã thử"}<ChevronRight size={16} /></button>
            <label className="reader-answer">Câu trả lời / điều còn vướng<textarea value={answer} maxLength={18000} onChange={(event) => onAnswer(event.target.value)} placeholder="Viết bằng lời của bạn, hoặc ghi câu hỏi muốn trao đổi…" /></label>
            <div className="reader-actions"><button className="primary" disabled={busy || !answer.trim()} onClick={onSaveAnswer}>Lưu câu trả lời</button><button className="secondary" disabled={busy} onClick={onToggleComplete}>{completed ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu bài học đã xong"}</button></div>
            {answerMessage && <p className="save-confirmation" role="status">{answerMessage}</p>}
            {busy && <p className="muted" role="status">Đang lưu lên máy chủ…</p>}
          </section>
          {detail?.nextTopic && <section className="reader-next"><strong>Bài tiếp theo gợi ý</strong><p>{detail.nextTopic}</p></section>}
          {detail?.note && <p className="reader-note">{detail.note}</p>}
          <section className="reader-sources"><h2>Nguồn và phạm vi đã đọc</h2>{sources.length ? sources.map((source) => <article key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <ArrowUpRight size={15} /></a><p>{source.readScope}</p><small>{source.publishedAt ? `Ngày xuất bản: ${source.publishedAt} · ` : ""}{source.retrievedAt ? `Truy cập: ${new Date(source.retrievedAt).toLocaleString("vi-VN", { timeZone: "UTC", hour12: false })} UTC` : "Chưa ghi nhận thời điểm truy cập"}</small></article>) : <p>Chưa gắn nguồn đã xác minh cho bài này.</p>}</section>
        </div>
        <aside className="reader-aside"><span>Ghi nhớ</span><p>Học phần đã chuẩn bị sẵn. Câu trả lời, rubric và tiến độ chỉ cập nhật khi bạn thực hiện thao tác.</p><p>Không nhập thông tin định danh bệnh nhân vào Learning Hub.</p></aside>
      </div>
    </article>
  );
}

function LogEntry({ log, isReviewed, onToggle }: { log: Log; isReviewed: boolean; onToggle: () => void }) {
  const due = log.due && log.due <= new Date().toISOString().slice(0, 10);
  return (
    <article>
      <div className="section-line"><span className="label">{log.track} · {log.kind}</span><small>{new Date(log.date).toLocaleDateString("vi-VN")}{log.minutes ? ` · ${log.minutes} phút` : ""}</small></div>
      <p className="prewrap">{log.body}</p>
      {log.due && <div className="review-due"><RotateCcw size={15} /> Ôn: {log.due} {due && !isReviewed && <span className="pill">Đến hạn</span>}<button onClick={onToggle}>{isReviewed ? "Đã ôn · Bỏ đánh dấu" : "Đánh dấu đã ôn"}</button></div>}
    </article>
  );
}

function Filters({ tracks: trackList, filter, setFilter, search, setSearch }: {
  tracks: TrackDefinition[];
  filter: string;
  setFilter: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="filters">
      <div>{["Tất cả", ...trackList.map((item) => item.id)].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
      <label className="search"><Search size={16} /><input aria-label="Tìm bài học và tài liệu" placeholder="Tìm bài học…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
  );
}
