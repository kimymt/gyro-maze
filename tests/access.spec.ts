import {test,expect,type Page} from '@playwright/test';
async function gate(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await page.locator('[data-level="6"]').click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await expect(page.getByRole('heading',{name:'07〜12を解放する'})).toBeVisible();}
test('first six are free; share cancellation and copying never grant access',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'share',{value:()=>Promise.reject(new DOMException('cancel','AbortError'))});});
 await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 for(let i=0;i<6;i++){await page.locator(`[data-level="${i}"]`).click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await expect(page.locator('.play-hud')).toBeVisible();await page.getByRole('button',{name:'一時停止'}).click();await page.getByRole('button',{name:'ステージ選択へ'}).click();}
 await page.locator('[data-level="6"]').click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await page.getByRole('button',{name:'SNSでシェア',exact:true}).click();await page.getByRole('button',{name:'共有先を選ぶ'}).click();
 expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();
 await page.getByRole('button',{name:'リンクをコピー'}).click();expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();
 await page.getByRole('button',{name:'シェアしました'}).click();await expect(page.locator('[data-level].locked')).toHaveCount(0);
 await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await expect(page.locator('[data-level].locked')).toHaveCount(0);
});
test('donation requires explicit declaration and works offline after caching',async({page,context})=>{
 await gate(page);await page.getByRole('button',{name:'寄付する',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();await page.getByRole('button',{name:'寄付しました'}).click();
 await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await page.locator('[data-level="11"]').click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await expect(page.locator('.play-hud')).toBeVisible();
});
test('the next-course action from 06 cannot bypass the gate',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await page.locator('[data-level="5"]').click();
 // Exercise the same delegated action used by the completion dialog without
 // replacing physics or adding a production cheat endpoint.
 await page.evaluate(()=>{const button=document.createElement('button');button.dataset.action='next';button.id='next-test';document.querySelector('#app')!.append(button);button.click();button.remove();});
 await expect(page.getByRole('heading',{name:'07〜12を解放する'})).toBeVisible();await expect(page.locator('.play-hud')).toBeHidden();
});
test('Lightning address and QR never unlock; declaration alone unlocks locally without a payment API',async({page,context})=>{
 await page.setViewportSize({width:393,height:852});
 const requests:string[]=[];page.on('request',r=>{if(/\/api\/|walletofsatoshi|livingroomofsatoshi/.test(r.url()))requests.push(r.url());});
 await gate(page);await page.getByRole('button',{name:'Lightningで支援する',exact:true}).click();
 await expect(page.getByLabel('Lightning送金先',{exact:true})).toHaveValue('garbledaction736@walletofsatoshi.com');
 await expect(page.getByRole('link',{name:'ウォレットを開く'})).toHaveAttribute('href',/^lightning:lnurl1/);
 await expect(page.locator('.payment-qr')).toHaveAttribute('width','220');
 await page.screenshot({path:'/private/tmp/gyro-self-report-phone.png'});
 await page.getByRole('button',{name:'送金先をコピー'}).click();
 expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();
 await page.getByRole('button',{name:'送金しました',exact:true}).click();await expect(page.locator('[data-level].locked')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('gyro-maze-access-v1')!))).toEqual({version:1,method:'lightning'});
 await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');await context.setOffline(true);await page.reload();
 await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await page.locator('[data-level="11"]').click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await expect(page.locator('.play-hud')).toBeVisible();
 expect(requests).toEqual([]);
});
test('legacy pending invoices are removed, BEST survives, and already-paid users can declare offline',async({page,context})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('gyro-maze-lightning-v1',JSON.stringify({id:'old-id',secret:'old-secret',invoice:'old-invoice',amount:1,expiresAt:Date.now()+10000}));
  localStorage.setItem('gyro-maze-save',JSON.stringify({version:1,quality:'auto',records:{'woodland-cube':{time:60,falls:0}}}));
 });
 await page.goto('/');await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');await context.setOffline(true);
 await gate(page);expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-lightning-v1'))).toBeNull();
 await expect(page.getByRole('button',{name:'送金の復元コードを使う'})).toHaveCount(0);
 await page.getByRole('button',{name:'Lightningで支援する',exact:true}).click();await expect(page.getByText(/すでに送金した方は/)).toBeVisible();
 await expect(page.getByRole('button',{name:'請求書を作る'})).toHaveCount(0);await page.getByRole('button',{name:'送金しました',exact:true}).click();
 await expect(page.locator('[data-level].locked')).toHaveCount(0);await expect(page.locator('[data-record="woodland-cube"]')).toHaveText('BEST 01:00');
});
test('an existing Lightning unlock survives migration',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('gyro-maze-access-v1',JSON.stringify({version:1,method:'lightning'})));
 await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await expect(page.locator('[data-level].locked')).toHaveCount(0);
});
test('Lightning declaration works for the session when storage is unavailable',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('unavailable');};Storage.prototype.setItem=()=>{throw Error('unavailable');};Storage.prototype.removeItem=()=>{throw Error('unavailable');};});
 await gate(page);await page.getByRole('button',{name:'Lightningで支援する',exact:true}).click();await page.getByRole('button',{name:'送金しました',exact:true}).click();
 await expect(page.locator('[data-level].locked')).toHaveCount(0);await expect(page.locator('#toast')).toContainText('今回は開いている間だけ有効');
});
