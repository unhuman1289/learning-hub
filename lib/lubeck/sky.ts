/**
 * Sky over Lübeck for the study window (DESIGN.md "Lübeck window"). Pure functions: the sun is computed from the
 * date, the clock comes from the device and is read in Europe/Berlin, weather and moon come from /api/ambient.
 */
export const LUBECK = { lat: 53.87, lon: 10.69 };
const RAD = Math.PI / 180;
const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export type Weather = { cloud: number; rain: boolean; snow: boolean; fog: number };
export type Moon = { phase: number; riseHour: number | null; setHour: number | null };
export type BerlinClock = { hour: number; month: number; day: number; offsetHours: number; weekday: string };

export const dayOfYear = (month: number, day: number) => CUMULATIVE_DAYS[month - 1] + day;

/** Sunrise, sunset (local clock hours) and the noon altitude in degrees; accurate to a few minutes. */
export function sunTimes(doy: number, offsetHours: number) {
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const b = ((2 * Math.PI) / 365) * (doy - 81);
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const noon = 12 - LUBECK.lon / 15 - equationOfTime / 60 + offsetHours;
  const cosHourAngle =
    (Math.sin(-0.833 * RAD) - Math.sin(LUBECK.lat * RAD) * Math.sin(declination * RAD)) /
    (Math.cos(LUBECK.lat * RAD) * Math.cos(declination * RAD));
  const half = Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) / RAD / 15;
  return { rise: noon - half, set: noon + half, noonAltitude: 90 - LUBECK.lat + declination };
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number) {
  const k = Math.max(0, Math.min(1, t)),
    x = channels(a),
    y = channels(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

const circular = (a: number, b: number) => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};

/**
 * Colour and light for one moment. `edge` is hours from the nearest sunrise/sunset (positive by day),
 * `darkness` 0 by day to 1 at night, `warmth` peaks in the golden hour and fades under cloud.
 */
export function skyState(hour: number, sun: { rise: number; set: number }, cloud: number) {
  const day = hour > sun.rise && hour < sun.set;
  const edge = day ? Math.min(hour - sun.rise, sun.set - hour) : -Math.min(circular(hour, sun.rise), circular(hour, sun.set));
  const dayColor = mix('#8fc0ea', '#b3bec6', cloud),
    night = mix('#141c30', '#262b38', cloud),
    dawn = mix('#5b6191', '#6c7080', cloud),
    gold = mix('#eeb07c', '#b9aca4', cloud);
  const sky =
    edge <= -1
      ? night
      : edge < -0.4
        ? mix(night, dawn, (edge + 1) / 0.6)
        : edge < 0.3
          ? mix(dawn, gold, (edge + 0.4) / 0.7)
          : edge < 1.2
            ? mix(gold, dayColor, (edge - 0.3) / 0.9)
            : dayColor;
  return {
    day,
    edge,
    sky,
    darkness: Math.max(0, Math.min(1, (0.3 - edge) / 1.3)),
    warmth: Math.max(0, 1 - Math.abs(edge - 0.35) / 0.9) * (1 - cloud * 0.8),
  };
}

/** The device clock read as Lübeck time. */
export function berlinClock(now: Date): BerlinClock {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now))
    parts[p.type] = p.value;
  const weekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Europe/Berlin', weekday: 'long' }).format(now);
  return {
    hour: Number(parts.hour) + Number(parts.minute) / 60,
    month: Number(parts.month),
    day: Number(parts.day),
    offsetHours: (Number(parts.hour) - now.getUTCHours() + 24) % 24,
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
  };
}

/** The same shape read from the device's own clock and time zone: the calendar leaf and anything that is "now" for the learner. */
export function deviceClock(now: Date): BerlinClock {
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(now);
  return {
    hour: now.getHours() + now.getMinutes() / 60,
    month: now.getMonth() + 1,
    day: now.getDate(),
    offsetHours: -now.getTimezoneOffset() / 60,
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
  };
}

/**
 * The clock the study window is drawn with: the learner's own date and hour, set against Lübeck's day. Sunrise and
 * sunset stay Lübeck's (they are computed in Lübeck clock hours, so `offsetHours` is Berlin's), weather and moon stay Lübeck's.
 */
export function skyClock(berlin: BerlinClock, device: BerlinClock): BerlinClock {
  return { ...device, offsetHours: berlin.offsetHours };
}

/** Used until /api/ambient answers, and whenever it fails. */
export function typicalWeather(month: number): Weather {
  if (month === 12 || month <= 2) return { cloud: 0.92, rain: false, snow: true, fog: 0 };
  if (month === 10 || month === 11) return { cloud: 0.92, rain: true, snow: false, fog: 0 };
  if (month >= 5 && month <= 8) return { cloud: 0.08, rain: false, snow: false, fog: 0 };
  return { cloud: 0.45, rain: false, snow: false, fog: 0 };
}

/** Moon phase 0..1 (0 new, 0.5 full) from the date alone; the fallback when the moon service is away. */
export function computedMoonPhase(year: number, month: number, day: number) {
  const age = (((Date.UTC(year, month - 1, day) - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.53 + 29.53) % 29.53;
  return age / 29.53;
}
export const moonIllumination = (phase: number) => Math.round(((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100);

/** Where the moon stands: 0..1 across the sky between rise and set, or null when it is down. */
export function moonProgress(hour: number, riseHour: number | null, setHour: number | null) {
  if (riseHour === null || setHour === null) return null;
  const span = (setHour - riseHour + 24) % 24 || 24,
    since = (hour - riseHour + 24) % 24;
  return since <= span ? since / span : null;
}
