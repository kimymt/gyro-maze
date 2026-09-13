export type OfflineState = 'loading'|'ready'|'error'|'unavailable';
export class Offline {
  registration?:ServiceWorkerRegistration; pending=false; private reloading=false;
  constructor(private report:(state:OfflineState,pending:boolean)=>void,private canActivate:()=>boolean){}
  async init(){
    if(!import.meta.env.PROD||!('serviceWorker' in navigator)||!window.isSecureContext){this.report('unavailable',false);return;}
    this.report('loading',false);
    try{
      this.registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(this.reloading)location.reload();else void this.check();
      });
      const watch=(worker:ServiceWorker)=>worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'){
          this.pending=!!navigator.serviceWorker.controller;
          void this.check();
        }
        if(worker.state==='redundant')this.report('error',false);
      });
      if(this.registration.installing)watch(this.registration.installing);
      this.registration.addEventListener('updatefound',()=>{if(this.registration?.installing)watch(this.registration.installing);});
      this.pending=!!this.registration.waiting;await this.check();
    }catch{this.report('error',false);}
  }
  async check(){
    const reg=this.registration;if(!reg)return;
    const worker=navigator.serviceWorker.controller||reg.active;
    if(!worker){if(reg.installing)return;this.report('error',this.pending);return;}
    try{
      const ready=await new Promise<boolean>((resolve)=>{
        const channel=new MessageChannel();const timeout=setTimeout(()=>{channel.port1.close();resolve(false);},8000);
        channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();resolve(e.data.ready===true);};worker.postMessage({type:'CHECK_CACHE'},[channel.port2]);
      });this.report(ready?'ready':'error',this.pending);
    }catch{this.report('error',this.pending);}
  }
  async retry(){
    this.report('loading',this.pending);
    if(!this.registration||(!this.registration.active&&!navigator.serviceWorker.controller)){await this.init();return;}
    // Re-download the full current cache after eviction/partial loss; SW install
    // does not run again for an unchanged version.
    try{
      const response=await fetch('/sw.js',{cache:'reload'});if(!response.ok)throw new Error('offline');
      // A versioned asset inventory is delivered by the active worker.
      const worker=navigator.serviceWorker.controller||this.registration.active;
      if(worker)await new Promise<void>((resolve,reject)=>{
        const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(new Error('timeout'));},60000);
        channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok?resolve():reject(new Error('cache'));};
        worker.postMessage({type:'REPAIR_CACHE'},[channel.port2]);
      });
      await this.registration.update();await this.check();
    }catch{this.report('error',this.pending);}
  }
  activate(){if(!this.canActivate()||!this.registration?.waiting)return;this.reloading=true;this.registration.waiting.postMessage({type:'ACTIVATE'});}
}
