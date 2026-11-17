"use client";

export type QualityRow = { learnerId: string; subjectId: string; subjectTitle: string; days: 14 | 30; aiGraded: number; disputed: number; overturned: number; keyIssues: number; rechecksWeek: number; changedWeek: number; changeRateWeek: number | null };

/** Grading quality per notebook; `names` adds a learner column for the admin view. */
export function QualityTable({ rows, names }: { rows: QualityRow[]; names?: Map<string, string> }) {
  if (!rows.length) return <p className="text-sm text-muted">Chưa có lượt AI chấm hay phản đối nào.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm leading-7">
        <thead className="text-muted">
          <tr>
            {names && <th scope="col" className="pr-3 font-semibold">Người học</th>}
            <th scope="col" className="pr-3 font-semibold">Sổ</th>
            <th scope="col" className="pr-3 font-semibold">Ngày</th>
            <th scope="col" className="pr-3 text-right font-semibold">AI chấm</th>
            <th scope="col" className="pr-3 text-right font-semibold">Phản đối</th>
            <th scope="col" className="pr-3 text-right font-semibold">Bị lật</th>
            <th scope="col" className="pr-3 text-right font-semibold">Đổi điểm 7 ngày</th><th scope="col" className="text-right font-semibold">Lỗi đáp án</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subjectId + row.days} className="border-t border-rule">
              {names && <td className="pr-3">{names.get(row.learnerId) ?? "—"}</td>}
              <td className="pr-3">{row.subjectTitle}</td>
              <td className="pr-3">{row.days}</td>
              <td className="pr-3 text-right">{row.aiGraded}</td>
              <td className="pr-3 text-right">{row.disputed}</td>
              <td className="pr-3 text-right">{row.overturned}</td>
              <td className="pr-3 text-right">{row.changeRateWeek === null ? "—" : `${Math.round(row.changeRateWeek * 100)}% (${row.changedWeek}/${row.rechecksWeek})`}</td><td className="text-right">{row.keyIssues}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
