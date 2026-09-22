import {test,expect,type Page} from '@playwright/test';
const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
const android='Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36';
const seen='gyro-maze-install-prompt-seen-v1';
const prompt=(page:Page)=>page.getByRole('dialog',{name:'ホーム画面に追加して遊ぶ',exact:true});
const guide=(page:Page)=>page.getByRole('dialog',{name:'ホーム画面に追加',exact:true});
async function ready(page:Page){await page.goto('/');await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');}
test.use({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
for(const [name,ua] of [['ios',ios],['android',android]])test.describe(name,()=>{
 test.use({userAgent:ua});
 test('first ready prompt, device-specific steps and one-time persistence',async({page})=>{
  await ready(page);await expect(prompt(page)).toBeVisible();await expect(page.locator('.start')).toBeHidden();
  for(const width of [320,393])for(const colorScheme of ['light','dark'] as const){
   await page.setViewportSize({width,height:568});await page.emulateMedia({colorScheme});
   await expect(prompt(page).getByRole('button',{name:'あとで'})).toBeInViewport({ratio:1});
   const box=(await prompt(page).boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({path:`/private/tmp/gyro-install-${name}.png`});
  await page.getByRole('button',{name:'追加方法を見る',exact:true}).click();
  await expect(guide(page).locator('li')).toHaveCount(3);
  await expect(guide(page)).toContainText(name==='ios'?'Safariの共有':'Chromeのメニュー');
  await expect(guide(page)).toContainText(name==='ios'?'Webアプリとして開く':'インストールしてショートカットを作成');
  await expect(guide(page)).not.toContainText(name==='ios'?'Chrome':'Safari');
  await page.getByRole('button',{name:'閉じる',exact:true}).click();await expect(page.locator('.start')).toBeVisible();
  await page.reload();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');await expect(prompt(page)).toBeHidden();
  await page.getByRole('button',{name:'遊び方',exact:true}).click();await page.getByRole('button',{name:'ホーム画面に追加する方法を見る'}).click();await expect(guide(page)).toBeVisible();
 });
 test('later and Escape do not prompt again',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'あとで',exact:true}).click();await page.reload();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');await expect(prompt(page)).toBeHidden();
  await page.evaluate(key=>localStorage.removeItem(key),seen);await page.reload();await expect(prompt(page)).toBeVisible();await page.keyboard.press('Escape');await expect(prompt(page)).toBeHidden();
  await page.getByRole('button',{name:'START',exact:true}).click();await expect(page.locator('.play-hud')).toBeVisible();
 });
});
test.describe('iOS lifecycle',()=>{
 test.use({userAgent:ios});
 test('an existing dialog is never replaced, then invitation appears after it closes',async({page})=>{
  await page.addInitScript(()=>{const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);navigator.serviceWorker.register=async(...args)=>{await new Promise(r=>setTimeout(r,2500));return register(...args);};});
  await page.goto('/');await page.getByRole('button',{name:'遊び方',exact:true}).click();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');await expect(page.getByRole('dialog',{name:'遊び方',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'わかった'}).click();await expect(prompt(page)).toBeVisible();
 });
 test('storage denial keeps dismissal for the session; gameplay help stays paused',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('denied');};Storage.prototype.setItem=()=>{throw Error('denied');};});
  await ready(page);await page.getByRole('button',{name:'あとで'}).click();await page.getByRole('button',{name:'START',exact:true}).click();await expect(page.locator('#timer')).not.toHaveText('00:00');
  await page.getByRole('button',{name:'遊び方',exact:true}).click();const time=await page.locator('#timer').textContent();
  await page.getByRole('button',{name:'ホーム画面に追加する方法を見る'}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'遊び方',exact:true})).toBeVisible();await page.waitForTimeout(1100);await expect(page.locator('#timer')).toHaveText(time!);
  await page.getByRole('button',{name:'わかった'}).click();await expect(page.locator('#timer')).not.toHaveText(time!);await expect(prompt(page)).toBeHidden();
 });
 test('previous banner dismissal is respected',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('gyro-maze-install-dismissed-at',String(Date.now())));await ready(page);await expect(prompt(page)).toBeHidden();
 });
});
test('standalone and unsupported browsers omit the prompt; iPad Safari is supported',async({browser})=>{
 const ipad='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
 for(const [ua,mode,touch,eligible] of [[ios,'standalone',true,false],[android,'standalone',true,false],[ios.replace('Version/27.0','CriOS/150.0'),'browser',true,false],[android.replace('Chrome/','SamsungBrowser/25 Chrome/'),'browser',true,false],[ipad,'browser',false,false],[ipad,'browser',true,true]] as const){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',userAgent:ua,hasTouch:touch});
  try{
   await context.addInitScript(({mode,touch})=>{Object.defineProperty(navigator,'platform',{value:'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{value:touch?5:0});if(mode==='standalone'){const media=matchMedia.bind(window);window.matchMedia=q=>{const result=media(q);if(q==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};}},{mode,touch});
   const page=await context.newPage();await ready(page);await expect(prompt(page)).toBeVisible({visible:eligible});
  }finally{await context.close();}
 }
});
test.describe('Android install completion',()=>{
 test.use({userAgent:android});
 test('installation closes the invitation and removes the help offer',async({page})=>{
  await ready(page);await expect(prompt(page)).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await expect(prompt(page)).toBeHidden();
  await page.getByRole('button',{name:'遊び方',exact:true}).click();await expect(page.getByRole('button',{name:'ホーム画面に追加する方法を見る'})).toHaveCount(0);
 });
 test('installation from gameplay help returns to paused help',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'あとで'}).click();await page.getByRole('button',{name:'START',exact:true}).click();await expect(page.locator('#timer')).not.toHaveText('00:00');
  await page.getByRole('button',{name:'遊び方',exact:true}).click();const time=await page.locator('#timer').textContent();await page.getByRole('button',{name:'ホーム画面に追加する方法を見る'}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await expect(page.getByRole('dialog',{name:'遊び方',exact:true})).toBeVisible();await expect(page.locator('#timer')).toHaveText(time!);
  await page.getByRole('button',{name:'わかった'}).click();await expect(page.locator('#timer')).not.toHaveText(time!);
 });
});
