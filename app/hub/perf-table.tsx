"use client";

import { useEffect, useState } from "react";
import type { RumSample, RumScreen } from "../../lib/rum-contract";
import { apiJson } from "./api";

type PerfRow = {
  day: string;
  country: string;
  screen: RumScreen;
  device: RumSample["device"];
  n: number;
  p75: number;
};

const screenLabels: Record<RumScreen, string> = {
  desk: "Mở bàn học",
  first_question: "Mở câu đầu",
  grade: "Chấm câu có đáp án",
  audio_play: "Phát âm thanh",
  tutor_first_token: "Hiện chữ đầu của gia sư",
};
const numbers = new Intl.NumberFormat("vi");
const countries = new Intl.DisplayNames("vi", { type: "region" });

export function PerfTable({ active }: { active: boolean }) {
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    apiJson<{ rows: PerfRow[] }>("/api/admin/perf", { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setRows(result.rows);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [active]);

  return <section aria-labelledby="admin-speed" className="min-w-0">
    <h3 id="admin-speed" className="font-print text-xl">Tốc độ theo quốc gia</h3>
    {status === "loading" && <p role="status" className="mt-1 text-sm text-muted-paper">Đang tải số đo…</p>}
    {status === "error" && <p role="alert" className="mt-1 text-sm text-brick">Chưa tải được số đo tốc độ.</p>}
    {status === "ready" && (rows.length === 0
      ? <p className="mt-1 text-sm text-muted-paper">Chưa có số đo từ người dùng.</p>
      : <table className="mt-2 w-full table-fixed text-sm tabular-nums">
        <caption className="pb-2 text-left text-muted-paper">
          {rows[0].day.split("-").reverse().join("/")} (giờ Berlin) · 75% lượt có thời gian từ p75 trở xuống.
        </caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="w-[27%] pb-1 pr-2">Quốc gia</th>
            <th scope="col" className="pb-1 pr-2">Thao tác và thiết bị</th>
            <th scope="col" className="w-[21%] pb-1 text-right">p75 (ms)</th>
            <th scope="col" className="w-[14%] pb-1 text-right">Lượt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={`${row.country}:${row.screen}:${row.device}`} className="border-b border-rule align-top">
            <th scope="row" className="break-words py-2 pr-2 text-left font-normal">
              {row.country === "XX" ? "Chưa rõ" : countries.of(row.country)}
            </th>
            <td className="py-2 pr-2">
              {screenLabels[row.screen]}
              <span className="block text-muted-paper">{row.device === "phone" ? "Điện thoại" : "Máy tính"}</span>
            </td>
            <td className="py-2 text-right">{numbers.format(row.p75)}</td>
            <td className="break-words py-2 text-right">{numbers.format(row.n)}</td>
          </tr>)}
        </tbody>
      </table>)}
  </section>;
}
