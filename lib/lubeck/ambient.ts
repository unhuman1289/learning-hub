import { LUBECK, type Moon, type Weather } from './sky.ts';

/**
 * Today's weather and moon over Lübeck for the study window. Decoration only: no learner data leaves the Hub,
 * the Worker asks on the family's behalf and the window falls back to computed values when a service is away.
 * Sources: Open-Meteo (weather, no key) and MET Norway Sunrise 3.0 (moon; needs an identifying User-Agent).
 */
export type Ambient = { weather: Weather | null; moon: Moon | null; fetchedAt: string };
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const USER_AGENT = 'LearningHub/1.0 https://learn.unhuman.cc';
const FOG_CODES = new Set([45, 48]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export function weatherFromOpenMeteo(body: unknown): Weather | null {
  const current = (body as { current?: Record<string, unknown> } | null)?.current;
  if (!current || typeof current.cloud_cover !== 'number') return null;
  const code = Number(current.weather_code),
    snow = SNOW_CODES.has(code) || Number(current.snowfall) > 0,
    fog = FOG_CODES.has(code);
  return {
    cloud: Math.max(0, Math.min(1, current.cloud_cover / 100)),
    snow,
    rain: !snow && (RAIN_CODES.has(code) || Number(current.rain) > 0),
    fog: fog ? 0.55 : 0,
  };
}

/** "2026-11-11T10:35+01:00" → 10.58 (local clock hours as the service states them). */
const clockHour = (value: unknown) => {
  const match = typeof value === 'string' ? /T(\d{2}):(\d{2})/.exec(value) : null;
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
};

export function moonFromMet(body: unknown): Moon | null {
  const p = (body as { properties?: Record<string, unknown> } | null)?.properties;
  if (!p || typeof p.moonphase !== 'number') return null;
  return {
    phase: (((p.moonphase % 360) + 360) % 360) / 360,
    riseHour: clockHour((p.moonrise as { time?: unknown } | undefined)?.time),
    setHour: clockHour((p.moonset as { time?: unknown } | undefined)?.time),
  };
}

/** `day` is the Berlin date (YYYY-MM-DD), `offset` its UTC offset such as "+01:00". */
export async function readAmbient(fetcher: Fetcher, day: string, offset: string, now = new Date()): Promise<Ambient> {
  const json = async (url: string) => {
    const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('ambient source ' + response.status);
    return response.json() as Promise<unknown>;
  };
  const [weather, moon] = await Promise.allSettled([
    json(
      `https://api.open-meteo.com/v1/forecast?latitude=${LUBECK.lat}&longitude=${LUBECK.lon}&current=weather_code,cloud_cover,rain,snowfall&timezone=Europe%2FBerlin`,
    ),
    json(`https://api.met.no/weatherapi/sunrise/3.0/moon?lat=${LUBECK.lat}&lon=${LUBECK.lon}&date=${day}&offset=${encodeURIComponent(offset)}`),
  ]);
  return {
    weather: weather.status === 'fulfilled' ? weatherFromOpenMeteo(weather.value) : null,
    moon: moon.status === 'fulfilled' ? moonFromMet(moon.value) : null,
    fetchedAt: now.toISOString(),
  };
}
