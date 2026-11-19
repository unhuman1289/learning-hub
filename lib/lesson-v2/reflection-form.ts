export type ReflectionFields = {
  difficulty: "easy" | "fit" | "hard";
  usefulness: "useful" | "mixed" | "not_useful";
  note: string;
};

export function reflectionSaveButton(value: ReflectionFields, saved: ReflectionFields | null, ready: boolean, busy: boolean) {
  const unchanged = saved !== null && value.difficulty === saved.difficulty &&
    value.usefulness === saved.usefulness && value.note === saved.note;
  return {
    label: busy ? "Đang lưu…" : unchanged ? "Đã lưu" : "Lưu",
    disabled: !ready || busy || unchanged,
  };
}
