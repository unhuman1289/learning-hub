import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { shapeNetwork, timeFromTap } from './network.mjs';

const credentialsFile = process.env.PHONE_CREDENTIALS;
const artifacts = process.env.PHONE_ARTIFACTS;
const requestLimit = 7 * 60_000;
const deviceNotebook = {
  'iphone-13': 'Deutsch',
  'pixel-7': 'Deutsch · Android',
};
const visiblePage = page => page.locator('.lesson-flow');

async function turnUntil(page, target, direction = /^(Bắt đầu bài|Trang sau: Câu [\d–]+|Sang Tổng kết)$/) {
  for (let offset = 0; offset < 20 && !await target.isVisible(); offset++) {
    const corner = page.getByRole('button', { name: direction });
    await expect(corner).toBeVisible();
    // The turn loads lazily, so wait for the sheet to be replaced, not only for the turn flag;
    // otherwise the next tap lands on the new page and turns one page too far.
    await visiblePage(page).locator('.lesson-flow-page[data-e2e-turned-from]').evaluateAll(sheets => sheets.forEach(sheet => delete sheet.dataset.e2eTurnedFrom));
    await visiblePage(page).locator('.lesson-flow-page:visible').evaluate(sheet => { sheet.dataset.e2eTurnedFrom = ''; });
    await corner.tap();
    await expect(visiblePage(page).locator('.lesson-flow-page[data-e2e-turned-from]:visible')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn', /.+/);
  }
  await expect(target).toBeVisible();
}

async function openSpine(page, title) {
  const spine = page.getByRole('link', { name: 'Mở sổ ' + title, exact: true });
  await spine.tap();
  if (await spine.isVisible() && await spine.getAttribute('data-out') === 'true') await spine.tap();
  await expect(page.getByRole('heading', { name: title, exact: true }).filter({ visible: true })).toBeVisible();
}

test('PHONE-CHECK', async ({ browser, browserName, baseURL }, info) => {
  if (new URL(baseURL).hostname === 'learning-hub-staging.tranvu-812.workers.dev') {
    if (!credentialsFile || !artifacts || !process.env.PHONE_COMMIT) {
      throw Error('Staging requires a commit, private credentials and a private artifacts folder.');
    }
    const health = await fetch(new URL('/api/health', baseURL)).then(response => response.json());
    expect(health.environment).toBe('staging');
    expect(health.commit).toBe(process.env.PHONE_COMMIT);
    test.setTimeout(26 * 60_000);
  } else if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw Error('PHONE-CHECK supports only loopback and Learning Hub staging.');
  }
  const subject = credentialsFile ? deviceNotebook[info.project.name] : 'Deutsch';
  const dir = artifacts && join(artifacts, info.project.name);
  if (dir) await mkdir(dir, { recursive: true, mode: 0o700 });
  const results = {};
  const measurements = {};
  let context = await browser.newContext({ ...info.project.use, baseURL });
  context.setDefaultTimeout(12_000);
  let page = await context.newPage();
  let restoreNetwork = await shapeNetwork(page, browserName);
  const desk = () => page.getByRole('region', { name: 'Bài tiếp theo' });
  const spine = () => page.getByRole('link', { name: 'Mở sổ ' + subject, exact: true });
  const answer = item => visiblePage(page).locator('#answer-' + item);
  let lessonUrl, newId, notebookId;
  const failures = [];
  const selected = new Set((process.env.PHONE_STEPS ?? '').split(',').filter(Boolean).map(Number));

  async function step(number, action) {
    if (number !== 1 && selected.size && !selected.has(number)) return;
    if (failures.includes(1) && number !== 11) return;
    try {
      const details = await test.step(String(number), action);
      results[number] = { pass: true, ...details };
    } catch (error) {
      failures.push(number);
      const message = error instanceof Error ? error.message : String(error);
      const secrets = credentialsFile ? [await readFile('private-data/staging-household.txt', 'utf8').then(v => v.replace(/\r?\n$/, ''))] : [];
      results[number] = { pass: false, times: measurements[number], error: secrets.reduce((text, secret) => text.replaceAll(secret, '[ẩn]'), message).slice(0, 1200) };
    } finally {
      if (dir) {
        await page.screenshot({
          path: join(dir, String(number).padStart(2, '0') + '.png'),
          mask: [page.getByLabel('Email', { exact: true }), page.getByLabel('Mật khẩu gia đình', { exact: true })],
          timeout: 5000,
        }).catch(() => {});
      }
      if (dir) await writeFile(join(dir, 'result.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
    }
  }

  try {
    await step(1, async () => {
      await page.goto('/');
      if (credentialsFile) {
        const { profileId } = JSON.parse(await readFile(credentialsFile, 'utf8'));
        const password = (await readFile('private-data/staging-household.txt', 'utf8')).replace(/\r?\n$/, '');
        await page.getByLabel('Mật khẩu gia đình', { exact: true }).fill(password);
        const entered = page.waitForResponse(response => response.url().endsWith('/api/household') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Vào nhà' }).tap();
        expect([302, 303]).toContain((await entered).status());
        const selectedProfile = await page.request.post('/api/profiles', { headers: { Origin: new URL(baseURL).origin }, data: { action: 'select', id: profileId } });
        expect(selectedProfile.status(), 'profile selection HTTP').toBe(200);
        await page.goto('/');
      } else {
        await page.getByRole('button', { name: /Ếch thử/ }).tap();
      }
      await expect(desk()).toBeVisible();
      const storageState = await context.storageState();
      await context.close();
      context = await browser.newContext({ ...info.project.use, baseURL, storageState });
      context.setDefaultTimeout(12_000);
      page = await context.newPage();
      restoreNetwork = await shapeNetwork(page, browserName);
      await page.goto('/');
      await expect(desk()).toBeVisible();
    });

    await step(2, async () => {
      await spine().scrollIntoViewIfNeeded();
      const pixels = await spine().boundingBox();
      const deskOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      await openSpine(page, subject);
      const bookOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(Math.max(deskOverflow, bookOverflow), 'horizontal overflow in CSS px').toBeLessThanOrEqual(1);
      return { spineWidth: pixels.width, spineHeight: pixels.height };
    });

    await step(3, async () => {
      if (credentialsFile) {
        const { subjects } = await (await context.request.get('/api/subjects')).json();
        const notebook = subjects.find(row => row.title === subject);
        notebookId = notebook.id;
        const { lessons } = await (await context.request.get('/api/subjects/' + notebook.id + '/lessons')).json();
        const id = lessons.find(row => !row.completedAt && row.slot === 'primary')?.id;
        if (!id) throw Error('No unfinished primary demo lesson.');
        lessonUrl = new URL('/?bai2=' + id, baseURL).href;
        const path = '/api/lessons/' + id;
        const { lesson } = await (await context.request.get(path)).json();
        if (!lesson.lastSubmission && lesson.items.some(item => item.id === 'i1' && item.input === 'short')) {
          const seed = await context.request.post(path + '/submissions', { headers: { origin: new URL(baseURL).origin }, data: {
            clientSubmissionId: crypto.randomUUID(),
            draftRevision: lesson.draftRevision,
            stage: 'independent',
            itemIds: ['i1'],
            answers: { i1: { answer: 'Wi' } },
          } });
          expect(seed.status(), 'stage a partially worked demo lesson').toBe(200);
        }
      }
      const times = measurements[3] = [];
      for (let n = 0; n < 3; n++) {
        await page.goto('/');
        const card = desk().getByRole('listitem').filter({ has: page.getByText(new RegExp('^' + subject + '(?: · [0-9]+ phút)?$')) }).first();
        const open = card.getByRole('link', { name: /^(Học tiếp|Mở bài)$/ });
        const name = await open.textContent();
        if (credentialsFile) expect(name.trim()).toBe('Học tiếp');
        const first = visiblePage(page).locator('[data-question-number]').first();
        if (name.trim() === 'Mở bài') {
          await open.tap();
          await expect(page.getByRole('button', { name: 'Bắt đầu bài' })).toBeVisible();
          await turnUntil(page, first);
        } else times.push(await timeFromTap(open, first));
        lessonUrl = page.url();
      }
      return { times };
    });

    await step(4, async () => {
      if (!new URL(page.url()).searchParams.has('bai2')) {
        if (!lessonUrl) throw Error('No accessible demo lesson.');
        await page.goto(lessonUrl);
      }
      const field = visiblePage(page).getByLabel('Bài làm của bạn').first();
      await turnUntil(page, field);
      const card = field.locator('xpath=ancestor::article');
      await field.tap();
      await field.fill('');
      await field.pressSequentially('Haus');
      await expect(field).toHaveValue('Haus');
      await field.evaluate(el => el.setSelectionRange(1, 1));
      for (const character of ['ä', 'ß']) {
        const key = card.getByRole('button', { name: 'Chèn ' + character, exact: true });
        const box = await key.boundingBox();
        expect(Math.min(box.width, box.height), 'touch target in CSS px').toBeGreaterThanOrEqual(44);
        await key.tap();
        await expect(field).toHaveValue(character === 'ä' ? 'Häaus' : 'Häßaus');
      }
      await field.fill('');
      await field.pressSequentially('Hấu');
      await expect(field).toHaveValue('Hấu');
      await expect(card.getByText(/Có dấu tiếng Việt/)).toBeVisible();
      const attrs = await field.evaluate(el => ({
        size: parseFloat(getComputedStyle(el).fontSize),
        autoCapitalize: el.getAttribute('autocapitalize'),
        autoCorrect: el.getAttribute('autocorrect'),
        spellcheck: el.spellcheck,
        autocomplete: el.getAttribute('autocomplete'),
      }));
      if (credentialsFile) expect(attrs.autocomplete, 'autocomplete').toBe('off');
      return attrs;
    });

    await step(5, async () => {
      if (credentialsFile) {
        for (const [index, correct] of ['Wie', 'Wo', 'Wann'].entries()) {
          const field = answer('i' + (index + 1));
          await turnUntil(page, field);
          await field.fill(correct);
        }
      } else {
        const field = visiblePage(page).getByLabel('Bài làm của bạn').first();
        await field.fill('Test online');
      }
      await expect(visiblePage(page).getByRole('button', { name: /^Kiểm tra/ })).toHaveCount(0);
      const summary = page.getByRole('region', { name: 'Tổng kết bài' });
      await turnUntil(page, summary);
      const elapsed = await timeFromTap(summary.getByRole('button', { name: 'Nộp bài', exact: true }),
        summary.getByText('Đã có kết quả bài làm.', { exact: true }));
      const times = measurements[5] = [elapsed];
      return { times };
    });

    await step(6, async () => {
      const summary = page.getByRole('region', { name: 'Tổng kết bài' });
      const id = new URL(lessonUrl ?? page.url()).searchParams.get('bai2');
      if (!id) throw Error('No accessible demo lesson.');
      const feedbackPath = '/api/lessons/' + id + '/feedback';
      const count = async () => {
        const response = await context.request.get(feedbackPath);
        expect(response.ok(), 'load saved submissions').toBeTruthy();
        return (await response.json()).submissions.length;
      };
      await turnUntil(page, summary);
      const lesson = (await (await context.request.get('/api/lessons/' + id)).json()).lesson;
      const index = credentialsFile ? 2 : lesson.items.findIndex(item => item.input === 'short');
      const item = lesson.items[index];
      await summary.getByRole('button', { name: new RegExp('^Câu ' + (index + 1) + ' ') }).tap();
      const field = answer(item.id);
      await expect(field).toBeVisible();
      const before = await count();
      await restoreNetwork({ offline: true });
      try {
        await field.fill('Test offline');
        await turnUntil(page, summary);
        await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
        await expect(summary.getByText(/Chưa nộp được vì mất mạng/)).toBeVisible();
        if (dir) await page.screenshot({ path: join(dir, '06-offline.png') });
      } finally {
        await restoreNetwork();
      }
      await expect.poll(count).toBe(before + 1);
      // The API can show the saved row before the reader receives the response.
      await expect(summary.getByRole('button', { name: 'Thử nộp lại', exact: true })).toHaveCount(0);
      await page.reload();
      expect(await count()).toBe(before + 1);
    });

    await step(7, async () => {
      if (lessonUrl) await page.goto(lessonUrl);
      await expect(page.locator('.lesson-flow')).toBeVisible();
      const summary = visiblePage(page).getByRole('region', { name: 'Tổng kết bài' });
      await turnUntil(page, summary);
      const finish = summary.getByRole('button', { name: 'Xong bài', exact: true });
      if (await finish.isVisible()) await finish.tap();
      const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Xong bài', exact: true });
      const reopen = page.getByRole('button', { name: 'Mở lại bài', exact: true });
      await expect(confirm.or(reopen).first()).toBeVisible();
      if (await confirm.isVisible()) await confirm.tap();
      await expect(visiblePage(page).getByRole('button', { name: 'Mở lại bài', exact: true })).toBeVisible();
      await page.goto(lessonUrl ?? page.url());
      await expect(reopen).toBeVisible();
      await summary.getByRole('button', { name: /^Câu \d+ (ĐÚNG|SỬA LẠI)/ }).first().tap();
      const mark = visiblePage(page).getByText('Chi tiết lời phê', { exact: true }).first();
      await expect(page.locator('html')).not.toHaveAttribute('data-lesson-turn', /.+/);
      await mark.tap();
      await expect(mark.locator('..')).toHaveAttribute('open', '');
      const id = new URL(page.url()).searchParams.get('bai2');
      const { lesson } = await (await context.request.get('/api/lessons/' + id)).json();
      expect(lesson.completedAt).toBeTruthy();
      const field = page.locator('input[id^="answer-"],textarea[id^="answer-"]').first();
      await expect(field).not.toHaveValue('');
      if (dir) await page.screenshot({ path: join(dir, '07-feedback.png') });

    });

    await step(8, async () => {
      if (notebookId) await page.goto('/?sach=' + notebookId);
      else {
        await page.goto('/');
        await openSpine(page, subject);
      }
      const started = Date.now();
      const posted = page.waitForResponse(response => response.url().endsWith('/api/requests') && response.request().method() === 'POST');
      const requestButton = page.getByRole('button', { name: /^(Xin bài mới|Bài mới)$/ });
      await requestButton.tap();
      const response = await posted;
      expect(response.ok()).toBeTruthy();
      const { request } = await response.json();
      const deadline = Number(process.env.PHONE_REQUEST_TIMEOUT ?? (credentialsFile ? requestLimit : 45_000));
      await expect.poll(async () => {
        const current = (await (await context.request.get('/api/requests')).json()).requests.find(row => row.id === request.id);
        newId = current?.resultLessonId;
        return newId ? 'saved' : current?.jobStatus ?? current?.status;
      }, { timeout: deadline, intervals: [5000, 15000, 60000] }).toBe('saved');
      if (!page.url().includes(newId)) {
        const open = page.getByRole('button', { name: 'Mở bài mới' });
        if (await open.isVisible()) await open.tap();
        else {
          await page.reload();
          // The notebook links the saved lesson from its title and from Mở bài.
          await page.getByRole('link', { name: 'Mở bài', exact: true }).and(page.locator('a[href*="' + newId + '"]')).tap();
        }
      }
      await expect(page).toHaveURL(new RegExp(newId));
      await expect(page.locator('.lesson-flow')).toBeVisible();
      return { elapsed: Date.now() - started };
    });

    await step(9, async () => {
      await page.goto('/');
      const title = 'Luyện phân số ' + info.project.name + (credentialsFile ? ' ' + Date.now() : '');
      await page.getByRole('button', { name: 'Sổ mới', exact: true }).tap();
      const dialog = page.getByRole('dialog', { name: 'Mở sổ mới' });
      await dialog.getByLabel('Tên sổ').fill(title);
      await dialog.getByLabel('Bạn muốn học gì?').fill('Ôn cộng hai phân số khác mẫu lớp 7. Ba câu ngắn, ưu tiên tính nhẩm.');
      const created = page.waitForResponse(response => response.url().endsWith('/api/subjects') && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Mở sổ', exact: true }).tap();
      const response = await created;
      expect(response.status()).toBe(201);
      const { subject: notebook } = await response.json();
      await page.goto('/');
      const shelfEntry = page.getByLabel(new RegExp('^(Mở sổ|Sổ) ' + title + '$'));
      await expect(shelfEntry).toBeVisible();
      if (dir) await page.screenshot({ path: join(dir, '09-shelf.png') });
      await expect.poll(async () => {
        const state = await (await context.request.get('/api/subjects')).json();
        return state.subjects.find(row => row.id === notebook.id)?.status;
      }, { timeout: Number(process.env.PHONE_REQUEST_TIMEOUT ?? requestLimit), intervals: [5000, 15000, 60000] }).toBe('active');
      await page.reload();
      await openSpine(page, title);
      const { lessons } = await (await context.request.get('/api/subjects/' + notebook.id + '/lessons')).json();
      const firstLesson = lessons.find(row => row.slot === 'primary');
      expect(firstLesson?.id, 'saved first lesson').toBeTruthy();
      await page.getByRole('link', { name: /^Mở bài/ }).tap();
      await expect(page).toHaveURL(new RegExp(firstLesson.id));
    });
    if (credentialsFile) {
      const state = await context.storageState();
      await context.close();
      context = await browser.newContext({
        ...info.project.use, baseURL, storageState: state,
        userAgent: info.project.use.userAgent + ' Zalo/26.11.1',
      });
      context.setDefaultTimeout(12_000);
      page = await context.newPage();
      await shapeNetwork(page, browserName);
      await step(11, async () => {
        await page.goto('/');
        await expect(page.getByText(/Mở bằng Safari\/Chrome/)).toBeVisible();
      });
    }
  } finally {
    await context.close();
  }
  expect(failures, 'failed PHONE-CHECK steps').toEqual([]);
});
