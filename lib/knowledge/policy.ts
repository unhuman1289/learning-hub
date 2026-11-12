import { z } from 'zod';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../automation/privacy.ts';
import { ApiError } from '../api-error.ts';

export const text = (max: number) => z.string().trim().min(1).max(max).refine(
  value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !/<\/?[a-z!][^>]*>/i.test(value),
  'Chỉ chấp nhận văn bản thuần.',
);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
});
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const sourceSchema = z.strictObject({
  url: z.string().max(2048).url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  }),
  title: text(250), publisher: text(150), issuer: text(150).optional(),
  sourceType: z.enum(['guideline','official_doc','textbook','paper','review','preprint','web']),
  publishedAt: date.optional(), versionLabel: text(100).optional(),
  retrievedAt: z.string().datetime({ offset: true }), readScope: z.enum(['full','partial','abstract']),
  jurisdiction: z.enum(['DE','EU','intl','other']).optional(),
  appliesInGermany: z.enum(['yes','no','unknown']).optional(),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/), evidenceNote: text(400).optional(),
});
export const topicKey=z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}:-]{0,100}$/u);
export const sourceInput = z.strictObject({
  versionId: identifier, clientChangeId: identifier, source: sourceSchema,
  notes: z.array(z.strictObject({
    heading: text(180), body: text(1500), quote: text(250).refine(value => value.split(/\s+/).length <= 25).optional(),
  })).min(1).max(12),
  links: z.array(z.strictObject({ subjectId: identifier.optional(), topicKey:topicKey.optional(), skillKey: text(100).optional() }).refine(link=>!!(link.subjectId||link.topicKey))).min(1).max(12),
  gapIds: z.array(identifier).max(10).optional(),
}).refine(input => input.notes.reduce((count,note)=>count+(note.quote?.split(/\s+/).length??0),0)<=25,
  "Chỉ trích tối đa 25 từ từ một nguồn.");

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'Dữ liệu tri thức chưa hợp lệ.');
  return result.data;
}

export function requirePublicText(values: (string | undefined)[]) {
  if (values.some(value => value && (containsContactDetails(value) || containsPossibleClinicalIdentifier(value, 'clinical'))))
    throw new ApiError(422, 'Tri thức chỉ nhận nội dung công khai, không nhận dữ liệu cá nhân.');
}

export function validateSource(source: z.infer<typeof sourceSchema>, clinical: boolean) {
  if (clinical && (!source.issuer || !source.publishedAt || !source.versionLabel || !source.jurisdiction || !source.appliesInGermany))
    throw new ApiError(422, 'Nguồn y khoa cần cơ quan ban hành, ngày, phiên bản, phạm vi và khả năng áp dụng tại Đức.');
  if (source.sourceType === 'guideline' &&
      (source.readScope === 'abstract' || /(?:^|\.)(?:arxiv\.org|medrxiv\.org|biorxiv\.org)$/.test(new URL(source.url).hostname)
       || /\b(?:systematic review|scoping review|preprint|meta-analysis)\b/i.test(source.title)))
    throw new ApiError(422, 'Nguồn này không đủ điều kiện ghi là hướng dẫn chính thức.');
}
