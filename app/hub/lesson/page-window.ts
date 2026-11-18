/** Stable page identities are the first question numbers in each authored group. */
export function lessonPageWindow(groups: number[][], current: number): number[][] {
  const index = groups.findIndex(group => group.includes(current));
  if (index < 0) return [];
  return groups.slice(Math.max(0, index - 1), index + 2);
}
