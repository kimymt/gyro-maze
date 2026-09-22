import './style.css';
import { Access } from './access';
import { Vector3 } from 'three';
import { levelDefinitions as levels, getLevel, nearestOnRoute, spawnPosition, type Level, type Marker } from './levels';
import { Scene } from './scene';
import { Physics, initPhysics } from './physics';
import { Input } from './input';
import { requestTiltPermission } from './tilt-permission';
import type { TiltInput } from './tilt';
import { Progress, parseSave, SAVE_KEY, formatTime } from './state';
import { Offline, type OfflineState } from './offline';
import { InstallGuide } from './install-guide';
const icons={lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',pause:'<path d="M9 5v14M15 5v14"/>',reset:'<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.8-2.5 2-2.5 4M12 17h.01"/>',chevron:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m14 6-6 6 6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',orbit:'<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-40 12 12)"/><circle cx="12" cy="12" r="3"/>'};
function icon(name:keyof typeof icons){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;}
function controlMarkup(home=false){return `<div class="control-setting"><fieldset class="control-picker"><legend>操作方法</legend><div class="control-options"><button type="button" data-control="touch" aria-pressed="true">指で操作</button><button type="button" data-control="tilt" aria-pressed="false">端末を傾ける</button></div></fieldset><p class="control-status" ${home?'id="control-status"':''} role="status" aria-live="polite"></p></div>`;}
const levelTotal=String(levels.length).padStart(2,'0');
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<div class="shell"><header class="header"><a class="brand" href="/" aria-label="GYRO ホーム">${icon('orbit')}<span>GYRO<span class="brand-dot">.</span></span></a><div class="offline-status"><span class="status-dot"></span><span id="offline-text">オフライン用データを確認中</span><button data-action="retry-offline" hidden>再試行</button><button data-action="update" hidden>更新する</button></div><button class="icon-button" data-action="help" aria-label="遊び方">${icon('help')}</button></header>
<main class="workspace"><section class="selection" aria-label="ステージ選択"><div class="intro"><p class="intro-copy">木と土、水の中を巡る。<br>落ちる心配のない、立体迷路。</p></div><div class="level-heading"><span>ステージを選択</span></div><div class="levels">${levels.map((l,i)=>`<button class="level ${i===0?'selected':''}" data-level="${i}" aria-label="ワールド ${l.number}" aria-pressed="${i===0}"><span class="level-number">${l.number}<span class="level-lock">${icon('lock')}</span></span><span class="level-copy"><span class="record" data-record="${l.id}"></span></span><span class="difficulty">${l.difficulty}</span>${icon('chevron')}</button>`).join('')}</div>${controlMarkup(true)}<div class="start-dock"><button class="primary start" data-action="start" disabled><span id="start-label">準備しています</span>${icon('arrow')}</button></div></section>
<section class="viewer" aria-label="3D迷路"><div class="viewer-grid" aria-hidden="true"></div><div class="scene-caption"><span class="mini-dot"></span><span class="scene-index" id="scene-index">01 / ${levelTotal}</span></div><div class="play-hud" hidden><button class="icon-button" data-action="pause" aria-label="一時停止">${icon('pause')}</button><div class="hud-title"><span id="play-number">ステージ 01</span><span class="control-label">指で操作</span></div><div class="timer" id="timer">00:00</div></div><canvas id="scene" aria-label="迷路をドラッグして回転。2本指でひねると回転、ピンチで拡大縮小。" tabindex="0"></canvas><div class="viewer-bottom"><p id="scene-description">木の外周から、森の内側へ。</p><div class="gesture-hint">${icon('orbit')}<span>ドラッグして回す</span><span class="hint-separator">/</span><span>ピンチで拡大</span></div></div><div class="play-bottom" hidden><div class="progress-row"><span id="checkpoint">スタート地点</span><span id="route-progress">道のり 0%</span></div><div class="play-tools"><button data-action="reset">${icon('reset')}視点リセット</button><button data-action="focus">球に寄る</button><button data-action="calibrate" aria-label="傾きの基準を合わせる" hidden>基準合わせ</button><button data-action="restart">再挑戦</button></div></div><div id="toast" role="status" aria-live="polite"></div></section></main>

</div><dialog id="dialog"></dialog>`;
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
const access=new Access();
const progress=new Progress();let selected=0,level:Level,physics:Physics|undefined,scene:Scene,input:Input,ready=false;
type ControlMode='touch'|'tilt';
let controlMode:ControlMode='touch',tilt:TiltInput|undefined,controlPending=false,controlMessage='',controlGeneration=0,gestureActive=false;
let save;try{save=parseSave(localStorage.getItem(SAVE_KEY));}catch{save=parseSave(null);}
let saved=save;const dialog=$<HTMLDialogElement>('#dialog');let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function controlUI(){
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-control]')){
    button.setAttribute('aria-pressed',String(button.dataset.control===controlMode));
    button.disabled=!ready||(button.dataset.control==='tilt'&&controlPending);
  }
  for(const status of root.querySelectorAll<HTMLElement>('.control-status'))status.textContent=controlPending?'傾きを確認しています…':controlMessage;
  for(const label of root.querySelectorAll<HTMLElement>('.control-label'))label.textContent=controlPending?'傾きを確認中':controlMode==='tilt'?'端末を傾ける':'指で操作';
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-action="calibrate"]'))button.hidden=controlMode!=='tilt';
  for(const button of root.querySelectorAll<HTMLButtonElement>('.start,[data-action="resume"],[data-level]'))button.disabled=!ready||controlPending;
}
function stopTilt(){controlGeneration++;tilt?.stop();controlPending=false;}
function controlFailure(message:string){
  stopTilt();controlMessage=message;input?.clear();accumulator=0;
  if(progress.phase==='playing'){progress.pause();renderPause();}
  controlUI();
}
async function chooseControl(mode:ControlMode){
  stopTilt();controlMessage='';input?.clear();gestureActive=false;
  if(mode==='touch'){controlMode='touch';controlUI();return;}
  const generation=controlGeneration;controlPending=true;controlUI();
  try{
    // Both permission requests start inside this click, before the module download.
    const permission=requestTiltPermission();
    const [,module]=await Promise.all([permission,import('./tilt')]);
    if(generation!==controlGeneration)return;
    tilt??=new module.TiltInput(controlFailure);
    await tilt.start();
    if(generation!==controlGeneration)return;
    controlMode='tilt';controlPending=false;
    if(progress.phase!=='playing'||dialog.open)tilt.stop();
    controlUI();
  }catch(error){
    if(generation!==controlGeneration)return;
    stopTilt();controlMode='touch';controlMessage=error instanceof Error?error.message:'傾き操作を開始できませんでした。指操作で遊べます。';controlUI();
  }
}
async function startTilt(){
  if(controlMode!=='tilt'||!tilt)return;
  stopTilt();const generation=controlGeneration;controlPending=true;controlMessage='';controlUI();
  try{
    await tilt.start();
    if(generation!==controlGeneration)return;
    controlPending=false;last=performance.now();accumulator=0;controlUI();
  }catch(error){
    if(generation!==controlGeneration)return;
    controlMode='touch';controlFailure(error instanceof Error?error.message:'傾き操作を開始できませんでした。指操作で遊べます。');
  }
}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(saved));}catch{toast('記録を保存できません。このまま遊べます。');}}
function updateRecords(){for(const l of levels){const r=saved.records[l.id];$(`[data-record="${l.id}"]`).textContent=r?`BEST ${formatTime(r.time)}`:'';}}
updateRecords();
const installGuide=new InstallGuide();
let offlineState:OfflineState='loading',updatePending=false;
function installUI(){
  if(ready&&offlineState==='ready'&&progress.phase==='select'&&!dialog.open&&!document.hidden&&installGuide.shouldPrompt){
    installGuide.markSeen();
    showDialog('<h2 class="install-heading">ホーム画面に追加して遊ぶ</h2><p>追加すると、次回からアイコンで起動できます。オフラインでも遊べます。</p><button class="primary" data-action="install-guide">追加方法を見る</button><button class="text-button" data-action="later-install">あとで</button>','install-prompt');
  }
}
installGuide.displayMode.addEventListener('change',installUI);
window.addEventListener('storage',installUI);
window.addEventListener('appinstalled',()=>{installGuide.installed=true;installGuide.markSeen();if(dialog.dataset.view==='install'&&installFromHelp)renderHelp();else if(dialog.dataset.view==='install-prompt'||dialog.dataset.view==='install')dialog.close();});
dialog.addEventListener('close',installUI);
function offlineUI(){
  const labels={loading:'オフライン用データを保存中',ready:'オフラインで遊べます',error:'オフライン保存が完了していません',unavailable:import.meta.env.DEV?'開発プレビュー':'オフラインにはHTTPS接続が必要です'};
  $('#offline-text').textContent=labels[offlineState];$('.status-dot').classList.toggle('ready',offlineState==='ready');
  $('[data-action="retry-offline"]').hidden=offlineState!=='error';$('[data-action="update"]').hidden=!updatePending||progress.phase!=='select';
  installUI();
}
const offline=new Offline((state,pending)=>{offlineState=state;updatePending=pending;offlineUI();},()=>progress.phase==='select');
void offline.init();
let accumulator=0,last=0,frames=0,frameElapsed=0,lowSamples=0,autoLow=false;
const previousPosition=new Vector3(),currentPosition=new Vector3();
function currentMarker():Marker{return progress.phase==='select'||progress.checkpoint<0?level.start:level.checkpoints[progress.checkpoint];}
function resetBall(){
  if(!physics)return;const m=currentMarker();physics.reset(m);scene.orientation.setFromUnitVectors(new Vector3(...m.up),new Vector3(0,1,0));scene.zoom=1;scene.updateCamera();input.clear();tilt?.recalibrate();accumulator=0;
  currentPosition.copy(physics.ball.translation());previousPosition.copy(currentPosition);progress.goalDwell=0;scene.needsRender=true;
}
function syncMode(){
  if(scene)scene.needsRender=true;
  const play=progress.phase!=='select';$('.shell').classList.toggle('is-playing',play);$('.selection').hidden=play;
  $('.play-hud').hidden=!play;$('.play-bottom').hidden=!play;$('.viewer-bottom').hidden=play;$('.scene-caption').hidden=play;
  offlineUI();requestAnimationFrame(()=>scene?.resize());
}
function select(index:number){
  stopTilt();controlMessage='';controlUI();selected=index;level=getLevel(index);physics?.dispose();physics=undefined;scene.load(level);
  accumulator=0;
  if(ready){physics=new Physics(level);currentPosition.copy(physics.ball.translation());previousPosition.copy(currentPosition);}
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-level]')){const active=Number(button.dataset.level)===index;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
  $('#scene-index').textContent=`${level.number} / ${levelTotal}`;$('#scene-description').textContent=level.description;
}
function start(){if(!ready||controlPending)return;if(!access.canPlay(selected)){void unlock();return;}stopTilt();controlMessage='';dialog.close();physics?.dispose();physics=new Physics(level);progress.start();scene.orientation.identity();resetBall();syncMode();$('#play-number').textContent=`ステージ ${level.number}`;$('#scene').focus();toast(controlMode==='tilt'?'今の持ち方を基準に、端末を傾けて操作':'少しずつ傾けて、球を転がそう');if(controlMode==='tilt')void startTilt();controlUI();}
let dialogGeneration=0;
async function unlock(){
  stopTilt();input?.clear();progress.phase='select';syncMode();
  showDialog('<h2>解放方法を読み込んでいます</h2>');
  const generation=dialogGeneration;
  try{const {openUnlock}=await import('./unlock');
    if(!dialog.open||generation!==dialogGeneration)return;
    openUnlock(dialog,html=>showDialog(html),method=>{
      const stored=access.grant(method);updateAccess();
      toast(stored?'07〜12で遊べます。':'07〜12で遊べます。この端末では保存できないため、今回は開いている間だけ有効です。');
    });
  }catch{if(generation!==dialogGeneration||!dialog.open)return;showDialog('<h2>解放方法を読み込めませんでした</h2><p>通信状態を確認してください。</p><button class="text-button" data-action="select">閉じる</button>');}
}
function updateAccess(){
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-level]')){
    const index=Number(button.dataset.level),locked=!access.canPlay(index);
    button.classList.toggle('locked',locked);
    button.setAttribute('aria-label',`ワールド ${levels[index].number}${locked?'・解放が必要':''}`);
  }
}
updateAccess();
function showDialog(html:string,view:'help'|'install'|'install-prompt'|'fatal'|'other'='other'){
  dialogGeneration++;if(view==='fatal')dialog.dispatchEvent(new Event('unlock-stop'));stopTilt();input?.clear();
  dialog.dataset.view=view;
  if(view==='help'||view==='install'||view==='install-prompt')dialog.setAttribute('aria-label',view==='help'?'遊び方':view==='install'?'ホーム画面に追加':'ホーム画面に追加して遊ぶ');else dialog.removeAttribute('aria-label');
  dialog.innerHTML=html;if(!dialog.open)dialog.showModal();controlUI();installUI();
}
function pause(){if(progress.phase!=='playing')return;stopTilt();progress.pause();input?.clear();accumulator=0;renderPause();}
function renderPause(){
  showDialog(`<h2>一時停止</h2>${controlMarkup()}<button class="primary" data-action="resume">ゲームに戻る ${icon('arrow')}</button><button class="secondary" data-action="restart">最初からやり直す</button><button class="text-button" data-action="select">ステージ選択へ</button><label class="quality-setting">描画品質<select id="quality"><option value="auto" ${saved.quality==='auto'?'selected':''}>自動</option><option value="low" ${saved.quality==='low'?'selected':''}>軽量</option></select></label>`);
}
function resume(){dialog.close();controlMessage='';progress.resume();input.clear();accumulator=0;last=performance.now();$('#scene').focus();if(controlMode==='tilt')void startTilt();controlUI();}
function finish(){
  stopTilt();
  const r={time:progress.elapsed,falls:progress.falls};const previous=saved.records[level.id];const best=!previous||r.time<previous.time;
  if(best)saved.records[level.id]=r;persist();updateRecords();input.clear();
  showDialog(`<p class="eyebrow">${best?'自己ベスト更新':'ステージクリア'}</p><div class="result-symbol">${icon('check')}</div><h2>たどり着いた。</h2><p>ステージ ${level.number}</p><div class="result-stats"><div><strong>${formatTime(r.time)}</strong><span>クリアタイム</span></div></div>${selected<levels.length-1?`<button class="primary" data-action="next">次の世界へ ${icon('arrow')}</button>`:''}<button class="secondary" data-action="restart">もう一度遊ぶ</button><button class="text-button" data-action="select">ステージ選択へ</button>`);
}
let helpWasPlaying=false;
function help(){stopTilt();helpWasPlaying=progress.phase==='playing';if(helpWasPlaying)progress.pause();input?.clear();renderHelp();}
function renderHelp(){showDialog(`<h2>遊び方</h2><div class="help-steps"><p><b>01</b><span><strong>${controlMode==='tilt'?'端末を傾ける':'1本指で回す'}</strong>${controlMode==='tilt'?'端末を傾けると迷路も傾きます。元の持ち方に戻すと迷路も戻ります。':'ドラッグで迷路を傾ける。指を離しても球は転がり続けます。'}</span></p><p><b>02</b><span><strong>2本指で調整</strong>${controlMode==='tilt'?'指でも回せます。ピンチで拡大・縮小。持ち替えたら「基準合わせ」。':'ひねって回転。ピンチで拡大・縮小。'}</span></p><p><b>03</b><span><strong>緑のリングへ</strong>金色の中継点を順に通り、緑のゴールで球を止めるとクリア。</span></p></div><p class="help-note">ホーム画面に追加したアプリで、「オフラインで遊べます」を確認してください。</p>${installGuide.canOffer?'<button class="text-button help-install" data-action="install-guide">ホーム画面に追加する方法を見る</button>':''}<button class="primary" data-action="close-help">わかった ${icon('arrow')}</button>`,'help');}
let installFromHelp=false;
function showInstallGuide(){
  if(!installGuide.canOffer)return;
  installFromHelp=dialog.open&&dialog.dataset.view==='help';
  installGuide.markSeen();
  const steps=installGuide.platform==='android'?['Chromeの<strong>メニュー</strong>を開く','<strong>ホーム画面に追加</strong>または<strong>インストールしてショートカットを作成</strong>を選ぶ','<strong>インストール</strong>を選び、画面の指示に従う']:['Safariの<strong>共有</strong>を開く<small>「その他」の中にある場合もあります。</small>','<strong>ホーム画面に追加</strong>を選ぶ','<strong>Webアプリとして開く</strong>をオンにして<strong>追加</strong>'];
  showDialog(`<h2 class="install-heading">ホーム画面に追加</h2><ol class="install-steps">${steps.map((step,i)=>`<li><span class="install-step-number" aria-hidden="true">0${i+1}</span><span>${step}</span></li>`).join('')}</ol><p class="help-note">追加したアプリを開き、「オフラインで遊べます」と表示されたら、通信なしで遊べます。</p><button class="primary" data-action="close-install">閉じる</button>`,'install');
  $('[data-action="close-install"]').focus();
}
function closeInstallGuide(){
  if(installFromHelp){renderHelp();$('[data-action="install-guide"].help-install').focus();}
  else{dialog.close();$('[data-action="start"]').focus();}
}
function closeHelp(){dialog.close();if(helpWasPlaying){if(controlMode==='tilt')renderPause();else{progress.resume();last=performance.now();}}installUI();}
root.addEventListener('click',e=>{
  const target=(e.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
  if(target.dataset.control==='touch'||target.dataset.control==='tilt'){void chooseControl(target.dataset.control);return;}
  if(target.dataset.level!==undefined&&!controlPending&&ready&&progress.phase==='select'){select(Number(target.dataset.level));return;}
  switch(target.dataset.action){
    case 'start':case 'restart':start();break;
    case 'pause':pause();break;
    case 'resume':resume();break;
    case 'select':dialog.close();progress.phase='select';input.clear();select(selected);syncMode();$('[data-action="start"]').focus();break;
    case 'next':select(selected+1);start();break;
    case 'focus':scene.setZoom(scene.zoom>1.5?1/scene.zoom:scene.focusZoom/scene.zoom);break;
    case 'calibrate':tilt?.recalibrate();input.clear();toast('この持ち方を基準にしました');break;
    case 'reset':resetBall();toast('中継点の姿勢に戻しました');break;
    case 'help':help();break;
    case 'unlock':void unlock();break;
    case 'close-help':closeHelp();break;
    case 'install-guide':showInstallGuide();break;
    case 'close-install':closeInstallGuide();break;
    case 'later-install':dialog.close();$('[data-action="start"]').focus();break;
    case 'retry-offline':void offline.retry();break;
    case 'update':offline.activate();break;
    case 'reload':location.reload();break;
  }
});
root.addEventListener('change',e=>{if((e.target as HTMLElement).id==='quality'){saved.quality=($<HTMLSelectElement>('#quality').value as 'auto'|'low');autoLow=false;lowSamples=0;scene.setQuality(saved.quality==='low');persist();}});
dialog.addEventListener('cancel',e=>{e.preventDefault();if(dialog.dataset.view==='fatal')return;if(dialog.dataset.view==='install'){closeInstallGuide();return;}if(dialog.dataset.view==='help'){closeHelp();return;}if(progress.phase==='paused'){if(controlMode==='touch')resume();}else if(progress.phase==='select')dialog.close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTilt();pause();input?.clear();accumulator=0;controlUI();}else{last=performance.now();void offline.check();}});
window.addEventListener('pagehide',()=>{stopTilt();pause();input?.clear();accumulator=0;});
const canvas=$<HTMLCanvasElement>('#scene');
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();progress.pause();input?.clear();dialog.close();showDialog('<h2>描画が停止しました。</h2><p>再読み込みして再開してください。クリア記録は保存されています。</p><button class="primary" data-action="reload">再読み込み</button>','fatal');});
canvas.addEventListener('webglcontextrestored',()=>{ /* Explicit reload reconstructs the physics and GPU resources together. */ });
function frame(time:number){
  requestAnimationFrame(frame);if(!scene||document.hidden)return;
  const dt=last?Math.min((time-last)/1000,.1):0;last=time;
  if(controlMode==='tilt'&&!controlPending&&progress.phase==='playing'&&!dialog.open){const delta=tilt?.update(dt);if(delta&&!gestureActive)scene.rotate(delta);}
  const simulating=()=>!controlPending&&!dialog.open&&(progress.phase==='playing'||progress.phase==='select');
  if(simulating()&&physics){
    accumulator+=dt;
    while(accumulator>=1/120&&simulating()){
      previousPosition.copy(physics.ball.translation());
      physics.step(scene.orientation);
      currentPosition.copy(physics.ball.translation());
      accumulator-=1/120;
      // Preview uses the same physics, without checkpoints, time, or records.
      if(progress.phase==='playing'){
        const cp=level.checkpoints[progress.checkpoint+1];
        if(cp&&currentPosition.distanceTo(spawnPosition(cp))<level.corridorRadius+.22){progress.checkpoint++;toast('中継点を通過しました');}
        const vel=physics.ball.linvel(),speed=Math.hypot(vel.x,vel.y,vel.z);
        const allCheckpoints=progress.checkpoint===level.checkpoints.length-1;
        if(progress.tick(1/120,allCheckpoints&&currentPosition.distanceTo(spawnPosition(level.goal))<level.corridorRadius+.22,speed))finish();
      }
    }
    if(progress.phase==='playing'){
      $('#timer').textContent=formatTime(progress.elapsed);
      const location=nearestOnRoute(currentPosition,level.route);$('#route-progress').textContent=`道のり ${Math.round(100*(location.index+location.t)/(level.route.length-1))}%`;
      $('#checkpoint').textContent=progress.checkpoint<0?'スタート地点':`中継点 ${progress.checkpoint+1} / ${level.checkpoints.length}`;
    }
    frames++;frameElapsed+=dt;
    if(frameElapsed>=3){
      if(frames/frameElapsed<45)lowSamples++;else lowSamples=0;
      if(lowSamples>=2&&saved.quality==='auto'&&!autoLow){autoLow=true;scene.setQuality(true);toast('動きを滑らかにするため画質を調整しました');}
      frames=0;frameElapsed=0;
    }
  }
  if(!scene.needsRender&&(!simulating()||physics?.ball.isSleeping()))return;
  if(physics)scene.draw(previousPosition.clone().lerp(currentPosition,Math.min(accumulator*120,1)),physics.ball.rotation());
  else scene.draw(spawnPosition(level.start));
}
async function boot(){
  try{
    // Download the engine while the scene is built; handle failure immediately.
    const physicsReady=initPhysics().then(()=>({ok:true as const}),error=>({ok:false as const,error}));
    scene=new Scene(canvas);scene.setQuality(saved.quality==='low');select(0);
    input=new Input(canvas,()=>ready&&!controlPending&&!dialog.open&&(progress.phase==='playing'||progress.phase==='select'),q=>scene.rotate(q),r=>scene.setZoom(r),{start:()=>{gestureActive=true;tilt?.recalibrate();},end:()=>{tilt?.recalibrate();gestureActive=false;}});
    requestAnimationFrame(frame);
    const physicsResult=await physicsReady;if(!physicsResult.ok)throw physicsResult.error;
    physics=new Physics(level);currentPosition.copy(physics.ball.translation());previousPosition.copy(currentPosition);
    ready=true;scene.needsRender=true;$('.start').removeAttribute('disabled');$('#start-label').textContent='START';controlUI();installUI();
  }catch(error){console.error(error);$('#start-label').textContent='読み込めませんでした';toast('再読み込みしてお試しください');showDialog('<h2>ゲームを開けませんでした。</h2><p>通信状態とブラウザの3D描画対応を確認し、再読み込みしてください。</p><button class="primary" data-action="reload">再読み込み</button>','fatal');}
}
void boot();
