import { ASSISTED_LESSONS, LISTENING_LESSON, TRANSCRIPT, VOICE_HASHES } from './fixtures/listening.mjs';
import { expect, test } from '@playwright/test';
import { routeMetrics } from './route-metrics.mjs';

const lessonUrl = '/api/lessons/' + LISTENING_LESSON;
const itemUrl = lessonUrl + '/items/i1';
const voiceSrc = { f: '/api/audio/' + VOICE_HASHES.f, m: '/api/audio/' + VOICE_HASHES.m };

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

  let failMaleAudio = true;
  const heardRequests = [];
  const plays = [];
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/audio/')) heardRequests.push({ url: path, status: response.status() });
    if (path === itemUrl + '/plays' && response.ok()) plays.push(response.request().postDataJSON().slow);
  });
  await page.route('**' + voiceSrc.m, route => failMaleAudio ? route.abort('failed') : route.continue());
  const clips = await Promise.all(Object.values(voiceSrc).map(async src => {
    const clip = await context.request.get(src, { headers: { Range: 'bytes=0-4095' } });
    expect(clip.status()).toBe(206);
    expect(clip.headers()['content-range']).toMatch(/^bytes 0-4095\/\d+$/);
    return clip.body();
  }));
  expect(clips[0].equals(clips[1])).toBe(false);
  const savedPlays = async () => (await (await context.request.get(lessonUrl)).json()).lesson.listen_log.i1;

  await lesson.tap();
  await expect(page.getByRole('button', { name: 'Bắt đầu bài' })).toBeVisible();
  expect(heardRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Bắt đầu bài' }).tap();
  const article = page.locator('article.lesson-item:visible');
  const play = article.getByRole('button', { name: 'Phát âm thanh' });
  await expect(play).toBeVisible();
  expect((await play.boundingBox()).height).toBeGreaterThanOrEqual(56);
  const media = article.locator('audio');
  await expect(media).toHaveAttribute('preload', 'none');
  await expect.poll(() => heardRequests).toEqual(expect.arrayContaining([
    { url: voiceSrc.f, status: 206 }, { url: '/api/audio/' + VOICE_HASHES.next, status: 206 },
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
  await expect.poll(savedPlays).toBe(1);

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
  expect(await savedPlays()).toBe(1);
  failMaleAudio = false;
  if (simulated) await media.evaluate(node => {
    node.play = async () => { node.dispatchEvent(new Event('playing')); };
  });
  await retry.focus();
  await page.keyboard.press('r');
  await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();
  if (simulated) await media.dispatchEvent('ended');
  await expect(article.getByText('Còn 1 lượt nghe')).toBeVisible();
  expect(await savedPlays()).toBe(1);

  await article.getByRole('button', { name: 'Chậm hơn' }).tap();
  await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();
  expect(await media.evaluate(node => [node.playbackRate, node.preservesPitch])).toEqual([0.8, true]);
  if (simulated) await media.dispatchEvent('ended');
  await expect(article.getByRole('button', { name: 'Nghe thêm (tính là gợi ý)' })).toBeVisible();
  await expect.poll(() => plays).toEqual([false, true]);
  expect(await savedPlays()).toBe(2);
  await screenshot('03-het-luot');

  const reveal = article.getByRole('button', { name: 'Xem lời thoại', exact: true }).first();
  await reveal.tap();
  const confirm = article.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Huỷ' }).tap();
  await expect(article.locator('p[lang="de-DE"]').filter({ hasText: TRANSCRIPT })).toHaveCount(0);
  await article.getByRole('textbox', { name: 'Bài làm của bạn' }).fill(TRANSCRIPT);
  const saved = page.waitForResponse(response => response.url().endsWith(lessonUrl + '/submissions') && response.ok());
  await article.getByRole('button', { name: 'Kiểm tra', exact: true }).tap();
  const { submission } = await (await saved).json();
  expect(submission.attempts[0].support).toBe('hint1');
  await expect(article.getByRole('button', { name: /Kiểm tra lại/ })).toBeVisible();
  const postAnswer = page.waitForResponse(response => response.url().endsWith(itemUrl + '/reveal') && response.ok());
  await reveal.tap();
  expect(await (await postAnswer).json()).toMatchObject({ transcript: TRANSCRIPT, support: 'hint1' });
  await expect(confirm).toHaveCount(0);
  await expect(article.locator('p[lang="de-DE"]').filter({ hasText: TRANSCRIPT })).toBeVisible();
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
  await expect(article.locator('p[lang="de-DE"]').filter({ hasText: TRANSCRIPT })).toBeVisible();
  await expect(media).toHaveCount(0);
  const preferences = (await (await context.request.get(settingsUrl)).json()).settings.preferences;
  expect(preferences.listeningVoice).toBe('m');
  expect(preferences.replaceAudioWithText).toBe(true);

  expect((await context.request.patch(settingsUrl, {
    headers: { origin }, data: { preferences: { ...preferences, replaceAudioWithText: false } },
  })).ok()).toBe(true);
  await page.reload();
  await previous.tap();
  await expect(article.getByRole('button', { name: 'Nghe thêm (tính là gợi ý)' })).toBeVisible();
  await expect(media).toHaveAttribute('src', voiceSrc.m);
  expect(await savedPlays()).toBe(2);

  await page.getByRole('button', { name: 'Trang sau: Câu 2', exact: true }).tap();
  await expect(article.getByRole('heading')).toHaveAttribute('data-question-number', '2');
  const before = page.waitForResponse(response => response.url().endsWith(lessonUrl + '/items/i2/reveal') && response.ok());
  await reveal.tap();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Xem lời thoại', exact: true }).tap();
  expect(await (await before).json()).toMatchObject({ transcript: TRANSCRIPT, support: 'hint2' });
  await expect(article.locator('p[lang="de-DE"]').filter({ hasText: TRANSCRIPT })).toBeVisible();
  await article.getByRole('textbox', { name: 'Bài làm của bạn' }).fill(TRANSCRIPT);
  const second = page.waitForResponse(response => response.url().endsWith(lessonUrl + '/submissions') && response.ok());
  await article.getByRole('button', { name: 'Kiểm tra', exact: true }).tap();
  expect((await (await second).json()).submission.attempts).toEqual([
    expect.objectContaining({ item_id: 'i2', support: 'hint2' }),
  ]);
});

test('a child can save their own voice and cannot change other settings', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  const request = context.request;
  const headers = { origin: new URL(page.url()).origin };
  const settings = '/api/learners/me/settings';
  const voice = '/api/learners/me/voice';
  const before = (await (await request.get(settings)).json()).settings;
  expect(before.role).toBe('child');
  expect((await request.post(voice, { headers, data: { voice: 'm' } })).ok()).toBe(true);
  expect((await request.post(voice, { headers, data: { voice: 'f', replaceAudioWithText: true } })).status()).toBe(400);
  expect((await request.post('/api/learners/demo-adult/voice', { headers, data: { voice: 'm' } })).status()).toBe(404);
  const expected = { ...before, preferences: { ...before.preferences, listeningVoice: 'm' } };
  const readSettings = async () => (await (await request.get(settings)).json()).settings;
  const forbidden = await request.patch(settings, { headers, data: { preferences: { replaceAudioWithText: true } } });
  expect(forbidden.status(), await forbidden.text()).toBe(403);
  expect(await readSettings()).toEqual(expected);
});

test.describe('giữ yêu cầu hỗ trợ nghe', () => {
  // Route must hold the request before it reaches the server.
  test.use({ serviceWorkers: 'block' });
for (const { id, mode, level } of ASSISTED_LESSONS) {
  test(`saves ${level} listening support before ${mode} submission`, async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Người học thử/ }).tap();
    await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
    await page.goto('/?bai2=' + id);
    await page.getByRole('button', { name: 'Bắt đầu bài' }).tap();
    const article = page.locator('article.lesson-item:visible');
    const media = article.locator('audio');
    // Hold playback open so the submission provably precedes the assisted replay's end.
    await media.evaluate(node => {
      node.play = async () => { node.dispatchEvent(new Event('playing')); };
    });
    await article.getByRole('button', { name: 'Phát âm thanh', exact: true }).tap();
    await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();
    await media.dispatchEvent('ended');
    await expect(article.getByText(level === 'slow' ? 'Còn 1 lượt nghe' : 'Đã hết lượt nghe', { exact: true })).toBeVisible();
    await article.getByRole('textbox', { name: 'Bài làm của bạn' }).fill(TRANSCRIPT);

    const url = '/api/lessons/' + id;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const reveal = page.waitForRequest(request => new URL(request.url()).pathname === url + '/items/i1/reveal');
    await page.route('**' + url + '/items/i1/reveal', async route => {
      await held;
      await route.continue();
    });
    const replay = article.getByRole('button', { name: level === 'slow' ? 'Chậm hơn' : 'Nghe thêm (tính là gợi ý)', exact: true });
    await replay.tap();
    try {
      expect((await reveal).postDataJSON()).toEqual({ level });
      await expect(article.getByText('Đang ghi lượt nghe…', { exact: true })).toBeVisible();
      await expect(article.getByText('Đang phát', { exact: true })).toHaveCount(0);
    } finally {
      release();
    }
    await expect(article.getByText('Đang phát', { exact: true })).toBeVisible();

    if (mode === 'whole-lesson') await page.getByRole('button', { name: 'Sang Tổng kết' }).tap();
    const saved = page.waitForResponse(response => response.url().endsWith(url + '/submissions') && response.request().method() === 'POST');
    await page.getByRole('button', { name: mode === 'whole-lesson' ? 'Nộp bài' : 'Kiểm tra', exact: true }).tap();
    const response = await saved;
    const result = await response.json();
    expect(response.status(), result.error).toBe(200);
    expect(result.submission.attempts).toEqual([expect.objectContaining({ item_id: 'i1', support: 'hint1' })]);
    const { lesson } = await (await context.request.get(url)).json();
    expect(lesson.listen_log).toEqual({ i1: 1 });
  });
}
});
