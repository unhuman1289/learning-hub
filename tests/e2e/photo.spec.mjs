import { openLessonSummary } from './lesson-summary.mjs';
import { expect, test } from '@playwright/test';

test('iPhone canvas photo uploads and appears attached', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  const link = page.getByRole('region', { name: 'Bài tiếp theo' }).getByRole('listitem').filter({ hasText: 'Deutsch' }).getByRole('link', { name: /Mở bài|Học tiếp/ }).first();
  await expect(link).toBeVisible();
  const id = new URL(await link.getAttribute('href'), page.url()).searchParams.get('bai2');
  const url = '/api/lessons/' + id;
  const { lesson } = await (await context.request.get(url)).json();
  const item = lesson.items.find(item => item.input === 'short');
  const draft = await context.request.put(url + '/draft', { headers: { origin: new URL(page.url()).origin }, data: { revision: lesson.draftRevision, answers: { [item.id]: { answer: 'Haus' } } } });
  expect(draft.ok()).toBe(true);
  await page.goto('/?bai2=' + id);
  const file = page.locator('.lesson-flow-page:visible').getByLabel('Nộp ảnh bài làm').first();
  await expect(file).toBeVisible();
  // The app itself uses the real WebKit canvas and sends its result to the real local Worker.
  const image = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ab4321'; ctx.fillRect(0, 0, 80, 60);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const response = page.waitForResponse(r => r.url().endsWith('/api/uploads') && r.request().method() === 'POST');
  await file.setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(image) });
  expect((await response).status()).toBe(201);
  await expect(page.getByRole('link', { name: 'Xem ảnh đã đính kèm' }).first()).toBeVisible();
  await expect(page.getByText(/Ảnh bài làm.*giữ tối đa/)).toHaveCount(0);
  const summary = await openLessonSummary(page);
  const privacy = summary.locator('summary').filter({ hasText: 'Quyền riêng tư của ảnh' });
  await expect(privacy).toHaveCount(1);
  await privacy.tap();
  await expect(summary.getByText(/Ảnh được giữ tối đa 30 ngày/)).toBeVisible();
  const submitted = page.waitForResponse(r => r.url().endsWith(url + '/submissions') && r.request().method() === 'POST');
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  const result = await submitted;
  expect(result.ok()).toBe(true);
  expect((await result.json()).submission.attempts).toEqual([
    expect.objectContaining({ item_id: item.id, attachmentIds: [expect.stringMatching(/^img_/)] }),
  ]);
});
