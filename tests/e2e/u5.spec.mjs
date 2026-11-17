import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { runFake } from '../../scripts/fake-runner.mjs';
import { shapeNetwork, timeFromTap } from './network.mjs';
import { routeMetrics } from './route-metrics.mjs';

const desk = page => page.getByRole('region', { name: 'Bài tiếp theo' });
const flow = page => page.locator('.lesson-flow');
const firstQuestion = page => flow(page).locator('[data-question-number]').first();
// The right page edge turns forward; its name says where it goes.
const nextEdge = page => flow(page).getByRole('button', { name: /^(Bắt đầu bài|Trang sau: Câu [\d–]+|Sang Tổng kết)$/ });
const previousEdge = page => flow(page).getByRole('button', { name: 'Trang trước', exact: true });

function checkTime(info, metric, ms, localLimit) {
  const limit = process.env.CI ? 5000 : localLimit;
  console.log(JSON.stringify({ project: info.project.name, metric, ms: Math.round(ms), limit }));
  expect(ms, metric).toBeLessThan(limit);
}
const turnSettled = page => expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn');
const openLesson = page => desk(page).getByRole('listitem').filter({ hasText: 'Deutsch' })
  .getByRole('link', { name: /Mở bài|Học tiếp/ }).first();

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test('mở bàn, làm bài khi mất mạng, tổng kết và mở bài tiếp theo', async ({ page, context, browserName }, info) => {
  await page.goto('/');
  const select = page.getByRole('button', { name: /Ếch thử/ });
  await expect(select).toBeVisible();
  await shapeNetwork(page, browserName);
  page.setDefaultTimeout(10_000);
  const coldStart = performance.now();
  await select.tap();
  await expect(openLesson(page)).toBeVisible();
  const coldMs = performance.now() - coldStart;
  if (process.env.CI) {
    // The first profile transition warms the desk. Enforce the CI limit on the reload below.
    console.log(JSON.stringify({ project: info.project.name, metric: 'desk-warmup', ms: Math.round(coldMs) }));
  } else {
    checkTime(info, 'desk-cold', coldMs, 5000);
  }

  await noOverflow(page);

  // Let the initial desk finish its ambient request before measuring the reload.
  await page.waitForLoadState("networkidle");
  const warm = routeMetrics(page);
  await page.goto('/');
  await expect(openLesson(page)).toBeVisible();
  const warmMs = await page.evaluate(() => performance.now());
  checkTime(info, 'desk-warm', warmMs, 3000);
  const deskStats = await warm();
  expect(deskStats.gzip, JSON.stringify(deskStats.chunks)).toBeLessThanOrEqual(180_000);
  expect(deskStats.api).toContain("/api/today");
  expect(deskStats.api.length, JSON.stringify(deskStats.api)).toBeLessThanOrEqual(2);
  await expect(page.locator(".lhw-window [data-p=front]")).toHaveCount(1);

  // Give the demo lesson a saved draft so the desk continues directly at a question.
  const link = openLesson(page);
  const href = await link.getAttribute('href');
  const origin = new URL(page.url()).origin;
  const id = new URL(href, origin).searchParams.get('bai2');
  const lessonURL = '/api/lessons/' + id;
  const read = await context.request.get(lessonURL);
  expect(read.ok()).toBe(true);
  const { lesson } = await read.json();
  const item = lesson.items.find(item => item.input === 'short');
  expect(item?.id).toBe('i2');
  const draft = await context.request.put(lessonURL + '/draft', {
    headers: { origin }, data: { revision: lesson.draftRevision, answers: { [item.id]: { answer: 'Haus' } } },
  });
  expect(draft.ok()).toBe(true);

  // Open the same lesson once before timing the transition from the desk.
  await link.tap();
  await expect(firstQuestion(page)).toBeVisible({ timeout: 30_000 });
  await page.goto('/');
  await expect(link).toBeVisible();

  const lessonSnapshot = routeMetrics(page);
  const firstMs = await timeFromTap(link, firstQuestion(page));
  checkTime(info, 'first-question', firstMs, 2000);
  const lessonStats = await lessonSnapshot();
  expect(lessonStats.api).toContain(lessonURL);
  expect(lessonStats.api.length).toBeLessThanOrEqual(2);
  await noOverflow(page);

  const field = flow(page).getByRole('textbox', { name: 'Bài làm của bạn' }).first();
  const card = field.locator('xpath=ancestor::article');
  await expect(field).toHaveValue('Haus');
  await field.tap();
  await field.evaluate(input => input.setSelectionRange(1, 1));
  for (const char of ['ä', 'ß']) {
    const control = card.getByRole('button', { name: 'Chèn ' + char, exact: true });
    const { width, height } = await control.boundingBox();
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    await control.tap();
  }
  await expect(field).toHaveValue('Häßaus');
  await field.fill('');
  await field.pressSequentially('Hấu');
  await expect(card.getByText(/Có dấu tiếng Việt/)).toBeVisible();

  const submissions = async () => (await (await context.request.get(lessonURL + '/feedback')).json()).submissions;
  const previous = (await submissions()).length;
  // Fail only the submission request. Other resources remain available so reload
  // and browser cache behavior cannot mask a lost or duplicated submission.
  const failedSubmission = route => route.abort('internetdisconnected');
  await page.route('**/submissions', failedSubmission);
  await field.fill('Lena kann heute Suppe kochen.');
  await expect(field).toHaveValue('Lena kann heute Suppe kochen.');
  await card.getByRole('button', { name: 'Kiểm tra', exact: true }).tap();
  const retry = card.getByRole('button', { name: 'Thử lại', exact: true });
  await expect(retry).toBeVisible();
  await expect(field).toHaveValue('Lena kann heute Suppe kochen.');
  await page.unroute('**/submissions', failedSubmission);
  const gradeMs = await timeFromTap(retry, card.getByRole('status').filter({ hasText: /Đúng/ }).first());
  checkTime(info, 'grade', gradeMs, 1200);
  expect((await submissions()).length).toBe(previous + 1);
  await page.reload();
  await expect(flow(page)).toBeVisible();
  expect((await submissions()).length).toBe(previous + 1);

  for (let index = 0; index < lesson.items.length + 1; index++) {
    const summary = flow(page).getByRole('heading', { name: 'Tổng kết bài' });
    if (await summary.isVisible()) break;
    // The turn starts after a lazy import, so wait for the sheet to be replaced
    // instead of racing the next tap against a page that is about to unmount.
    const sheet = flow(page).locator('.lesson-flow-page');
    await sheet.evaluate(element => { element.dataset.e2eTurnedFrom = ''; });
    await nextEdge(page).tap();
    await expect(flow(page).locator('.lesson-flow-page[data-e2e-turned-from]')).toHaveCount(0);
    await turnSettled(page);
  }
  await expect(flow(page).getByRole('heading', { name: 'Tổng kết bài' })).toBeVisible();
  await flow(page).getByRole('button', { name: 'Xong bài', exact: true }).tap();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Xong bài', exact: true });
  if (await confirm.isVisible()) await confirm.tap();
  const next = page.waitForResponse(response => {
    const url = new URL(response.url());
    return /^\/api\/lessons\/les_[a-f0-9]{20}$/.test(url.pathname) && url.pathname !== lessonURL &&
      url.searchParams.get('view') === 'reader' && response.ok();
  });
  await flow(page).getByRole('button', { name: 'Bài tiếp theo', exact: true }).tap();
  await expect(page).toHaveURL(url => url.searchParams.has('bai2') && url.searchParams.get('bai2') !== id);
  await next;
  await expect(flow(page)).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 10_000 });

  const notebookSnapshot = routeMetrics(page);
  await page.goto('/?sach=sub_dddddddddddddddddddd');
  await expect(page.getByRole('heading', { name: 'Hôm nay', exact: true })).toBeVisible();
  const notebookStats = await notebookSnapshot();
  expect(notebookStats.api).toContain("/api/subjects/sub_dddddddddddddddddddd");
  expect(notebookStats.api, 'GET on notebook entry').toHaveLength(2);
  await noOverflow(page);
  await page.getByText('Lịch sử', { exact: true }).tap();
  await expect(page.getByRole('heading', { name: /Tháng/ }).first()).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Sổ mới', exact: true }).tap();
  const title = 'Sổ thử ' + info.project.name + ' ' + crypto.randomUUID().slice(0, 8);
  await page.getByLabel('Tên sổ').fill(title);
  await page.getByLabel('Bạn muốn học gì?').fill('Ôn tiếng Đức với câu ngắn.');
  await page.getByRole('button', { name: 'Mở sổ', exact: true }).tap();
  await expect(page.getByRole('heading', { name: title, exact: true }).filter({ visible: true })).toBeVisible();
  const credentials = JSON.parse(await readFile('.wrangler/demo-runner.json', 'utf8'));
  const fixture = JSON.parse(await readFile('fixtures/lessons/deutsch-modalverb.json', 'utf8'));
  fixture.items[0].audio = { lang: 'de-DE', rate: 0.8, maxPlays: 3, transcript: 'never',
    lines: [{ speaker: 'a', text: 'Guten Morgen.' }] };
  const results = await runFake({ baseUrl: origin.replace('127.0.0.1', 'localhost'), credentials, fixture });
  const [savedLesson] = results.flatMap(result => result.outcome?.subjects?.flatMap(subject => subject.lessonIds) ?? []);
  expect(savedLesson).toBeTruthy();
  const response = await page.request.get('/api/lessons/' + savedLesson);
  expect(response.ok()).toBe(true);
  const listening = (await response.json()).lesson.items[0].audio;
  expect(listening).not.toHaveProperty('lines');
  expect(listening.durationMs).toBeGreaterThan(0);
  expect(listening.src.f).not.toBe(listening.src.m);
  for (const src of Object.values(listening.src)) {
    const clip = await page.request.get(src, { headers: { Range: 'bytes=0-15' } });
    expect(clip.status()).toBe(206);
    expect(clip.headers()['content-range']).toMatch(/^bytes 0-15\/\d+$/);
    expect((await clip.body()).toString('ascii', 4, 8)).toBe('ftyp');
  }
  await page.reload();
  await expect(page.getByRole('link', { name: /Mở bài|Làm tiếp/ }).first()).toBeVisible();

  console.log(JSON.stringify({ project: info.project.name, coldMs, warmMs, firstMs, gradeMs, desk: deskStats, lesson: lessonStats, notebook: notebookStats }));
});

test.describe('cửa sổ chờ dữ liệu', () => {
  // Playwright routing must see the delayed request directly.
  test.use({ serviceWorkers: 'block' });
test('cửa sổ Lübeck chờ bàn học có bài trước khi tải cảnh', async ({ page }) => {
  const manifest = JSON.parse(await readFile('dist/client/.vite/manifest.json', 'utf8'));
  const scene = '/' + manifest['app/hub/lubeck/scene.ts'].file;
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(openLesson(page)).toBeVisible();

  let sceneRequested = false;
  const watchScene = request => {
    if (new URL(request.url()).pathname === scene) sceneRequested = true;
  };
  let todayRequested = false;
  let releaseToday;
  const heldToday = new Promise(resolve => { releaseToday = resolve; });
  await page.route(url => url.pathname === '/api/today', async route => {
    todayRequested = true;
    await heldToday;
    await route.continue();
  });
  await page.clock.install();
  page.on('request', watchScene);
  try {
    await page.goto('/');
    await expect.poll(() => todayRequested).toBe(true);
    await expect(page.locator('.lhw-window')).toHaveCount(1);
    await page.clock.runFor(4500);
    await expect(openLesson(page)).toHaveCount(0);
    expect(sceneRequested).toBe(false);

    releaseToday();
    await expect(openLesson(page)).toBeVisible();
    await page.clock.runFor(4500);
    await expect.poll(() => sceneRequested).toBe(true);
    await expect(page.locator('.lhw-window [data-p=front]')).toHaveCount(1);
  } finally {
    releaseToday();
    page.off('request', watchScene);
  }
});

});

const lessonHeading = page => flow(page).locator('[data-lesson-heading]');
const questionHeading = page => flow(page).locator('[data-question-number]').first();

/** A one-finger horizontal drag on the page, as touch events (React listens on the lesson root). */
async function swipe(page, dx, { release = true, at = 0.75 } = {}) {
  await page.locator('.lesson-flow-page').evaluate((sheet, { dx, release, at }) => {
    const { left, width, top, height } = sheet.getBoundingClientRect();
    const y = top + Math.min(height, innerHeight - top) * at;
    const x = left + width / 2;
    const target = sheet.querySelector('p') ?? sheet;
    // WebKit has no Touch constructor; React only reads the touch lists and coordinates.
    const fire = (type, clientX) => {
      const touch = { identifier: 1, target, clientX, clientY: y };
      const ended = type === 'touchend';
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: ended ? [] : [touch] }, targetTouches: { value: ended ? [] : [touch] }, changedTouches: { value: [touch] },
      });
      target.dispatchEvent(event);
    };
    fire('touchstart', x);
    for (let step = 1; step <= 4; step++) fire('touchmove', x + dx * step / 4);
    if (release) fire('touchend', x + dx);
  }, { dx, release, at });
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Record where each sheet is visible on screen when the next turn starts. */
async function watchTurnWindows(page) {
  await page.evaluate(() => {
    window.__turnWindows = null;
    if (window.__turnWatched) return;
    window.__turnWatched = true;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = callback => {
      const transition = start(callback);
      transition.ready.then(() => {
        const visible = name => {
          const style = getComputedStyle(document.documentElement, `::view-transition-group(${name})`);
          const top = new DOMMatrix(style.transform).f;
          const [insetTop = '0', , insetBottom = insetTop] = (style.clipPath.match(/inset\(([^)]*)\)/)?.[1] ?? '').split(/\s+/);
          return [top + parseFloat(insetTop), top + parseFloat(style.height) - parseFloat(insetBottom)];
        };
        window.__turnWindows = { out: visible('lesson-leaf'), in: visible('lesson-leaf-in') };
      });
      return transition;
    };
  });
}

async function expectSameWindow(page) {
  await expect.poll(() => page.evaluate(() => window.__turnWindows)).not.toBeNull();
  const { out, in: next } = await page.evaluate(() => window.__turnWindows);
  expect(Math.abs(out[0] - next[0]), JSON.stringify({ out, next })).toBeLessThanOrEqual(1);
  expect(Math.abs(out[1] - next[1]), JSON.stringify({ out, next })).toBeLessThanOrEqual(1);
  expect(out[1] - out[0]).toBeGreaterThan(100);
}

async function edgesClearOfControls(page) {
  const edges = await flow(page).locator('[data-turn-edge], [data-turn-corner]').evaluateAll(list => list.map(edge => edge.getBoundingClientRect().toJSON()));
  const controls = await flow(page).locator('input, textarea, select, button:not([data-turn-edge]), a, summary')
    .evaluateAll(list => list.filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().toJSON()));
  for (const edge of edges) for (const control of controls) expect(overlaps(edge, control), JSON.stringify({ edge, control })).toBe(false);
}

test('lật trang bằng mép giấy, vuốt và bàn phím', async ({ page, context, browserName }) => {
  await page.goto('/');
  // A profile the test above has not used, so this is still its first lesson.
  await page.getByRole('button', { name: /Người học thử/ }).tap();
  await desk(page).getByRole('listitem').filter({ hasText: 'Đọc về hệ thống' }).getByRole('link', { name: /Mở bài|Học tiếp/ }).first().tap();
  await expect(lessonHeading(page)).toBeVisible();

  // First lesson: the hint shows by the right edge; the first page has no left edge.
  const hint = flow(page).getByText('Chạm mép giấy để lật', { exact: true });
  await expect(hint).toBeVisible();
  await expect(previousEdge(page)).toHaveCount(0);
  const start = flow(page).getByRole('button', { name: 'Bắt đầu bài', exact: true });
  const sheet = await flow(page).locator('.lesson-flow-page').boundingBox();
  const edge = await start.boundingBox();
  expect(edge.width).toBeGreaterThanOrEqual(44);
  expect(Math.abs(edge.y - (sheet.y + sheet.height / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(edge.y + edge.height - (sheet.y + sheet.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(edge.x + edge.width - (sheet.x + sheet.width))).toBeLessThanOrEqual(1);
  await edgesClearOfControls(page);
  // Every page is at least a screen tall below the notebook bar, and each side curls at the top too.
  const viewport = page.viewportSize();
  expect(sheet.height).toBeGreaterThanOrEqual(Math.min(viewport.height - 176, 400) - 1);
  await expect(flow(page).locator('[data-turn-corner="right"] [data-curl]')).toBeVisible();
  await expect(flow(page).locator('[data-turn-corner="left"]')).toHaveCount(0);

  // Tap the right edge: the page turns and the hint is remembered.
  const saved = page.waitForResponse(response => response.url().endsWith('/api/learners/me/hints') && response.status() === 204);
  await start.tap();
  await saved;
  await expect(questionHeading(page)).toBeVisible();
  await turnSettled(page);
  await expect(hint).toHaveCount(0);
  await edgesClearOfControls(page);

  // Tap the left edge: back to the first page.
  await previousEdge(page).tap();
  await expect(lessonHeading(page)).toBeVisible();
  await turnSettled(page);

  // The top corner turns too, and both sheets show in the same window whatever their length.
  await watchTurnWindows(page);
  await flow(page).locator('[data-turn-corner="right"]').tap();
  await expect(questionHeading(page)).toBeVisible();
  await expectSameWindow(page);
  await turnSettled(page);
  // Scrolled down a page, the turn still uses one window for both sheets.
  await page.evaluate(() => scrollBy(0, 400));
  await watchTurnWindows(page);
  await previousEdge(page).tap();
  await expect(lessonHeading(page)).toBeVisible();
  await expectSameWindow(page);
  await turnSettled(page);

  // A short swipe lifts the corner, then springs back without turning.
  const right = flow(page).locator('[data-turn-edge="right"]');
  await swipe(page, -40, { release: false });
  await expect(right).toHaveAttribute('data-pulled', '');
  expect(Number(await right.evaluate(node => node.style.getPropertyValue('--pull')))).toBeCloseTo(40 / 64, 2);
  await swipe(page, -40);
  await expect(right).not.toHaveAttribute('data-pulled');
  // In the upper half the top corner lifts instead.
  const rightTop = flow(page).locator('[data-turn-corner="right"]');
  await swipe(page, -40, { release: false, at: 0.2 });
  await expect(rightTop).toHaveAttribute('data-pulled', '');
  await expect(right).not.toHaveAttribute('data-pulled');
  await swipe(page, -40, { at: 0.2 });
  await expect(rightTop).not.toHaveAttribute('data-pulled');
  await expect(lessonHeading(page)).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn');
  // Past the 64 px threshold it turns.
  await swipe(page, -90);
  await expect(questionHeading(page)).toBeVisible();
  await turnSettled(page);

  // Keyboard: the edge takes visible focus, curls further, and Enter turns the page.
  const forward = nextEdge(page);
  await forward.focus();
  if (browserName === 'chromium') {
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(forward).toBeFocused();
    expect(await forward.evaluate(node => node.matches(':focus-visible'))).toBe(true);
    await expect.poll(() => forward.locator('[data-curl]').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(30);
  }
  const before = await questionHeading(page).getAttribute('data-question-number');
  await page.keyboard.press('Enter');
  await expect(flow(page).locator(`[data-question-number="${before}"]`)).toHaveCount(0);
  await turnSettled(page);
  await expect(page.locator(':focus')).not.toHaveAttribute('data-turn-edge');
  await page.keyboard.press('ArrowLeft');
  await turnSettled(page);
  await expect(flow(page).locator(`[data-question-number="${before}"]`)).toBeVisible();

  // Remembered in the profile: the hint stays away after a reload.
  await page.reload();
  await expect(flow(page)).toBeVisible();
  await expect(hint).toHaveCount(0);

  if (browserName === 'chromium') {
    // On a 4× slower CPU a turn must not block the main thread for more than 50 ms.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.__longTasks = [];
      new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(entry => Math.round(entry.duration))))
        .observe({ type: 'longtask' });
    });
    for (const turn of [() => nextEdge(page).tap(), () => previousEdge(page).tap()]) {
      await page.evaluate(() => { window.__longTasks.length = 0; });
      await turn();
      await expect(page.locator('html')).toHaveAttribute('data-lesson-turn', /.+/);
      await turnSettled(page);
      const tasks = await page.evaluate(() => window.__longTasks);
      console.log(JSON.stringify({ metric: 'turn-long-tasks', tasks }));
      expect(Math.max(0, ...tasks), 'long task during a turn').toBeLessThanOrEqual(50);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
});
