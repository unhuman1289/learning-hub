import { z } from 'zod/v4';

export const itemKind = z.enum(['choice', 'short', 'long', 'cloze', 'order', 'code', 'table', 'label', 'match']);
export type ItemKind = z.infer<typeof itemKind>;
export const itemKindsInput = z.array(itemKind).min(1).max(itemKind.options.length)
  .refine(kinds => new Set(kinds).size === kinds.length);

export function itemPolicy(framework?: string): { kinds: ItemKind[]; minimum: number; codeKnowledge: boolean } {
  if (framework && /-(cefr|hsk)$/.test(framework))
    return { kinds: ['choice', 'short', 'long', 'cloze'], minimum: 1, codeKnowledge: false };
  if (framework === 'rust-core' || framework === 'python-core')
    return { kinds: ['choice', 'short', 'cloze', 'order', 'code'], minimum: 2, codeKnowledge: true };
  if (framework && /^vn-gdpt-2018-(toan|khtn|sinh|ly|hoa)$/.test(framework))
    return { kinds: ['choice', 'short', 'long', 'cloze', 'table', 'label'], minimum: 2, codeKnowledge: true };
  return { kinds: ['choice', 'short', 'long'], minimum: 1, codeKnowledge: true };
}
