import {beforeAll,it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {initPhysics,Physics} from '../src/physics';
import {levels,spawnPosition,nearestOnRoute} from '../src/levels';
beforeAll(()=>initPhysics());
for(const level of levels){
 it(`${level.id}: all spawn points settle on a real surface`,()=>{
  const physics=new Physics(level);
  try{for(const marker of [level.start,...level.checkpoints,level.goal]){
   physics.reset(marker);const q=new Quaternion().setFromUnitVectors(new Vector3(...marker.up),new Vector3(0,1,0));
   for(let i=0;i<90;i++)physics.step(q);
   const p=new Vector3().copy(physics.ball.translation());expect(p.distanceTo(spawnPosition(marker))).toBeLessThan(.45);
  }}finally{physics.dispose();}
 });
}
it('even an extreme velocity cannot escape the invisible boundary',()=>{
 const p=new Physics(levels[0]);try{
  p.ball.setLinvel({x:100,y:-100,z:100},true);
  p.step(new Quaternion());
  expect(nearestOnRoute(p.ball.translation(),levels[0].route).distanceSquared).toBeLessThanOrEqual((levels[0].corridorRadius+1e-5)**2);
 }finally{p.dispose();}
});
for(const idleSeconds of [0,6])it(`ball rolls after tilting and releasing following ${idleSeconds}s of rest`,()=>{
 const p=new Physics(levels[0]);
 try{
  const flat=new Quaternion();
  for(let i=0;i<idleSeconds*120;i++)p.step(flat);
  const x=p.ball.translation().x;
  // One drag changes orientation; no further input occurs during these steps.
  const tilted=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.22);
  for(let i=0;i<120;i++)p.step(tilted);
  expect(p.ball.translation().x-x).toBeGreaterThan(.2);
 }finally{p.dispose();}
});

it('unchanged gravity still allows a stationary ball to sleep',()=>{
 const p=new Physics(levels[0]);try{for(let i=0;i<720;i++)p.step(new Quaternion());expect(p.ball.isSleeping()).toBe(true);}finally{p.dispose();}
});
