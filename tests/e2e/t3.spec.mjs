import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('Bột giữ trạng thái mất mạng, bận, giới hạn và giảm chuyển động',async ({page})=>{
 let remaining=20,limit='lesson';
 await page.route('**/api/tutor/sprite/v2/*.webp',route=>route.fulfill({status:200,contentType:'image/webp',body:Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')}));
 await page.route('**/api/lessons/*/tutor',route=>route.fulfill({json:{turns:[],enabled:true,remaining,limit}}));
 await page.addInitScript(()=>{const original=window.fetch.bind(window);window.__mode='offline';window.fetch=async(url,options)=>{if(url!=='/api/tutor')return original(url,options);if(window.__mode==='offline')throw new TypeError('offline');return new Response('event: queued\ndata: {"status":"queued"}\n\n',{headers:{'Content-Type':'text/event-stream'}});};});
 await page.goto('/');await page.getByRole('button',{name:/Ếch thử/}).tap();await page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('listitem').filter({hasText:'Deutsch'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first().tap();
 const trigger=page.getByRole('button',{name:'Hỏi Bột'});await trigger.tap();const panel=page.getByRole('dialog',{name:'Trò chuyện với Bột'});const input=panel.getByRole('textbox',{name:'Câu hỏi cho Bột'});
 await expect(panel.locator('.tutor-pet-strip')).toHaveCSS('animation-name','none');await input.fill('Hỏi');await panel.getByRole('button',{name:'Gửi'}).tap();await expect(panel.getByText(/Mất kết nối/)).toBeVisible();
 await panel.getByRole('button',{name:'Hỏi tiếp'}).tap();await page.evaluate(()=>{window.__mode='busy';});await input.fill('Hỏi tiếp');await panel.getByRole('button',{name:'Gửi'}).tap();await expect(panel.getByText(/Con đang bận/)).toBeVisible();
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();remaining=0;await trigger.tap();await expect(panel.getByText(/Bài này con trả lời đủ 20 lượt/)).toBeVisible();await page.keyboard.press('Escape');limit='day';await trigger.tap();await expect(panel.getByText(/đủ 60 lượt/)).toBeVisible();
});
