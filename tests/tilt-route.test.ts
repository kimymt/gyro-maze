import {beforeAll,it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {initPhysics,Physics} from '../src/physics';
import {levels,nearestOnRoute,spawnPosition} from '../src/levels';
import {Progress,parseSave} from '../src/state';

beforeAll(()=>initPhysics());

it('the revised third stage can pass its checkpoints and stop at the goal within 25 degrees of tilt',()=>{
 const level=levels[2],physics=new Physics(level),progress=new Progress();progress.start();
 const down=new Vector3(0,-1,0),neutral=new Vector3(...level.start.up).negate();
 const maxAngle=25*Math.PI/180,maxHorizontal=Math.tan(maxAngle)*9.81;
 let maxStep=0,maxTilt=0,farthest=0;
 try{
  for(let step=0;step<120*180&&progress.phase==='playing';step++){
   const position=new Vector3().copy(physics.ball.translation()),velocity=new Vector3().copy(physics.ball.linvel());
   const nearest=nearestOnRoute(position,level.route);
   const distance=level.route[nearest.index].distance+(level.route[nearest.index+1].distance-level.route[nearest.index].distance)*nearest.t;
   farthest=Math.max(farthest,distance);
   const target=level.route.find(node=>node.distance>=distance+.8)??level.route.at(-1)!;
   const command=new Vector3(...target.position).sub(position).multiplyScalar(8).addScaledVector(velocity,-4);
   // A bounded gravity controller: no teleports, extra force, or physics changes.
   command.addScaledVector(neutral,-command.dot(neutral)).clampLength(0,maxHorizontal);
   const gravity=neutral.clone().multiplyScalar(9.81).add(command).normalize();
   maxTilt=Math.max(maxTilt,neutral.angleTo(gravity));
   physics.step(new Quaternion().setFromUnitVectors(gravity,down));
   const next=new Vector3().copy(physics.ball.translation());
   maxStep=Math.max(maxStep,next.distanceTo(position));
   const checkpoint=level.checkpoints[progress.checkpoint+1];
   if(checkpoint&&next.distanceTo(spawnPosition(checkpoint))<level.corridorRadius+.22)progress.checkpoint++;
   progress.tick(1/120,progress.checkpoint===level.checkpoints.length-1&&next.distanceTo(spawnPosition(level.goal))<level.corridorRadius+.22,new Vector3().copy(physics.ball.linvel()).length());
  }
  expect(progress.checkpoint).toBe(level.checkpoints.length-1);
  expect(progress.phase,`stopped at ${farthest.toFixed(2)} / ${level.routeLength.toFixed(2)}; position=${JSON.stringify(physics.ball.translation())}`).toBe('result');
  expect(maxTilt).toBeLessThanOrEqual(maxAngle+1e-10);
  expect(maxStep,'no projection jump between distant parts of the course').toBeLessThan(.08);
  expect(new Vector3().copy(physics.ball.linvel()).length()).toBeLessThan(.55);
 }finally{physics.dispose();}
});

it('keeps old third-stage records separate from the revised course',()=>{
 const oldRecord={time:12,falls:0},newRecord={time:42,falls:0};
 expect(levels[2].id).not.toBe('water-wilderness');
 const oldOnly=parseSave(JSON.stringify({version:1,records:{'water-wilderness':oldRecord}}));
 expect(oldOnly.records['water-wilderness']).toEqual(oldRecord);
 expect(oldOnly.records[levels[2].id]).toBeUndefined();
 const both=parseSave(JSON.stringify({version:1,records:{'water-wilderness':oldRecord,[levels[2].id]:newRecord}}));
 expect(both.records['water-wilderness']).toEqual(oldRecord);
 expect(both.records[levels[2].id]).toEqual(newRecord);
});
