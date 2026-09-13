import type RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { BALL_RADIUS, TRACK_CENTER_LIMIT, nearestOnRoute, routeFrame, spawnPosition, type Level, type Marker } from './levels';
import { localGravity } from './state';
let ready: Promise<void> | undefined;
let engine: typeof RAPIER;
export function initPhysics() { return ready ??= import('@dimforge/rapier3d-compat').then(async module=>{engine=module.default;await engine.init();}); }
export class Physics {
  world: RAPIER.World; ball: RAPIER.RigidBody;
  private appliedGravity=new Vector3(0,-9.81,0);
  private resting=0;
  constructor(public level: Level) {
    this.world=new engine.World({x:0,y:-9.81,z:0});this.world.timestep=1/120;
    const p=spawnPosition(level.start);
    this.ball=this.world.createRigidBody(engine.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setCcdEnabled(true).setLinearDamping(.8).setAngularDamping(.5));
    this.world.createCollider(engine.ColliderDesc.ball(BALL_RADIUS).setDensity(2).setFriction(.5).setRestitution(0),this.ball);
  }
  step(q: Quaternion) {
    const g=localGravity(q);
    if(g.distanceToSquared(this.appliedGravity)>1e-12){this.ball.wakeUp();this.resting=0;this.world.gravity={x:g.x,y:g.y,z:g.z};this.appliedGravity.copy(g);}
    this.world.step();
    this.contain();
  }
  private contain(){
    if(this.ball.isSleeping())return;
    const position=new Vector3().copy(this.ball.translation());
    const nearest=nearestOnRoute(position,this.level.route),center=new Vector3(nearest.x,nearest.y,nearest.z);
    const {up,side,tangent}=routeFrame(this.level.route,nearest.index,nearest.t);
    const velocity=new Vector3().copy(this.ball.linvel());
    // The ball stays attached to the floor even when the world is upside down.
    // Reconstructing on the ribbon also removes travel beyond either end marker.
    const lateral=position.clone().sub(center).dot(side);
    const limit=Math.min(this.level.corridorRadius,TRACK_CENTER_LIMIT);
    position.copy(center).addScaledVector(side,Math.max(-limit,Math.min(limit,lateral)));
    velocity.addScaledVector(up,-velocity.dot(up));
    const sideways=velocity.dot(side);
    if((lateral<=-limit&&sideways<0)||(lateral>=limit&&sideways>0))velocity.addScaledVector(side,-sideways);
    const forward=velocity.dot(tangent);
    if((nearest.index===0&&nearest.t===0&&forward<0)||
      (nearest.index===this.level.route.length-2&&nearest.t===1&&forward>0))velocity.addScaledVector(tangent,-forward);
    velocity.clampLength(0,2.6);
    this.ball.setTranslation(position,false);this.ball.setLinvel(velocity,false);
    const spin=new Vector3().crossVectors(up,velocity).multiplyScalar(1/BALL_RADIUS);this.ball.setAngvel(spin,false);
    this.resting=velocity.lengthSq()<.0016?this.resting+this.world.timestep:0;
    if(this.resting>1.2)this.ball.sleep();
  }
  reset(m: Marker) { this.resting=0;this.ball.setTranslation(spawnPosition(m),true);this.ball.setLinvel({x:0,y:0,z:0},true);this.ball.setAngvel({x:0,y:0,z:0},true);this.ball.setRotation({x:0,y:0,z:0,w:1},true); }
  dispose() { this.world.free(); }
}
