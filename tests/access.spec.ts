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
test('Lightning stays locked until server confirms paid and preserves recovery code',async({page})=>{
 let paid=false,amount=0;
 await page.route('**/api/lightning/**',async route=>{const data=route.request().postDataJSON();if(route.request().url().endsWith('/invoice')){amount=data.amount;await route.fulfill({json:{id:'a'.repeat(48),secret:'b'.repeat(48),invoice:'lnbc-test-fixture',amount,expiresAt:Date.now()+3600000}});}else await route.fulfill({json:{status:paid?'paid':'pending'}});});
 await gate(page);await page.getByRole('button',{name:'Lightningで支援する',exact:true}).click();await page.getByLabel('金額（sat）').fill('21');await page.getByRole('button',{name:'請求書を作る'}).click();await expect(page.getByRole('button',{name:'入金を再確認'})).toBeVisible();expect(amount).toBe(21);expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();await expect(page.getByLabel('復元コード',{exact:true})).toHaveValue('a'.repeat(48)+'.'+'b'.repeat(48));
 paid=true;await page.getByRole('button',{name:'入金を再確認'}).click();await expect(page.locator('[data-level].locked')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('gyro-maze-access-v1')!).method)).toBe('lightning');
});
test('payment network failure and invalid amount do not unlock',async({page})=>{
 await page.route('**/api/lightning/**',route=>route.abort());await gate(page);await page.getByRole('button',{name:'Lightningで支援する',exact:true}).click();await page.getByLabel('金額（sat）').fill('0');await page.getByRole('button',{name:'請求書を作る'}).click();await expect(page.locator('[data-payment-status]')).toContainText('1 sat以上');await page.getByLabel('金額（sat）').fill('1');await page.getByRole('button',{name:'請求書を作る'}).click();await expect(page.locator('[data-payment-status]')).toContainText('作れません');expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();
});

test('the next-course action from 06 cannot bypass the gate',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await page.locator('[data-level="5"]').click();
 // Exercise the same delegated action used by the completion dialog without
 // replacing physics or adding a production cheat endpoint.
 await page.evaluate(()=>{const button=document.createElement('button');button.dataset.action='next';button.id='next-test';document.querySelector('#app')!.append(button);button.click();button.remove();});
 await expect(page.getByRole('heading',{name:'07〜12を解放する'})).toBeVisible();await expect(page.locator('.play-hud')).toBeHidden();
});
test('a paid recovery code restores access; pending and rejected codes do not',async({page})=>{
 let paid=false;await page.route('**/api/lightning/status',route=>route.fulfill({json:paid?{status:'paid'}:{status:'pending',invoice:'lnbc-test',amount:1,expiresAt:Date.now()+3600000}}));
 await gate(page);await page.getByRole('button',{name:'送金の復元コードを使う'}).click();await page.getByLabel('復元コード',{exact:true}).fill('bad');await page.getByRole('button',{name:'入金を確認して復元'}).click();await expect(page.locator('[data-payment-status]')).toContainText('コードを確認');
 await page.getByLabel('復元コード',{exact:true}).fill('a'.repeat(48)+'.'+'b'.repeat(48));await page.getByRole('button',{name:'入金を確認して復元'}).click();await expect(page.getByRole('button',{name:'入金を再確認'})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();paid=true;await page.getByRole('button',{name:'入金を再確認'}).click();await expect(page.locator('[data-level].locked')).toHaveCount(0);
});
test('a late payment response cannot dismiss a graphics failure dialog',async({page})=>{
 let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/lightning/**',async route=>{
  if(route.request().url().endsWith('/invoice'))await route.fulfill({json:{id:'a'.repeat(48),secret:'b'.repeat(48),invoice:'lnbc-test',amount:1,expiresAt:Date.now()+3600000}});
  else{await hold;await route.fulfill({json:{status:'paid'}});}
 });
 await gate(page);await page.getByRole('button',{name:'Lightningで支援する',exact:true}).click();await page.getByRole('button',{name:'請求書を作る'}).click();await expect(page.getByRole('button',{name:'入金を再確認'})).toBeVisible();
 await page.locator('#scene').dispatchEvent('webglcontextlost');await expect(page.getByRole('heading',{name:'描画が停止しました。'})).toBeVisible();release();await page.waitForTimeout(300);
 await expect(page.getByRole('heading',{name:'描画が停止しました。'})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('gyro-maze-access-v1'))).toBeNull();
});
