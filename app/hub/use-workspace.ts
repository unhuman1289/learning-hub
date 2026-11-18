"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Note = { id: string; title: string; url: string; track: string; body: string };
export type Log = { id: string; kind: string; track: string; date: string; body: string; due?: string; minutes?: number };
export type Workspace = { done: string[]; notes: Note[]; logs: Log[]; starts: Record<string, string>; daily: number };

export const emptyWorkspace: Workspace = { done: [], notes: [], logs: [], starts: {}, daily: 240 };

/**
 * Shared notes, journal and checklist state stored in D1 with optimistic revisions.
 * Every change is saved right away; saves run one at a time so a later save always
 * carries the revision returned by the previous one.
 */
export function useWorkspace(enabled = true) {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef<Workspace>(emptyWorkspace);
  const revision = useRef(0);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const result = await response.json() as { data?: Workspace; revision: number; error: string };
      if (!response.ok) throw Error(result.error);
      const next = result.data ? { ...emptyWorkspace, ...result.data } : emptyWorkspace;
      latest.current = next;
      revision.current = result.revision;
      setData(next);
      setLoaded(true);
      setDirty(false);
    } catch (cause) {
      setError((cause as Error).message || "Chưa tải được ghi chú.");
    }
  }, []);

  useEffect(() => {
    if (enabled) void Promise.resolve().then(load);
  }, [enabled, load]);

  const save = useCallback((): Promise<boolean> => {
    queue.current = queue.current.then(async () => {
      const snapshot = latest.current;
      setSaving(true);
      setError("");
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: revision.current, data: snapshot }),
        });
        const result = await response.json() as { revision: number; error: string };
        if (!response.ok) throw Error(result.error);
        revision.current = result.revision;
        if (latest.current === snapshot) setDirty(false);
        return true;
      } catch (cause) {
        setError((cause as Error).message || "Chưa lưu được.");
        return false;
      } finally {
        setSaving(false);
      }
    });
    return queue.current;
  }, []);

  /** Apply a change locally, then save it unless `persist` is false (staged changes). */
  const commit = useCallback((change: (current: Workspace) => Workspace, persist = true) => {
    const next = change(latest.current);
    latest.current = next;
    setData(next);
    setDirty(true);
    return persist ? save() : Promise.resolve(true);
  }, [save]);

  const toggleDone = useCallback((id: string) => commit((current) => ({
    ...current,
    done: current.done.includes(id) ? current.done.filter((item) => item !== id) : [...current.done, id],
  })), [commit]);

  return { data, loaded, saving, dirty, error, load, save, commit, toggleDone, latest };
}

export type WorkspaceApi = ReturnType<typeof useWorkspace>;
