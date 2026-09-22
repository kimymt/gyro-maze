const SEEN_KEY='gyro-maze-install-prompt-seen-v1';
const DISMISSED_KEY='gyro-maze-install-dismissed-at';

/** In-app instructions only; the browser performs installation. */
export class InstallGuide {
  readonly displayMode=window.matchMedia('(display-mode: standalone)');
  private seenThisSession=false;
  installed=false;

  get platform():'ios'|'android'|undefined{
    const ua=navigator.userAgent;
    const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1&&!/Android/.test(ua));
    const safari=/Version\//.test(ua)&&/Safari\//.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if(ios&&safari)return 'ios';
    if(/Android/.test(ua)&&/Chrome\//.test(ua)&&!/; wv\)|Version\/|EdgA\/|OPR\/|SamsungBrowser\/|Firefox\//.test(ua))return 'android';
  }
  get canOffer(){
    const standalone=(navigator as Navigator&{standalone?:boolean}).standalone===true||this.displayMode.matches;
    return !!this.platform&&!standalone&&!this.installed;
  }
  get shouldPrompt(){
    if(!this.canOffer||this.seenThisSession)return false;
    try{
      if(localStorage.getItem(SEEN_KEY)==='1')return false;
      // Respect an unexpired dismissal of the previous banner.
      const at=Number(localStorage.getItem(DISMISSED_KEY)),age=Date.now()-at;
      if(at>0&&age>=0&&age<7*24*60*60*1000)return false;
    }catch{ /* Session state still prevents repeated prompts. */ }
    return true;
  }
  markSeen(){
    this.seenThisSession=true;
    try{localStorage.setItem(SEEN_KEY,'1');}catch{}
  }
}
