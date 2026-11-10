export function evidenceStrength(
  result: 'correct' | 'partial' | 'incorrect' | 'ungradable',
  support: 'none' | 'hint1' | 'hint2' | 'solution',
  attemptNo: number,
): 'E0' | 'E1' | 'E2' | 'E3' | null {
  if (result === 'ungradable') return null;
  if (result === 'incorrect' || support === 'solution') return 'E0';
  if (support !== 'none') return 'E1';
  return result === 'partial' || attemptNo > 1 ? 'E2' : 'E3';
}
