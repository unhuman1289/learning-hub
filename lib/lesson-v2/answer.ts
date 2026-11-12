import type { LessonItemAny } from '../contracts/lesson-package-v3.ts';

export function parseStructuredAnswer(answer: string): unknown {
  try { return JSON.parse(answer); } catch { return null; }
}

export function hasLessonAnswer(input: LessonItemAny['input'], answer: string) {
  if (input === 'short' || input === 'long' || input === 'code') return !!answer.trim();
  if (input === 'choice') return !!answer.trim() && answer.trim() !== '[]';
  const value = parseStructuredAnswer(answer);
  const entries = input === 'match' && value && typeof value === 'object' && !Array.isArray(value)
    ? Object.values(value) : Array.isArray(value) ? value : [];
  return entries.some(entry => typeof entry === 'string' && !!entry.trim());
}
