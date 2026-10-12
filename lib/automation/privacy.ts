import type { LearningTrack } from '../daily-policy.ts';

export function containsPossibleClinicalIdentifier(text: string, track: LearningTrack) {
  const explicitIdentifier = containsExplicitIdentifier(text);
  const clinicalNarrative = (track === 'MTB' || track === 'Cardio')
    && /\b(patient|case|subject)\b/i.test(text)
    && /\b(?:year[- ]old|born|diagnosed|hospital|clinic|admitted|surgery|tumou?r|cancer)\b/i.test(text);
  return explicitIdentifier || clinicalNarrative;
}

export function containsExplicitIdentifier(text: string) {
  return /\bpatient\s*(?:name|id|number)\b|\bmedical\s+record\b|\bmrn\b|\bdate\s+of\s+birth\b|\bdob\b|\bpatient\s*:\s*|\bcase\s*(?:no\.?|number|id)\b|\bcase\s*:\s*/i.test(text);
}

export function redactContactDetails(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
    .replace(/\b(?:\+?\d[\d .()/-]{7,}\d)\b/g, '[phone redacted]');
}

export function containsContactDetails(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /\b(?:\+?\d[\d .()/-]{7,}\d)\b/.test(text);
}
