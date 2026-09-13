import {beforeAll,it,expect} from 'vitest';
import {Vector3,Quaternion} from 'three';
import {initPhysics,Physics} from '../src/physics';
import {levels,nearestOnRoute,routeFrame,spawnPosition} from '../src/levels';
beforeAll(()=>initPhysics());
for(const level of levels)it(`${level.id}: outside and interior route can be completed with gravity alone`,()=>{
 const physics=new Physics(level);let checkpoint=0,maxStep=0;
 try{
  for(let waypoint=1;waypoint<level.route.length;waypoint++){
   const node=level.route[waypoint],destination=new Vector3(...node.position);
   let reached=false;
   for(let step=0;step<1800;step++){
    const p=new Vector3().copy(physics.ball.translation()),velocity=new Vector3().copy(physics.ball.linvel());
    const error=destination.clone().sub(p);
    const nearest=nearestOnRoute(p,level.route);const {up:supportUp}=routeFrame(level.route,nearest.index,nearest.t);
    if(error.length()<.2){reached=true;break;}
    const gravity=error.multiplyScalar(12).addScaledVector(velocity,-5).addScaledVector(supportUp,-3).normalize();
    physics.step(new Quaternion().setFromUnitVectors(gravity,new Vector3(0,-1,0)));
    maxStep=Math.max(maxStep,p.distanceTo(new Vector3().copy(physics.ball.translation())));
    const cp=level.checkpoints[checkpoint];if(cp&&p.distanceTo(spawnPosition(cp))<level.corridorRadius+.22)checkpoint++;
   }
   expect(reached,`waypoint ${waypoint}: ${JSON.stringify(physics.ball.translation())}, target ${destination.toArray()}`).toBe(true);
  }
  expect(checkpoint).toBe(level.checkpoints.length);
  expect(maxStep,'no position snap while crossing a face').toBeLessThan(.08);
  expect(new Vector3().copy(physics.ball.translation()).distanceTo(spawnPosition(level.goal))).toBeLessThan(level.corridorRadius+.22);
 }finally{physics.dispose();}
});
for(const level of levels)it(`${level.id}: arbitrary rotations cannot eject the ball`,()=>{
 const physics=new Physics(level);let seed=9;
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 try{
  for(const marker of [level.start,...level.checkpoints,level.goal]){
   physics.reset(marker);
   for(let i=0;i<1800;i++){
    const q=new Quaternion().setFromAxisAngle(new Vector3(random()-.5,random()-.5,random()-.5).normalize(),random()*Math.PI*2);
    physics.step(q);
    const p=physics.ball.translation();expect(Number.isFinite(p.x+p.y+p.z)).toBe(true);
    expect(nearestOnRoute(p,level.route).distanceSquared).toBeLessThanOrEqual((level.corridorRadius+1e-5)**2);
   }
  }
 }finally{physics.dispose();}
});
it('worlds become larger and longer, and every route visits both the outside and the inside',()=>{
 for(let i=0;i<levels.length;i++){
  const level=levels[i];if(i){expect(level.halfSize).toBeGreaterThan(levels[i-1].halfSize);expect(level.routeLength).toBeGreaterThan(levels[i-1].routeLength);}
  expect(level.route.some(n=>Math.max(...n.position.map(Math.abs))>level.halfSize)).toBe(true);
  expect(level.route.some(n=>Math.max(...n.position.map(Math.abs))<level.halfSize*.65)).toBe(true);
 }
});
