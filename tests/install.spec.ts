import {test,expect,type Page} from '@playwright/test';

// These tests exercise iOS eligibility in Chromium; device Safari remains a separate check.
const iphoneSafari='Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
const ipadSafari='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
const installAction='ホーム画面に追加する方法を見る';
const dismissalKey='gyro-maze-install-dismissed-at';
const day=24*60*60*1000;

test.use({userAgent:iphoneSafari,viewport:{width:393,height:852},hasTouch:true,isMobile:true});

async function openReady(page:Page){
 await page.goto('/');
 await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
}

test('iPhone banner uses the approved copy, fits the mobile layout and yields to dialogs and gameplay',async({page})=>{
 await openReady(page);
 const banner=page.locator('#install-banner');
 await expect(banner).toBeVisible();
 await expect(banner.getByText('オフラインで遊ぶ',{exact:true})).toBeVisible();
 await expect(banner.getByRole('button',{name:installAction,exact:true})).toBeVisible();
 await expect(page.getByText('アイコンから、いつでもGYROに。',{exact:true})).toHaveCount(0);
 for(const colorScheme of ['light','dark'] as const){
  await page.emulateMedia({colorScheme});
  for(const width of [393,320]){
   await page.setViewportSize({width,height:852});
   const layout=await page.evaluate(()=>{
    const start=document.querySelector('.start')!.getBoundingClientRect();
    const notice=document.querySelector('#install-banner')!.getBoundingClientRect();
    const footer=document.querySelector('.footer')!.getBoundingClientRect();
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,startBottom:start.bottom,noticeTop:notice.top,noticeBottom:notice.bottom,footerTop:footer.top};
   });
   expect(layout.scroll).toBeLessThanOrEqual(layout.width);
   expect(layout.noticeTop).toBeGreaterThanOrEqual(layout.startBottom-1);
   expect(layout.noticeBottom).toBeLessThanOrEqual(layout.footerTop+1);
  }
 }
 await banner.getByRole('button',{name:installAction,exact:true}).click();
 const guide=page.getByRole('dialog',{name:'ホーム画面に追加',exact:true});
 await expect(guide).toBeVisible();await expect(banner).toBeHidden();
 const steps=guide.locator('ol > li');await expect(steps).toHaveCount(3);
 await expect(steps.nth(0)).toContainText('共有');
 await expect(steps.nth(1)).toContainText('ホーム画面に追加');
 await expect(steps.nth(2)).toContainText('Webアプリとして開く');
 await guide.getByRole('button',{name:'閉じる',exact:true}).click();
 await expect(banner).toBeVisible();
 await page.evaluate(async()=>{
  for(const name of await caches.keys())if(name.startsWith('gyro-maze-')){
   const cache=await caches.open(name);await cache.delete('/icon-192.png');
  }
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(page.locator('#offline-text')).toHaveText('オフライン保存が完了していません');
 await expect(banner).toBeHidden();
 await page.getByRole('button',{name:'再試行',exact:true}).click();
 await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 await expect(banner).toBeVisible();
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await expect(banner).toBeHidden();
 await page.getByRole('button',{name:'一時停止'}).click();
 await page.getByRole('button',{name:'ステージ選択へ'}).click();
 await expect(banner).toBeVisible();
});

test('dismissal lasts seven days while help keeps the installation guide available',async({page})=>{
 await openReady(page);
 await page.getByRole('button',{name:'ホーム画面への追加案内を閉じる'}).click();
 await expect(page.locator('#install-banner')).toBeHidden();
 const dismissedAt=await page.evaluate(key=>Number(localStorage.getItem(key)),dismissalKey);
 expect(dismissedAt).toBeGreaterThan(Date.now()-60_000);
 await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 await expect(page.locator('#install-banner')).toBeHidden();
 await page.getByRole('button',{name:'遊び方'}).click();
 await page.getByRole('dialog').getByRole('button',{name:installAction,exact:true}).click();
 await expect(page.getByRole('dialog',{name:'ホーム画面に追加',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await expect(page.getByRole('dialog').getByText('1本指で回す',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'わかった'}).click();
 await expect(page.locator('#install-banner')).toBeHidden();
 await page.evaluate(({key,at})=>localStorage.setItem(key,String(at)),{key:dismissalKey,at:Date.now()-8*day});
 await page.reload();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 await expect(page.locator('#install-banner')).toBeVisible();
});

test('closing an installation guide opened from gameplay help keeps the game paused until help closes',async({page})=>{
 await openReady(page);await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await expect(page.locator('#timer')).not.toHaveText('00:00');
 await page.getByRole('button',{name:'遊び方'}).click();
 const pausedTime=await page.locator('#timer').textContent();
 await page.getByRole('dialog').getByRole('button',{name:installAction,exact:true}).click();
 await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await expect(page.getByRole('dialog').getByText('1本指で回す',{exact:true})).toBeVisible();
 await page.waitForTimeout(1100);await expect(page.locator('#timer')).toHaveText(pausedTime!);
 await expect(page.locator('#install-banner')).toBeHidden();
 await page.getByRole('dialog').getByRole('button',{name:installAction,exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog').getByText('1本指で回す',{exact:true})).toBeVisible();
 await expect(page.locator('#timer')).toHaveText(pausedTime!);
 await page.getByRole('button',{name:'わかった'}).click();
 await expect(page.locator('#timer')).not.toHaveText(pausedTime!);
});

test('unavailable storage still allows session dismissal, help and gameplay',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  Storage.prototype.getItem=()=>{throw new DOMException('Storage unavailable','SecurityError');};
  Storage.prototype.setItem=()=>{throw new DOMException('Storage unavailable','SecurityError');};
 });
 await openReady(page);await expect(page.locator('#install-banner')).toBeVisible();
 await page.getByRole('button',{name:'ホーム画面への追加案内を閉じる'}).click();
 await page.getByRole('button',{name:'遊び方'}).click();
 await page.getByRole('dialog').getByRole('button',{name:installAction,exact:true}).click();
 await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('button',{name:'わかった'}).click();
 await expect(page.locator('#install-banner')).toBeHidden();
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await expect(page.locator('#timer')).not.toHaveText('00:00');
 expect(errors).toEqual([]);
});

test('standalone and other browsers omit the prompt; desktop-style iPad Safari remains eligible',async({browser})=>{
 const cases=[
  {name:'desktop Safari',userAgent:ipadSafari,touch:false,mode:'browser',eligible:false},
  {name:'iPhone Chrome',userAgent:iphoneSafari.replace('Version/27.0','CriOS/150.0.0.0'),touch:true,mode:'browser',eligible:false},
  {name:'iOS standalone',userAgent:iphoneSafari,touch:true,mode:'navigator',eligible:false},
  {name:'display-mode standalone',userAgent:iphoneSafari,touch:true,mode:'media',eligible:false},
  {name:'desktop-style iPad Safari',userAgent:ipadSafari,touch:true,mode:'browser',eligible:true},
 ];
 for(const scenario of cases){
  await test.step(scenario.name,async()=>{
   const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',userAgent:scenario.userAgent,hasTouch:scenario.touch,viewport:{width:393,height:852}});
   try{
    await context.addInitScript(({mode,touch})=>{
     Object.defineProperty(navigator,'platform',{value:'MacIntel'});
     Object.defineProperty(navigator,'maxTouchPoints',{value:touch?5:0});
     if(mode==='navigator')Object.defineProperty(navigator,'standalone',{value:true});
     if(mode==='media'){
      const matchMedia=window.matchMedia.bind(window);
      window.matchMedia=query=>{const result=matchMedia(query);if(query.includes('display-mode')&&query.includes('standalone'))Object.defineProperty(result,'matches',{value:true});return result;};
     }
    },{mode:scenario.mode,touch:scenario.touch});
    const page=await context.newPage();await openReady(page);
    await expect(page.locator('#install-banner')).toBeVisible({visible:scenario.eligible});
    await page.getByRole('button',{name:'遊び方'}).click();
    await expect(page.getByRole('dialog').getByRole('button',{name:installAction,exact:true})).toHaveCount(scenario.eligible?1:0);
   }finally{await context.close();}
  });
 }
});
