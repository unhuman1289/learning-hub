import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('mất phản hồi sau khi lưu: đọc lại trước khi thử, không tạo lượt trùng', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  const id = 'les_00000000000000000001';
  const api = `/api/lessons/${id}`;
  const lesson = (await (await page.request.get(api)).json()).lesson;
  const item = lesson.items.find(i => i.input === 'short');
  const saved = await page.request.put(api + '/draft', { headers: { origin: new URL(page.url()).origin }, data: { revision: lesson.draftRevision, answers: { [item.id]: { answer: 'Haus' } } } });
  expect(saved.ok()).toBeTruthy();
  let posts = 0, key;
  await page.route(`**${api}/submissions`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    key = route.request().postDataJSON().clientSubmissionId;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('connectionreset');
  });
  await page.goto('/?bai2=' + id);
  await expect(page.locator(`[data-question-number="${lesson.items.findIndex(i => i.id === item.id) + 1}"]:visible`)).toBeVisible();
  await page.locator(`[data-question-number="${lesson.items.findIndex(i => i.id === item.id) + 1}"]:visible`).locator('xpath=ancestor::article').getByRole('button', { name: /Kiểm tra/ }).tap();
  await expect.poll(() => posts).toBe(1);
  await expect(page.getByText(/kiểm tra lại khi có mạng/)).toBeVisible();
  await context.setOffline(true);
  await context.setOffline(false);
  await expect.poll(async () => (await (await page.request.get(api + '/submissions?clientSubmissionId=' + key)).json()).submission?.id).toBeTruthy();
  await expect.poll(() => posts).toBe(1);
  await expect(page.getByText(/kiểm tra lại khi có mạng/)).toHaveCount(0);
  const history = await (await page.request.get(api + '/feedback')).json();
  expect(history.submissions.filter(s => s.attempts.some(a => a.item_id === item.id))).toHaveLength(1);
});
