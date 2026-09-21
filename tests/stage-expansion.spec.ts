import {test,expect,type Page} from '@playwright/test';
// These regression tests exercise already unlocked gameplay. access.spec.ts covers the gate.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('gyro-maze-access-v1',JSON.stringify({version:1,method:'share'})));});

const iphoneSafari='Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';

async function openReady(page:Page){
 await page.goto('/');
 await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(page.locator('[data-level]')).toHaveCount(12);
}

test('stage 10 can be selected by keyboard and stage counts remain correct after returning home',async({page})=>{
 await openReady(page);
 await expect(page.locator('#scene-index')).toHaveText('01 / 12');
 await expect(page.locator('[data-level="0"]')).toHaveAttribute('aria-pressed','true');
 const last=page.getByRole('button',{name:'ワールド 10',exact:true});
 await last.focus();await page.keyboard.press('Enter');
 await expect(last).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-level][aria-pressed="true"]')).toHaveCount(1);
 await expect(page.locator('#scene-index')).toHaveText('10 / 12');
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await expect(page.locator('#play-number')).toHaveText('ステージ 10');
 await expect(page.locator('#timer')).not.toHaveText('00:00');
 await page.getByRole('button',{name:'一時停止'}).click();
 await page.getByRole('button',{name:'ステージ選択へ'}).click();
 await expect(last).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#scene-index')).toHaveText('10 / 12');
});

test('new-stage records survive startup, a settings save and a subsequent reload',async({page})=>{
 await openReady(page);
 const ids=await page.locator('[data-level] [data-record]').evaluateAll(elements=>elements.map(element=>(element as HTMLElement).dataset.record!));
 expect(new Set(ids).size).toBe(12);
 const records=Object.fromEntries(ids.map((id,index)=>[id,{time:60+index,falls:index}]));
 // The retired stage 03 record must also survive alongside all ten active stages.
 records['water-wilderness']={time:123,falls:0};
 for(const id of ids.slice(3,10))records[id.replace(/-v2$/,'')]={time:10,falls:0};
 await page.evaluate(records=>localStorage.setItem('gyro-maze-save',JSON.stringify({version:1,quality:'auto',records})),records);
 await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 for(let i=0;i<12;i++)await expect(page.locator(`[data-record="${ids[i]}"]`)).toHaveText(`BEST 01:${i.toString().padStart(2,'0')}`);
 await page.locator('[data-level="9"]').click();await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await page.getByRole('button',{name:'一時停止'}).click();
 await page.getByRole('combobox',{name:'描画品質'}).selectOption('low');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('gyro-maze-save')!))).toEqual({version:1,quality:'low',records});
 await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(page.locator('[data-level="0"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#scene-index')).toHaveText('01 / 12');
 for(let i=3;i<12;i++)await expect(page.locator(`[data-record="${ids[i]}"]`)).toHaveText(`BEST 01:${i.toString().padStart(2,'0')}`);
});

test.describe('expanded stage picker on phones',()=>{
 test.use({userAgent:iphoneSafari,viewport:{width:393,height:852},hasTouch:true,isMobile:true});
 for(const viewport of [{width:320,height:568},{width:393,height:852},{width:852,height:393}])test(`${viewport.width}x${viewport.height} keeps twelve stage targets and the start button usable`,async({page})=>{
  await page.setViewportSize(viewport);await openReady(page);
  await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
  await expect(page.locator('#install-banner')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const rectangles=await page.locator('[data-level]').evaluateAll(elements=>elements.map(element=>{
   const rect=element.getBoundingClientRect();return {label:element.getAttribute('aria-label'),x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  }));
  for(const rect of rectangles){
   expect(rect.width,`${rect.label} minimum tap width`).toBeGreaterThanOrEqual(44);
   expect(rect.height,`${rect.label} minimum tap height`).toBeGreaterThanOrEqual(44);
   expect(rect.x,`${rect.label} left edge`).toBeGreaterThanOrEqual(0);
   expect(rect.x+rect.width,`${rect.label} right edge`).toBeLessThanOrEqual(viewport.width);
  }
  for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
   const a=rectangles[i],b=rectangles[j];
   expect(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y),`${a.label} and ${b.label} overlap`).toBe(false);
  }
  const last=page.getByRole('button',{name:'ワールド 10',exact:true});
  await last.scrollIntoViewIfNeeded();await expect(last).toBeInViewport();await last.click();
  await expect(page.locator('#scene-index')).toHaveText('10 / 12');
  await page.screenshot({path:test.info().outputPath(`stage-picker-${viewport.width}x${viewport.height}.png`),fullPage:true});
  const start=page.getByRole('button',{name:'この世界で遊ぶ'});
  await start.scrollIntoViewIfNeeded();await expect(start).toBeInViewport();await start.click();
  await expect(page.locator('#play-number')).toHaveText('ステージ 10');
  await expect(page.getByRole('button',{name:'一時停止'})).toBeInViewport();
  await expect(page.getByRole('button',{name:'視点リセット'})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
