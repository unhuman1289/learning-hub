import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('Bột giữ trạng thái mất mạng, bận và giảm chuyển động',async ({page})=>{
 await page.route('**/api/tutor/sprite/*/*.webp',route=>route.fulfill({status:200,contentType:'image/webp',body:Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')}));
 await page.route('**/api/lessons/*/tutor',route=>route.fulfill({json:{turns:[],enabled:true,remaining:60}}));
 await page.addInitScript(()=>{const original=window.fetch.bind(window);window.__mode='offline';window.fetch=async(url,options)=>{if(url!=='/api/tutor')return original(url,options);if(window.__mode==='offline')throw new TypeError('offline');return new Response('event: queued\ndata: {"status":"queued"}\n\n',{headers:{'Content-Type':'text/event-stream'}});};});
 await page.goto('/');await page.getByRole('button',{name:/Ếch thử/}).tap();await page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('listitem').filter({hasText:'Deutsch'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first().tap();
 const trigger=page.getByRole('button',{name:'Hỏi Bột'});await trigger.tap();const panel=page.getByRole('dialog',{name:'Trò chuyện với Bột'});const input=panel.getByRole('textbox',{name:'Câu hỏi cho Bột'});
 await expect(panel.getByText(/Con chào ạ!/)).toBeVisible();await expect(panel.locator('.tutor-pet-strip')).toHaveCSS('animation-name','none');await input.fill('Hỏi');await panel.getByRole('button',{name:'Gửi'}).tap();await expect(panel.getByText(/Mất kết nối/)).toBeVisible();
 await panel.getByRole('button',{name:'Hỏi tiếp'}).tap();await page.evaluate(()=>{window.__mode='busy';});await input.fill('Hỏi tiếp');await panel.getByRole('button',{name:'Gửi'}).tap();await expect(panel.getByText(/Con đang bận/)).toBeVisible();
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});

test('lượt 21 trong bài hỏi được, lượt 81 trong ngày bị từ chối', async ({page}) => {
 const lessonId = 'les_00000000000000000001';
 const tutorUrl = `/api/lessons/${lessonId}/tutor`;
 await page.goto('/');
 await page.getByRole('button', {name:/Ếch thử/}).tap();
 await expect(page.getByRole('region', {name:'Bài tiếp theo'})).toBeVisible();
 const ask = question => page.request.post('/api/tutor', {
   headers: {origin:new URL(page.url()).origin},
   data: {lessonId,itemId:'i1',question},
 });
 for (let i=1; i<=20; i++) {
   const response = await ask('Gợi ý ' + i);
   expect(await response.text()).toContain('event: done');
 }
 await page.goto('/?bai2=' + lessonId);
 const trigger = page.getByRole('button', {name:'Hỏi Bột'});
 await trigger.tap();
 const panel = page.getByRole('dialog', {name:'Trò chuyện với Bột'});
 const input = panel.getByRole('textbox', {name:'Câu hỏi cho Bột'});
 await expect(panel.getByText('Còn 60 lượt hỏi hôm nay')).toBeVisible();
 await input.fill('Gợi ý 21');
 await panel.getByRole('button', {name:'Gửi'}).tap();
 await expect(panel.getByText('Còn 59 lượt hỏi hôm nay')).toBeVisible();
 await expect.poll(async () => (await (await page.request.get(tutorUrl)).json()).turns.at(-1)?.status).toBe('answered');
 await panel.getByRole('button', {name:/Đóng/}).tap();
 for (let i=22; i<=80; i++) {
   const response = await ask('Gợi ý ' + i);
   expect(await response.text()).toContain('event: done');
 }
 const refused = await ask('Gợi ý 81');
 expect(refused.status()).toBe(409);
 expect((await refused.json()).error).toContain('80 lượt mỗi ngày');
 await trigger.tap();
 await expect(panel.getByText(/đã đủ 80 lượt hỏi/)).toBeVisible();
 await expect(input).toHaveCount(0);
});
