"use client";

import { useCallback, useEffect, useState } from "react";
import type { LearnerSummary } from "../../lib/learners/list";
import type { SubjectView } from "../../lib/subjects/service";

export type ShelfSubject = SubjectView;
export type NewSubject = {
  title?: string; template?: "skill" | "reading"; goal?: string; level?: string; curriculum?: string; legacyTrack?: string;
};

const query = (learner: string | null) => (learner ? `?learner=${encodeURIComponent(learner)}` : "");

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw Error(body?.error || fallback);
  return body;
}

/**
 * The shelf of one learner (the signed-in account when `learner` is null) and the list of
 * learners whose shelf this account may open. Nothing is shown as created before the server answers.
 */
export function useShelf(learner: string | null) {
  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [subjects, setSubjects] = useState<ShelfSubject[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const body = await readJson<{ subjects: ShelfSubject[] }>(await fetch(`/api/subjects${query(learner)}`, { cache: "no-store" }), "Chưa tải được tủ sách.");
      setSubjects(body.subjects);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [learner]);

  useEffect(() => {
    void Promise.resolve().then(() => { setSubjects(null); return load(); });
  }, [load]);

  useEffect(() => {
    let current = true;
    fetch("/api/learners", { cache: "no-store" })
      .then((response) => readJson<{ learners: LearnerSummary[] }>(response, ""))
      .then((body) => { if (current) setLearners(body.learners); })
      .catch(() => {});
    return () => { current = false; };
  }, []);

  const create = useCallback(async (input: NewSubject) => {
    const body = await readJson<{ subject: ShelfSubject }>(await fetch(`/api/subjects${query(learner)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }), "Chưa mở được sổ mới.");
    setSubjects((current) => [...(current ?? []), body.subject]);
    return body.subject;
  }, [learner]);

  const update = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const body = await readJson<{ subject: ShelfSubject }>(await fetch(`/api/subjects/${id}${query(learner)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }), "Chưa lưu được thay đổi.");
    setSubjects((current) => (current ?? []).map((item) => (item.id === id ? body.subject : item)));
    return body.subject;
  }, [learner]);

  const self = learners.find((item) => item.relation === "self") ?? null;
  return { learners, self, subjects, error, load, create, update };
}

export type ShelfApi = ReturnType<typeof useShelf>;
