import {describe,it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {Progress,localGravity,parseSave} from '../src/state';
describe('rotated gravity',()=>{
 it('keeps world gravity downward for arbitrary maze orientations',()=>{
  for(const axis of [new Vector3(1,0,0),new Vector3(1,2,3).normalize()])for(const angle of [0,.4,Math.PI,Math.PI*1.6]){const q=new Quaternion().setFromAxisAngle(axis,angle);expect(localGravity(q).applyQuaternion(q).distanceTo(new Vector3(0,-9.81,0))).toBeLessThan(1e-10);}
 });
 it('reverses local gravity on the underside',()=>expect(localGravity(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI)).y).toBeCloseTo(9.81));
});
describe('progress',()=>{
 it('requires continuous rest and emits completion once',()=>{const p=new Progress();p.start();p.tick(.5,true,0);p.tick(.1,false,0);expect(p.tick(.5,true,0)).toBe(false);expect(p.tick(.2,true,0)).toBe(true);expect(p.tick(1,true,0)).toBe(false);});
 it('does not count pause time or accept a fast pass through the goal',()=>{const p=new Progress();p.start();p.tick(1,true,2);p.pause();p.tick(100,true,0);expect(p.elapsed).toBe(1);p.resume();expect(p.tick(.7,true,.2)).toBe(true);});
 it('resets falls and checkpoints only on a new run',()=>{const p=new Progress();p.start();p.checkpoint=1;p.fall();expect(p.falls).toBe(1);expect(p.checkpoint).toBe(1);p.start();expect(p.falls).toBe(0);expect(p.checkpoint).toBe(-1);});
});
it('recovers from corrupt, future-version, and malformed saved records',()=>{
 for(const raw of ['{',JSON.stringify({version:2,records:{}}),'null'])expect(parseSave(raw).records).toEqual({});
 expect(parseSave(JSON.stringify({version:1,records:{'woodland-cube':{time:-1,falls:0},'water-wilderness':{time:12,falls:2}}})).records).toEqual({'water-wilderness':{time:12,falls:2}});
});
