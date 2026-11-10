"use client";

import { useEffect, useState } from "react";

type Profile = { id: string; displayName: string; avatar: string; role: "adult" | "child" };

async function post(body: unknown) {
  let response: Response;
  try {
    response = await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Mất kết nối. Thử lại khi có mạng.");
  }
  const value = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(value?.error || "Chưa lưu được.");
  return value;
}

function Badge({ profile, size = "size-8" }: { profile: Pick<Profile, "displayName" | "avatar">; size?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid ${size} shrink-0 place-items-center rounded-full bg-paper/85 font-semibold uppercase text-accent-hover`}
    >
      {profile.avatar || profile.displayName.slice(0, 1)}
    </span>
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
                onClick={() => void run({ action: "select", id: p.id }, () => window.location.assign("/"))}
                className="grid w-full justify-items-center gap-2 rounded-lg border border-line bg-paper p-4 hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <Badge profile={p} size="size-14 text-2xl" />
                <span className="font-semibold">{p.displayName}</span>
                <span className="text-sm text-muted">{p.role === "child" ? "Trẻ em" : "Người lớn"}</span>
              </button>
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
                <label className="grid gap-1 text-sm">
                  Biểu tượng
                  <input
                    maxLength={8}
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="🐸"
                    className="w-20 rounded border border-line bg-paper p-2"
                  />
                </label>
                <button disabled={busy} className="rounded-md border border-line bg-paper px-3 py-2 disabled:opacity-50">
                  Lưu
                </button>
              </form>
            )}
            <button
              type="button"
              className="justify-self-start text-sm underline"
              onClick={() => void run({ action: "unmanage" }, () => setVersion((v) => v + 1))}
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
export function ProfileControls({ name, manage }: { name: string; manage: boolean }) {
  const [busy, setBusy] = useState(false);
  async function act(body: unknown) {
    setBusy(true);
    try {
      await post(body);
      // The server page decides between the picker and the hub, so load it again.
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Badge profile={{ displayName: name, avatar: "" }} />
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
