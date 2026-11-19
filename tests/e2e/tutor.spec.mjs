import { expect, test } from '@playwright/test';

const lessonId = 'les_00000000000000000005';
const lessonPath = '/api/lessons/' + lessonId;
const child = 'demo-ech';

test('Quản trị tắt gia sư, trẻ em hỏi qua SSE và người giám hộ đọc nhận xét', async ({ page, baseURL }) => {
  const local = new URL(baseURL);
  expect(['localhost', '127.0.0.1']).toContain(local.hostname);
  const headers = { origin: local.origin };
  const profile = data => page.request.post('/api/profiles', { headers, data });
  const toggle = enabled => page.request.post('/api/admin/family', {
    headers, data: { action: 'tutor', userId: child, enabled },
  });
  const address = data => page.request.post('/api/admin/family', {
    headers, data: { action: 'tutor-address', userId: child, ...data },
  });
  const ask = question => page.request.post('/api/tutor', {
    headers, data: { lessonId, itemId: 'i1', question },
  });
  const learnerView = lessonPath + '/tutor?learner=' + child;

  await page.goto('/');
  const childProfile = page.getByRole('button', { name: /Ếch thử/ });
  await expect(childProfile).toBeVisible();
  expect((await ask('Em nên bắt đầu từ đâu?')).status()).toBe(401);
  expect((await address({ self: 'em' })).status()).toBe(401);
  await childProfile.tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  expect((await page.request.get('/api/admin/ai-controls')).status()).toBe(403);
  expect((await page.request.put('/api/admin/ai-controls', {headers, data:{subjectId:'sub_11111111111111111111',openaiEnabled:true,ttsEnabled:true}})).status()).toBe(403);
  expect((await toggle(false)).status()).toBe(403);
  expect((await address({ self: 'em' })).status()).toBe(403);

  expect((await profile({ action: 'select', id: 'demo-admin' })).status()).toBe(200);
  expect((await profile({ action: 'manage' })).status()).toBe(200);
  await page.goto('/?trang=quan-tri');
  await page.getByRole('button', { name: 'Sổ', exact: true }).tap();
  const controlResponse = await page.request.get('/api/admin/ai-controls');
  expect(controlResponse.status()).toBe(200);
  const before = (await controlResponse.json()).controls[0];
  const update = (openaiEnabled, ttsEnabled) => page.request.put('/api/admin/ai-controls', {headers, data:{subjectId:before.id,openaiEnabled,ttsEnabled}});
  const saved = await update(!before.openai_enabled, !!before.tts_enabled);
  expect(saved.status()).toBe(200);
  expect((await saved.json()).controls.find(x=>x.id===before.id).openai_enabled).toBe(Number(!before.openai_enabled));
  expect((await update(!!before.openai_enabled, !!before.tts_enabled)).status()).toBe(200);
  await page.getByRole('button', { name: 'Gia đình', exact: true }).tap();
  const member = page.getByRole('listitem').filter({ hasText: 'demo-ech@example.test' });
  const checkbox = member.getByRole('checkbox', { name: 'Cho phép dùng gia sư' });
  await expect(checkbox).toBeChecked();
  const self = member.getByLabel('Bột xưng');
  await self.selectOption('em');
  await expect(self).toHaveValue('em');
  await member.getByLabel('Bột gọi').fill('chị Ếch');
  await member.getByRole('button', { name: 'Lưu cách gọi' }).tap();
  await expect(member.getByRole('button', { name: 'Lưu cách gọi' })).toBeDisabled();
  const savedAddress = await page.request.get('/api/admin/family');
  expect((await savedAddress.json()).members.find(entry => entry.id === child)).toMatchObject({ tutorSelf:'em', tutorCall:'chị Ếch' });
  const save = page.waitForResponse(response => response.url().endsWith('/api/admin/family') && response.request().method() === 'POST');
  await checkbox.tap();
  expect((await save).status()).toBe(200);
  await expect(checkbox).not.toBeChecked();

  expect((await profile({ action: 'select', id: child })).status()).toBe(200);
  expect((await ask('Em nên bắt đầu từ đâu?')).status()).toBe(403);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText(/Em chào chị Ếch/);
  await expect(page.locator('.tutor-pet-fallback')).toBeVisible();
  await expect(page.locator('.tutor-pet-strip')).toHaveCount(0);
  expect((await profile({ action: 'select', id: 'demo-admin' })).status()).toBe(200);
  expect((await profile({ action: 'manage' })).status()).toBe(200);
  expect((await toggle(true)).status()).toBe(200);
  expect((await profile({ action: 'select', id: child })).status()).toBe(200);

  const response = await ask('Em nên bắt đầu từ đâu? test@example.test');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/event-stream');
  const events = await response.text();
  expect(events).toMatch(/event: delta[\s\S]*event: delta[\s\S]*event: done/);
  expect(events).toContain('Em gợi ý tìm từ khóa trước nha.');
  const turnId = JSON.parse(events.split('\n')[1].slice('data: '.length)).id;

  expect((await profile({ action: 'select', id: 'demo-adult' })).status()).toBe(200);
  expect((await page.request.get(learnerView)).status()).toBe(404);
  expect((await profile({ action: 'select', id: 'demo-admin' })).status()).toBe(200);
  const { turns, self: tutorSelf, call } = await (await page.request.get(learnerView)).json();
  expect({ tutorSelf, call }).toEqual({ tutorSelf:'em', call:'chị Ếch' });
  const turn = turns.find(entry => entry.id === turnId);
  expect(turn).toMatchObject({ status: 'answered', question: 'Em nên bắt đầu từ đâu? [email redacted]' });

  await page.goto('/');
  await page.getByLabel('Xem bàn của').selectOption(child);
  await expect(page.locator('h1')).toHaveText(/Bàn của Ếch/);
  await page.getByRole('region', { name: 'Bài tiếp theo' }).getByRole('listitem').filter({ hasText: 'Toán 7' })
    .getByRole('link', { name: /Mở bài|Học tiếp/ }).first().tap();
  const heading = page.getByRole('heading', { name: 'Tổng kết bài' });
  const flow = page.locator('.lesson-flow');
  for (let index = 0; index < 20 && !await heading.isVisible(); index++) {
    await flow.locator('.lesson-flow-page[data-e2e-turned-from]').evaluateAll(sheets => sheets.forEach(sheet => delete sheet.dataset.e2eTurnedFrom));
    const sheet = flow.locator('.lesson-flow-page:visible');
    await sheet.evaluate(element => { element.dataset.e2eTurnedFrom = ''; });
    await flow.getByRole('button', { name: /^(Bắt đầu bài|Trang sau: Câu [\d–]+|Sang Tổng kết)$/ }).tap();
    await expect(flow.locator('.lesson-flow-page[data-e2e-turned-from]:visible')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn', /.+/);
  }
  const remarks = page.getByRole('region', { name: 'Nhận xét của gia sư' });
  await expect(remarks.getByText(turn.question).last()).toBeVisible();
  await expect(remarks.getByText(turn.answer).last()).toBeVisible();
});
