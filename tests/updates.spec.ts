import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
let server:Server;let version='v1';let failAsset=false;let sw='';let base='';
test.beforeAll(async()=>{
 sw=await readFile('dist/sw.js','utf8');
 server=createServer(async(req,res)=>{
  const path=new URL(req.url!,'http://local').pathname;
  if(path==='/sw.js'){
   let source=sw.replace(/gyro-maze-[a-f0-9]+/g,`gyro-maze-test-${version}`);
   if(failAsset)source=source.replace('const ASSETS=[','const ASSETS=["/missing-test-asset",');
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(source);return;
  }
  if(path==='/index.html'){res.writeHead(308,{Location:'/'});res.end();return;}
  if(path==='/missing-test-asset'){res.writeHead(503);res.end('unavailable');return;}
  const filename=resolve('dist',path==='/'?'index.html':'.'+path);
  if(!filename.startsWith(resolve('dist')+'/')){res.writeHead(403);res.end();return;}
  try{const data=await readFile(filename);const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};res.writeHead(200,{'Content-Type':types[extname(filename)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
test('failed installation can retry; updates wait until the selection screen',async({page,context})=>{
 version='broken';failAsset=true;await page.goto(base);await expect(page.locator('#offline-text')).toHaveText('オフライン保存が完了していません');
 failAsset=false;version='v1';await page.getByRole('button',{name:'再試行',exact:true}).click();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 version='v2';await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();});
 await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
 await expect(page.getByRole('button',{name:'更新する',exact:true})).toBeHidden();await expect(page.locator('.play-hud')).toBeVisible();
 await page.getByRole('button',{name:'一時停止'}).click();await page.getByRole('button',{name:'ステージ選択へ'}).click();
 await expect(page.getByRole('button',{name:'更新する',exact:true})).toBeVisible();await page.getByRole('button',{name:'更新する',exact:true}).click();
 await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 version='broken-v3';failAsset=true;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();});
 await expect(page.locator('#offline-text')).toHaveText('オフライン保存が完了していません');
 await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();await context.setOffline(false);
});
