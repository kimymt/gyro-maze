import {it,expect} from 'vitest';
import {Vector3} from 'three';
import {levels,routeFrame} from '../src/levels';
const degrees=(a:Vector3,b:Vector3)=>a.angleTo(b)*180/Math.PI;
for(const level of levels){
 it(`${level.id}: face transitions have no support flips or coarse gaps`,()=>{
  const route=level.route;
  for(let i=0;i<route.length-1;i++){
   const a=route[i],b=route[i+1],gap=new Vector3(...a.position).distanceTo(new Vector3(...b.position));
   expect(gap).toBeGreaterThan(0);expect(gap).toBeLessThanOrEqual(.051);
   expect(degrees(new Vector3(...a.up),new Vector3(...b.up))).toBeLessThan(12);
   for(const t of [0,.25,.5,.75,1]){
    const {up,tangent,side}=routeFrame(route,i,t);
    for(const vector of [up,tangent,side]){expect(Number.isFinite(vector.x+vector.y+vector.z)).toBe(true);expect(vector.length()).toBeCloseTo(1,8);}
    expect(Math.abs(up.dot(tangent))).toBeLessThan(1e-8);
   }
  }
 });
 it(`${level.id}: crossing a segment boundary does not jump the floor direction`,()=>{
  for(let i=1;i<level.route.length-1;i++){
   const before=routeFrame(level.route,i-1,1-1e-6),after=routeFrame(level.route,i,1e-6);
   expect(degrees(before.up,after.up)).toBeLessThan(.001);
   expect(degrees(before.tangent,after.tangent)).toBeLessThan(.001);
  }
 });
}
