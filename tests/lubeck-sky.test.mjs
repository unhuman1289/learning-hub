import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyClock, berlinClock, computedMoonPhase, dayOfYear, mix, moonIllumination, moonProgress, skyState, sunTimes, typicalWeather } from '../lib/lubeck/sky.ts';
import { moonFromMet, readAmbient, weatherFromOpenMeteo } from '../lib/lubeck/ambient.ts';

const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('sunrise and sunset in Lübeck follow the season, in local clock time', () => {
  const november = sunTimes(dayOfYear(11, 11), 1);
  near(november.rise, 7 + 36 / 60, 0.15);
  near(november.set, 16 + 22 / 60, 0.15);
  const june = sunTimes(dayOfYear(6, 21), 2);
  near(june.rise, 4 + 43 / 60, 0.2);
  near(june.set, 21 + 53 / 60, 0.2);
  assert.ok(june.noonAltitude > 58 && november.noonAltitude < 20);
});

test('the sky is dark at night, warm at the edges of the day and plain by day', () => {
  const sun = { rise: 7.6, set: 16.4 };
  const noon = skyState(12, sun, 0.1), dusk = skyState(16.2, sun, 0.1), night = skyState(23, sun, 0.1);
  assert.equal(noon.day, true);
  assert.equal(noon.darkness, 0);
  assert.equal(night.day, false);
  assert.equal(night.darkness, 1);
  assert.ok(dusk.warmth > 0.6 && noon.warmth === 0 && night.warmth === 0);
  assert.ok(skyState(16.2, sun, 1).warmth < dusk.warmth, 'cloud mutes the golden hour');
  // Just after midnight is as far from sunset as from sunrise across the day boundary.
  assert.equal(skyState(0.5, sun, 0).darkness, 1);
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

test('the device clock is read as Berlin time, including summer time', () => {
  const winter = berlinClock(new Date('2026-11-11T14:30:00Z'));
  assert.deepEqual([winter.hour, winter.month, winter.day, winter.offsetHours], [15.5, 11, 11, 1]);
  const summer = berlinClock(new Date('2026-06-30T22:15:00Z'));
  assert.deepEqual([summer.hour, summer.month, summer.day, summer.offsetHours], [0.25, 7, 1, 2]);
});

test('moon: phase, light and position between rise and set', () => {
  near(computedMoonPhase(2026, 11, 24), 0.5, 0.06);
  assert.equal(moonIllumination(0), 0);
  assert.equal(moonIllumination(0.5), 100);
  near(moonProgress(13.7, 10.58, 16.8), (13.7 - 10.58) / (16.8 - 10.58), 1e-9);
  assert.equal(moonProgress(20, 10.58, 16.8), null);
  near(moonProgress(1, 22, 6), 3 / 8, 1e-9);
  assert.equal(moonProgress(12, null, 16), null);
});

test('weather and moon answers are reduced to what the window draws; bad answers become null', () => {
  assert.deepEqual(weatherFromOpenMeteo({ current: { weather_code: 3, cloud_cover: 97, rain: 0, snowfall: 0 } }), { cloud: 0.97, rain: false, snow: false, fog: 0 });
  assert.deepEqual(weatherFromOpenMeteo({ current: { weather_code: 61, cloud_cover: 100, rain: 0.4, snowfall: 0 } }), { cloud: 1, rain: true, snow: false, fog: 0 });
  assert.deepEqual(weatherFromOpenMeteo({ current: { weather_code: 73, cloud_cover: 80, rain: 0, snowfall: 0.2 } }), { cloud: 0.8, rain: false, snow: true, fog: 0 });
  assert.equal(weatherFromOpenMeteo({ current: { weather_code: 45, cloud_cover: 60 } }).fog, 0.55);
  assert.equal(weatherFromOpenMeteo({ error: true }), null);
  const moon = moonFromMet({ properties: { moonphase: 18.87, moonrise: { time: '2026-11-11T10:35+01:00' }, moonset: { time: '2026-11-11T16:48+01:00' } } });
  near(moon.phase, 18.87 / 360, 1e-9);
  near(moon.riseHour, 10 + 35 / 60, 1e-9);
  near(moon.setHour, 16.8, 1e-9);
  assert.deepEqual(moonFromMet({ properties: { moonphase: 200, moonrise: { time: null }, moonset: {} } }), { phase: 200 / 360, riseHour: null, setHour: null });
  assert.equal(moonFromMet({}), null);
  assert.deepEqual(typicalWeather(11), { cloud: 0.92, rain: true, snow: false, fog: 0 });
});

test('one failing service does not hide the other, and only Lübeck coordinates are sent', async () => {
  const urls = [];
  const fetcher = async (url, init) => {
    urls.push(url);
    assert.match(init.headers['User-Agent'], /LearningHub/);
    if (url.includes('open-meteo')) return new Response('down', { status: 502 });
    return Response.json({ properties: { moonphase: 90, moonrise: { time: '2026-11-11T10:35+01:00' }, moonset: { time: '2026-11-11T16:48+01:00' } } });
  };
  const ambient = await readAmbient(fetcher, '2026-11-11', '+01:00', new Date('2026-11-11T12:00:00Z'));
  assert.equal(ambient.weather, null);
  assert.equal(ambient.moon.phase, 0.25);
  assert.equal(urls.length, 2);
  for (const url of urls) assert.match(url, /^https:\/\/(api\.open-meteo\.com|api\.met\.no)\/.*53\.87.*10\.69/);
  assert.match(urls[1], /date=2026-11-11&offset=%2B01%3A00/);
});

test("the device clock follows the device's own zone, not Berlin's", async () => {
  const { deviceClock, berlinClock } = await import("../lib/lubeck/sky.ts");
  const before = process.env.TZ;
  try {
    process.env.TZ = "Asia/Ho_Chi_Minh";
    const now = new Date("2026-11-12T13:30:00Z");
    const local = deviceClock(now);
    assert.equal(local.hour, 20.5);
    assert.equal(local.offsetHours, 7);
    assert.equal(local.day, 12);
    assert.equal(berlinClock(now).hour, 14.5);
    // Late evening in Berlin is already the next day in Vietnam.
    assert.equal(deviceClock(new Date("2026-11-12T20:00:00Z")).day, 13);
    assert.equal(berlinClock(new Date("2026-11-12T20:00:00Z")).day, 12);
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test("the window is drawn at the learner's hour against Lübeck's sunset", () => {
  const berlin = { hour: 14.5, month: 11, day: 12, offsetHours: 1, weekday: 'Thứ năm' };
  const device = { hour: 20.5, month: 11, day: 12, offsetHours: 7, weekday: 'Thứ năm' };
  const clock = skyClock(berlin, device);
  assert.equal(clock.hour, 20.5);
  assert.equal(clock.offsetHours, 1);
  const sun = sunTimes(dayOfYear(clock.month, clock.day), clock.offsetHours);
  assert.ok(sun.set < 17 && sun.set > 15, `Lübeck sunset on 12 Nov is about 16:00, got ${sun.set}`);
  assert.equal(skyState(clock.hour, sun, 0.5).day, false);
  assert.equal(skyState(14.5, sun, 0.5).day, true);
});
