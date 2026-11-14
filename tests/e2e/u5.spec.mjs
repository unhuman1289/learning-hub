import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { runFake } from '../../scripts/fake-runner.mjs';
import { shapeNetwork, timeFromTap } from './network.mjs';

const desk = page => page.getByRole('region', { name: 'Bài tiếp theo' });
const flow = page => page.locator('.lesson-flow');
const firstQuestion = page => flow(page).locator('[data-question-number]').first();

function checkTime(info, metric, ms, localLimit) {
  const limit = process.env.CI ? 5000 : localLimit;
  console.log(JSON.stringify({ project: info.project.name, metric, ms: Math.round(ms), limit }));
  expect(ms, metric).toBeLessThan(limit);
}
const turnSettled = page => expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn');
const openLesson = page => desk(page).getByRole('listitem').filter({ hasText: 'Deutsch' })
  .getByRole('link', { name: /Mở bài|Học tiếp/ }).first();

function routeMetrics(page) {
  const origin = new URL(page.url()).origin;
  const api = [], files = new Set();
  const collect = request => {
    const url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET') return;
    if (url.pathname.startsWith('/api/')) api.push(url.pathname);
    if (url.pathname.endsWith('.js')) files.add(url.href);
  };
  page.on('request', collect);
  return async () => {
    page.off('request', collect);
    const sizes = await Promise.all([...files].map(async url => {
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      return gzipSync(Buffer.from(await response.arrayBuffer())).length;
    }));
    return { api, gzip: sizes.reduce((sum, bytes) => sum + bytes, 0), chunks: [...files].map((url, i) => [new URL(url).pathname.split("/").at(-1), sizes[i]]) };
  };
}

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

  const warm = routeMetrics(page);
  await page.goto('/');
  await expect(openLesson(page)).toBeVisible();
  const warmMs = await page.evaluate(() => performance.now());
  checkTime(info, 'desk-warm', warmMs, 3000);
  const deskStats = await warm();
  expect(deskStats.gzip).toBeLessThanOrEqual(180_000);
  expect(deskStats.api).toContain("/api/today");
  expect(deskStats.api.length).toBeLessThanOrEqual(2);
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
    await flow(page).getByRole('button', { name: /^(Bắt đầu|Tiếp|Tổng kết)$/ }).tap();
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
  const results = await runFake({ baseUrl: origin.replace('127.0.0.1', 'localhost'), credentials, fixture });
  expect(results.some(result => result.outcome?.subjects?.some(subject => subject.lessonIds.length))).toBe(true);
  await page.reload();
  await expect(page.getByRole('link', { name: /Mở bài|Làm tiếp/ }).first()).toBeVisible();

  console.log(JSON.stringify({ project: info.project.name, coldMs, warmMs, firstMs, gradeMs, desk: deskStats, lesson: lessonStats, notebook: notebookStats }));
});
