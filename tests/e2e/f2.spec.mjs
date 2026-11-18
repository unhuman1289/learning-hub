import { openLessonSummary } from './lesson-summary.mjs';
import { test, expect } from '@playwright/test';
import { shapeNetwork } from './network.mjs';

const open = page => page.getByRole('region', { name: 'Bài tiếp theo' }).getByRole('link', { name: /Mở bài|Học tiếp/ }).first();

test('bàn học offline và đổi hồ sơ trên hai tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(open(page)).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(open(page)).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('lh-today-v1')).keys()).length)).toBe(1);
  await expect.poll(() => page.evaluate(async () => { const name = (await caches.keys()).find(x => x.startsWith('lh-static-')); return name ? (await (await caches.open(name)).keys()).some(x => /\/_next\/static\/.*\.js$/.test(x.url)) : false; })).toBe(true);
  const title = await page.evaluate(async () => { const cache = await caches.open('lh-today-v1'); const response = await cache.match((await cache.keys())[0]); return (await response.json()).items[0].title; });
  const second = await context.newPage();
  await second.goto('/');
  await expect(open(second)).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Đang mất mạng');
  await expect(page.locator('main')).toContainText(title);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Thử kết nối lại' }).tap();
  await page.getByRole('region', { name: 'Bài tiếp theo' }).getByRole('listitem').filter({ hasText: 'Deutsch' })
    .getByRole('link', { name: /Mở bài|Học tiếp/ }).first().tap();
  await expect(page.locator('.lesson-flow')).toBeVisible();
  const firstPage = page.getByRole('button', { name: 'Bắt đầu bài' });
  if (await firstPage.isVisible()) await firstPage.tap();
  const choice = page.locator('.lesson-flow-window-page[data-active]').getByRole('checkbox').first();
  await expect(choice).toBeEnabled();
  await choice.press('Space');
  const summary = await openLessonSummary(page);
  const request = page.waitForResponse(r => r.url().endsWith('/submissions') && r.request().method() === 'POST');
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  const response = await request;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({ itemIds: null, stage: null });
  await expect(summary.getByText('Đã có kết quả bài làm.', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: /Đổi người/ }).tap();
  await second.getByRole('button', { name: /Người học thử/ }).tap();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lh-offline-profile'))).toBe('demo-adult');
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('lh-today-v1')).keys()).map(x => x.url))).not.toContain(expect.stringContaining('demo-ech'));
  await second.close();
});

test('mở bàn học lần hai', async ({ page, browserName }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await shapeNetwork(page, browserName);
  let start = performance.now();
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(open(page)).toBeVisible();
  const cold = performance.now() - start;
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => navigator.serviceWorker.ready);
  start = performance.now();
  await page.reload();
  await expect(open(page)).toBeVisible();
  const warm = performance.now() - start;
  console.log(JSON.stringify({ metric: 'f2-desk', cold, warm, project: browserName }));
  expect(warm).toBeLessThan(5000);
  expect(warm).toBeLessThan(cold);
});
