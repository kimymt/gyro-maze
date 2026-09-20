import {test,expect} from '@playwright/test';
test('ten worlds, gameplay, pause, reset and help work without browser errors',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await expect(page.locator('[data-level]')).toHaveCount(10);
 for(let i=0;i<10;i++){
  await page.locator(`[data-level="${i}"]`).click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
  await expect(page.locator('.play-hud')).toBeVisible();await expect(page.locator('#timer')).not.toHaveText('00:00');
  await page.getByRole('button',{name:'一時停止'}).click();const time=await page.locator('#timer').textContent();await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(1100);await expect(page.locator('#timer')).toHaveText(time!);
  await page.getByRole('button',{name:'ゲームに戻る'}).click();await page.getByRole('button',{name:'視点リセット'}).click();
  await page.getByRole('button',{name:'一時停止'}).click();await page.getByRole('button',{name:'ステージ選択へ'}).click();
 }
 await page.getByRole('button',{name:'遊び方'}).click();await expect(page.getByRole('dialog').getByText('1本指で回す',{exact:true})).toBeVisible();await page.getByRole('button',{name:'わかった'}).click();
 expect(errors).toEqual([]);await page.screenshot({path:'test-results/desktop.png',fullPage:true});
});
test('phone layout has no overflow and all worlds restart offline',async({page,context})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます',{timeout:30000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/phone.png',fullPage:true});
 await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 for(let i=0;i<10;i++){
  await page.locator(`[data-level="${i}"]`).click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await expect(page.locator('#timer')).not.toHaveText('00:00');
  await page.getByRole('button',{name:'一時停止'}).click();await page.getByRole('button',{name:'ステージ選択へ'}).click();
 }
 await context.setOffline(false);
 expect(errors).toEqual([]);
});
test('storage corruption does not block startup',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('gyro-maze-save','{broken'));await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
});
test('evicted cache is detected and repaired',async({page})=>{
 await page.goto('/');await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 await page.evaluate(async()=>{for(const name of await caches.keys())if(name.startsWith('gyro-maze-')){const c=await caches.open(name);await c.delete('/icon-192.png');}document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('#offline-text')).toHaveText('オフライン保存が完了していません');await page.getByRole('button',{name:'再試行',exact:true}).click();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
});
test('touch rotation, pinch, cancellation, and landscape remain usable',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await page.locator('[data-level="9"]').click();await expect(page.locator('#scene-index')).toHaveText('10 / 10');const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const rect=await canvas.boundingBox();expect(rect).not.toBeNull();
 const cdp=await context.newCDPSession(page);const x=rect!.x+rect!.width*.5,y=rect!.y+rect!.height*.5;
 const before=await canvas.screenshot();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*8,y:y+i*2,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect((await canvas.screenshot()).equals(before)).toBe(false);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40,y:y-15,id:1},{x:x+40,y:y+15,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.screenshot({path:'test-results/world-10-phone.png',fullPage:true});
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await page.setViewportSize({width:844,height:390});
 await expect(page.getByRole('button',{name:'一時停止'})).toBeInViewport();await expect(page.getByRole('button',{name:'視点リセット'})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'一時停止'}).click();await expect(page.getByRole('button',{name:'ゲームに戻る'})).toBeVisible();
});
