import { Quaternion, Vector3 } from 'three';
export class Input {
  private points = new Map<number,{x:number;y:number}>();
  private abort = new AbortController();
  constructor(private canvas: HTMLCanvasElement, private enabled:()=>boolean, private rotate:(q:Quaternion)=>void,private zoom:(ratio:number)=>void) {
    const options={signal:this.abort.signal};
    canvas.addEventListener('pointerdown',e=>{if(!enabled())return;canvas.setPointerCapture(e.pointerId);this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});},options);
    canvas.addEventListener('pointermove',e=>{
      const previous=this.points.get(e.pointerId);if(!previous||!enabled())return;
      const before=[...this.points.values()];this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.points.size===1){
        const scale=2.2/Math.min(canvas.clientWidth,canvas.clientHeight);
        const dx=(e.clientX-previous.x)*scale,dy=(e.clientY-previous.y)*scale;
        const axis=new Vector3(dy,dx,0);const angle=axis.length();
        if(angle>0)this.rotate(new Quaternion().setFromAxisAngle(axis.normalize(),angle));
      } else if(this.points.size===2){
        const after=[...this.points.values()];
        const angle=(p:typeof after)=>Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x);
        let delta=angle(after)-angle(before);delta=Math.atan2(Math.sin(delta),Math.cos(delta));
        this.rotate(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-delta));
        const distance=(p:typeof after)=>Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        if(distance(before)>10&&distance(after)>10)this.zoom(distance(after)/distance(before));
      }
    },options);
    for(const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,(event)=>{this.points.delete((event as PointerEvent).pointerId);},options);
    canvas.addEventListener('wheel',e=>{if(!enabled())return;e.preventDefault();this.zoom(Math.exp(-e.deltaY*.001));},{...options,passive:false});
    window.addEventListener('keydown',e=>{
      if(!enabled()||(e.target instanceof HTMLElement&&['BUTTON','SELECT','INPUT'].includes(e.target.tagName)))return;
      const axes:Record<string,Vector3>={ArrowUp:new Vector3(-1,0,0),ArrowDown:new Vector3(1,0,0),ArrowLeft:new Vector3(0,-1,0),ArrowRight:new Vector3(0,1,0),q:new Vector3(0,0,1),e:new Vector3(0,0,-1)};
      if(axes[e.key]){e.preventDefault();this.rotate(new Quaternion().setFromAxisAngle(axes[e.key],.06));}
    },options);
  }
  clear(){this.points.clear();}
  dispose(){this.abort.abort();this.points.clear();}
}
