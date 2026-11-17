import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('tấm gia sư: trẻ em, nghĩ, stream, chặn, mất mạng, bận và giới hạn',async ({page})=>{
  let remaining=20, limit='lesson';
  await page.route('**/api/lessons/*/tutor',route=>route.fulfill({json:{turns:[],enabled:true,remaining,limit}}));
  await page.addInitScript(() => {
    const original=window.fetch.bind(window);
    window.__tutorMode='answer';
    window.fetch=async (url,options) => {
      if (url !== '/api/tutor') return original(url,options);
      if (window.__tutorMode==='offline') throw new TypeError('offline');
      const mode=window.__tutorMode, encoder=new TextEncoder();
      const record=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      const body=new ReadableStream({async start(controller) {
        await new Promise(resolve=>setTimeout(resolve,250));
        if(mode==='busy') controller.enqueue(encoder.encode(record('queued',{status:'queued'})));
        else {
          controller.enqueue(encoder.encode(record('delta',{text:'Thử suy nghĩ. '})));
          await new Promise(resolve=>setTimeout(resolve,400));
          controller.enqueue(encoder.encode(record('blocked',{})+record('delta',{text:'(Chỗ này có đáp án, mình giữ lại nhé.)',blocked:true})+record('done',{})));
        }
        controller.close();
      }});
      return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
    };
  });
  await page.goto('/'); await page.getByRole('button',{name:/Ếch thử/}).tap();
  const lesson=page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('listitem').filter({hasText:'Deutsch'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first();
  await lesson.tap();
  const flow=page.locator('.lesson-flow');
  await flow.getByRole('button',{name:'Bắt đầu bài'}).click({force:true});
  const trigger=page.getByRole('button',{name:'Hỏi gia sư về câu này'}).first(); await expect(trigger).toBeVisible(); await trigger.tap();
  const panel=page.getByRole('region',{name:'Trò chuyện với gia sư'}); const input=panel.getByRole('textbox',{name:'Câu hỏi của bạn'});
  await expect(input).toBeFocused(); await expect(panel.getByText('Còn 20 lượt hỏi trong bài này')).toBeVisible(); await expect(panel.getByText('Chỉ hỏi về câu này. Bố mẹ đọc được mọi câu hỏi và trả lời.')).toBeVisible();
  await input.fill('Gợi ý nhé'); await panel.getByRole('button',{name:'Gửi'}).tap();
  await expect(panel.getByText('Để mình nghĩ chút…')).toBeVisible(); await expect(panel.getByText('Thử suy nghĩ.')).toBeVisible(); await expect(panel.getByText('(Chỗ này có đáp án, mình giữ lại nhé.)')).toHaveCount(0);
  await expect(panel.getByText('(Chỗ này có đáp án, mình giữ lại nhé.)')).toBeVisible();
  await page.evaluate(()=>{window.__tutorMode='offline';}); await input.fill('Hỏi tiếp'); await panel.getByRole('button',{name:'Gửi'}).tap(); await expect(panel.getByText(/Mất kết nối/)).toBeVisible();
  await panel.getByRole('button',{name:'Hỏi tiếp'}).tap(); await expect(input).toBeFocused();
  await page.evaluate(()=>{window.__tutorMode='busy';}); await input.fill('Chờ nhé'); await panel.getByRole('button',{name:'Gửi'}).tap(); await expect(panel.getByText(/Mình đang bận một chút/)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  remaining=0; await trigger.tap(); await expect(panel.getByText('Bài này mình đã trả lời đủ 20 lượt rồi. Bạn thử tự làm tiếp nhé!')).toBeVisible(); await expect(input).toHaveCount(0);
  await page.keyboard.press('Escape'); limit='day'; await trigger.tap();
  await expect(panel.getByText('Hôm nay mình đã trả lời đủ 60 lượt. Mai hỏi tiếp nhé!')).toBeVisible();
});
