import {beforeAll,it,expect} from 'vitest';
import {Quaternion,Vector3,Mesh,MeshBasicMaterial,Raycaster,DoubleSide} from 'three';
import {trackGeometries} from '../src/track';
import {initPhysics,Physics} from '../src/physics';
import {BALL_RADIUS,TRACK_WIDTH,TRACK_BEVEL,TRACK_END_PADDING,levels,nearestOnRoute,routeFrame} from '../src/levels';
beforeAll(()=>initPhysics());
const v=(p:{x:number;y:number;z:number})=>new Vector3().copy(p);
for(const level of levels){
 it(`${level.id}: reset is in contact and inverted gravity cannot lift the ball`,()=>{
  const physics=new Physics(level);
  try{for(const marker of [level.start,...level.checkpoints,level.goal]){
   physics.reset(marker);
   expect(v(physics.ball.translation()).sub(new Vector3(...marker.position)).dot(new Vector3(...marker.up))).toBeCloseTo(BALL_RADIUS,5);
   const upsideDown=new Quaternion().setFromUnitVectors(new Vector3(...marker.up),new Vector3(0,-1,0));
   for(let i=0;i<180;i++){
    physics.step(upsideDown);const p=v(physics.ball.translation()),nearest=nearestOnRoute(p,level.route),{up}=routeFrame(level.route,nearest.index,nearest.t);
    const height=p.sub(new Vector3(nearest.x,nearest.y,nearest.z)).dot(up);
    expect(Math.abs(height)).toBeLessThan(.003);
    expect(Math.abs(v(physics.ball.linvel()).dot(up))).toBeLessThan(.003);
   }
  }}finally{physics.dispose();}
 });
 it(`${level.id}: the complete ball stays inside both end caps and side edges`,()=>{
  const physics=new Physics(level);
  try{for(const end of [false,true])for(const sideSign of [-1,1]){
   const marker=end?level.goal:level.start,node=end?level.route.at(-1)!:level.route[0];
   const frame=routeFrame(level.route,end?level.route.length-2:0,end?1:0),out=frame.tangent.clone().multiplyScalar(end?1:-1);
   physics.reset(marker);physics.ball.setLinvel(out.clone().multiplyScalar(10).addScaledVector(frame.side,sideSign*5),true);
   const gravity=out.clone().addScaledVector(frame.side,sideSign).normalize();
   const q=new Quaternion().setFromUnitVectors(gravity,new Vector3(0,-1,0));
   for(let i=0;i<180;i++){
    physics.step(q);const offset=v(physics.ball.translation()).sub(new Vector3(...node.position));
    expect(offset.dot(out)).toBeLessThanOrEqual(.002);
    expect(offset.dot(out)+BALL_RADIUS).toBeLessThan(TRACK_END_PADDING);
    expect(Math.abs(offset.dot(frame.side))+BALL_RADIUS).toBeLessThanOrEqual(TRACK_WIDTH/2-TRACK_BEVEL);
    expect(Math.abs(offset.dot(frame.up))).toBeLessThan(.003);
   }
  }}finally{physics.dispose();}
 });
 it(`${level.id}: surface contact is retained throughout changing gravity`,()=>{
  const physics=new Physics(level);let seed=13;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  try{for(let n=0;n<level.route.length;n+=17){
   const node=level.route[n],up=new Vector3(...node.up);
   physics.reset({position:new Vector3(...node.position).addScaledVector(up,-BALL_RADIUS).toArray(),up:node.up});
   for(let i=0;i<40;i++){
    physics.step(new Quaternion().setFromAxisAngle(new Vector3(random()-.5,random()-.5,random()-.5).normalize(),random()*Math.PI*2));
    const p=v(physics.ball.translation()),nearest=nearestOnRoute(p,level.route),frame=routeFrame(level.route,nearest.index,nearest.t);
    const offset=p.sub(new Vector3(nearest.x,nearest.y,nearest.z));
    expect(Math.abs(offset.dot(frame.up))).toBeLessThan(.003);
    expect(Math.abs(offset.dot(frame.side))+BALL_RADIUS).toBeLessThanOrEqual(TRACK_WIDTH/2-TRACK_BEVEL);
   }
  }}finally{physics.dispose();}
 },15000); // Exhaustive samples grow with route length; retain the same contact tolerances.
}

for(const level of levels)it(`${level.id}: visible endpoint decks support the complete sphere footprint`,()=>{
 const tracks=trackGeometries(level),material=new MeshBasicMaterial({side:DoubleSide});
 try{for(const end of [false,true]){
  const node=end?level.route.at(-1)!:level.route[0],frame=routeFrame(level.route,end?level.route.length-2:0,end?1:0);
  const deck=new Mesh((end?tracks.at(-1)!:tracks[0]).geometry,material);deck.updateMatrixWorld(true);
  for(const sideSign of [-1,1]){
   const origin=new Vector3(...node.position).addScaledVector(frame.tangent,(end?1:-1)*BALL_RADIUS)
    .addScaledVector(frame.side,sideSign*(TRACK_WIDTH/2-TRACK_BEVEL-.01)).addScaledVector(frame.up,.1);
   const hits=new Raycaster(origin,frame.up.clone().negate()).intersectObject(deck);
   expect(hits.length).toBeGreaterThan(0);expect(hits[0].distance).toBeCloseTo(.1+BALL_RADIUS,4);
  }
 }}finally{for(const {geometry} of tracks)geometry.dispose();material.dispose();}
});
