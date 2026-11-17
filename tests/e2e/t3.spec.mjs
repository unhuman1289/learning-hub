import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('tấm gia sư: trẻ em, nghĩ, stream, chặn, mất mạng, bận và giới hạn',async ({page})=>{
  let remaining=20, limit='lesson'; const requestedRows=[];
  await page.route('**/api/tutor/sprite/v2/*.webp', route => { requestedRows.push(new URL(route.request().url()).pathname.split('/').pop()); return route.fulfill({status:200, contentType:'image/webp', body:Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')}); });
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
  const trigger=page.getByRole('button',{name:'Hỏi gia sư về câu này'}).first(); await expect(trigger).toBeVisible(); await expect(trigger.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','sit'); await expect(trigger.locator('.tutor-pet')).toHaveCSS('width','88px'); await expect(trigger.locator('.tutor-pet')).toHaveCSS('height','95px'); await trigger.tap();
  const panel=page.getByRole('region',{name:'Trò chuyện với gia sư'}); await expect(panel.locator('.tutor-pet')).toHaveCSS('width','96px'); await expect(panel.locator('.tutor-pet')).toHaveCSS('height','104px'); const input=panel.getByRole('textbox',{name:'Câu hỏi của bạn'});
  await expect(input).toBeFocused(); await expect(panel.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','tilt'); expect(requestedRows.indexOf('wave.webp')).toBeGreaterThanOrEqual(0); expect(requestedRows.indexOf('point_up.webp')).toBeGreaterThan(requestedRows.indexOf('wave.webp')); await expect(panel.getByText('Còn 20 lượt hỏi trong bài này')).toBeVisible(); await expect(panel.getByText('Chỉ hỏi về câu này. Bố mẹ đọc được mọi câu hỏi và trả lời.')).toBeVisible();
  await expect(panel.locator('.tutor-pet-strip')).toHaveCSS('animation-name','none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await input.fill('Gợi ý nhé'); await panel.getByRole('button',{name:'Gửi'}).tap();
  await expect(panel.getByText('Để mình nghĩ chút…')).toBeVisible(); await expect(panel.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','think'); await expect(panel.getByText('Thử suy nghĩ.')).toBeVisible(); await expect(panel.getByText('(Chỗ này có đáp án, mình giữ lại nhé.)')).toHaveCount(0);
  await expect(panel.getByText('(Chỗ này có đáp án, mình giữ lại nhé.)')).toBeVisible();
  await expect(panel.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','cover_mouth');
  await expect(panel.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','talk');
  await page.evaluate(()=>{window.__tutorMode='offline';}); await input.fill('Hỏi tiếp'); await panel.getByRole('button',{name:'Gửi'}).tap(); await expect(panel.getByText(/Mất kết nối/)).toBeVisible(); await expect(panel.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','umbrella'); await expect(panel.locator('.tutor-pet-strip')).toHaveCSS('animation-name','tutor-umbrella-intro, tutor-umbrella-loop');
  await panel.getByRole('button',{name:'Hỏi tiếp'}).tap(); await expect(input).toBeFocused();
  await page.evaluate(()=>{window.__tutorMode='busy';}); await input.fill('Chờ nhé'); await panel.getByRole('button',{name:'Gửi'}).tap(); await expect(panel.getByText(/Mình đang bận một chút/)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  remaining=0; await trigger.tap(); await expect(panel.getByText('Bài này mình đã trả lời đủ 20 lượt rồi. Bạn thử tự làm tiếp nhé!')).toBeVisible(); await expect(panel.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','sleep'); await expect(input).toHaveCount(0);
  await page.keyboard.press('Escape'); limit='day'; await trigger.tap();
  await expect(panel.getByText('Hôm nay mình đã trả lời đủ 60 lượt. Mai hỏi tiếp nhé!')).toBeVisible();
});

for (const asked of [false, true]) {
  test(`Kiểm tra đúng sau khi ${asked ? 'đã hỏi' : 'chưa hỏi'} gia sư`, async ({page, context}) => {
    await page.route('**/api/tutor/sprite/v2/*.webp', route => route.fulfill({status:200, contentType:'image/webp', body:Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')}));
    await page.route('**/api/lessons/*/tutor', route=>route.fulfill({json:{turns:asked ? [{id:'turn-1',item_id:'i2',question:'Gợi ý?',answer:'Hãy thử.',status:'answered'}] : [{id:'other',item_id:'i1',question:'Câu khác',answer:'Gợi ý',status:'answered'}],enabled:true,remaining:19,limit:'lesson'}}));
    await page.goto('/'); await page.getByRole('button',{name:/Ếch thử/}).tap();
    const link=page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('listitem').filter({hasText:'Deutsch'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first();
    const id=new URL(await link.getAttribute('href'),page.url()).searchParams.get('bai2');
    const url=`/api/lessons/${id}`; const response=await context.request.get(url); const {lesson}=await response.json();
    await context.request.put(url+'/draft',{headers:{origin:new URL(page.url()).origin},data:{revision:lesson.draftRevision,answers:{i2:{answer:'sai'}}}});
    await link.tap();
    const field=page.getByRole('textbox',{name:'Bài làm của bạn'}).first(); await expect(field).toBeVisible();
    const card=field.locator('xpath=ancestor::article'); const trigger=page.getByRole('button',{name:'Hỏi gia sư về câu này'}).nth(1); await expect(trigger).toBeVisible();
    // Establish a previous incorrect answer even when this demo lesson was used by another test.
    await field.fill('sai'); const check=card.getByRole('button',{name:/^Kiểm tra( lại)?$/}); await expect(check).toBeEnabled(); await check.tap();
    await expect(check).toHaveText("Kiểm tra lại");
    await field.fill('Lena kann heute Suppe kochen.'); await expect(check).toBeEnabled(); await check.tap();
    await expect(trigger.locator('[data-pet-row]')).toHaveAttribute('data-pet-row',asked ? 'nod' : 'jump');
    await expect(trigger.locator('[data-pet-row]')).toHaveAttribute('data-pet-row','sit');
  });
}


test('sprite ở góc trang người lớn', async ({page})=>{
  await page.route('**/api/tutor/sprite/v2/*.webp', route=>route.fulfill({status:200,contentType:'image/webp',body:Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')}));
  await page.route('**/api/lessons/*/tutor',route=>route.fulfill({json:{turns:[],enabled:true,remaining:20,limit:'lesson'}}));
  await page.goto('/'); await page.getByRole('button',{name:/Người học thử/}).tap();
  const lesson=page.getByRole('region',{name:'Bài tiếp theo'}).getByRole('link',{name:/Mở bài|Học tiếp/}).first(); await lesson.tap();
  await page.locator('.lesson-flow').getByRole('button',{name:'Bắt đầu bài'}).click({force:true});
  const pet=page.getByRole('button',{name:'Hỏi gia sư về câu này'}).first().locator('.tutor-pet');
  await expect(pet).toHaveCSS('width','72px'); await expect(pet).toHaveCSS('height','78px');
});
