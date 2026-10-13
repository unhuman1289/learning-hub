import { berlinDay } from '../daily-policy.ts';

export type Activity = 'recall' | 'recognize' | 'correct' | 'transform' | 'apply' | 'explain' | 'create' | 'investigate';
export type Mastery = 'not_assessed' | 'introduced' | 'developing' | 'demonstrated' | 'needs_review';
export type ErrorCategory = 'knowledge' | 'application' | 'slip' | 'reading' | 'unknown';
export type Evidence = {
  id: string;
  submissionId: string;
  at: string;
  activity: Activity;
  result: 'correct' | 'partial' | 'incorrect' | 'ungradable';
  support: 'none' | 'hint1' | 'hint2' | 'solution';
  attemptNo: number;
  status: 'graded' | 'pending' | 'disputed' | 'void';
  itemVoid?: boolean;
  context: 'lesson' | 'review' | 'check';
  stage: string;
  errors?: { label: string; category: ErrorCategory }[];
};
export type Dimensions = { knowledge: number; recognition: number; application: number; retention: number };
export type ErrorPattern = {
  label: string; labelNorm: string; category: ErrorCategory;
  confidence: 'suspected' | 'confirmed'; status: 'open' | 'improving' | 'resolved';
  occurrences: number; daysSeen: number; exampleAttemptIds: string[];
  firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null;
};
export type Review = {
  intervalDays: number | null; nextReviewDay: string | null;
  kind: 'retention' | 'remediation' | null; stepDay: string | null; maintained: boolean;
};
export const reviewSteps = [1, 3, 7, 14, 30, 60] as const;
const DAY_MS = 86400000;
const epochDay = (day: string) => Date.parse(day + 'T00:00:00Z') / DAY_MS;
export const addDays = (day: string, days: number) => new Date((epochDay(day) + days) * DAY_MS).toISOString().slice(0, 10);
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (e: Evidence) => {
  const parts = dayFormatter.formatToParts(new Date(e.at));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
};
const gap = (a: string, b: string) => epochDay(a) - epochDay(b);

/** Invalidated, disputed and unreadable answers contribute no evidence, including no errors. */
export function evidenceStrength(e: Evidence): 0 | 1 | 2 | 3 | null {
  if (e.status !== 'graded' || e.itemVoid || e.result === 'ungradable') return null;
  if (e.result === 'incorrect' || e.support === 'solution') return 0;
  if (e.support !== 'none') return 1;
  if (e.result === 'partial' || e.attemptNo > 1) return 2;
  return 3;
}

function orderedEvidence(input: readonly Evidence[], now: Date): Evidence[] {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid evaluation time.');
  const byId = new Map<string, Evidence>();
  for (const e of input) {
    if (!Number.isFinite(Date.parse(e.at)) || !Number.isInteger(e.attemptNo) || e.attemptNo < 1) throw new Error('Invalid evidence.');
    const old = byId.get(e.id);
    if (old && JSON.stringify(old) !== JSON.stringify(e)) throw new Error('Conflicting evidence id.');
    byId.set(e.id, e);
  }
  return [...byId.values()].filter(e => Date.parse(e.at) <= now.getTime() && evidenceStrength(e) !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id, 'en'));
}

const dimensionActivities = {
  knowledge: ['recall', 'explain'], recognition: ['recognize', 'correct'],
  application: ['transform', 'apply', 'create', 'investigate'],
};
function dimension(rows: Evidence[]): number {
  if (!rows.length) return 0;
  const independentDays = new Set(rows.filter(e => evidenceStrength(e) === 3).map(dayOf));
  // An E0 anywhere in the latest submission/time group prevents level 3. ID ordering is not evidence.
  const last = rows.at(-1)!;
  const latest = rows.filter(e => e.submissionId === last.submissionId || e.at === last.at);
  if (independentDays.size >= 2 && latest.every(e => evidenceStrength(e) !== 0)) return 3;
  if (independentDays.size || rows.filter(e => evidenceStrength(e) === 2).length >= 2) return 2;
  return 1;
}
function dimensions(rows: Evidence[], day: string): Dimensions {
  const recent = rows.filter(e => gap(day, dayOf(e)) < 60);
  const base = Object.fromEntries(Object.entries(dimensionActivities).map(([key, activities]) =>
    [key, dimension(recent.filter(e => activities.includes(e.activity)))])) as Omit<Dimensions, 'retention'>;
  let previousStrongDay: string | null = null;
  const delayed: Evidence[] = [];
  // A previous answer from the same sitting/day cannot manufacture a delayed check.
  for (const e of rows) {
    if (previousStrongDay && gap(dayOf(e), previousStrongDay) >= 5) delayed.push(e);
    if (evidenceStrength(e)! >= 2) previousStrongDay = dayOf(e);
  }
  const independent = delayed.filter(e => evidenceStrength(e) === 3);
  let retention = delayed.length ? 1 : 0;
  if (independent.length) retention = 2;
  if (independent.length >= 2 && gap(dayOf(independent.at(-1)!), dayOf(independent[0])) >= 14) retention = 3;
  return { ...base, retention };
}

export const normalizeErrorLabel = (label: string) => label.normalize('NFKC').toLocaleLowerCase('de')
  .replace(new RegExp('[^\\p{L}\\p{N}]+', 'gu'), ' ').trim();

function patterns(rows: Evidence[]): ErrorPattern[] {
  const groups = new Map<string, { e: Evidence; label: string; category: ErrorCategory }[]>();
  for (const e of rows) {
    const seen = new Set<string>();
    for (const error of e.errors ?? []) {
      const norm = normalizeErrorLabel(error.label);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const category = error.category === 'slip' && !rows.some(other => other.id !== e.id && other.submissionId === e.submissionId && evidenceStrength(other) === 3)
        ? 'unknown' : error.category;
      const group = groups.get(norm) ?? [];
      group.push({ e, label: error.label, category });
      groups.set(norm, group);
    }
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([labelNorm, occurrences]) => {
    const first = occurrences[0], last = occurrences.at(-1)!;
    const days = new Set(occurrences.map(x => dayOf(x.e)));
    const after = rows.filter(e => Date.parse(e.at) > Date.parse(last.e.at));
    const lastTwo = rows.slice(-2);
    const clean = (e: Evidence) => !(e.errors ?? []).some(x => normalizeErrorLabel(x.label) === labelNorm);
    const goodDays = new Set(after.filter(e => evidenceStrength(e) === 3 && clean(e)).map(dayOf));
    const resolved = goodDays.size >= 2;
    const improving = lastTwo.length === 2 && lastTwo.every(e => Date.parse(e.at) > Date.parse(last.e.at) && evidenceStrength(e)! >= 2 && clean(e));
    let resolvedAt: string | null = null;
    if (resolved) {
      const seenDays = new Set<string>();
      resolvedAt = after.find(e => {
        if (evidenceStrength(e) === 3 && clean(e)) seenDays.add(dayOf(e));
        return seenDays.size >= 2;
      })!.at;
    }
    return { label: last.label, labelNorm, category: last.category, confidence: days.size >= 2 ? 'confirmed' : 'suspected',
      status: resolved ? 'resolved' : improving ? 'improving' : 'open', occurrences: occurrences.length,
      daysSeen: days.size, exampleAttemptIds: occurrences.slice(-5).map(x => x.e.id),
      firstSeenAt: first.e.at, lastSeenAt: last.e.at, resolvedAt };
  });
}

function review(rows: Evidence[], errorPatterns: ErrorPattern[]): Review {
  let intervalDays: number | null = null, nextReviewDay: string | null = null;
  let kind: Review['kind'] = null, stepDay: string | null = null, maintained = false;
  for (const e of rows) {
    const strength = evidenceStrength(e)!;
    const day = dayOf(e);
    if (intervalDays === null) {
      if (strength < 2) continue;
      intervalDays = 3; nextReviewDay = addDays(day, 3); kind = 'retention'; stepDay = day;
      continue; // The first successful answer initializes; it does not also advance.
    }
    if (!(e.context === 'review' || e.context === 'check' || e.stage === 'independent')) continue;
    if (strength === 0) {
      intervalDays = 1; maintained = false;
      // A failure resets eligibility even if there was already an increase on this day.
      kind = errorPatterns.some(p => p.status !== 'resolved' && ['knowledge', 'application'].includes(p.category)) ? 'remediation' : 'retention';
      stepDay = day;
    } else if (strength === 1) {
      intervalDays = reviewSteps[Math.max(0, reviewSteps.indexOf(intervalDays as typeof reviewSteps[number]) - 1)];
      maintained = false; stepDay = day;
    } else if (strength === 3 && stepDay !== day) {
      if (intervalDays === 60) maintained = true;
      else intervalDays = reviewSteps[reviewSteps.indexOf(intervalDays as typeof reviewSteps[number]) + 1];
      stepDay = day;
    }
    // Unsupported/partial evidence cannot perpetually postpone an already scheduled review.
    if (strength === 3 || strength < 2) nextReviewDay = maintained ? null : addDays(day, intervalDays);
  }
  return { intervalDays, nextReviewDay, kind, stepDay, maintained };
}

export function computeSkillState(input: readonly Evidence[], now: Date) {
  const rows = orderedEvidence(input, now), day = berlinDay(now);
  const dim = dimensions(rows, day), errorPatterns = patterns(rows);
  const confirmedBlock = errorPatterns.some(p => p.confidence === 'confirmed' && p.status !== 'resolved' && ['knowledge', 'application'].includes(p.category));
  // If application is high but there is a blocking error/insufficient understanding, remain developing.
  let ceiling: Mastery = !rows.length ? 'not_assessed' : Math.max(dim.knowledge, dim.recognition, dim.application) <= 1 ? 'introduced' : 'developing';
  if (dim.application === 3 && Math.max(dim.knowledge, dim.recognition) >= 2 && !confirmedBlock) ceiling = 'demonstrated';
  const schedule = review(rows, errorPatterns);
  const mostRecent = rows.at(-1);
  const latestGroup = mostRecent ? rows.filter(e => e.submissionId === mostRecent.submissionId || e.at === mostRecent.at) : [];
  const failedLatest = latestGroup.some(e => evidenceStrength(e) === 0);
  // Look for independent application on two days and understanding prior to the last failing group.
  const beforeFailure = rows.filter(e => !latestGroup.includes(e));
  const historicalDim = dimensions(beforeFailure.filter(e => evidenceStrength(e)! >= 2), day);
  const wasDemonstrated = historicalDim.application === 3 && Math.max(historicalDim.knowledge, historicalDim.recognition) >= 2;
  const overdue = (ceiling === 'developing' || ceiling === 'demonstrated') && schedule.nextReviewDay !== null && schedule.intervalDays !== null &&
    gap(day, schedule.nextReviewDay) > schedule.intervalDays / 2;
  if (overdue || failedLatest && wasDemonstrated) ceiling = 'needs_review';
  const exposure: Partial<Record<Activity, number>> = {}, recentExposure: Partial<Record<Activity, number>> = {};
  for (const e of rows) {
    exposure[e.activity] = (exposure[e.activity] ?? 0) + 1;
    if (gap(day, dayOf(e)) < 14) recentExposure[e.activity] = (recentExposure[e.activity] ?? 0) + 1;
  }
  const stuckOn = dim.application < 2 ? Object.entries(recentExposure).filter(([, count]) => count! >= 8)
    .sort(([a, ac], [b, bc]) => bc! - ac! || a.localeCompare(b, 'en'))[0]?.[0] as Activity | undefined : undefined;
  return { dimensions: dim, mastery: ceiling, masteryCeiling: ceiling, errors: errorPatterns, review: schedule,
    exposure, recentExposure, attemptsTotal: rows.length, lastAttemptAt: mostRecent?.at ?? null,
    lastIndependentAt: rows.filter(e => evidenceStrength(e) === 3).at(-1)?.at ?? null, stuckOn: stuckOn ?? null };
}

/** AI proposals cannot shorten below half/double above the server interval or escape [1, 60]. */
export function clampReviewDays(proposed: number, interval: number): number {
  if (!Number.isFinite(proposed) || !reviewSteps.includes(interval as typeof reviewSteps[number])) throw new Error('Invalid review proposal.');
  return Math.min(60, Math.max(1, Math.ceil(interval / 2), Math.min(Math.floor(interval * 2), Math.round(proposed))));
}
export function clampMastery(proposed: Mastery, ceiling: Mastery): { mastery: Mastery; clipped: boolean } {
  if (proposed === 'needs_review') return { mastery: proposed, clipped: false };
  if (ceiling === 'needs_review') return { mastery: ceiling, clipped: true };
  const ranks: Mastery[] = ['not_assessed', 'introduced', 'developing', 'demonstrated'];
  if (!ranks.includes(proposed) || !ranks.includes(ceiling)) throw new Error('Invalid mastery proposal.');
  return ranks.indexOf(proposed) <= ranks.indexOf(ceiling) ? { mastery: proposed, clipped: false } : { mastery: ceiling, clipped: true };
}

/** An AI resolve proposal is admissible only with real positive, clean evidence after the last error. */
export function canResolveError(pattern: ErrorPattern, input: readonly Evidence[], evidenceIds: readonly string[], now: Date): boolean {
  const rows = orderedEvidence(input, now);
  if (!evidenceIds.length || gap(berlinDay(now), berlinDay(new Date(pattern.lastSeenAt))) < 14) return false;
  if (rows.some(e => Date.parse(e.at) > Date.parse(pattern.lastSeenAt) && (e.errors ?? []).some(x => normalizeErrorLabel(x.label) === pattern.labelNorm))) return false;
  return evidenceIds.every(id => rows.some(e => e.id === id && Date.parse(e.at) > Date.parse(pattern.lastSeenAt) && evidenceStrength(e)! >= 2 && !(e.errors ?? []).some(x => normalizeErrorLabel(x.label) === pattern.labelNorm)));
}

export function evidenceFingerprint(input:readonly Evidence[]):string {
 return JSON.stringify([...input].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id,'en')).map(e=>({id:e.id,submissionId:e.submissionId,at:e.at,activity:e.activity,result:e.result,support:e.support,attemptNo:e.attemptNo,status:e.status,context:e.context,stage:e.stage,itemVoid:!!e.itemVoid,errors:e.errors??[]})));
}
