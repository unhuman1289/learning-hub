import { normalizeText } from '../evidence/normalize-text.ts';

export const BLOCKED_SENTENCE = '(Chỗ này có đáp án, mình giữ lại nhé.)';

const normalized = (s: string) => normalizeText(s, { ignoreCase: true, punctuation: 'ignore' }).replace(/\s+/g, ' ').trim();

function containsToken(text: string, answer: string): boolean {
  if (!answer) return false;
  let at = text.indexOf(answer);
  while (at >= 0) {
    const before = text[at - 1], after = text[at + answer.length];
    if ((!before || !/[\p{L}\p{M}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{M}\p{N}]/u.test(after))) return true;
    at = text.indexOf(answer, at + 1);
  }
  return false;
}

export type AnswerFragments = { texts: string[]; labels: string[] };
/** Keys stay in the Worker and are never included in the model context. */
export function answerFragments(item: Record<string, unknown>): AnswerFragments {
  const key = item.key as { type?: string; accepted?: string[]; correct?: string[] } | undefined;
  const choices = item.choices as { id: string; text: string }[] | undefined;
  const correct = (choices ?? []).map((choice, index) => ({choice, index})).filter(({choice}) => key?.correct?.includes(choice.id));
  const prompt = normalized(typeof item.prompt === 'string' ? item.prompt : '');
  const texts = [typeof item.solution === 'string' ? item.solution : '', ...(key?.accepted ?? []), ...correct.map(({choice}) => choice.text)]
    .filter(text => normalized(text) && !containsToken(prompt, normalized(text)));
  // Choice labels follow the visible order, not the choice IDs (which may be reordered).
  return { texts, labels: correct.map(({index}) => String.fromCharCode(65 + index))
    .filter(label => !containsToken(prompt, normalized(label))) };
}

const references = ['đáp án','phương án','chọn','lựa chọn','câu','option','antwort','lösung'];
const labelTokens = (s: string) => normalizeText(s, {ignoreCase:true, punctuation:'keep'}).replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const hasReference = (s: string) => references.some(ref => containsToken(labelTokens(s), ref));
const hasLabel = (s: string, labels: string[]) => labels.some(label => containsToken(labelTokens(s), normalized(label)));

export function containsAnswer(sentence: string, fragments: AnswerFragments): boolean {
  const text = normalized(sentence);
  if (fragments.texts.some(fragment => containsToken(text, normalized(fragment)))) return true;
  // Keep punctuation as token separators for labels such as "(B)".
  return hasReference(sentence) && hasLabel(sentence, fragments.labels);
}

/** Hold the last sentence until a boundary or end of stream, even across SSE chunks. */
export class SentenceFilter {
  private pending = '';
  private suppressUntilBoundary = false;
  private fragments: AnswerFragments;
  private output: (text: string, blocked: boolean) => void;
  constructor(fragments: AnswerFragments, output: (text: string, blocked: boolean) => void) { this.fragments=fragments; this.output=output; }
  push(chunk: string) {
    this.pending += chunk;
    // A newline ends a sentence even when it is split across SSE records.
    const boundary = /[.!?。！？]+(?=\s)|\n/u;
    let match: RegExpExecArray | null;
    while (this.pending) {
      match = boundary.exec(this.pending);
      if (this.suppressUntilBoundary) {
        if (match) { this.pending = this.pending.slice(match.index + match[0].length); this.suppressUntilBoundary = false; }
        else if (this.pending.length > 240) this.pending = this.pending.slice(240);
        else break;
      } else if (match && match.index < 240) {
        const end = match.index + match[0].length;
        this.send(this.pending.slice(0, end));
        this.pending = this.pending.slice(end);
      } else if (this.pending.length > 240) {
        // Retain the longest suffix which could start an answer across the cut.
        let cut = 240;
        const word = (ch: string | undefined) => !!ch && /[\p{L}\p{M}\p{N}]/u.test(ch);
        while (cut > 0 && word(this.pending[cut - 1]) && word(this.pending[cut])) cut--;
        // Very long unbroken tokens cannot be labels and must still be bounded.
        if (cut === 0) cut = 240;
        const before = this.pending.slice(0, cut);
        const candidates = [...this.fragments.texts, ...this.fragments.labels, ...(this.fragments.labels.length ? references : [])];
        for (const candidate of candidates) {
          const value = normalized(candidate);
          for (let start = Math.max(0, cut - candidate.length - 8); start < cut; start++) {
            const suffix = normalized(before.slice(start));
            if (suffix && value.startsWith(suffix)) { cut = Math.min(cut, start); break; }
          }
        }
        // A very long possible answer has no safe prefix: redact the bounded block.
        const part = this.pending.slice(0, cut);
        // A reference and label may appear arbitrarily far apart in one long sentence.
        // Fail closed on such a segment; otherwise a later segment could reveal the label.
        if (cut === 0 || (this.fragments.labels.length > 0 && (hasReference(part) || hasLabel(part, this.fragments.labels)))) {
          this.output(BLOCKED_SENTENCE, true); this.pending = this.pending.slice(cut || 240); this.suppressUntilBoundary = true;
        } else { this.send(part); this.pending = this.pending.slice(cut); }
      } else break;
    }
  }
  finish() { if (this.pending && !this.suppressUntilBoundary) this.send(this.pending); this.pending = ''; }
  private send(sentence: string) {
    const blocked = containsAnswer(sentence, this.fragments);
    const leading = sentence.match(/^\s*/u)?.[0] ?? '';
    this.output(blocked ? leading + BLOCKED_SENTENCE : sentence, blocked);
  }
}
