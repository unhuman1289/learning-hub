import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });

const lessonId = 'les_00000000000000000001';
const activePage = page => page.locator('.lesson-flow-window-page[data-active]');
const nextPage = async page => {
  const previous = await activePage(page).getAttribute('data-question-page');
  await page.locator('[data-turn-edge=right]:visible').click();
  await expect(activePage(page)).not.toHaveAttribute('data-question-page', previous ?? '');
  await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn');
};
const answerSize = field => field.evaluate(input => ({
  height: input.clientHeight,
  line: parseFloat(getComputedStyle(input).lineHeight),
  contentHeight: input.scrollHeight,
  width: input.clientWidth,
  contentWidth: input.scrollWidth,
}));

async function capture(page, project, name) {
  const folder = process.env.W5_SCREENSHOTS;
  if (!folder) return;
  await mkdir(folder, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${folder}/${project}-${name}.png` });
}

test('W5 giữ chữ Hán đứng và ô trả lời co giãn theo dòng kẻ', async ({ page, browserName, isMobile }, info) => {
  await page.route(url => url.pathname === '/api/today', async route => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const data = await response.json();
    const demoNotebook = data.subjects.find(subject => subject.title !== 'Deutsch');
    demoNotebook.title = '汉语';
    await route.fulfill({ response, json: data });
  });
  let locked = false;
  let revision = 0;
  await page.route(`**/api/lessons/${lessonId}/draft`, route => route.fulfill({ json: { revision: ++revision } }));
  await page.route('**/api/learners/me/hints', route => route.fulfill({ status: 204 }));
  await page.route('**/api/study', route => route.request().method() === 'GET' ? route.continue() : route.abort());
  await page.route(url => url.pathname === `/api/lessons/${lessonId}` && url.searchParams.get('view') === 'reader', async route => {
    const response = await route.fetch();
    const data = await response.json();
    const short = data.lesson.items.find(item => item.input === 'short');
    const fixture = { ...short, attachment: 'optional', prompt: 'Viết một câu tiếng Đức về kế hoạch của em cuối tuần này.' };
    data.lesson.items = [fixture, { ...fixture, id: 'w5-long', input: 'long', prompt: 'Kể thêm về kế hoạch của em.' }];
    data.lesson.draft = {};
    data.lesson.completedAt = locked ? '2026-11-19T10:00:00Z' : null;
    data.submissions = [];
    await route.fulfill({ response, json: data });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).click();
  const han = page.locator('.spine-face').getByText('汉语', { exact: true });
  const latin = page.locator('.spine-face').getByText('Deutsch', { exact: true });
  await expect(han).toBeVisible();
  await expect(han).toHaveCSS('writing-mode', 'vertical-rl');
  await expect(han).toHaveCSS('text-orientation', 'upright');
  await expect(han).toHaveCSS('transform', 'none');
  await expect(latin).toHaveCSS('text-orientation', 'mixed');
  await expect(latin).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await han.scrollIntoViewIfNeeded();
  await capture(page, info.project.name, 'ke-so');

  await page.goto('/?bai2=' + lessonId);
  await nextPage(page);
  const field = activePage(page).getByRole('textbox', { name: 'Bài làm của bạn' });
  await expect(field).toHaveJSProperty('tagName', 'TEXTAREA');
  await expect(field).toHaveAttribute('lang', 'de');
  await expect(field).toHaveAttribute('maxlength', '8000');
  await expect(field).toHaveAttribute('autocorrect', 'off');
  await field.fill('');
  const { line } = await answerSize(field);
  await expect.poll(async () => (await answerSize(field)).height).toBe(line);
  await page.evaluate(() => document.fonts.ready);
  const sample = 'Am Samstag möchte ich mit meiner Familie in den Park gehen und dort ein Picknick machen. Danach gehen wir am See spazieren und besuchen meine Großeltern. Wenn es am Sonntag regnet, bleiben wir zu Hause und kochen zusammen eine Suppe.';
  await field.fill(sample.slice(0, 94));
  expect((await answerSize(field)).height).toBeGreaterThan(line);
  const words = sample.split(' ');
  let wrapped = '';
  for (const word of words) {
    wrapped = wrapped ? wrapped + ' ' + word : word;
    await field.fill(wrapped);
    if ((await answerSize(field)).height === 3 * line) break;
  }
  expect((await answerSize(field)).height).toBe(3 * line);
  await field.press('End');
  await field.press('Enter');
  await expect(field).toHaveValue(wrapped);
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS('outline-style', 'solid');
  await capture(page, info.project.name, 'tra-loi');

  const grip = activePage(page).getByRole('button', { name: 'Đổi chiều cao ô trả lời' });
  await grip.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await grip.boundingBox();
  expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
  const start = { x: x + width / 2, y: y + height / 2 };
  if (browserName === 'chromium' && isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, y: start.y + line * 1.4 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + line * 1.4, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await answerSize(field)).height).toBe(4 * line);
  await grip.press('ArrowUp');
  await expect.poll(async () => (await answerSize(field)).height).toBe(3 * line);
  await grip.press('Enter');
  await field.fill('W'.repeat(3000));
  const shortCap = await answerSize(field);
  const fraction = (page.viewportSize().width < 640 ? .4 : .45);
  await expect.poll(async () => (await answerSize(field)).height).toBe(Math.floor(page.viewportSize().height * fraction / line) * line);
  expect(shortCap.contentHeight).toBeGreaterThan(shortCap.height);
  expect(shortCap.contentWidth).toBeLessThanOrEqual(shortCap.width + 1);
  await field.fill('Erste Zeile\nZweite Zeile');
  await expect(field).toHaveValue('Erste Zeile Zweite Zeile');
  await field.fill(wrapped);

  await nextPage(page);
  await expect(field).toHaveAttribute('rows', '5');
  await expect.poll(async () => (await answerSize(field)).height).toBe(5 * line);
  await field.fill('Erste Zeile');
  await field.press('Enter');
  await field.pressSequentially('Zweite Zeile');
  await expect(field).toHaveValue('Erste Zeile\nZweite Zeile');
  await field.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 270 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => (await answerSize(field)).height).toBe(Math.floor(270 * fraction / line) * line);
  await field.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event('resize'));
  });

  await nextPage(page);
  const summary = page.getByRole('region', { name: 'Tổng kết bài' });
  await expect(summary.getByText('Quyền riêng tư của ảnh')).toHaveCount(0);
  await expect(summary.getByRole('link', { name: 'Về bàn' })).toHaveCount(0);
  const close = page.getByRole('link', { name: 'Đóng sổ' });
  await expect(close).toBeVisible();
  await expect(summary.getByRole('button', { name: /^Câu 2/ })).toBeVisible();
  await expect(summary.getByText('Đã làm 2/2 câu.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, info.project.name, 'tong-ket');
  await close.click();
  await expect(page).toHaveURL(/\?sach=/);

  locked = true;
  await page.goto('/?bai2=' + lessonId);
  await summary.getByRole('button', { name: /^Câu 1/ }).click();
  await expect(field).toBeDisabled();
  await expect(grip).toHaveCount(0);
  await nextPage(page);
  await nextPage(page);
  const toolbar = close.locator('..');
  await toolbar.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 160, clientY: 100 });
  await toolbar.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 164, clientY: 187 });
  await expect(page).toHaveURL(/\?sach=/);
});
