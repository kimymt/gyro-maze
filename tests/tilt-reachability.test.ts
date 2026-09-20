import {afterEach, beforeAll, expect, it, vi} from 'vitest';
import {PerspectiveCamera, Quaternion, Vector3} from 'three';
import {levels, nearestOnRoute, routeFrame, spawnPosition} from '../src/levels';
import {initPhysics, Physics} from '../src/physics';
import {Scene} from '../src/scene';
import {localGravity, Progress} from '../src/state';
import {orientationGravity, TiltInput} from '../src/tilt';

const RAD = Math.PI / 180;
beforeAll(() => initPhysics());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function headlessScene() {
  // Exercise the production camera/rotation methods without constructing WebGL.
  const scene = Object.create(Scene.prototype) as Scene;
  Object.assign(scene, {camera: new PerspectiveCamera(), orientation: new Quaternion(), zoom: 1, baseDistance: 1});
  scene.updateCamera();
  return scene;
}

function reachableCommands(levelIndex: number, beta: number) {
  const level = levels[levelIndex], camera = headlessScene().camera.quaternion.clone(), inverseCamera = camera.clone().invert();
  const base = new Quaternion().setFromUnitVectors(new Vector3(...level.start.up), new Vector3(0, 1, 0));
  const neutral = orientationGravity(beta, 0);
  const commands: {beta: number; gamma: number; gravity: Vector3}[] = [];
  // Both Euler coordinates and the gravity-vector offset stay within 28 degrees.
  // This is a deliberately conservative subset of the controller's full range.
  for (let b = beta - 28; b <= beta + 28; b += 2) for (let gamma = -28; gamma <= 28; gamma += 2) {
    const current = orientationGravity(b, gamma), angle = current.angleTo(neutral);
    if (angle > 28 * RAD || angle > 0 && angle < 1.5 * RAD) continue;
    const delta = new Quaternion().setFromUnitVectors(current, neutral);
    const pose = camera.clone().multiply(delta).multiply(inverseCamera).multiply(base);
    commands.push({beta: b, gamma, gravity: localGravity(pose).normalize()});
  }
  return {commands, base};
}

it.each([{levelIndex: 0, beta: 45}, {levelIndex: 1, beta: 45}, ...[30, 45, 60].map(beta => ({levelIndex: 2, beta}))])('actual camera-space input can drive stage index $levelIndex from a beta $beta-degree holding position', async ({levelIndex, beta}) => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']});
  const sensorWindow = Object.assign(new EventTarget(), {performance, screen: {orientation: Object.assign(new EventTarget(), {angle: 0})}});
  vi.stubGlobal('window', sensorWindow);
  vi.stubGlobal('document', Object.assign(new EventTarget(), {visibilityState: 'visible'}));
  const problem = vi.fn(), input = new TiltInput(problem);
  const emit = (b: number, gamma: number) => sensorWindow.dispatchEvent(Object.assign(new Event('deviceorientation'), {beta: b, gamma, alpha: null}));
  const starting = input.start(); emit(beta, 0); await starting;
  const {commands, base} = reachableCommands(levelIndex, beta);
  const level = levels[levelIndex], physics = new Physics(level), progress = new Progress(); progress.start();
  const scene = headlessScene(); scene.orientation.copy(base);
  const pose = scene.orientation, neutral = localGravity(base).normalize();
  let farthest = 0, maxStep = 0, maxAngle = 0, maxFloorError = 0, maxSpeed = 0;
  try {
    // Every sampled path tangent has a strictly forward sensor-reachable gravity.
    // This is a constructive check, not an assertion that all headings are reachable.
    const minimumForwardGravity = Math.min(...level.route.map(node => Math.max(...commands.map(command => command.gravity.dot(new Vector3(...node.tangent))))));
    expect(minimumForwardGravity).toBeGreaterThan(.02);
    for (let frame = 0; frame < 60 * 180 && progress.phase === 'playing'; frame++) {
      const position = new Vector3().copy(physics.ball.translation()), velocity = new Vector3().copy(physics.ball.linvel());
      const nearest = nearestOnRoute(position, level.route);
      const distance = level.route[nearest.index].distance + (level.route[nearest.index + 1].distance - level.route[nearest.index].distance) * nearest.t;
      farthest = Math.max(farthest, distance);
      const target = level.route.find(node => node.distance >= distance + .8) ?? level.route.at(-1)!;
      const command = new Vector3(...target.position).sub(position).multiplyScalar(8).addScaledVector(velocity, -4);
      command.addScaledVector(neutral, -command.dot(neutral)).clampLength(0, Math.tan(25 * RAD) * 9.81);
      const desired = neutral.clone().multiplyScalar(9.81).add(command).normalize();
      let best = commands[0], bestScore = -Infinity;
      for (const candidate of commands) {
        const score = candidate.gravity.dot(desired);
        if (score > bestScore) { bestScore = score; best = candidate; }
      }
      emit(best.beta, best.gamma);
      sensorWindow.dispatchEvent(Object.assign(new Event('devicemotion'), {accelerationIncludingGravity: {x: 0, y: 0, z: 9.81}, rotationRate: null}));
      const delta = input.update(1 / 60);
      if (delta) scene.rotate(delta);
      maxAngle = Math.max(maxAngle, pose.angleTo(base));
      for (let substep = 0; substep < 2; substep++) {
        const before = new Vector3().copy(physics.ball.translation());
        physics.step(pose);
        const next = new Vector3().copy(physics.ball.translation());
        maxStep = Math.max(maxStep, next.distanceTo(before));
        const contact = nearestOnRoute(next, level.route), frame = routeFrame(level.route, contact.index, contact.t);
        maxFloorError = Math.max(maxFloorError, Math.abs(next.clone().sub(new Vector3(contact.x, contact.y, contact.z)).dot(frame.up)));
        maxSpeed = Math.max(maxSpeed, new Vector3().copy(physics.ball.linvel()).length());
        const checkpoint = level.checkpoints[progress.checkpoint + 1];
        if (checkpoint && next.distanceTo(spawnPosition(checkpoint)) < level.corridorRadius + .22) progress.checkpoint++;
        progress.tick(1 / 120, progress.checkpoint === level.checkpoints.length - 1 && next.distanceTo(spawnPosition(level.goal)) < level.corridorRadius + .22, new Vector3().copy(physics.ball.linvel()).length());
      }
    }
    console.log(JSON.stringify({stage: level.number, beta, candidates: commands.length, minimumForwardGravity, elapsed: progress.elapsed, farthest, routeLength: level.routeLength, phase: progress.phase, checkpoint: progress.checkpoint, maxStep, maxFloorError, maxSpeed, maxAngleDegrees: maxAngle / RAD}));
    expect(progress.phase, `beta=${beta}; farthest=${farthest.toFixed(2)}; position=${JSON.stringify(physics.ball.translation())}`).toBe('result');
    expect(maxStep).toBeLessThan(.08);
    // Same tolerance as attachment.test.ts: the route is a sampled curved ribbon.
    expect(maxFloorError).toBeLessThan(.003);
    expect(maxSpeed).toBeLessThanOrEqual(2.600001);
    expect(maxAngle).toBeLessThanOrEqual(28 * RAD + 1e-8);
    expect(problem).not.toHaveBeenCalled();
  } finally { input.stop(); physics.dispose(); }
}, 30000);
