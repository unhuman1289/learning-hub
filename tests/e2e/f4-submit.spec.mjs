import { readFile } from 'node:fs/promises';
import { runFake } from '../../scripts/fake-runner.mjs';
import { openLessonSummary } from './lesson-summary.mjs';
import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('câu có đáp án và câu mở được chấm trong cùng lượt nộp', async ({ page, baseURL }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  await page.goto('/?bai2=les_00000000000000000004');
  await page.getByRole('button', { name: 'Bắt đầu bài', exact: true }).tap();
  const active = page.locator('.lesson-flow-window-page[data-active]');
  await active.locator('#answer-i2').fill('Lena kann heute Suppe kochen.');
  await active.locator('#answer-i3').fill('Paul möchte einen Kuchen kaufen.');

  const summary = await openLessonSummary(page);
  const submitted = page.waitForResponse(r => r.url().endsWith('/submissions') && r.request().method() === 'POST');
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  const response = await submitted;
  expect(response.ok()).toBe(true);
  const { submission } = await response.json();
  expect(submission.attempts).toEqual([
    expect.objectContaining({ item_id: 'i2', result: 'correct' }),
    expect.objectContaining({ item_id: 'i3', status: 'pending' }),
  ]);

  const local = new URL(baseURL);
  local.hostname = 'localhost';
  const credentials = JSON.parse(await readFile('.wrangler/demo-runner.json', 'utf8'));
  expect(await runFake({ baseUrl: local.href, credentials, max: 1 })).toEqual([
    expect.objectContaining({ status: 'succeeded' }),
  ]);
  await expect(summary.getByText('Đã có kết quả bài làm.', { exact: true })).toBeVisible();
  const feedback = await (await page.request.get(response.url().replace(/\/submissions$/, '/feedback'))).json();
  expect(feedback.submissions.find(entry => entry.id === submission.id).attempts).toEqual([
    expect.objectContaining({ item_id: 'i2', result: 'correct' }),
    expect.objectContaining({ item_id: 'i3', result: 'correct' }),
  ]);
});

test('giữ nháp của yêu cầu từng câu cũ và gửi lại từ Tổng kết', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  const id = 'les_00000000000000000001', url = '/api/lessons/' + id;
  const { lesson } = await (await page.request.get(url)).json();
  const item = lesson.items.find(item => item.input === 'choice');
  const old = {
    clientSubmissionId: crypto.randomUUID(), draftRevision: lesson.draftRevision,
    stage: item.stage, itemIds: [item.id], answers: { [item.id]: { answer: '["b"]' } },
  };
  await page.evaluate(({ id, old }) => {
    const profile = localStorage.getItem('lh-offline-profile');
    localStorage.setItem('lh:lesson-draft:v2:' + profile + ':' + id + ':submission',
      JSON.stringify({ expiresAt: Date.now() + 60000, draft: JSON.stringify(old) }));
  }, { id, old });
  const sent = [];
  await page.route('**' + url + '/submissions', async route => {
    if (route.request().method() === 'POST') sent.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto('/?bai2=' + id);
  const summary = await openLessonSummary(page);
  await summary.getByRole('button', { name: 'Thử nộp lại', exact: true }).tap();
  await expect(page.getByRole('alert').filter({ hasText: 'Bài làm vẫn còn. Bấm Nộp bài' })).toBeVisible();
  expect(sent).toEqual([]);
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  await expect(summary.getByText('Đã có kết quả bài làm.', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ stage: null, itemIds: null });
  expect(sent[0].clientSubmissionId).not.toBe(old.clientSubmissionId);
  const { submissions } = await (await page.request.get(url + '/feedback')).json();
  expect(submissions[0].attempts).toEqual([
    expect.objectContaining({ item_id: item.id, answer: '["b"]' }),
  ]);
});

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
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({ itemIds: null, stage: null });
    key = input.clientSubmissionId;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('connectionreset');
  });
  await page.goto('/?bai2=' + id);
  await expect(page.locator(`[data-question-number="${lesson.items.findIndex(i => i.id === item.id) + 1}"]:visible`)).toBeVisible();
  await (await openLessonSummary(page)).getByRole('button', { name: 'Nộp bài', exact: true }).tap();
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

test('mất mạng trước POST: tự gửi một lần khi có mạng', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  const id = 'les_00000000000000000001', api = `/api/lessons/${id}`;
  const lesson = (await (await page.request.get(api)).json()).lesson;
  // Keep the shared fixture free of an outstanding open-answer grading job.
  const item = lesson.items.find(i => i.id === 'i7');
  const draft = await page.request.put(api + '/draft', { headers: { origin: new URL(page.url()).origin }, data: { revision: lesson.draftRevision, answers: { [item.id]: { answer: 'Buch' } } } });
  expect(draft.ok()).toBeTruthy();
  let posts = [];
  await page.route(`**${api}/submissions`, async route => { if (route.request().method() === 'POST') posts.push(route.request().postDataJSON().clientSubmissionId); await route.continue(); });
  await page.goto('/?bai2=' + id);
  const question = page.locator(`[data-question-number="${lesson.items.findIndex(i => i.id === item.id) + 1}"]:visible`).locator('xpath=ancestor::article');
  await expect(question).toBeVisible();
  const summary = await openLessonSummary(page);
  await context.setOffline(true);
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  await expect(summary.getByText(/Chưa nộp được vì mất mạng/)).toBeVisible();
  expect(posts).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => posts.length).toBe(1);
  await expect(page.getByText(/kiểm tra lại khi có mạng/)).toHaveCount(0);
  const found = await (await page.request.get(api + '/submissions?clientSubmissionId=' + posts[0])).json();
  expect(found.submission.attempts.filter(a => a.item_id === item.id)).toHaveLength(1);
});

test('nháp đổi trên máy khác: giữ bài và không ghi đè khi nối mạng', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  const id = 'les_00000000000000000001', api = `/api/lessons/${id}`;
  const lesson = (await (await page.request.get(api)).json()).lesson;
  const item = lesson.items.filter(i => i.input === 'short')[2];
  const initial = await page.request.put(api + '/draft', { headers: { origin: new URL(page.url()).origin }, data: { revision: lesson.draftRevision, answers: { [item.id]: { answer: 'Nháp ban đầu' } } } });
  expect(initial.ok()).toBeTruthy();
  const revision = (await initial.json()).revision;
  await page.goto('/?bai2=' + id);
  const number = lesson.items.findIndex(i => i.id === item.id) + 1;
  const question = page.locator(`[data-question-number="${number}"]:visible`).locator('xpath=ancestor::article');
  await expect(question).toBeVisible();
  await context.setOffline(true);
  await question.getByRole('textbox', { name: 'Bài làm của bạn' }).fill('Bài trên máy này');
  const summary = await openLessonSummary(page);
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  await expect(summary.getByText(/Chưa nộp được vì mất mạng/)).toBeVisible();
  const other = await page.request.put(api + '/draft', { headers: { origin: new URL(page.url()).origin }, data: { revision, answers: { [item.id]: { answer: 'Bản từ máy khác' } } } });
  expect(other.ok()).toBeTruthy();
  await context.setOffline(false);
  await expect(page.getByRole('alert').filter({ hasText: /khác|phiên bản|thay đổi/ }).first()).toBeVisible();
  await summary.getByRole('button', { name: new RegExp('^Câu ' + number + ' ') }).tap();
  expect(await question.getByRole('textbox', { name: 'Bài làm của bạn' }).inputValue()).toBe('Bài trên máy này');
  const current = (await (await page.request.get(api)).json()).lesson;
  expect(current.draft[item.id].answer).toBe('Bản từ máy khác');
  const history = (await (await page.request.get(api + '/feedback')).json()).submissions;
  expect(history.filter(s => s.attempts.some(a => a.item_id === item.id))).toHaveLength(0);
});

test('bài đã nhận, nháp đổi sau đó: không xóa bản đang giữ khi đối soát', async ({ page, context }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Ếch thử/ }).tap();
  await expect(page.getByRole('region', { name: 'Bài tiếp theo' })).toBeVisible();
  const id='les_00000000000000000001', api=`/api/lessons/${id}`;
  const lesson=(await (await page.request.get(api)).json()).lesson;
  const item=lesson.items.filter(i=>i.input==='short').at(-1);
  const initial=await page.request.put(api+'/draft',{headers:{origin:new URL(page.url()).origin},data:{revision:lesson.draftRevision,answers:{[item.id]:{answer:'Ban đầu'}}}});
  expect(initial.ok()).toBeTruthy();
  let posts=0, savedRevision, key;
  await page.route(`**${api}/submissions`,async route=>{
    if(route.request().method()!=='POST') return route.continue();
    posts++; const input=route.request().postDataJSON(); key=input.clientSubmissionId;
    expect(input.answers[item.id].answer).toBe('Câu trên máy này');
    const response=await route.fetch(); expect(response.ok()).toBeTruthy(); savedRevision=(await response.json()).draftRevision;
    await route.abort('connectionreset');
  });
  await page.goto('/?bai2='+id);
  const number=lesson.items.findIndex(i=>i.id===item.id)+1;
  const question=page.locator(`[data-question-number="${number}"]:visible`).locator('xpath=ancestor::article');
  await expect(question).toBeVisible();
  await question.getByRole('textbox',{name:'Bài làm của bạn'}).fill('Câu trên máy này');
  const summary = await openLessonSummary(page);
  await summary.getByRole('button', { name: 'Nộp bài', exact: true }).tap();
  await expect.poll(()=>savedRevision).toBeTruthy();
  const other=await page.request.put(api+'/draft',{headers:{origin:new URL(page.url()).origin},data:{revision:savedRevision,answers:{[item.id]:{answer:'Bản đến sau'}}}});
  expect(other.ok()).toBeTruthy();
  await context.setOffline(true); await context.setOffline(false);
  await expect(page.getByRole('alert').filter({hasText:'Lượt nộp đã lưu, nhưng nháp trên máy chủ đã đổi'})).toBeVisible();
  expect(posts).toBe(1);
  expect((await (await page.request.get(api+'/submissions?clientSubmissionId='+key)).json()).submission).toBeTruthy();
  expect((await (await page.request.get(api)).json()).lesson.draft[item.id].answer).toBe('Bản đến sau');
  await summary.getByRole('button', { name: new RegExp('^Câu ' + number + ' ') }).tap();
  expect(await question.getByRole('textbox',{name:'Bài làm của bạn'}).inputValue()).toBe('Câu trên máy này');
});

test('Tổng kết giữ mốc nộp đầu và góp ý khi nộp sửa lại', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', {name:/Ếch thử/}).tap();
  await expect(page.getByRole('region', {name:'Bài tiếp theo'})).toBeVisible();
  const id = 'les_00000000000000000003', api = '/api/lessons/' + id;
  const origin = new URL(page.url()).origin;
  const { lesson } = await (await page.request.get(api)).json();
  const draft = await page.request.put(api + '/draft', {headers:{origin}, data:{
    revision:lesson.draftRevision, answers:{i1:{answer:'nicht'},i2:{answer:'nicht'},i3:{answer:'nicht'}},
  }});
  expect(draft.ok()).toBeTruthy();
  await page.goto('/?bai2=' + id);
  const summary = await openLessonSummary(page);
  const reflection = page.getByRole('region', {name:'Góp ý cho bài sau'});
  const note = reflection.getByRole('textbox');
  const save = reflection.getByRole('button', {name:'Lưu',exact:true});
  const saved = reflection.getByRole('button', {name:'Đã lưu',exact:true});
  async function submit() {
    const response = page.waitForResponse(r => r.url().endsWith(api + '/submissions') && r.request().method() === 'POST');
    await summary.getByRole('button', {name:'Nộp bài',exact:true}).tap();
    const posted = await response;
    expect(posted.ok()).toBeTruthy();
    return (await posted.json()).submission;
  }
  async function complete() {
    await summary.getByRole('button', {name:'Xong bài',exact:true}).tap();
    await expect(reflection).toBeVisible();
  }
  const first = await submit();
  await expect(summary.getByText('2/3 câu đúng')).toBeVisible();
  await expect(summary.getByRole('button', {name:/Câu 1 SỬA LẠI/})).toBeVisible();
  await expect(summary.locator('time')).toHaveCount(1);
  await expect(summary.locator('time')).toHaveAttribute('datetime',first.created_at);
  await complete();
  await note.fill('Thêm ví dụ với kein.');
  await page.route('**/api/submissions/*/reflection', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    await route.fulfill({status:503,json:{error:'Chưa lưu được góp ý.'}});
  });
  await save.tap();
  await expect(reflection.getByRole('alert')).toHaveText('Chưa lưu được góp ý.');
  await expect(save).toBeEnabled();
  await page.unroute('**/api/submissions/*/reflection');
  await save.tap();
  await expect(saved).toBeDisabled();
  await expect(page.getByText(/^Đã lưu\.?$/)).toHaveCount(1);

  await summary.getByRole('button', {name:'Mở lại bài'}).tap();
  await expect(reflection).toHaveCount(0);
  await openLessonSummary(page);
  await summary.getByRole('button', {name:/Làm lại 1 câu/}).tap();
  await page.locator('#answer-i1:visible').fill('kein');
  await openLessonSummary(page);
  const retry = await submit();
  expect(retry.id).not.toBe(first.id);
  await expect(summary.getByText('3/3 câu đúng')).toBeVisible();
  await expect(summary.getByRole('button', {name:/Câu 1 ĐÚNG/})).toBeVisible();
  await expect(summary.getByText(/đã sửa ·/)).toHaveCount(1);
  await expect(summary.locator('time').first()).toHaveAttribute('datetime',first.created_at);
  await expect(summary.locator('time').last()).toHaveAttribute('datetime',retry.created_at);
  await complete();
  await expect(reflection).toHaveCount(1);
  await expect(note).toHaveValue('Thêm ví dụ với kein.');
  await expect(saved).toBeDisabled();
  await note.fill('Thêm một câu với kein.');
  await expect(save).toBeEnabled();
  await save.tap();
  await expect(saved).toBeDisabled();
  const oldUrl = '/api/submissions/' + first.id + '/reflection';
  expect((await (await page.request.get(oldUrl)).json()).reflection).toMatchObject({revision:2,note:'Thêm một câu với kein.'});
  await page.goto('/?sach=' + lesson.subjectId);
  await page.getByText('Lịch sử', {exact:true}).tap();
  const row = page.locator('li').filter({has:page.locator('a[href*="bai2=' + id + '"]')});
  await expect(row).toHaveCount(1);
  await row.locator('xpath=ancestor::details[1]/summary').tap();
  await expect(row.getByText(/đã sửa ·/)).toBeVisible();
  await expect(row.locator('time').first()).toHaveAttribute('datetime',first.created_at);
  await expect(row.locator('time').last()).toHaveAttribute('datetime',retry.created_at);
});
