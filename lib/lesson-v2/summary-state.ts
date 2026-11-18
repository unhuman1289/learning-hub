export type SummaryAttempt = { result: string | null } | undefined;
export function summaryState(attempts: SummaryAttempt[], waiting: boolean, queued: boolean, slow: boolean, child: boolean, name: string) {
  const pending = attempts.filter(a => a && !a.result).length;
  const corrections = attempts.flatMap((a, index) => a && (a.result === 'incorrect' || a.result === 'partial') ? [index] : []);
  const correct = attempts.filter(a => a?.result === 'correct').length;
  if (waiting) return queued || slow
    ? { phase: 'queued' as const, pet: 'busy' as const, message: 'Bài đã lưu rồi, bạn cứ đóng sổ nhé. Có lời phê con báo nha.', pending, corrections, correct }
    : { phase: 'checking' as const, pet: 'think' as const, message: `Con đang đọc ${pending} câu viết nha.`, pending, corrections, correct };
  if (pending) return { phase: 'unavailable' as const, pet: 'busy' as const, message: 'Bài đã lưu, lời phê chưa có. Con sẽ báo khi có kết quả nha.', pending, corrections, correct };
  if (attempts.some(a => !!a?.result)) {
    const praise = name ? `${name} giỏi quá!` : 'Giỏi quá!';
    const message = child ? `${praise} ${corrections.length ? `Chỉ còn ${corrections.length} câu cần sửa thôi nè.` : 'Con làm xong rồi nè.'}`
      : `Con chấm xong rồi ạ.${corrections.length ? ` Có ${corrections.length} câu cần sửa.` : ''}`;
    return { phase: 'graded' as const, pet: child ? 'cheer' as const : 'nod' as const, message, pending, corrections, correct };
  }
  return { phase: 'review' as const, pet: null, message: '', pending, corrections, correct };
}
