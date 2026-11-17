import { normalizeText } from '../evidence/normalize-text.ts';

export const BLOCKED_SENTENCE = '(Chỗ này có đáp án, mình giữ lại nhé.)';

/** Keys stay in the Worker and are never included in the model context. */
export function answerFragments(item: Record<string, unknown>): string[] {
  const key = item.key as { type?: string; accepted?: string[]; correct?: string[] } | undefined;
  const choices = item.choices as { id: string; text: string }[] | undefined;
  return [typeof item.solution === 'string' ? item.solution : '',
    ...(key?.accepted ?? []),
    ...(choices ?? []).filter(choice => key?.correct?.includes(choice.id)).map(choice => choice.text)];
}

const normalized = (s: string) => normalizeText(s, { ignoreCase: true, punctuation: 'ignore' }).replace(/\s+/g, ' ').trim();

export function containsAnswer(sentence: string, fragments: string[]): boolean {
  const text = normalized(sentence);
  return fragments.some(fragment => {
    const answer = normalized(fragment);
    if (!answer) return false;
    let at = text.indexOf(answer);
    while (at >= 0) {
      const before = text[at - 1], after = text[at + answer.length];
      if ((!before || !/[\p{L}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{N}]/u.test(after))) return true;
      at = text.indexOf(answer, at + 1);
    }
    return false;
  });
}

/** Hold the last sentence until a boundary or end of stream, even across SSE chunks. */
export class SentenceFilter {
  private pending = '';
  private fragments: string[];
  private output: (text: string, blocked: boolean) => void;
  constructor(fragments: string[], output: (text: string, blocked: boolean) => void) { this.fragments=fragments; this.output=output; }
  push(chunk: string) {
    this.pending += chunk;
    const boundary = /[.!?。！？]+(?=\s)/u;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(this.pending))) {
      const end = match.index + match[0].length;
      this.send(this.pending.slice(0, end));
      this.pending = this.pending.slice(end);
    }
  }
  finish() { if (this.pending) this.send(this.pending); this.pending = ''; }
  private send(sentence: string) {
    const blocked = containsAnswer(sentence, this.fragments);
    const leading = sentence.match(/^\s*/u)?.[0] ?? '';
    this.output(blocked ? leading + BLOCKED_SENTENCE : sentence, blocked);
  }
}
