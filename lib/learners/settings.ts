import { ApiError } from '../api-error.ts';
import { DEFAULT_TARGET_MINUTES, MAX_TARGET_MINUTES, MIN_TARGET_MINUTES } from '../study-sql.ts';
import type { Db } from '../subjects/service.ts';

export type LearnerSettings = {
  dailyTargetMinutes: number;
  role: 'adult' | 'child';
  displayName: string | null;
  explainLanguage: string;
  preferences: Record<string, unknown>;
  aiBudget: Record<string, number> | null;
  /** Wishes for style and context that reach the AI runners (L5.5); data, not instructions. */
  personalPrompt: string;
  avatar: string;
};
export type SettingsPatch = Partial<Omit<LearnerSettings, 'role'>>;

type Row = {
  daily_target_minutes: number;
  role: string;
  display_name: string | null;
  explain_language: string;
  preferences: string;
  ai_budget: string | null;
  personal_prompt: string | null;
  avatar: string | null;
};

const budgetKeys = new Set(['assessPerDay', 'recheckPerDay', 'requestNowPerDay', 'extraPerDay']);
const languages = new Set(['vi', 'de', 'en']);
const bad = (message: string) => new ApiError(400, message);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export async function readSettings(db: Db, learnerId: string): Promise<LearnerSettings> {
  const row = await db
    .prepare(
      'SELECT daily_target_minutes, role, display_name, explain_language, preferences, ai_budget, personal_prompt, avatar FROM learner_settings WHERE user_id = ?',
    )
    .bind(learnerId)
    .first<Row>();
  return {
    dailyTargetMinutes: row?.daily_target_minutes ?? DEFAULT_TARGET_MINUTES,
    role: row?.role === 'child' ? 'child' : 'adult',
    displayName: row?.display_name ?? null,
    explainLanguage: row?.explain_language ?? 'vi',
    preferences: row ? JSON.parse(row.preferences) : {},
    aiBudget: row?.ai_budget ? JSON.parse(row.ai_budget) : null,
    personalPrompt: row?.personal_prompt ?? '',
    avatar: row?.avatar ?? '',
  };
}

/** Role and guardian links are admin actions (H1.6); this patch never changes them. */
export function parseSettingsPatch(body: unknown): SettingsPatch {
  if (!isRecord(body)) throw bad('Cài đặt không hợp lệ.');
  const allowedKeys = new Set(['dailyTargetMinutes', 'displayName', 'explainLanguage', 'preferences', 'aiBudget', 'personalPrompt', 'avatar']);
  const unknownKey = Object.keys(body).find((key) => !allowedKeys.has(key));
  if (unknownKey) throw bad(`Không sửa được trường ${unknownKey}.`);
  const patch: SettingsPatch = {};
  if ('dailyTargetMinutes' in body) {
    const value = body.dailyTargetMinutes;
    if (!Number.isInteger(value) || (value as number) < MIN_TARGET_MINUTES || (value as number) > MAX_TARGET_MINUTES)
      throw bad(`Mục tiêu cần từ ${MIN_TARGET_MINUTES} đến ${MAX_TARGET_MINUTES} phút.`);
    patch.dailyTargetMinutes = value as number;
  }
  if ('displayName' in body) {
    if (body.displayName === null) patch.displayName = null;
    else if (typeof body.displayName === 'string' && body.displayName.trim().length >= 1 && body.displayName.trim().length <= 40)
      patch.displayName = body.displayName.trim();
    else throw bad('Biệt danh cần 1–40 ký tự.');
  }
  if ('explainLanguage' in body) {
    if (!languages.has(body.explainLanguage as string)) throw bad('Ngôn ngữ giải thích không hợp lệ.');
    patch.explainLanguage = body.explainLanguage as string;
  }
  if ('preferences' in body) {
    if (!isRecord(body.preferences) || JSON.stringify(body.preferences).length > 2048) throw bad('Sở thích học tối đa 2 KB.');
    patch.preferences = body.preferences;
  }
  if ('aiBudget' in body) {
    if (body.aiBudget === null) patch.aiBudget = null;
    else if (
      isRecord(body.aiBudget) &&
      Object.entries(body.aiBudget).every(
        ([key, value]) => budgetKeys.has(key) && Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100,
      )
    ) {
      patch.aiBudget = body.aiBudget as Record<string, number>;
    } else throw bad('Ngân sách AI không hợp lệ.');
  }
  if ('personalPrompt' in body) {
    if (typeof body.personalPrompt !== 'string' || body.personalPrompt.length > 4000) throw bad('Prompt cá nhân tối đa 4000 ký tự.');
    patch.personalPrompt = body.personalPrompt.trim();
  }
  if ('avatar' in body) {
    if (typeof body.avatar !== 'string' || !/^[\p{Extended_Pictographic}\p{L}\p{N}\u200d\ufe0f]{0,8}$/u.test(body.avatar.trim()))
      throw bad('Biểu tượng tối đa vài ký tự hoặc emoji.');
    patch.avatar = body.avatar.trim();
  }
  if (!Object.keys(patch).length) throw bad('Không có gì để sửa.');
  return patch;
}

export async function updateSettings(db: Db, learnerId: string, patch: SettingsPatch, now = new Date()) {
  const current = await readSettings(db, learnerId);
  const next = { ...current, ...patch };
  // Edited preferences keep the hints the learner has already seen.
  if (patch.preferences) for (const key of Object.values(SEEN_HINTS)) if (key in current.preferences) next.preferences = { ...next.preferences, [key]: current.preferences[key] };
  await db
    .prepare(
      `INSERT INTO learner_settings (user_id, daily_target_minutes, updated, display_name, explain_language, preferences, ai_budget, personal_prompt, avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET daily_target_minutes = excluded.daily_target_minutes, updated = excluded.updated,
      display_name = excluded.display_name, explain_language = excluded.explain_language, preferences = excluded.preferences, ai_budget = excluded.ai_budget,
      personal_prompt = excluded.personal_prompt, avatar = excluded.avatar`,
    )
    .bind(
      learnerId,
      next.dailyTargetMinutes,
      now.toISOString(),
      next.displayName,
      next.explainLanguage,
      JSON.stringify(next.preferences),
      next.aiBudget ? JSON.stringify(next.aiBudget) : null,
      next.personalPrompt,
      next.avatar,
    )
    .run();
  return readSettings(db, learnerId);
}

/** UI hints a learner has already seen. Stored in `preferences` but kept out of model context. */
export const SEEN_HINTS = { pageEdge: 'pageEdgeHintSeen' } as const;
export type SeenHint = keyof typeof SEEN_HINTS;
export const isSeenHint = (value: unknown): value is SeenHint => typeof value === 'string' && Object.hasOwn(SEEN_HINTS, value);

/** The learner has not yet dismissed this hint. */
export const showsHint = (settings: LearnerSettings, hint: SeenHint) => settings.preferences[SEEN_HINTS[hint]] !== true;

/**
 * Remembers that the learner saw a hint. Children may record this for themselves even though they
 * cannot edit settings: it changes no goal, budget or prompt. A single statement, so concurrent
 * settings edits are not overwritten.
 */
export async function markHintSeen(db: Db, learnerId: string, hint: SeenHint, now = new Date()) {
  const key = SEEN_HINTS[hint];
  await db
    .prepare(
      `INSERT INTO learner_settings (user_id, daily_target_minutes, updated, preferences) VALUES (?, ?, ?, json_object(?, json('true')))
    ON CONFLICT(user_id) DO UPDATE SET preferences = json_set(preferences, '$.' || ?, json('true')), updated = excluded.updated`,
    )
    .bind(learnerId, DEFAULT_TARGET_MINUTES, now.toISOString(), key, key)
    .run();
}

export async function setListeningVoice(db: Db, learnerId: string, voice: 'f' | 'm', now = new Date()) {
  await db.prepare(
    `INSERT INTO learner_settings (user_id,daily_target_minutes,updated,preferences) VALUES (?,?,?,json_object('listeningVoice',?))
     ON CONFLICT(user_id) DO UPDATE SET preferences=json_set(preferences,'$.listeningVoice',?),updated=excluded.updated`,
  ).bind(learnerId, DEFAULT_TARGET_MINUTES, now.toISOString(), voice, voice).run();
}

/** Learning preferences without UI bookkeeping, for model context. */
export function learningPreferences(preferences: unknown) {
  if (!isRecord(preferences)) return preferences;
  const hidden = new Set<string>(Object.values(SEEN_HINTS));
  return Object.fromEntries(Object.entries(preferences).filter(([key]) => !hidden.has(key)));
}
