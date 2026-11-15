import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { routeMetrics } from './route-metrics.mjs';

const lessonUrl = '/api/lessons/les_00000000000000000007';
const itemUrl = lessonUrl + '/items/i1';
const transcript = 'Können wir uns am Montag um zehn Uhr treffen? Ja, das passt gut.';
const voiceSrc = { f: '/api/audio/demo-f', m: '/api/audio/demo-m' };
const audio = { lang: 'de-DE', rate: 1, maxPlays: 2, durationMs: 4939, transcript: 'after_answer', src: voiceSrc };
const fixture = await readFile(new URL('./fixtures/listening-demo.m4a', import.meta.url));

test('nghe, đổi giọng, nghe chậm và mở lời thoại', async ({ page, context, browserName }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Người học thử/ }).tap();
  const desk = page.getByRole('region', { name: 'Bài tiếp theo' });
  const lesson = desk.getByRole('link', { name: /Mở bài|Học tiếp/ }).first();
  await expect(lesson).toBeVisible();

  const deskSnapshot = routeMetrics(page);
  await page.goto('/');
  await expect(lesson).toBeVisible();
  // Use the same cutoff as U5: stop collecting when the desk's next lesson is visible.
  const { gzip, chunks } = await deskSnapshot();
  console.log(JSON.stringify({ project: info.project.name, desk: { gzip, chunks } }));
  expect(gzip).toBeGreaterThan(0);
  expect(gzip).toBeLessThanOrEqual(180_000);

  if (process.env.CI) {
    const requests = new Map();
    const origin = new URL(page.url()).origin;
    const logRequest = request => {
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname.endsWith('.js')) requests.set(url.href, request.resourceType());
    };
    page.on('request', logRequest);
    await page.reload();
    await expect(lesson).toBeVisible();
    const early = new Set(requests.keys());
    await page.waitForLoadState('networkidle');
    page.off('request', logRequest);
    const legacy = await Promise.all([...requests].map(async ([url, type]) => {
      const response = await context.request.get(url);
      const bytes = (await response.body());
      const node = await fetch(url).then(result => result.arrayBuffer());
      return [new URL(url).pathname.split('/').at(-1), type, early.has(url), gzipSync(bytes).length,
        gzipSync(Buffer.from(node)).length, bytes.length];
    }));
    console.log(JSON.stringify({ project: info.project.name, legacy }));
  }

  let missingSource = false;
  let submitted = false;
  let plays = 0;
  let slowReveals = 0;
  let failMaleAudio = true;
  const heardRequests = [];
  const transcripts = [];
  // Keep the real demo lesson, answer submission and profile API. Inject the L2 reader metadata.
  await page.route(url => url.pathname === lessonUrl || url.pathname === lessonUrl + '/feedback', async route => {
    const response = await route.fetch();
    const data = await response.json();
    for (const item of data.lesson?.items ?? []) {
      if (item.id === 'i1') {
        item.prompt = 'Bạn nghe thấy họ hẹn nhau lúc nào?';
        item.audio = missingSource ? { ...audio, src: undefined } : audio;
      }
      if (item.id === 'i2') item.audio = { ...audio, src: { f: '/api/audio/next-f', m: '/api/audio/next-m' } };
    }
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/audio/*', async route => {
    const url = new URL(route.request().url()).pathname;
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    if (url === voiceSrc.m && failMaleAudio) return route.abort('failed');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), fixture.length - 1) : fixture.length - 1;
    const status = range ? 206 : 200;
    heardRequests.push({ url, status });
    await route.fulfill({
      status,
      contentType: 'audio/mp4',
      body: fixture.subarray(start, end + 1),
      headers: {
        'Accept-Ranges': 'bytes',
        ...(range && { 'Content-Range': `bytes ${start}-${end}/${fixture.length}` }),
      },
    });
  });
  await page.route('**' + itemUrl + '/plays', async route => {
    plays++;
    await route.fulfill({ status: 404 });
  });
  await page.route('**' + itemUrl + '/reveal', async route => {
    const { level } = route.request().postDataJSON();
    if (level === 'slow') {
      slowReveals++;
      return route.fulfill({ status: 404 });
    }
    transcripts.push(submitted);
    await route.fulfill({ json: { transcript } });
  });

  await lesson.tap();
  await expect(page.getByRole('button', { name: 'Bắt đầu bài' })).toBeVisible();
  expect(heardRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Bắt đầu bài' }).tap();
  const article = page.locator('article.lesson-item');
  const play = article.getByRole('button', { name: 'Phát âm thanh' });
  await expect(play).toBeVisible();
  expect((await play.boundingBox()).height).toBeGreaterThanOrEqual(56);
  const media = article.locator('audio');
  await expect(media).toHaveAttribute('preload', 'none');
  await expect.poll(() => heardRequests).toEqual(expect.arrayContaining([
    { url: voiceSrc.f, status: 206 }, { url: '/api/audio/next-f', status: 206 },
  ]));
  await expect(article.getByText('Còn 2 lượt nghe')).toBeVisible();
  const screenshot = async (name) => {
    if (info.project.name !== 'iphone-13' || !process.env.L5_SCREENSHOTS) return;
    await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn', /.+/);
    await article.getByRole('heading').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ path: `${process.env.L5_SCREENSHOTS}/${name}.png` });
  };
  await screenshot('01-chua-nghe');

  // Linux WebKit may lack a usable media sink. Only simulate media events on that platform.
  const simulated = browserName === 'webkit' && process.platform === 'linux';
  if (simulated) {
    console.log('Linux WebKit: UI/media events and Range responses only.');
    await media.evaluate(node => {
      node.play = async () => { node.dispatchEvent(new Event('playing')); };
    });
  }
  await play.tap();
  await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();
  await screenshot('02-dang-phat');
  if (simulated) await media.dispatchEvent('ended');
  await expect(article.getByText('Còn 1 lượt nghe')).toBeVisible();
  await expect.poll(() => plays).toBe(1);

  const voiceButton = article.getByRole('button', { name: 'Nam', exact: true });
  await voiceButton.tap();
  await expect(voiceButton).toHaveAttribute('aria-pressed', 'true');
  await expect(voiceButton).toBeEnabled();
  await expect(media).toHaveAttribute('src', voiceSrc.m);
  const origin = new URL(page.url()).origin;
  const settingsUrl = '/api/learners/me/settings';
  expect((await (await context.request.get(settingsUrl)).json()).settings.preferences.listeningVoice).toBe('m');
  await expect(article.getByText('Còn 1 lượt nghe')).toBeVisible();
  if (simulated) await media.evaluate(node => {
    node.play = async () => { throw new Error('Simulated interrupted playback'); };
  });
  await play.tap();
  const retry = article.getByRole('button', { name: 'Phát lại', exact: true });
  await expect(retry).toBeVisible();
  expect(plays).toBe(1);
  failMaleAudio = false;
  if (simulated) await media.evaluate(node => {
    node.play = async () => { node.dispatchEvent(new Event('playing')); };
  });
  await retry.focus();
  await page.keyboard.press('r');
  await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();
  if (simulated) await media.dispatchEvent('ended');
  await expect(article.getByText('Còn 1 lượt nghe')).toBeVisible();
  expect(plays).toBe(1);

  await article.getByRole('button', { name: 'Chậm hơn' }).tap();
  await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();
  expect(await media.evaluate(node => [node.playbackRate, node.preservesPitch])).toEqual([0.8, true]);
  if (simulated) await media.dispatchEvent('ended');
  await expect(article.getByRole('button', { name: 'Nghe thêm (tính là gợi ý)' })).toBeVisible();
  await expect.poll(() => [plays, slowReveals]).toEqual([2, 1]);
  await screenshot('03-het-luot');

  const reveal = article.getByRole('button', { name: 'Xem lời thoại', exact: true }).first();
  await reveal.tap();
  const confirm = article.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Huỷ' }).tap();
  expect(transcripts).toEqual([]);
  await article.getByRole('textbox', { name: 'Bài làm của bạn' }).fill('Montag um zehn Uhr.');
  const saved = page.waitForResponse(response => response.url().endsWith(lessonUrl + '/submissions') && response.ok());
  await article.getByRole('button', { name: 'Kiểm tra', exact: true }).tap();
  await saved;
  submitted = true;
  await expect(article.getByRole('button', { name: /Kiểm tra lại/ })).toBeVisible();
  await reveal.tap();
  await expect(confirm).toHaveCount(0);
  await expect(article.getByText(transcript, { exact: true })).toBeVisible();
  expect(transcripts).toEqual([true]);
  await screenshot('04-loi-thoai');

  // Exercise the real profile form and the reader's text-only setting.
  const currentUrl = page.url();
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).tap();
  const form = page.getByRole('form', { name: 'Về bạn' });
  await form.getByLabel('Thay âm thanh bằng chữ').check();
  await form.getByRole('button', { name: 'Lưu', exact: true }).tap();
  await expect(form.getByText('Đã lưu.', { exact: true })).toBeVisible();
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 Zalo' }));
  await page.goto(currentUrl);
  await expect(page.getByText('Mở bằng Safari/Chrome để dùng đầy đủ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sao chép liên kết' })).toBeVisible();
  const previous = page.getByRole('button', { name: 'Trang trước' });
  await previous.tap();
  await expect(article.getByText(transcript, { exact: true })).toBeVisible();
  await expect(media).toHaveCount(0);
  const preferences = (await (await context.request.get(settingsUrl)).json()).settings.preferences;
  expect(preferences.listeningVoice).toBe('m');
  expect(preferences.replaceAudioWithText).toBe(true);

  expect((await context.request.patch(settingsUrl, {
    headers: { origin }, data: { preferences: { ...preferences, replaceAudioWithText: false } },
  })).ok()).toBe(true);
  missingSource = true;
  await page.reload();
  await previous.tap();
  await expect(article.getByText('Âm thanh chưa sẵn sàng', { exact: true })).toBeVisible();
  await expect(article.getByRole('textbox', { name: 'Bài làm của bạn' })).toBeEditable();
});
