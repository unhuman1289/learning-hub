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
