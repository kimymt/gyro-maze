import {test,expect} from '@playwright/test';
for(const started of [false,true])test(`resting ball rolls after releasing a drag in ${started?'game':'preview'}`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('gyro-maze-save',JSON.stringify({version:1,records:{},quality:'low'})));
 await page.goto(process.env.GYRO_TEST_URL??'/');
 await expect(page.getByRole('button',{name:'START'})).toBeEnabled();
 if(started){await page.getByRole('button',{name:'START'}).click();await expect.poll(async()=>page.locator('#timer').textContent(),{timeout:15000}).toBe('00:06');}
 else await page.waitForTimeout(6500);
 const canvas=page.locator('canvas');const rect=(await canvas.boundingBox())!;
 const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y,{steps:5});await page.mouse.up();
 // Hide changing overlays so the complete model can be checked, including the top ledge.
 await page.addStyleTag({content:'.play-hud,.play-bottom,#toast,.viewer-bottom,.scene-caption{visibility:hidden!important}'});
 const clip=rect;
 await page.waitForTimeout(150);const released=await page.screenshot({clip});
 await page.waitForTimeout(700);const later=await page.screenshot({clip});
 expect(later.equals(released),'ball must visibly move after input stops').toBe(false);
 if(!started)await expect(page.locator('.record').filter({hasText:'BEST'})).toHaveCount(0);
});
