/** A failed upload must never become a submitted answer. */
export async function submitAfterPhoto(upload: Promise<void>, submit: () => void) {
  try { await upload; } catch { return false; }
  submit();
  return true;
}
