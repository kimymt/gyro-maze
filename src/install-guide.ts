const DISMISSED_KEY='gyro-maze-install-dismissed-at';
const DISMISS_DURATION=7*24*60*60*1000;

/** Safari needs a share-menu guide; this is not an OS install/notification prompt. */
export class InstallGuide {
  readonly displayMode=window.matchMedia('(display-mode: standalone)');
  private dismissedThisSession=false;

  get canOffer(){
    const ua=navigator.userAgent;
    const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const safari=/Version\//.test(ua)&&/Safari\//.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    const standalone=(navigator as Navigator&{standalone?:boolean}).standalone===true||this.displayMode.matches;
    return ios&&safari&&!standalone;
  }

  get dismissed(){
    if(this.dismissedThisSession)return true;
    try{
      const timestamp=Number(localStorage.getItem(DISMISSED_KEY));
      const age=Date.now()-timestamp;
      return Number.isFinite(timestamp)&&timestamp>0&&age>=0&&age<DISMISS_DURATION;
    }catch{return false;}
  }

  dismiss(){
    this.dismissedThisSession=true;
    try{localStorage.setItem(DISMISSED_KEY,String(Date.now()));}catch{ /* Keep dismissal for this session if storage is unavailable. */ }
  }
}
