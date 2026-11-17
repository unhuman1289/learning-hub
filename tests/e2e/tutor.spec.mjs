import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const lessonId = 'les_00000000000000000005';
const lessonPath = '/api/lessons/' + lessonId;
const child = 'demo-ech';

test('Quản trị tắt gia sư, trẻ em hỏi qua SSE và người giám hộ đọc nhận xét', async ({ page, baseURL }) => {
  const local = new URL(baseURL);
  expect(['localhost', '127.0.0.1']).toContain(local.hostname);
  const { bearer } = JSON.parse(await readFile('.wrangler/demo-runner.json', 'utf8'));
  const headers = { origin: local.origin };
  const profile = data => page.request.post('/api/profiles', { headers, data });
  const toggle = enabled => page.request.post('/api/admin/family', {
    headers, data: { action: 'tutor', userId: child, enabled },
  });
  const ask = question => page.request.post('/api/tutor', {
    headers, data: { lessonId, itemId: 'i1', question },
  });
  const learnerView = lessonPath + '/tutor?learner=' + child;

  await page.goto('/');
  const childProfile = page.getByRole('button', { name: /Ếch thử/ });
  await expect(childProfile).toBeVisible();
  expect((await ask('Em nên bắt đầu từ đâu?')).status()).toBe(401);
  await childProfile.tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  expect((await toggle(false)).status()).toBe(403);

  expect((await profile({ action: 'select', id: 'demo-admin' })).status()).toBe(200);
  expect((await profile({ action: 'manage' })).status()).toBe(200);
  await page.goto('/?trang=quan-tri');
  await page.getByRole('button', { name: 'Gia đình', exact: true }).tap();
  const member = page.getByRole('listitem').filter({ hasText: 'demo-ech@example.test' });
  const checkbox = member.getByRole('checkbox', { name: 'Cho phép dùng gia sư' });
  await expect(checkbox).toBeChecked();
  const save = page.waitForResponse(response => response.url().endsWith('/api/admin/family') && response.request().method() === 'POST');
  await checkbox.tap();
  expect((await save).status()).toBe(200);
  await expect(checkbox).not.toBeChecked();

  expect((await profile({ action: 'select', id: child })).status()).toBe(200);
  expect((await ask('Em nên bắt đầu từ đâu?')).status()).toBe(403);
  expect((await profile({ action: 'select', id: 'demo-admin' })).status()).toBe(200);
  expect((await profile({ action: 'manage' })).status()).toBe(200);
  expect((await toggle(true)).status()).toBe(200);
  expect((await profile({ action: 'select', id: child })).status()).toBe(200);

  const leaseUrl = new URL('/api/automation/v2/jobs/lease', local);
  leaseUrl.hostname = 'localhost';
  const lease = await page.request.post(leaseUrl.href, {
    headers: { Authorization: bearer },
    data: { kinds: ['assess'], max: 1, runner: { name: 'T1 QA', version: '1', model: 'none' } },
  });
  expect(lease.status()).toBe(200);
  const wsUrl = new URL('/api/automation/v2/tutor/connect', local);
  wsUrl.hostname = 'localhost'; wsUrl.protocol = 'ws:';
  const socket = new WebSocket(wsUrl, { headers: { Authorization: bearer } });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
  const heartbeat = setInterval(() => socket.send('ping'), 30000);
  socket.addEventListener('close', () => clearInterval(heartbeat), {once:true});
  socket.addEventListener('message', event => {
    if (event.data === 'pong') return;
    const msg = JSON.parse(event.data);
    if (msg.type === 'ask') {
      socket.send(JSON.stringify({type:'delta',turnId:msg.turnId,text:'Em thử tìm từ khóa. '}));
      socket.send(JSON.stringify({type:'delta',turnId:msg.turnId,text:'Em nghĩ gì?'}));
      socket.send(JSON.stringify({type:'done',turnId:msg.turnId}));
    }
  });
  const response = await ask('Em nên bắt đầu từ đâu? test@example.test');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/event-stream');
  const events = await response.text();
  expect(events).toMatch(/event: delta[\s\S]*event: delta[\s\S]*event: done/);
  socket.close();
  const turnId = JSON.parse(events.split('\n')[1].slice('data: '.length)).id;

  expect((await profile({ action: 'select', id: 'demo-adult' })).status()).toBe(200);
  expect((await page.request.get(learnerView)).status()).toBe(404);
  expect((await profile({ action: 'select', id: 'demo-admin' })).status()).toBe(200);
  const { turns } = await (await page.request.get(learnerView)).json();
  const turn = turns.find(entry => entry.id === turnId);
  expect(turn).toMatchObject({ status: 'answered', question: 'Em nên bắt đầu từ đâu? [email redacted]' });

  await page.goto('/');
  await page.getByLabel('Xem bàn của').selectOption(child);
  await page.getByRole('region', { name: 'Bài tiếp theo' }).getByRole('listitem').filter({ hasText: 'Toán 7' })
    .getByRole('link', { name: /Mở bài|Học tiếp/ }).first().tap();
  const heading = page.getByRole('heading', { name: 'Tổng kết bài' });
  const flow = page.locator('.lesson-flow');
  for (let index = 0; index < 20 && !await heading.isVisible(); index++) {
    const sheet = flow.locator('.lesson-flow-page');
    await sheet.evaluate(element => { element.dataset.e2eTurnedFrom = ''; });
    await flow.getByRole('button', { name: /^(Bắt đầu bài|Trang sau: Câu [\d–]+|Sang Tổng kết)$/ }).tap();
    await expect(flow.locator('.lesson-flow-page[data-e2e-turned-from]')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn', /.+/);
  }
  const remarks = page.getByRole('region', { name: 'Nhận xét của gia sư' });
  await expect(remarks.getByText(turn.question).last()).toBeVisible();
  await expect(remarks.getByText(turn.answer).last()).toBeVisible();
});
