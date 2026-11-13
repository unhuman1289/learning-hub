"use client";

import {KnowledgePanel} from "../admin/knowledge-panel";
import { WindowPreview } from "./lubeck/preview";
import { Download } from "lucide-react";
import { WoodFrame } from "../../components/notebook/house";
import PendingApprovals from "../../components/pending-approvals";
import RunStatus from "../run-status";
import {ImportPanel} from "./lesson-v2/import-panel";
import {AdminAlertBanner, AiJobsPanel} from "./ai-jobs-panel";
import { AdminDisputes } from "./admin-disputes";
import { FamilyAdmin } from "./family-admin";
import { buttonClass } from "./ui";
import type { DailyApi } from "./use-daily";
import type { WorkspaceApi } from "./use-workspace";

/** Admin-only: approvals, scheduled update log, backups and a copy of shared notes. */
export function AdminView({ daily, workspace, hub2 = false, profileMode = false }: { daily: DailyApi; workspace: WorkspaceApi; hub2?: boolean; profileMode?: boolean }) {
  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...workspace.latest.current }, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "learning-hub-workspace.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <h1 className="font-print text-[2rem] font-medium">Quản trị</h1>
      {hub2 && <AdminAlertBanner />}
      {!profileMode && <WoodFrame label="Duyệt tài khoản"><PendingApprovals isAdmin /></WoodFrame>}
      <WoodFrame label="Gia đình">
        <h2 className="font-print text-2xl font-medium">Gia đình</h2>
        <p className="mb-4 mt-2 text-sm text-muted">Đặt trẻ em, biệt danh dùng trong bài và lời phê, và phụ huynh của từng người.</p>
        {hub2 && <ImportPanel />}
        <FamilyAdmin />
      </WoodFrame>
      {hub2 && <WoodFrame label="Chấm sai cần xem"><AdminDisputes /></WoodFrame>}
      {hub2 && <WoodFrame label="Lượt soạn và chấm"><AiJobsPanel /></WoodFrame>}
      {hub2 && <WoodFrame label="Tri thức"><KnowledgePanel /></WoodFrame>}
      <WoodFrame label="Cập nhật bài và sao lưu">
        <h2 className="mb-3 font-print text-2xl font-medium">Cập nhật bài và sao lưu</h2>
        {daily.data ? <RunStatus data={daily.data} isAdmin onBackup={daily.setBackup} /> : <p className="text-muted">{daily.error || "Đang tải…"}</p>}
      </WoodFrame>
      <WoodFrame label="Xem thử cửa sổ"><WindowPreview /></WoodFrame>
      {!hub2 && <WoodFrame label="Dữ liệu lưu trữ">
        <h2 className="font-print text-2xl font-medium">Dữ liệu lưu trữ</h2>
        <p className="mt-2 text-sm text-muted">Tải bản sao dữ liệu workspace cũ dưới dạng JSON.</p>
        <button type="button" onClick={exportWorkspace} className={buttonClass("secondary", "mt-4")}><Download size={16} aria-hidden="true" /> Tải bản sao</button>
      </WoodFrame>}
    </div>
  );
}
