import {test,expect} from '@playwright/test';

// Keep the delayed/failed engine request under test control, outside the offline cache.
test.use({serviceWorkers:'block'});
const physicsChunk=/\/assets\/rapier-[^/]+\.js(?:\?.*)?$/;

test('help stays usable while physics loads and remains open when the game becomes ready',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let requested=false,release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route(physicsChunk,async route=>{requested=true;await pending;await route.continue();});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>requested).toBe(true);
  await expect(page.locator('.start')).toBeDisabled();
  await page.getByRole('button',{name:'遊び方'}).click();
  const help=page.getByRole('dialog',{name:'遊び方',exact:true});
  await expect(help.getByText('1本指で回す',{exact:true})).toBeVisible();

  release();
  await expect(page.getByRole('button',{name:'START'})).toBeEnabled();
  await expect(help).toBeVisible();
  await help.getByRole('button',{name:'わかった'}).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button',{name:'START'}).click();
  await expect(page.locator('.play-hud')).toBeVisible();
  await expect(page.locator('#timer')).not.toHaveText('00:00');
  expect(errors).toEqual([]);
 }finally{release();}
});

test('a failed physics download offers reload and a successful retry can start the game',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let failed=false;
 await page.route(physicsChunk,async route=>{
  if(!failed){failed=true;await route.abort('failed');}
  else await route.continue();
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const failure=page.getByRole('dialog');
 await expect(failure.getByRole('heading',{name:'ゲームを開けませんでした。'})).toBeVisible();
 await expect(page.locator('.start')).toBeDisabled();
 await expect(page.locator('#start-label')).toHaveText('読み込めませんでした');
 await failure.getByRole('button',{name:'再読み込み',exact:true}).click();

 await expect(page.getByRole('button',{name:'START'})).toBeEnabled();
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.locator('canvas')).toHaveCount(1);
 await page.getByRole('button',{name:'START'}).click();
 await expect(page.locator('#timer')).not.toHaveText('00:00');
 expect(failed).toBe(true);
 expect(errors).toEqual([]);
});
