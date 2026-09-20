import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';

// Synthetic Chromium events verify browser integration, not iPhone sensor quality.
type PermissionResult='granted'|'denied'|'pending'|'error';
type SensorHarness={
 calls:{orientation:number;motion:number};
 active:{orientation:number;motion:number};
 setAngles:(beta:number,gamma:number)=>void;
 stream:(orientation?:boolean)=>void;
 stop:()=>void;
 resolve:(result:'granted'|'denied')=>void;
};
type SensorWindow=Window&{__tiltTest:SensorHarness};
const iphoneSafari='Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
test.use({userAgent:iphoneSafari,viewport:{width:393,height:852},hasTouch:true,isMobile:true});

async function mockSensors(page:Page,orientation:PermissionResult='granted',motion:PermissionResult='granted'){
 await page.addInitScript(({orientation,motion})=>{
  const calls={orientation:0,motion:0},active={orientation:0,motion:0};
  const pending:Array<(result:'granted'|'denied')=>void>=[];
  let beta=45,gamma=0,timer:ReturnType<typeof setInterval>|undefined;
  const permission=(kind:'orientation'|'motion',result:PermissionResult)=>{
   calls[kind]++;
   if(result==='pending')return new Promise<'granted'|'denied'>(resolve=>pending.push(resolve));
   if(result==='error')return Promise.reject(new DOMException('Permission unavailable','NotAllowedError'));
   return Promise.resolve(result);
  };
  class Orientation extends Event{
   readonly alpha:number|null;readonly beta:number|null;readonly gamma:number|null;readonly absolute=false;
   constructor(type:string,init:DeviceOrientationEventInit={}){super(type,init);this.alpha=init.alpha??null;this.beta=init.beta??null;this.gamma=init.gamma??null;}
   static requestPermission(){return permission('orientation',orientation);}
  }
  class Motion extends Event{
   readonly acceleration=null;readonly accelerationIncludingGravity:DeviceMotionEventAccelerationInit|null;
   readonly rotationRate={alpha:0,beta:0,gamma:0};readonly interval=16;
   constructor(type:string,init:DeviceMotionEventInit={}){super(type,init);this.accelerationIncludingGravity=init.accelerationIncludingGravity??null;}
   static requestPermission(){return permission('motion',motion);}
  }
  Object.defineProperty(window,'DeviceOrientationEvent',{configurable:true,value:Orientation});
  Object.defineProperty(window,'DeviceMotionEvent',{configurable:true,value:Motion});
  const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
  const subscriptions:Array<{type:string;callback:EventListenerOrEventListenerObject;capture:boolean;active:boolean;kind:'orientation'|'motion'}>=[];
  window.addEventListener=((type:string,callback:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions)=>{
   if(callback&&(type==='deviceorientation'||type==='devicemotion')){
    const kind:'orientation'|'motion'=type==='deviceorientation'?'orientation':'motion';
    const capture=typeof options==='boolean'?options:!!options?.capture;
    const signal=typeof options==='object'?options.signal:undefined;
    if(!signal?.aborted&&!subscriptions.some(s=>s.active&&s.type===type&&s.callback===callback&&s.capture===capture)){
     const tracked={type,callback,capture,active:true,kind};subscriptions.push(tracked);active[kind]++;
     signal?.addEventListener('abort',()=>{if(tracked.active){tracked.active=false;active[kind]--;}});
    }
   }
   add(type,callback as EventListener,options);
  }) as typeof window.addEventListener;
  window.removeEventListener=((type:string,callback:EventListenerOrEventListenerObject|null,options?:boolean|EventListenerOptions)=>{
   const capture=typeof options==='boolean'?options:!!options?.capture;
   for(const subscription of subscriptions){if(subscription.active&&subscription.type===type&&subscription.callback===callback&&subscription.capture===capture){subscription.active=false;active[subscription.kind]--;}}
   remove(type,callback as EventListener,options);
  }) as typeof window.removeEventListener;
  const emit=(includeOrientation=true)=>{
   if(includeOrientation)window.dispatchEvent(new Orientation('deviceorientation',{alpha:0,beta,gamma}));
   const b=beta*Math.PI/180,g=gamma*Math.PI/180;
   window.dispatchEvent(new Motion('devicemotion',{accelerationIncludingGravity:{x:-9.81*Math.cos(b)*Math.sin(g),y:9.81*Math.sin(b),z:9.81*Math.cos(b)*Math.cos(g)}}));
  };
  (window as unknown as SensorWindow).__tiltTest={
   calls,active,setAngles:(nextBeta,nextGamma)=>{beta=nextBeta;gamma=nextGamma;emit();},
   stream:(includeOrientation=true)=>{clearInterval(timer);emit(includeOrientation);timer=setInterval(()=>emit(includeOrientation),16);},
   stop:()=>clearInterval(timer),resolve:result=>{for(const resolve of pending.splice(0))resolve(result);},
  };
 },{orientation,motion});
}

const picker=(page:Page)=>page.locator('.control-picker:visible');
const choice=(page:Page,mode:'touch'|'tilt')=>picker(page).locator(`[data-control="${mode}"]`);
async function openReady(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();}
async function sensorState(page:Page){return page.evaluate(()=>{const h=(window as unknown as SensorWindow).__tiltTest;return {calls:h.calls,active:h.active};});}
async function stream(page:Page){await page.evaluate(()=>(window as unknown as SensorWindow).__tiltTest.stream());}
async function enableTilt(page:Page){await stream(page);await choice(page,'tilt').click();await expect(choice(page,'tilt')).toHaveAttribute('aria-pressed','true');await expect(choice(page,'tilt')).toBeEnabled();}
async function start(page:Page){await page.getByRole('button',{name:'この世界で遊ぶ'}).click();await expect(page.locator('#timer')).not.toHaveText('00:00');}
async function expectStopped(page:Page){await expect.poll(async()=> (await sensorState(page)).active).toEqual({orientation:0,motion:0});}
async function expectTimerStopped(page:Page){const time=await page.locator('#timer').textContent();await page.waitForTimeout(1150);await expect(page.locator('#timer')).toHaveText(time!);}
async function modelImage(page:Page,path?:string){
 const overlayStyle=await page.addStyleTag({content:'dialog,.play-hud,.play-bottom,#toast{visibility:hidden!important}dialog::backdrop{background:transparent!important;backdrop-filter:none!important}'});
 try{return await page.locator('canvas').screenshot({path});}
 finally{await overlayStyle.evaluate(style=>style.remove());}
}
async function changedPixelFraction(first:Buffer,second:Buffer){
 const a=await sharp(first).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const b=await sharp(second).removeAlpha().raw().toBuffer({resolveWithObject:true});
 expect(a.info).toEqual(b.info);let changed=0;
 for(let i=0;i<a.data.length;i+=3){if(Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]))>24)changed++;}
 return changed/(a.info.width*a.info.height);
}
async function goalMarkerPixels(png:Buffer){
 const {data}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true}),pixels=new Set<number>();
 // The unlit green goal ring stays opaque when terrain fades around a moving ball.
 for(let i=0;i<data.length;i+=3){const r=data[i],g=data[i+1],b=data[i+2];if(g>215&&g-r>18&&r-b>45)pixels.add(i/3);}
 expect(pixels.size,'the goal ring must be visible for the rotation comparison').toBeGreaterThan(40);return pixels;
}

test('every launch defaults to touch without permission requests or sensor subscriptions',async({page})=>{
 await mockSensors(page);await openReady(page);
 await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');
 expect(await sensorState(page)).toEqual({calls:{orientation:0,motion:0},active:{orientation:0,motion:0}});
 await enableTilt(page);await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');
 expect(await sensorState(page)).toEqual({calls:{orientation:0,motion:0},active:{orientation:0,motion:0}});
 await start(page);expect(await sensorState(page)).toEqual({calls:{orientation:0,motion:0},active:{orientation:0,motion:0}});
});

for(const result of ['denied','error'] as const)test(`orientation permission ${result} leaves touch playable without active sensors`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await mockSensors(page,result);await openReady(page);await choice(page,'tilt').click();
 await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');await expect(choice(page,'tilt')).toBeEnabled();
 await expect(page.locator('#control-status')).toContainText(/指(?:で)?操作/);
 expect((await sensorState(page)).calls).toEqual({orientation:1,motion:1});await expectStopped(page);
 await start(page);expect(errors).toEqual([]);
});

test('switching back to touch cancels pending permission even when permission resolves later',async({page})=>{
 await mockSensors(page,'pending','pending');await openReady(page);await choice(page,'tilt').click();
 await expect(choice(page,'tilt')).toBeDisabled();await expect(page.locator('#control-status')).toContainText('傾きを確認');
 expect((await sensorState(page)).calls).toEqual({orientation:1,motion:1});
 await choice(page,'touch').click();await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>{const h=(window as unknown as SensorWindow).__tiltTest;h.stream();h.resolve('granted');});
 await page.waitForTimeout(700);await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');await expectStopped(page);
 await start(page);
});

test('switching controls while paused and calibrating during play preserve progress',async({page})=>{
 await mockSensors(page);await page.addInitScript(()=>localStorage.setItem('gyro-maze-save',JSON.stringify({version:1,records:{},quality:'low'})));await openReady(page);await start(page);
 const box=(await page.locator('canvas').boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+20,{steps:6});await page.mouse.up();
 await page.waitForTimeout(1000);await page.getByRole('button',{name:'一時停止',exact:true}).click();
 const before=await modelImage(page),time=await page.locator('#timer').textContent(),checkpoint=await page.locator('#checkpoint').textContent();
 await enableTilt(page);await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible();
 await expect(page.locator('#timer')).toHaveText(time!);await expect(page.locator('#checkpoint')).toHaveText(checkpoint!);
 expect((await modelImage(page)).equals(before),'changing input must not reset or rotate a paused stage').toBe(true);await expectStopped(page);
 await expectTimerStopped(page);
 await page.getByRole('button',{name:'ゲームに戻る'}).click();await expect(page.locator('#timer')).not.toHaveText(time!);
 const traveled=Number((await page.locator('#route-progress').textContent())!.match(/\d+/)![0]);expect(traveled).toBeGreaterThan(1);
 await page.getByRole('button',{name:'傾きの基準を合わせる',exact:true}).click();
 await expect(page.locator('#toast')).toHaveText('この持ち方を基準にしました');
 await expect(page.locator('#checkpoint')).toHaveText(checkpoint!);
 const after=Number((await page.locator('#route-progress').textContent())!.match(/\d+/)![0]);
 expect(after,'calibration must not return the ball to the start').toBeGreaterThanOrEqual(traveled-1);
});

test('a held device angle stops rotating the stage and orientation need not arrive periodically',async({page},testInfo)=>{
 await mockSensors(page);await page.addInitScript(()=>localStorage.setItem('gyro-maze-save',JSON.stringify({version:1,records:{},quality:'low'})));await openReady(page);await enableTilt(page);await start(page);
 const neutral=await modelImage(page,'test-results/tilt-neutral.png');
 await page.evaluate(()=>(window as unknown as SensorWindow).__tiltTest.setAngles(63,13));
 // Orientation events may stop when a real device is still; motion remains the heartbeat.
 await page.evaluate(()=>(window as unknown as SensorWindow).__tiltTest.stream(false));
 await page.waitForTimeout(1800);const held=await modelImage(page,'test-results/tilt-held.png');
 expect(await changedPixelFraction(neutral,held),'device tilt must visibly change the model').toBeGreaterThan(.005);
 await page.waitForTimeout(2200);const later=await modelImage(page,'test-results/tilt-held-later.png');
 await testInfo.attach('neutral',{body:neutral,contentType:'image/png'});await testInfo.attach('held',{body:held,contentType:'image/png'});await testInfo.attach('held-later',{body:later,contentType:'image/png'});
 const heldMarker=await goalMarkerPixels(held),laterMarker=await goalMarkerPixels(later);
 const unchanged=[...heldMarker].filter(pixel=>laterMarker.has(pixel)).length/Math.max(heldMarker.size,laterMarker.size);
 expect(unchanged,'holding an angle may move the ball but must not keep rotating the goal ring').toBeGreaterThan(.97);
 await expect(page.getByRole('dialog')).toBeHidden();
 expect((await sensorState(page)).active.orientation).toBeGreaterThan(0);expect((await sensorState(page)).active.motion).toBeGreaterThan(0);
});

test('tilt help suspends sensors and requires an explicit resume',async({page})=>{
 await mockSensors(page);await openReady(page);await enableTilt(page);await start(page);
 await page.getByRole('button',{name:'遊び方',exact:true}).click();await expectStopped(page);await expectTimerStopped(page);
 await page.getByRole('button',{name:'わかった'}).click();
 await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible();await expectStopped(page);await expectTimerStopped(page);
 const time=await page.locator('#timer').textContent();await page.getByRole('button',{name:'ゲームに戻る'}).click();await expect(page.locator('#timer')).not.toHaveText(time!);
});

test('orientation changes and background return remain paused until the player resumes',async({page})=>{
 await mockSensors(page);await openReady(page);await enableTilt(page);await start(page);
 await page.evaluate(()=>{
  Object.defineProperty(screen.orientation,'angle',{configurable:true,value:90});
  window.dispatchEvent(new Event('orientationchange'));screen.orientation.dispatchEvent(new Event('change'));
 });
 await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible();await expectStopped(page);await expectTimerStopped(page);
 await page.getByRole('button',{name:'ゲームに戻る'}).click();await expect(page.getByRole('dialog')).toBeHidden();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible();await expectStopped(page);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expectTimerStopped(page);await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible();
});

test('tilt can be selected for the first time after an offline reload',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await mockSensors(page);await openReady(page);await expect(page.locator('#offline-text')).toHaveText('オフラインで遊べます');
 await context.setOffline(true);
 try{
  await page.reload();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
  expect((await sensorState(page)).calls).toEqual({orientation:0,motion:0});await enableTilt(page);await start(page);
  expect(errors).toEqual([]);
 }finally{await context.setOffline(false);}
});

test('starting without a fresh sensor sample keeps the clock stopped and offers touch recovery',async({page})=>{
 await mockSensors(page);await openReady(page);await enableTilt(page);
 await page.evaluate(()=>(window as unknown as SensorWindow).__tiltTest.stop());
 await page.getByRole('button',{name:'この世界で遊ぶ'}).click();
 await page.waitForTimeout(1500);await expect(page.locator('#timer')).toHaveText('00:00');
 await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible({timeout:7000});
 await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('dialog').locator('.control-status')).toContainText('取得できません');
 await expectStopped(page);await expect(page.locator('#timer')).toHaveText('00:00');
 await page.getByRole('button',{name:'ゲームに戻る'}).click();await expect(page.locator('#timer')).not.toHaveText('00:00');
});

test('a lost motion heartbeat pauses the game and does not restart when sensor data returns',async({page})=>{
 await mockSensors(page);await openReady(page);await enableTilt(page);await start(page);
 await page.evaluate(()=>(window as unknown as SensorWindow).__tiltTest.stop());
 await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible({timeout:5000});
 await expect(choice(page,'tilt')).toHaveAttribute('aria-pressed','true');await expectStopped(page);
 await stream(page);await expectTimerStopped(page);await expectStopped(page);
 const time=await page.locator('#timer').textContent();await page.getByRole('button',{name:'ゲームに戻る'}).click();await expect(page.locator('#timer')).not.toHaveText(time!);
});

for(const mode of ['touch','tilt'] as const)test(`a lost graphics context in ${mode} mode cannot resume after background return or Escape`,async({page})=>{
 await mockSensors(page);await openReady(page);if(mode==='tilt')await enableTilt(page);await start(page);
 const contextLost=await page.locator('canvas').evaluate(canvas=>{
  const extension=(canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
  if(!extension)return false;extension.loseContext();return true;
 });
 expect(contextLost,'the browser must support forcing a real WebGL context loss').toBe(true);
 await expect(page.getByRole('heading',{name:'描画が停止しました。',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveAttribute('data-view','fatal');await expectStopped(page);await expectTimerStopped(page);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'));});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByRole('heading',{name:'描画が停止しました。',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'ゲームに戻る',exact:true})).toHaveCount(0);await expectTimerStopped(page);await expectStopped(page);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toHaveAttribute('data-view','fatal');
 await expect(page.getByRole('button',{name:'再読み込み',exact:true})).toBeVisible();await expectTimerStopped(page);await expectStopped(page);
 await page.getByRole('button',{name:'再読み込み',exact:true}).click();await expect(page.getByRole('button',{name:'この世界で遊ぶ'})).toBeEnabled();
 await expect(choice(page,'touch')).toHaveAttribute('aria-pressed','true');
 await start(page);
});

test('tilt controls fit a narrow phone and short landscape without overlapping',async({page})=>{
 await mockSensors(page);await openReady(page);await enableTilt(page);await start(page);
 for(const viewport of [{width:320,height:568},{width:568,height:320}]){
  await page.setViewportSize(viewport);
  // A mobile orientation change intentionally pauses tilt control. Measure live play,
  // not the still-visible gameplay controls behind the pause dialog.
  await page.waitForTimeout(300);
  if(await page.getByRole('dialog').isVisible()){
   await expect(page.getByRole('heading',{name:'一時停止',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'ゲームに戻る'}).click();
  }
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(async()=> (await sensorState(page)).active).toEqual({orientation:1,motion:1});
  const time=await page.locator('#timer').textContent();await expect(page.locator('#timer')).not.toHaveText(time!);
  await expect(page.getByRole('button',{name:'傾きの基準を合わせる',exact:true})).toBeInViewport();
  const buttons=page.locator('.play-tools button:visible');await expect(buttons).toHaveCount(4);
  const rectangles=await buttons.evaluateAll(elements=>elements.map(element=>{
   const rect=element.getBoundingClientRect(),textLines=new Set<string>();
   for(const child of element.childNodes)if(child.nodeType===Node.TEXT_NODE&&child.textContent?.trim()){
    const range=document.createRange();range.selectNodeContents(child);
    for(const line of range.getClientRects())if(line.width>0)textLines.add(line.top.toFixed(1));
   }
   return {label:element.textContent,x:rect.x,y:rect.y,width:rect.width,height:rect.height,textLineCount:textLines.size};
  }));
  for(const rect of rectangles){
   expect(rect.textLineCount,`${rect.label} should remain on one line`).toBe(1);
   expect(rect.width,`${rect.label} minimum tap width`).toBeGreaterThanOrEqual(44);
   expect(rect.height,`${rect.label} minimum tap height`).toBeGreaterThanOrEqual(44);
   expect(rect.x,`${rect.label} left edge`).toBeGreaterThanOrEqual(0);
   expect(rect.x+rect.width,`${rect.label} right edge`).toBeLessThanOrEqual(viewport.width);
   expect(rect.y,`${rect.label} top edge`).toBeGreaterThanOrEqual(0);
   expect(rect.y+rect.height,`${rect.label} bottom edge`).toBeLessThanOrEqual(viewport.height);
  }
  for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
   const a=rectangles[i],b=rectangles[j];
   const intersectionWidth=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
   const intersectionHeight=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
   expect(intersectionWidth>0&&intersectionHeight>0,`${a.label} and ${b.label} overlap`).toBe(false);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({path:test.info().outputPath(`tilt-tools-${viewport.width}x${viewport.height}.png`)});
 }
});
