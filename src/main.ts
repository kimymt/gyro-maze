import './style.css';
import { Vector3 } from 'three';
import { levels, nearestOnRoute, spawnPosition, type Marker } from './levels';
import { Scene } from './scene';
import { Physics, initPhysics } from './physics';
import { Input } from './input';
import { Progress, parseSave, SAVE_KEY, formatTime } from './state';
import { Offline, type OfflineState } from './offline';
import { InstallGuide } from './install-guide';
const icons={close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',pause:'<path d="M9 5v14M15 5v14"/>',reset:'<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.8-2.5 2-2.5 4M12 17h.01"/>',chevron:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m14 6-6 6 6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',orbit:'<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-40 12 12)"/><circle cx="12" cy="12" r="3"/>'};
function icon(name:keyof typeof icons){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;}
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<div class="shell"><header class="header"><a class="brand" href="/" aria-label="GYRO ホーム">${icon('orbit')}<span>GYRO<span class="brand-dot">.</span></span></a><button class="icon-button" data-action="help" aria-label="遊び方">${icon('help')}</button></header>
<main class="workspace"><section class="selection" aria-label="ステージ選択"><div class="intro"><p class="intro-copy">木と土、水の中を巡る。<br>落ちる心配のない、立体迷路。</p></div><div class="level-heading"><span>ステージを選択</span></div><div class="levels">${levels.map((l,i)=>`<button class="level ${i===0?'selected':''}" data-level="${i}" aria-label="ワールド ${l.number}" aria-pressed="${i===0}"><span class="level-number">${l.number}</span><span class="level-copy"><span class="record" data-record="${l.id}"></span></span><span class="difficulty">${l.difficulty}</span>${icon('chevron')}</button>`).join('')}</div><button class="primary start" data-action="start" disabled><span id="start-label">準備しています</span>${icon('arrow')}</button></section>
<section class="viewer" aria-label="3D迷路"><div class="viewer-grid" aria-hidden="true"></div><div class="scene-caption"><span class="mini-dot"></span><span class="scene-index" id="scene-index">01 / 03</span></div><div class="play-hud" hidden><button class="icon-button" data-action="pause" aria-label="一時停止">${icon('pause')}</button><div class="hud-title"><span id="play-number">ステージ 01</span></div><div class="timer" id="timer">00:00</div></div><canvas id="scene" aria-label="迷路をドラッグして回転。2本指でひねると回転、ピンチで拡大縮小。" tabindex="0"></canvas><div class="viewer-bottom"><p id="scene-description">木の外周から、森の内側へ。</p><div class="gesture-hint">${icon('orbit')}<span>ドラッグして回す</span><span class="hint-separator">/</span><span>ピンチで拡大</span></div></div><div class="play-bottom" hidden><div class="progress-row"><span id="checkpoint">スタート地点</span><span id="route-progress">道のり 0%</span></div><div class="play-tools"><button data-action="reset">${icon('reset')}視点リセット</button><button data-action="focus">球に寄る</button><button data-action="restart">再挑戦</button></div></div><div id="toast" role="status" aria-live="polite"></div></section></main>
<aside class="install-banner" id="install-banner" aria-labelledby="install-banner-title" aria-live="polite" hidden><button class="install-dismiss" data-action="dismiss-install" aria-label="ホーム画面への追加案内を閉じる">${icon('close')}</button><h2 id="install-banner-title">オフラインで遊ぶ</h2><button class="install-link" data-action="install-guide">ホーム画面に追加する方法を見る ${icon('arrow')}</button></aside>
<footer class="footer"><div class="offline-status"><span class="status-dot"></span><span id="offline-text">オフライン用データを確認中</span><button data-action="retry-offline" hidden>再試行</button><button data-action="update" hidden>更新する</button></div></footer></div><dialog id="dialog"></dialog>`;
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
const progress=new Progress();let selected=0,physics:Physics|undefined,scene:Scene,input:Input,ready=false;
let save;try{save=parseSave(localStorage.getItem(SAVE_KEY));}catch{save=parseSave(null);}
let saved=save;const dialog=$<HTMLDialogElement>('#dialog');let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(saved));}catch{toast('記録を保存できません。このまま遊べます。');}}
function updateRecords(){for(const l of levels){const r=saved.records[l.id];$(`[data-record="${l.id}"]`).textContent=r?`BEST ${formatTime(r.time)}`:'';}}
updateRecords();
const installGuide=new InstallGuide();
let offlineState:OfflineState='loading',updatePending=false;
function installUI(){
  const visible=ready&&offlineState==='ready'&&progress.phase==='select'&&!dialog.open&&installGuide.canOffer&&!installGuide.dismissed;
  $('#install-banner').hidden=!visible;
}
installGuide.displayMode.addEventListener('change',installUI);
window.addEventListener('storage',installUI);
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
function currentMarker():Marker{return progress.phase==='select'||progress.checkpoint<0?levels[selected].start:levels[selected].checkpoints[progress.checkpoint];}
function resetBall(){
  if(!physics)return;const m=currentMarker();physics.reset(m);scene.orientation.setFromUnitVectors(new Vector3(...m.up),new Vector3(0,1,0));scene.zoom=1;scene.updateCamera();input.clear();accumulator=0;
  currentPosition.copy(physics.ball.translation());previousPosition.copy(currentPosition);progress.goalDwell=0;scene.needsRender=true;
}
function syncMode(){
  if(scene)scene.needsRender=true;
  const play=progress.phase!=='select';$('.shell').classList.toggle('is-playing',play);$('.selection').hidden=play;
  $('.play-hud').hidden=!play;$('.play-bottom').hidden=!play;$('.viewer-bottom').hidden=play;$('.scene-caption').hidden=play;
  offlineUI();requestAnimationFrame(()=>scene?.resize());
}
function select(index:number){
  selected=index;physics?.dispose();physics=undefined;scene.load(levels[index]);
  accumulator=0;
  if(ready){physics=new Physics(levels[index]);currentPosition.copy(physics.ball.translation());previousPosition.copy(currentPosition);}
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-level]')){const active=Number(button.dataset.level)===index;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
  $('#scene-index').textContent=`${levels[index].number} / 03`;$('#scene-description').textContent=levels[index].description;
}
function start(){if(!ready)return;dialog.close();physics?.dispose();physics=new Physics(levels[selected]);progress.start();scene.orientation.identity();resetBall();syncMode();$('#play-number').textContent=`ステージ ${levels[selected].number}`;$('#scene').focus();toast('少しずつ傾けて、球を転がそう');}
function showDialog(html:string,view:'help'|'install'|'other'='other'){
  dialog.dataset.view=view;
  if(view==='other')dialog.removeAttribute('aria-label');else dialog.setAttribute('aria-label',view==='install'?'ホーム画面に追加':'遊び方');
  dialog.innerHTML=html;dialog.showModal();installUI();
}
function pause(){if(progress.phase!=='playing')return;progress.pause();input.clear();accumulator=0;
  showDialog(`<h2>一時停止</h2><button class="primary" data-action="resume">ゲームに戻る ${icon('arrow')}</button><button class="secondary" data-action="restart">最初からやり直す</button><button class="text-button" data-action="select">ステージ選択へ</button><label class="quality-setting">描画品質<select id="quality"><option value="auto" ${saved.quality==='auto'?'selected':''}>自動</option><option value="low" ${saved.quality==='low'?'selected':''}>軽量</option></select></label>`);
}
function finish(){
  const r={time:progress.elapsed,falls:progress.falls};const previous=saved.records[levels[selected].id];const best=!previous||r.time<previous.time;
  if(best)saved.records[levels[selected].id]=r;persist();updateRecords();input.clear();
  showDialog(`<p class="eyebrow">${best?'自己ベスト更新':'ステージクリア'}</p><div class="result-symbol">${icon('check')}</div><h2>たどり着いた。</h2><p>ステージ ${levels[selected].number}</p><div class="result-stats"><div><strong>${formatTime(r.time)}</strong><span>クリアタイム</span></div><div><strong>${Math.round(levels[selected].routeLength)}</strong><span>道のり</span></div></div>${selected<levels.length-1?`<button class="primary" data-action="next">次の世界へ ${icon('arrow')}</button>`:''}<button class="secondary" data-action="restart">もう一度遊ぶ</button><button class="text-button" data-action="select">ステージ選択へ</button>`);
}
let helpWasPlaying=false;
function help(){helpWasPlaying=progress.phase==='playing';if(helpWasPlaying)progress.pause();input?.clear();renderHelp();}
function renderHelp(){showDialog(`<h2>遊び方</h2><div class="help-steps"><p><b>01</b><span><strong>1本指で回す</strong>ドラッグで迷路を傾ける。指を離しても球は転がり続けます。</span></p><p><b>02</b><span><strong>2本指で調整</strong>ひねって回転。ピンチで拡大・縮小。</span></p><p><b>03</b><span><strong>緑のリングへ</strong>金色の中継点を順に通り、緑のゴールで球を止めるとクリア。</span></p></div><p class="help-note">Safariからホーム画面に追加したアプリで、「オフラインで遊べます」を確認してください。</p>${installGuide.canOffer?'<button class="text-button help-install" data-action="install-guide">ホーム画面に追加する方法を見る</button>':''}<button class="primary" data-action="close-help">わかった ${icon('arrow')}</button>`,'help');}
let installFromHelp=false;
function showInstallGuide(){
  if(!installGuide.canOffer)return;
  installFromHelp=dialog.open&&dialog.dataset.view==='help';
  showDialog(`<h2 class="install-heading">ホーム画面に追加</h2><ol class="install-steps"><li><span class="install-step-number" aria-hidden="true">01</span><span>Safariの<strong>共有</strong>を開く<small>「その他」の中にある場合もあります。</small></span></li><li><span class="install-step-number" aria-hidden="true">02</span><span><strong>ホーム画面に追加</strong>を選ぶ</span></li><li><span class="install-step-number" aria-hidden="true">03</span><span><strong>Webアプリとして開く</strong>をオンにして<strong>追加</strong></span></li></ol><p class="help-note">追加したアプリを開き、「オフラインで遊べます」と表示されたら、通信なしで遊べます。</p><button class="primary" data-action="close-install">閉じる</button>`,'install');
  $('[data-action="close-install"]').focus();
}
function closeInstallGuide(){
  if(installFromHelp){renderHelp();$('[data-action="install-guide"].help-install').focus();}
  else{dialog.close();installUI();if(!$('#install-banner').hidden)$('#install-banner [data-action="install-guide"]').focus();}
}
function closeHelp(){dialog.close();if(helpWasPlaying){progress.resume();last=performance.now();}installUI();}
root.addEventListener('click',e=>{
  const target=(e.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
  if(target.dataset.level!==undefined&&ready&&progress.phase==='select'){select(Number(target.dataset.level));return;}
  switch(target.dataset.action){
    case 'start':case 'restart':start();break;
    case 'pause':pause();break;
    case 'resume':dialog.close();progress.resume();last=performance.now();$('#scene').focus();break;
    case 'select':dialog.close();progress.phase='select';input.clear();select(selected);syncMode();$('[data-action="start"]').focus();break;
    case 'next':select(selected+1);start();break;
    case 'focus':scene.setZoom(scene.zoom>1.5?1/scene.zoom:2.2/scene.zoom);break;
    case 'reset':resetBall();toast('中継点の姿勢に戻しました');break;
    case 'help':help();break;
    case 'close-help':closeHelp();break;
    case 'install-guide':showInstallGuide();break;
    case 'close-install':closeInstallGuide();break;
    case 'dismiss-install':installGuide.dismiss();installUI();break;
    case 'retry-offline':void offline.retry();break;
    case 'update':offline.activate();break;
    case 'reload':location.reload();break;
  }
});
root.addEventListener('change',e=>{if((e.target as HTMLElement).id==='quality'){saved.quality=($<HTMLSelectElement>('#quality').value as 'auto'|'low');autoLow=false;lowSamples=0;scene.setQuality(saved.quality==='low');persist();}});
dialog.addEventListener('cancel',e=>{e.preventDefault();if(dialog.dataset.view==='install'){closeInstallGuide();return;}if(dialog.dataset.view==='help'){closeHelp();return;}if(progress.phase==='paused'){dialog.close();progress.resume();last=performance.now();}else if(progress.phase==='select')dialog.close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();input?.clear();accumulator=0;}else{last=performance.now();void offline.check();}});
window.addEventListener('pagehide',()=>{pause();input?.clear();accumulator=0;});
const canvas=$<HTMLCanvasElement>('#scene');
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();progress.pause();input?.clear();dialog.close();showDialog('<h2>描画が停止しました。</h2><p>再読み込みして再開してください。クリア記録は保存されています。</p><button class="primary" data-action="reload">再読み込み</button>');});
canvas.addEventListener('webglcontextrestored',()=>{ /* Explicit reload reconstructs the physics and GPU resources together. */ });
function frame(time:number){
  requestAnimationFrame(frame);if(!scene||document.hidden)return;
  const dt=last?Math.min((time-last)/1000,.1):0;last=time;
  const simulating=()=>progress.phase==='playing'||progress.phase==='select';
  if(simulating()&&physics){
    accumulator+=dt;
    while(accumulator>=1/120&&simulating()){
      previousPosition.copy(physics.ball.translation());
      physics.step(scene.orientation);
      currentPosition.copy(physics.ball.translation());
      accumulator-=1/120;
      // Preview uses the same physics, without checkpoints, time, or records.
      if(progress.phase==='playing'){
        const cp=levels[selected].checkpoints[progress.checkpoint+1];
        if(cp&&currentPosition.distanceTo(spawnPosition(cp))<levels[selected].corridorRadius+.22){progress.checkpoint++;toast('中継点を通過しました');}
        const vel=physics.ball.linvel(),speed=Math.hypot(vel.x,vel.y,vel.z);
        const allCheckpoints=progress.checkpoint===levels[selected].checkpoints.length-1;
        if(progress.tick(1/120,allCheckpoints&&currentPosition.distanceTo(spawnPosition(levels[selected].goal))<levels[selected].corridorRadius+.22,speed))finish();
      }
    }
    if(progress.phase==='playing'){
      $('#timer').textContent=formatTime(progress.elapsed);
      const location=nearestOnRoute(currentPosition,levels[selected].route);$('#route-progress').textContent=`道のり ${Math.round(100*(location.index+location.t)/(levels[selected].route.length-1))}%`;
      $('#checkpoint').textContent=progress.checkpoint<0?'スタート地点':`中継点 ${progress.checkpoint+1} / ${levels[selected].checkpoints.length}`;
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
  else scene.draw(spawnPosition(levels[selected].start));
}
async function boot(){
  try{
    // Download the engine while the scene is built; handle failure immediately.
    const physicsReady=initPhysics().then(()=>({ok:true as const}),error=>({ok:false as const,error}));
    scene=new Scene(canvas);scene.setQuality(saved.quality==='low');select(0);
    input=new Input(canvas,()=>ready&&(progress.phase==='playing'||progress.phase==='select'),q=>scene.rotate(q),r=>scene.setZoom(r));
    requestAnimationFrame(frame);
    const physicsResult=await physicsReady;if(!physicsResult.ok)throw physicsResult.error;
    physics=new Physics(levels[selected]);currentPosition.copy(physics.ball.translation());previousPosition.copy(currentPosition);
    ready=true;scene.needsRender=true;$('.start').removeAttribute('disabled');$('#start-label').textContent='この世界で遊ぶ';installUI();
  }catch(error){console.error(error);$('#start-label').textContent='読み込めませんでした';toast('再読み込みしてお試しください');showDialog('<h2>ゲームを開けませんでした。</h2><p>通信状態とブラウザの3D描画対応を確認し、再読み込みしてください。</p><button class="primary" data-action="reload">再読み込み</button>');}
}
void boot();
