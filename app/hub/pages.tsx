"use client";

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { OakDesk, WoodFrame } from "../../components/notebook/house";
import { RuledPage, cx } from "../../components/notebook/paper";
import PendingApprovals from "../../components/pending-approvals";
import RunStatus from "../run-status";
import {ImportPanel} from "./lesson-v2/import-panel";
import {AiJobsPanel} from "./ai-jobs-panel";
import { AdminDisputes } from "./admin-disputes";
import { FamilyAdmin } from "./family-admin";
import { JournalList, journalKinds, type FormRequest } from "./journal";
import { trackIds, trackInfo, type TrackId } from "./model";
import { buttonClass } from "./ui";
import type { DailyApi } from "./use-daily";
import type { WorkspaceApi } from "./use-workspace";

/** Every journal entry across notebooks: sessions, reviews, observations, saved answers. */
export function NotesView({ workspace, openForm }: { workspace: WorkspaceApi; openForm: (request: FormRequest) => void }) {
  const [filter, setFilter] = useState<TrackId | "all">("all");
  const logs = workspace.data.logs.filter((log) => filter === "all" || log.track === filter);
  const kindTrack = (kind: string) => kind === "Quan sát Bột" ? "Bột" : kind === "Lỗi tiếng Đức" ? "Deutsch" : filter === "all" ? "AI" : filter;
  return (
    <div className="mx-auto w-full max-w-4xl">
      <OakDesk>
      <RuledPage className="min-h-[70vh] rounded-[2px] shadow-page">
        <h1 className="font-hand text-[32px] leading-[3.5rem] relative top-2.5 text-accent">Ghi chú</h1>
        <p className="max-w-[68ch] leading-7 text-muted">Review tuần, quan sát, quyết định và bài làm đã lưu của mọi cuốn sổ.</p>
        <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Lọc theo sổ">
          {(["all", ...trackIds] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={cx("min-h-9 rounded-full border px-3 text-sm", filter === item ? "border-accent bg-rose-soft font-semibold text-accent-hover" : "border-line bg-paper text-muted hover:text-ink")}
            >
              {item === "all" ? "Tất cả" : trackInfo(item).title}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {journalKinds.map((kind) => (
            <button key={kind} type="button" disabled={!workspace.loaded} onClick={() => openForm({ kind, track: kindTrack(kind) })} className={buttonClass("secondary", "min-h-9 px-3 font-normal")}>
              <Plus size={14} aria-hidden="true" /> {kind}
            </button>
          ))}
        </div>
        <div className="mt-14">
          <JournalList
            logs={logs}
            workspace={{ done: workspace.data.done, toggle: (id) => void workspace.toggleDone(id) }}
            empty={workspace.loaded ? "Chưa có ghi chú. Sau khi học, ghi lại điều đã hiểu và điều còn vướng." : "Đang mở ghi chú…"}
          />
        </div>
      </RuledPage>
      </OakDesk>
    </div>
  );
}

/** Admin-only: approvals, scheduled update log, backups and a copy of shared notes. */
export function AdminView({ daily, workspace, hub2 = false, profileMode = false }: { daily: DailyApi; workspace: WorkspaceApi; hub2?: boolean; profileMode?: boolean }) {
  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...workspace.latest.current }, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "learning-hub-ghi-chu.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <h1 className="font-print text-[2rem] font-medium">Quản trị</h1>
      {!profileMode && <WoodFrame label="Duyệt tài khoản"><PendingApprovals isAdmin /></WoodFrame>}
      <WoodFrame label="Gia đình">
        <h2 className="font-print text-2xl font-medium">Gia đình</h2>
        <p className="mb-4 mt-2 text-sm text-muted">Đặt trẻ em, biệt danh dùng trong bài và lời phê, và phụ huynh của từng người.</p>
        {hub2 && <ImportPanel />}
        <FamilyAdmin />
      </WoodFrame>
      {hub2 && <WoodFrame label="Chấm sai cần xem"><AdminDisputes /></WoodFrame>}
      {hub2 && <WoodFrame label="Lượt soạn và chấm"><AiJobsPanel /></WoodFrame>}
      <WoodFrame label="Cập nhật bài và sao lưu">
        <h2 className="mb-3 font-print text-2xl font-medium">Cập nhật bài và sao lưu</h2>
        {daily.data ? <RunStatus data={daily.data} isAdmin onBackup={daily.setBackup} /> : <p className="text-muted">{daily.error || "Đang tải…"}</p>}
      </WoodFrame>
      <WoodFrame label="Bản sao ghi chú">
        <h2 className="font-print text-2xl font-medium">Bản sao ghi chú</h2>
        <p className="mt-2 text-sm text-muted">Tải ghi chú, nhật ký và các mốc đã đánh dấu đang hiển thị dưới dạng JSON.</p>
        <button type="button" onClick={exportWorkspace} className={buttonClass("secondary", "mt-4")}><Download size={16} aria-hidden="true" /> Tải bản sao</button>
      </WoodFrame>
    </div>
  );
}
