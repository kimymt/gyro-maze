import {test,expect} from '@playwright/test';
import {levelDefinitions} from '../src/levels';
test('START stays visible with all BEST records, safe areas and resized viewports',async({page})=>{
 await page.addInitScript(ids=>localStorage.setItem('gyro-maze-save',JSON.stringify({version:1,quality:'auto',records:Object.fromEntries(ids.map(id=>[id,{time:60,falls:0}]))})),levelDefinitions.map(l=>l.id));
 await page.setViewportSize({width:420,height:912});await page.goto('/');
 const start=page.getByRole('button',{name:'START',exact:true});await expect(start).toBeEnabled();
 await page.evaluate(()=>document.documentElement.style.setProperty('--safe-bottom','34px'));
 for(const [width,height] of [[420,912],[393,852],[320,568],[852,393]]){
  await page.setViewportSize({width,height});
  for(const colorScheme of ['light','dark'] as const){
   await page.emulateMedia({colorScheme});await page.evaluate(()=>scrollTo(0,0));
   const box=(await start.boundingBox())!;expect(box.y).toBeGreaterThan(0);expect(box.y+box.height).toBeLessThanOrEqual(height-34);
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   const controls=(await page.locator('.selection .control-setting').boundingBox())!,dock=(await page.locator('.start-dock').boundingBox())!;
   expect(controls.y+controls.height).toBeLessThanOrEqual(dock.y);await expect(start).toBeInViewport({ratio:1});
  }
 }
 await page.setViewportSize({width:420,height:912});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/private/tmp/gyro-start-dock.png'});
 await page.getByRole('button',{name:'遊び方',exact:true}).click();await expect(start).toBeHidden();
 await page.keyboard.press('Escape');await expect(start).toBeVisible();
 await page.locator('[data-level="6"]').click();await start.click();await expect(page.getByRole('heading',{name:'07〜12を解放する'})).toBeVisible();await expect(start).toBeHidden();
 await page.getByRole('button',{name:'閉じる',exact:true}).click();await expect(start).toBeVisible();
 await page.locator('[data-level="0"]').click();await start.click();await expect(start).toBeHidden();await expect(page.locator('.play-hud')).toBeVisible();
 await page.getByRole('button',{name:'一時停止',exact:true}).click();await page.getByRole('button',{name:'ステージ選択へ'}).click();await expect(start).toBeInViewport({ratio:1});
});
