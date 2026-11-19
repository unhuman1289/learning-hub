import { openLessonSummary } from './lesson-summary.mjs';
import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('một Bột cho cả bài, chọn câu khác và giữ hội thoại khi lật trang',async ({page})=>{
  let sent;
  const turns = [];
  await page.route('**/api/lessons/*/tutor', route => route.fulfill({ json: {
    turns, enabled: true, remaining: 20 - turns.length, limit: 'lesson', displayName: 'Ếch', self: 'em', call: 'chị Ếch',
  } }));
  await page.route('**/api/tutor', async route => {
    sent = route.request().postDataJSON();
    turns.push({ id: 'test-turn', item_id: sent.itemId, question: sent.question, answer: 'Em gợi ý nha.', status: 'answered' });
    await route.fulfill({ contentType: 'text/event-stream', body: 'event: delta\ndata: {"text":"Em gợi ý nha."}\n\nevent: done\ndata: {}\n\n' });
  });
  await page.goto('/'); await page.getByRole('button',{name:/Ếch thử/}).tap();
  await page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('listitem').filter({hasText:'Deutsch'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first().tap();
  const flow=page.locator('.lesson-flow'); await flow.getByRole('button',{name:'Bắt đầu bài'}).click({force:true});
  const trigger=page.getByRole('button',{name:'Hỏi Bột'}); await expect(trigger).toHaveCount(1); await trigger.tap();
  const panel=page.getByRole('dialog',{name:'Trò chuyện với Bột'}); await expect(panel).toBeVisible();
  await expect(panel.getByText(/Em chào chị Ếch ạ!/)).toBeVisible();
  const pickSecond = panel.getByRole('button', { name: 'Câu 2', exact: true });
  await pickSecond.tap();
  await expect(pickSecond).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('textbox',{name:'Câu hỏi cho Bột'}).fill('Câu này khác gì?'); await panel.getByRole('button',{name:'Gửi'}).tap();
  await expect(panel.getByText('Em gợi ý nha.')).toBeVisible(); expect(sent.itemId).toBe('i2');
  await panel.getByRole('button',{name:/Đóng/}).tap(); await expect(trigger).toBeFocused();
  await expect(flow.getByRole('button', { name: /^Kiểm tra/ })).toHaveCount(0);
  const active = flow.locator('.lesson-flow-window-page[data-active]');
  await active.locator('#answer-i2').fill('Lena kann heute Suppe kochen.');
  await active.locator('#answer-i3').fill('Paul möchte einen Kuchen kaufen.');
  await flow.locator('[data-turn-edge=right]:visible').tap();
  await expect(active.locator('#answer-i2')).toHaveCount(0);
  await expect(trigger).toHaveCount(1);
  await trigger.tap();
  await expect(panel.getByText('Em gợi ý nha.')).toBeVisible();
  await panel.getByRole('button', { name: /Đóng/ }).tap();
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
  await expect(trigger).toHaveCount(1);
});

test('câu 4 hỏi câu 2, bảo vệ đáp án và ghi ngoài phạm vi',async ({page})=>{
  await page.goto('/'); await page.getByRole('button',{name:/Ếch thử/}).tap();
  await expect(page.getByRole('region',{name:'Bài tiếp theo'})).toBeVisible();
  const id='les_00000000000000000001'; const path=`/api/lessons/${id}`;
  const current=await (await page.request.get(path)).json();
  const saved=await page.request.put(path+'/draft',{headers:{origin:new URL(page.url()).origin},data:{revision:current.lesson.draftRevision,answers:{i4:{answer:'Essai'}}}}); expect(saved.ok()).toBeTruthy();
  await page.goto('/?bai2='+id); const flow=page.locator('.lesson-flow');
  await expect(flow.locator('[data-question-number="4"]:visible')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Hỏi Bột'}).tap(); const panel=page.getByRole('dialog',{name:'Trò chuyện với Bột'});
  await expect(panel.getByRole('button',{name:'Câu 4 · đang mở'})).toHaveAttribute('aria-pressed','true');
  await panel.getByRole('button',{name:'Câu 2',exact:true}).tap(); const input=panel.getByRole('textbox',{name:'Câu hỏi cho Bột'});
  const ask=async text=>{await input.fill(text);await panel.getByRole('button',{name:'Gửi'}).tap();await expect(panel.getByRole('button',{name:'Chờ chút'})).toHaveCount(0);};
  await ask('[e2e] đáp án câu khác'); await expect(panel.getByText(/Chỗ này lộ đáp án/)).toBeVisible();
  let data=await (await page.request.get(path+'/tutor')).json();
  expect(data.turns.at(-1)).toMatchObject({item_id:'i2',leak_blocked:1});
  const reveal=await page.request.post(path+'/items/i2/reveal',{headers:{origin:new URL(page.url()).origin},data:{level:'solution'}}); expect(reveal.ok()).toBeTruthy();
  await ask('[e2e] giải thích lời giải'); await expect(panel.getByText('Lena kann heute Suppe kochen.',{exact:true})).toBeVisible();
  await ask('[e2e] ngoài phạm vi'); await expect(panel.getByText(/Chuyện đó để lúc khác nha, giờ con chỉ giúp bài này/)).toBeVisible();
  data=await (await page.request.get(path+'/tutor')).json(); expect(data.turns.at(-1)).toMatchObject({off_topic:1,item_id:'i2'});
});
