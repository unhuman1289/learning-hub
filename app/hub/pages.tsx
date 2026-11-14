"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KnowledgePanel } from "../admin/knowledge-panel";
import { WindowPreview } from "./lubeck/preview";
import { Download } from "lucide-react";
import { WoodFrame } from "../../components/notebook/house";
import { RuledPage } from "../../components/notebook/paper";
import PendingApprovals from "../../components/pending-approvals";
import RunStatus from "../run-status";
import { ImportPanel } from "./lesson-v2/import-panel";
import { AiJobsPanel } from "./ai-jobs-panel";
import { AdminAttention, AdminGradingQuality, type ReadLearnerNames } from "./admin-disputes";
import { FamilyAdmin } from "./family-admin";
import { buttonClass } from "./ui";
import { apiJson } from "./api";
import type { LearnerSummary } from "../../lib/learners/list";
import type { DailyApi } from "./use-daily";
import type { WorkspaceApi } from "./use-workspace";

const sections = { attention: "Cần xem", family: "Gia đình", knowledge: "Knowledge", system: "Hệ thống" } as const;
type Section = keyof typeof sections;

export function AdminView({ daily, workspace, hub2 = false, profileMode = false }: {
  daily: DailyApi; workspace: WorkspaceApi; hub2?: boolean; profileMode?: boolean;
}) {
  const [selection, setSelection] = useState<Section>(hub2 ? "attention" : "family");
  const [opened, setOpened] = useState(() => new Set<Section>([selection]));
  const heading = useRef<HTMLHeadingElement>(null);
  const focusPanel = useRef(false);
  const names = useRef<ReturnType<ReadLearnerNames> | null>(null);
  const readNames = useCallback<ReadLearnerNames>(() => {
    names.current ??= apiJson<{ learners: LearnerSummary[] }>("/api/learners")
      .then(({ learners }) => new Map(learners.map(learner => [learner.id, learner.name])))
      .catch(error => {
        names.current = null;
        throw error;
      });
    return names.current;
  }, []);


  function select(next: Section) {
    if (next === selection) return;
    focusPanel.current = true;
    setOpened(current => new Set([...current, next]));
    setSelection(next);
  }

  useEffect(() => {
    if (!focusPanel.current) return;
    focusPanel.current = false;
    heading.current?.focus({ preventScroll: true });
  }, [selection]);

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...workspace.latest.current }, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "learning-hub-workspace.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  const visibleSections: Section[] = hub2 ? ["attention", "family", "knowledge", "system"] : ["family", "system"];
  return (
    <div className="admin-notebook mx-auto w-full max-w-4xl">
      <h1 className="mb-4 font-print text-4xl font-medium">Quản trị</h1>
      <nav aria-label="Khu quản trị" className="flex flex-wrap gap-1 pb-1">
        {visibleSections.map(section => <button key={section} type="button" aria-pressed={selection === section} aria-controls="admin-current"
          onClick={() => select(section)} className="admin-section-button min-h-11 rounded-t-sm px-3 font-hand text-lg focus-visible:outline-2 focus-visible:outline-offset-2">
          {sections[section]}
        </button>)}
      </nav>
      <RuledPage as="section" className="admin-notebook-page rounded-b-lg shadow-page">
        <div id="admin-current" aria-labelledby="admin-panel-heading">
          <h2 id="admin-panel-heading" ref={heading} tabIndex={-1} className="mb-4 font-print text-3xl">{sections[selection]}</h2>

          {hub2 && opened.has("attention") && <div hidden={selection !== "attention"}>
            <AdminAttention readNames={readNames} onSystem={() => select("system")} />
          </div>}

          {(opened.has("family") || selection === "family") && <div hidden={selection !== "family"} className="grid gap-6">
            {!profileMode && <PendingApprovals isAdmin />}
            <FamilyAdmin />
            {hub2 && <AdminDetails title="Nhập bài đã duyệt"><ImportPanel /></AdminDetails>}
          </div>}

          {hub2 && opened.has("knowledge") && <div hidden={selection !== "knowledge"}>
            <KnowledgePanel />
          </div>}

          {opened.has("system") && <div hidden={selection !== "system"} className="grid min-w-0 gap-5">
            <section aria-labelledby="admin-speed">
              <h3 id="admin-speed" className="font-print text-xl">Thời gian mở câu đầu tiên · p75</h3>
              <p className="mt-1 text-sm text-muted-paper">Chưa có số đo theo quốc gia. Dữ liệu sẽ hiện khi có kết quả đo từ người dùng.</p>
            </section>
            {hub2 && <>
              <AdminDetails title="Lượt soạn và chấm"><AiJobsPanel active={selection === "system"} /></AdminDetails>
              <AdminDetails title="Chất lượng chấm"><AdminGradingQuality readNames={readNames} /></AdminDetails>
            </>}
            <AdminDetails title="Cập nhật bài và sao lưu">
              {daily.data ? <RunStatus data={daily.data} isAdmin onBackup={daily.setBackup} />
                : <p role={daily.error ? "alert" : "status"} className="text-muted-paper">{daily.error || "Đang tải…"}</p>}
            </AdminDetails>
            <AdminDetails title="Xem thử cửa sổ"><WoodFrame label="Xem thử cửa sổ"><WindowPreview /></WoodFrame></AdminDetails>
            {!hub2 && <AdminDetails title="Dữ liệu lưu trữ">
              <p className="mb-2 text-sm text-muted-paper">Tải bản sao dữ liệu workspace cũ dưới dạng JSON.</p>
              <button type="button" onClick={exportWorkspace} className={buttonClass("secondary")}><Download size={16} aria-hidden="true" /> Tải bản sao</button>
            </AdminDetails>}
          </div>}
        </div>
      </RuledPage>
    </div>
  );
}

function AdminDetails({ title, children }: { title: string; children: ReactNode }) {
  const [visited, setVisited] = useState(false);
  return <details className="border-t border-rule" onToggle={event => {
    if (event.currentTarget.open) setVisited(true);
  }}>
    <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">{title}</summary>
    {visited && <div className="min-w-0 pt-2">{children}</div>}
  </details>;
}
