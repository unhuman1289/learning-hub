import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('một Bột cho cả bài, chọn câu khác và giữ hội thoại khi lật trang',async ({page})=>{
  let sent;
  await page.route('**/api/lessons/*/tutor',route=>route.fulfill({json:{turns:[],enabled:true,remaining:20,limit:'lesson',displayName:'Ếch'}}));
  await page.route('**/api/tutor',async route=>{sent=route.request().postDataJSON();await route.fulfill({contentType:'text/event-stream',body:'event: delta\ndata: {"text":"Con gợi ý nha."}\n\nevent: done\ndata: {}\n\n'});});
  await page.goto('/'); await page.getByRole('button',{name:/Ếch thử/}).tap();
  await page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('listitem').filter({hasText:'Deutsch'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first().tap();
  const flow=page.locator('.lesson-flow'); await flow.getByRole('button',{name:'Bắt đầu bài'}).click({force:true});
  const trigger=page.getByRole('button',{name:'Hỏi Bột'}); await expect(trigger).toHaveCount(1); await trigger.tap();
  const panel=page.getByRole('dialog',{name:'Trò chuyện với Bột'}); await expect(panel).toBeVisible();
  await expect(panel.getByText(/Con chào Ếch/)).toBeVisible();
  await panel.getByRole('button',{name:'Câu 2',exact:true}).tap();
  await panel.getByRole('textbox',{name:'Câu hỏi cho Bột'}).fill('Câu này khác gì?'); await panel.getByRole('button',{name:'Gửi'}).tap();
  await expect(panel.getByText('Con gợi ý nha.')).toBeVisible(); expect(sent.itemId).toBe('i2');
  await panel.getByRole('button',{name:/Đóng/}).tap(); await expect(trigger).toBeFocused();
  await flow.locator('[data-turn-edge=right]:visible').tap(); await expect(trigger).toHaveCount(1);
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
  await ask('[e2e] ngoài phạm vi'); await expect(panel.getByText(/chuyện đó để lúc khác/)).toBeVisible();
  data=await (await page.request.get(path+'/tutor')).json(); expect(data.turns.at(-1)).toMatchObject({off_topic:1,item_id:'i2'});
});
