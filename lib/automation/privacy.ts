import type { SubjectSensitivity } from '../subjects/sql.ts';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone candidates must start like a dialable number: "+49 …", "(0451) …" or "0451/…".
// Dates, year ranges, DOIs and most ISBNs start with other digits and are never candidates.
const PHONE_CANDIDATE = /(?<![\w./-])(?:\+\d|\(0\d|0\d)[\d .()/-]{6,}\d(?![\w/-])/g;
const ISBN_SHAPE = /^\d{1,5}-\d{1,7}-\d{1,7}-[\dX]$/i;

const NAME = String.raw`[A-ZÄÖÜ][a-zäöüß]+(?:[ -][A-ZÄÖÜ][a-zäöüß]+)+`;
const DATE = String.raw`(?:\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})`;

const EXPLICIT_IDENTIFIER = new RegExp([
  String.raw`\bpatient\s*(?:name|id|number)\b`,
  String.raw`\bmedical\s+record\b`,
  String.raw`\bmrn\b`,
  String.raw`\bdate\s+of\s+birth\b`,
  String.raw`\bdob\b`,
  String.raw`\bcase\s*(?:no\.?|number|id)\b`,
  String.raw`\b(?:fall|patienten|akten)[- ]?(?:nr\.?|nummer)\b`,
  String.raw`\baktenzeichen\b`,
  String.raw`(?:số|mã)\s+(?:hồ\s+sơ|bệnh\s+án|bệnh\s+nhân)`,
  String.raw`\b(?:geb\.|geboren\s+am|born\s+on)\s*${DATE}`,
  String.raw`sinh\s+ngày\s*${DATE}`,
].join('|'), 'i');
// Case-sensitive on purpose: "Patient: Jane Doe" is a name, "Patient: simulated woman" is not.
const LABELLED_NAME = new RegExp(String.raw`\b(?:[Pp]atient(?:in)?|PATIENT|[Cc]ase|[Ff]all)\s*:\s*${NAME}`);

// Only for clinical and child-development notebooks: a named person or a dated clinical event points to a real record.
// Simulated cases ("simulated 58-year-old woman, NSCLC") contain neither and pass.
const TITLED_NAME = /\b(?:Herr|Frau|Mr|Mrs|Ms)\.?\s+[A-ZÄÖÜ][a-zäöüß]+/;
const DATED_EVENT = new RegExp([
  String.raw`\b(?:admitted|aufgenommen|operiert|diagnosed|operated)\b[^.\n]{0,20}?\b(?:on|am)\s+${DATE}`,
  String.raw`nhập\s+viện\s+ngày\s*${DATE}`,
].join('|'), 'i');

/** Explicit identifiers are blocked everywhere; `clinical` and `child_dev` notebooks also block named people and dated events. */
export function containsPossibleClinicalIdentifier(text: string, sensitivity: SubjectSensitivity) {
  if (containsExplicitIdentifier(text)) return true;
  return sensitivity !== 'normal' && (TITLED_NAME.test(text) || DATED_EVENT.test(text));
}

export function containsExplicitIdentifier(text: string) {
  return EXPLICIT_IDENTIFIER.test(text) || LABELLED_NAME.test(text);
}

function phoneMatches(text: string) {
  const found: string[] = [];
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const value = match[0];
    const digits = value.replace(/\D/g, '').length;
    if (digits < 9 || digits > 15 || ISBN_SHAPE.test(value)) continue;
    if (/isbn[\s:-]*$/i.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
    found.push(value);
  }
  return found;
}

export function redactContactDetails(text: string) {
  let result = text.replace(EMAIL, '[email redacted]');
  for (const phone of phoneMatches(result)) result = result.split(phone).join('[phone redacted]');
  return result;
}

export function containsContactDetails(text: string) {
  return new RegExp(EMAIL.source, 'i').test(text) || phoneMatches(text).length > 0;
}

/** Learner-visible text of a lesson package; source URLs and dates are excluded on purpose. */
export function lessonTextFields(lesson: unknown): string {
  if (!lesson || typeof lesson !== 'object') return '';
  const value = lesson as Record<string, unknown>;
  const parts: string[] = [];
  const add = (item: unknown) => { if (typeof item === 'string') parts.push(item); };
  for (const key of ['title', 'objective', 'level', 'diagram', 'exercise', 'deliverable', 'nextTopic']) add(value[key]);
  for (const section of Array.isArray(value.sections) ? value.sections : []) {
    if (section && typeof section === 'object') { add((section as Record<string, unknown>).heading); add((section as Record<string, unknown>).text); }
  }
  for (const question of Array.isArray(value.questions) ? value.questions : []) {
    if (question && typeof question === 'object') { add((question as Record<string, unknown>).question); add((question as Record<string, unknown>).answer); }
  }
  for (const source of Array.isArray(value.sources) ? value.sources : []) {
    if (source && typeof source === 'object') { add((source as Record<string, unknown>).title); add((source as Record<string, unknown>).readScope); }
  }
  return parts.join('\n');
}
