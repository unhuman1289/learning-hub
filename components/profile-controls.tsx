"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PaperDialog } from "../app/hub/paper-dialog";
import { ProfileSettings } from "../app/hub/profile-settings";

type Profile = { id: string; displayName: string; avatar: string; role: "adult" | "child" };

async function post<T = unknown>(body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Mất kết nối. Thử lại khi có mạng.");
  }
  const value = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(value?.error || "Chưa lưu được.");
  return value as T;
}

function shownEmoji(avatar: string) {
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(avatar) ? avatar : "🙂";
}

function Badge({ avatar, size = "size-8 text-lg" }: { avatar: string; size?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid ${size} shrink-0 place-items-center rounded-full bg-paper/85 leading-none`}
    >
      {shownEmoji(avatar)}
    </span>
  );
}

function EmojiField({ value, onChange, disabled, inputRef }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="grid justify-items-start gap-1 text-sm">
      Emoji
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={32}
        autoComplete="off"
        spellCheck={false}
        placeholder="🙂"
        className="min-h-11 w-24 rounded border border-line bg-paper px-3 text-xl text-ink"
      />
    </label>
  );
}

function EmojiForm({ avatar, id, name, onSaved, onClose }: {
  avatar: string; id?: string; name: string; onSaved: (avatar: string) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(avatar), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ avatar: string }>({ action: "avatar", id, avatar: value });
      onSaved(result.avatar);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      aria-label={`Đổi emoji của ${name}`}
      className="grid gap-3 text-ink"
      onSubmit={(event) => { event.preventDefault(); void save(); }}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); } }}
    >
      <p className="font-semibold">Emoji của {name}</p>
      <EmojiField value={value} onChange={setValue} disabled={busy} inputRef={input} />
      <p className="text-sm text-muted">Nhập hoặc dán một emoji. Để trống để dùng mặc định.</p>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="brick min-h-11 px-4 text-sm font-semibold disabled:opacity-50">{busy ? "Đang lưu…" : "Lưu emoji"}</button>
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 px-3 text-sm underline">Hủy</button>
      </div>
    </form>
  );
}

/** "Ai đang học?": pick a profile on this device. No passwords: the household gate is in front of the whole app. */
export function ProfilePicker() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null),
    [manage, setManage] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [role, setRole] = useState<"adult" | "child">("adult"),
    [avatar, setAvatar] = useState(""),
    [editing, setEditing] = useState<Profile | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/profiles", { cache: "no-store" })
      .then(async (r) => {
        const value = (await r.json()) as { profiles: Profile[]; manage: boolean; error?: string };
        if (!r.ok) throw new Error(value.error || "Chưa tải được hồ sơ.");
        if (live) {
          setProfiles(value.profiles);
          setManage(value.manage);
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version]);
  async function run(body: unknown, after?: () => void) {
    setBusy(true);
    setError("");
    try {
      await post(body);
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <h1 className="font-hand text-4xl">Ai đang học?</h1>
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
      {!profiles && !error && <p role="status">Đang tải hồ sơ…</p>}
      {profiles && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run({ action: "select", id: p.id }, () => window.location.reload())}
                className="grid w-full justify-items-center gap-2 rounded-lg border border-line bg-paper p-4 hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <Badge avatar={p.avatar} size="size-14 text-2xl" />
                <span className="font-semibold">{p.displayName}</span>
                <span className="text-sm text-muted">{p.role === "child" ? "Trẻ em" : "Người lớn"}</span>
              </button>
              {manage && (
                <button type="button" onClick={() => setEditing(p)} aria-label={`Đổi emoji của ${p.displayName}`} className="min-h-11 w-full text-sm text-accent underline">
                  Đổi emoji
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {profiles && !profiles.length && <p>Chưa có hồ sơ nào. Bật chế độ quản lý để thêm hồ sơ đầu tiên.</p>}
      <section className="grid gap-3 border-t border-line pt-4">
        {!manage ? (
          <ManageButton busy={busy} onManage={(pin) => run({ action: "manage", pin }, () => setVersion((v) => v + 1))} />
        ) : (
          <>
            <p className="text-sm text-muted">Đang ở chế độ quản lý.</p>
            {editing && (
              <EmojiForm
                key={editing.id}
                id={editing.id}
                name={editing.displayName}
                avatar={editing.avatar}
                onSaved={(icon) => {
                  setProfiles((current) => current?.map((p) => p.id === editing.id ? { ...p, avatar: icon } : p) ?? null);
                  setEditing(null);
                }}
                onClose={() => setEditing(null)}
              />
            )}
            {!adding ? (
              <button type="button" className="justify-self-start underline" onClick={() => setAdding(true)}>
                Thêm hồ sơ
              </button>
            ) : (
              <form
                className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({ action: "create", displayName: name, role, avatar }, () => {
                    setAdding(false);
                    setName("");
                    setAvatar("");
                    setVersion((v) => v + 1);
                  });
                }}
              >
                <label className="grid gap-1 text-sm">
                  Tên hiển thị
                  <input
                    required
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded border border-line bg-paper p-2"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Vai trò
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "adult" | "child")}
                    className="rounded border border-line bg-paper p-2"
                  >
                    <option value="adult">Người lớn</option>
                    <option value="child">Trẻ em</option>
                  </select>
                </label>
                <EmojiField value={avatar} onChange={setAvatar} disabled={busy} />
                <button disabled={busy} className="rounded-md border border-line bg-paper px-3 py-2 disabled:opacity-50">
                  Lưu
                </button>
              </form>
            )}
            <button
              type="button"
              className="justify-self-start text-sm underline"
              onClick={() => void run({ action: "unmanage" }, () => { setEditing(null); setVersion((v) => v + 1); })}
            >
              Thoát chế độ quản lý
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function ManageButton({ busy, onManage }: { busy: boolean; onManage: (pin: string | undefined) => void }) {
  const [asking, setAsking] = useState(false),
    [pin, setPin] = useState("");
  if (!asking)
    return (
      <button type="button" className="justify-self-start text-sm underline" onClick={() => setAsking(true)}>
        Chế độ quản lý
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onManage(pin || undefined);
      }}
    >
      <label className="grid gap-1 text-sm">
        PIN quản lý (bỏ trống nếu chưa đặt)
        <input
          inputMode="numeric"
          pattern="\d{0,8}"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-32 rounded border border-line bg-paper p-2"
        />
      </label>
      <button disabled={busy} className="rounded-md border border-line bg-paper px-3 py-2 disabled:opacity-50">
        Bật
      </button>
    </form>
  );
}

/** Header controls in profile mode: who is studying, switch person, manage mode on/off. */
export function ProfileControls({ name, manage, initialAvatar, settingsLearner }: { name: string; manage: boolean; initialAvatar: string; settingsLearner?: string }) {
  const [busy, setBusy] = useState(false), [editing, setEditing] = useState(false), [avatar, setAvatar] = useState(initialAvatar);
  const editorId = useId();
  const [settings, setSettings] = useState(false);
  const closeSettings = useCallback(() => setSettings(false), []);
  const avatarButton = useRef<HTMLButtonElement>(null);
  function closeEditor() {
    setEditing(false);
    avatarButton.current?.focus();
  }
  async function act(body: unknown) {
    setBusy(true);
    try {
      await post(body);
      // The server page decides between the picker and the hub, so load it again.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative flex min-w-0 items-center gap-2">
      <button
        ref={avatarButton}
        type="button"
        aria-label="Đổi emoji hồ sơ"
        title="Đổi emoji hồ sơ"
        aria-expanded={editing}
        aria-controls={editing ? editorId : undefined}
        onClick={() => setEditing((open) => !open)}
        className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-paper"
      >
        <Badge avatar={avatar} />
      </button>
      {editing && (
        <div id={editorId} className="absolute right-0 top-full z-10 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-line bg-paper p-4">
          <EmojiForm
            avatar={avatar}
            name={name}
            onSaved={(icon) => { setAvatar(icon); closeEditor(); }}
            onClose={closeEditor}
          />
          {settingsLearner && <button type="button" className="mt-2 min-h-11 text-sm text-accent underline" onClick={() => {setEditing(false); setSettings(true);}}>Hồ sơ</button>}
        </div>
      )}
      {settings && settingsLearner && <PaperDialog title="Hồ sơ" labelId={editorId + "-settings"} onClose={closeSettings}>
        <div className="text-ink"><ProfileSettings learner={settingsLearner} title="Cài đặt cá nhân" /></div>
      </PaperDialog>}
      <span className="hidden max-w-40 truncate text-sm opacity-80 md:inline">
        {name}
        {manage ? " · quản lý" : ""}
      </span>
      {manage && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act({ action: "unmanage" })}
          className="min-h-9 shrink-0 rounded-md border border-oak-dark/60 bg-paper/85 px-3 text-sm text-ink disabled:opacity-50"
        >
          Thoát quản lý
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void act({ action: "leave" })}
        className="min-h-9 shrink-0 rounded-md border border-oak-dark/60 bg-paper/85 px-3 text-sm text-ink hover:border-accent hover:text-accent-hover disabled:opacity-50"
      >
        Đổi người
      </button>
    </div>
  );
}
