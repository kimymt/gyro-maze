import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(join(root,'package.json'))('@playwright/test');
const output=join(root,'research/stage-variety-screenshots');await mkdir(output,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],selections=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},colorScheme:'light'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.GYRO_TEST_URL||'http://127.0.0.1:4174');
 await page.locator('.start:enabled').waitFor();
 for(let index=3;index<10;index++){
  const milliseconds=await page.evaluate(async index=>{
   const start=performance.now();document.querySelector(`[data-level="${index}"]`).click();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return performance.now()-start;
  },index);
  const number=String(index+1).padStart(2,'0');
  await page.locator('.viewer').screenshot({path:join(output,`stage-${number}.png`)});
  selections.push({number,selectionToTwoFramesMs:milliseconds});
 }
 await page.setViewportSize({width:393,height:852});await page.emulateMedia({colorScheme:'dark'});
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await page.getByRole('button',{name:'球に寄る',exact:true}).click();await page.waitForTimeout(2800);
 await page.screenshot({path:join(output,'stage-10-focused-dark.png')});
 await page.setViewportSize({width:852,height:393});
 await page.screenshot({path:join(output,'stage-10-focused-landscape.png')});
 const evidence={environment:'Desktop Chromium with SwiftShader; these timings do not represent iPhone performance.',errors,selections};
 await writeFile(join(output,'rendered-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
