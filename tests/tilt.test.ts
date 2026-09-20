import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Quaternion, Vector3} from 'three';
import {orientationGravity, TiltInput} from '../src/tilt';
import {requestTiltPermission} from '../src/tilt-permission';

const RAD = Math.PI / 180;
let sensorWindow: EventTarget & {screen: {orientation: EventTarget & {angle: number}}; isSecureContext: boolean; DeviceOrientationEvent: object; DeviceMotionEvent: object};
let sensorDocument: EventTarget & {visibilityState: string};
let controllers: TiltInput[];

beforeEach(() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance']});
  sensorWindow = Object.assign(new EventTarget(), {screen: {orientation: Object.assign(new EventTarget(), {angle: 0})}, isSecureContext: true, DeviceOrientationEvent: {}, DeviceMotionEvent: {}});
  sensorDocument = Object.assign(new EventTarget(), {visibilityState: 'visible'});
  vi.stubGlobal('window', sensorWindow);
  vi.stubGlobal('document', sensorDocument);
  controllers = [];
});
afterEach(() => { controllers.forEach(controller => controller.stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });

function orientation(beta: number | null, gamma: number | null, alpha: number | null = null) {
  sensorWindow.dispatchEvent(Object.assign(new Event('deviceorientation'), {beta, gamma, alpha}));
}
function heartbeat() {
  sensorWindow.dispatchEvent(Object.assign(new Event('devicemotion'), {accelerationIncludingGravity: {x: 0, y: 0, z: 9.81}, rotationRate: null}));
}
function controller(problem = vi.fn()) { const input = new TiltInput(problem); controllers.push(input); return input; }
async function started(beta = 0, gamma = 0, problem = vi.fn()) {
  const input = controller(problem), promise = input.start();
  heartbeat(); orientation(beta, gamma); await promise; return input;
}
function run(input: TiltInput, frames = 180, dt = 1 / 60, result = new Quaternion()) {
  for (let i = 0; i < frames; i++) { const delta = input.update(dt); if (delta) result.premultiply(delta); }
  return result.normalize();
}

it('gravity has unit length, ignores compass heading, and is continuous across beta wrap', () => {
  for (const beta of [-180, -90, 0, 60, 179.9]) for (const gamma of [-90, -30, 0, 90]) {
    expect(orientationGravity(beta, gamma).length()).toBeCloseTo(1, 12);
  }
  expect(orientationGravity(179.9, 30).angleTo(orientationGravity(-179.9, 30))).toBeCloseTo(.2 * RAD, 8);
});

it('does not subscribe or request permission just by constructing a controller', () => {
  const listen = vi.spyOn(sensorWindow, 'addEventListener');
  const request = vi.fn(); sensorWindow.DeviceOrientationEvent = {requestPermission: request};
  expect(controller().update(1 / 60)).toBeNull();
  expect(listen).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});

it('starts neutral at the current holding position and rejects small hand tremor', async () => {
  const input = await started(60, 12);
  for (let i = 0; i < 120; i++) {
    orientation(60 + Math.sin(i) * .6, 12 + Math.cos(i) * .6, i * 17);
    expect(input.update(1 / 60)).toBeNull();
  }
});

it('tracks physical screen tilt, stays bounded while held, then returns to neutral', async () => {
  const input = await started();
  orientation(20, 0);
  const pose = run(input);
  expect(pose.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 20 * RAD))).toBeLessThan(1e-6);
  for (let i = 0; i < 120; i++) { orientation(20 + Math.sin(i) * .05, 0); expect(input.update(1 / 60)).toBeNull(); }
  orientation(0, 0);
  run(input, 180, 1 / 60, pose);
  expect(pose.angleTo(new Quaternion())).toBeLessThan(1e-6);
  expect(input.update(1 / 60)).toBeNull();
});

it('caps large input at 28 degrees and limits a sudden frame rotation', async () => {
  const input = await started(); orientation(120, 0);
  const first = input.update(1 / 60)!;
  expect(first.angleTo(new Quaternion())).toBeLessThanOrEqual(75 * RAD / 60 + 1e-8);
  const pose = run(input, 180, 1 / 60, first);
  expect(pose.angleTo(new Quaternion())).toBeCloseTo(28 * RAD, 7);
  expect(input.update(1 / 60)).toBeNull();
});

it('converges consistently at 30, 60 and 120 frames per second', async () => {
  const poses: Quaternion[] = [];
  for (const rate of [30, 60, 120]) {
    const input = await started(); orientation(22, 10);
    poses.push(run(input, rate * 2, 1 / rate)); input.stop();
  }
  expect(poses[0].angleTo(poses[1])).toBeLessThan(.01 * RAD);
  expect(poses[0].angleTo(poses[2])).toBeLessThan(.01 * RAD);
});

it('rebases without undoing already applied maze rotation', async () => {
  const input = await started(); orientation(18, 0); const maze = run(input);
  input.recalibrate(); expect(input.update(1 / 60)).toBeNull();
  orientation(18, 0); expect(input.update(1 / 60)).toBeNull();
  orientation(23, 0); run(input, 180, 1 / 60, maze);
  expect(maze.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 23 * RAD))).toBeLessThan(1e-6);
});

it('crosses beta ±180 without generating a large rotation', async () => {
  const input = await started(179, 0); orientation(-179, 0);
  expect(run(input).angleTo(new Quaternion())).toBeCloseTo(2 * RAD, 8);
});

it.each([
  {angle: 90, beta: 12, gamma: 0, axis: new Vector3(0, 1, 0)},
  {angle: 270, beta: 12, gamma: 0, axis: new Vector3(0, -1, 0)},
  {angle: 90, beta: 0, gamma: 12, axis: new Vector3(-1, 0, 0)},
  {angle: 270, beta: 0, gamma: 12, axis: new Vector3(1, 0, 0)},
])('maps beta=$beta gamma=$gamma onto the physical screen axis at $angle degrees', async ({angle, beta, gamma, axis}) => {
  // A counter-clockwise 90° turn puts the device right edge at screen top,
  // while a 270° turn puts it at screen bottom. Expectations use those physical axes.
  sensorWindow.screen.orientation.angle = angle;
  const landscape = await started(); orientation(beta, gamma);
  const expected = new Quaternion().setFromAxisAngle(axis, 12 * RAD);
  expect(run(landscape).angleTo(expected)).toBeLessThan(1e-6);
});

it('ignores isolated invalid samples, invalid dt and compass changes', async () => {
  const input = await started();
  orientation(Number.NaN, 0); orientation(null, null); orientation(181, 0);
  expect(input.update(1 / 60)).toBeNull(); orientation(0, 0, 270);
  expect(input.update(1 / 60)).toBeNull(); orientation(25, 0);
  for (const dt of [0, -1, Number.NaN, Infinity]) expect(input.update(dt)).toBeNull();
  expect(input.update(100)!.angleTo(new Quaternion())).toBeLessThanOrEqual(75 * RAD * .05 + 1e-8);
});

it('does not mistake unchanged orientation for a stalled sensor when motion heartbeats arrive', async () => {
  const problem = vi.fn(), input = await started(0, 0, problem);
  for (let i = 0; i < 20; i++) { heartbeat(); vi.advanceTimersByTime(500); }
  expect(problem).not.toHaveBeenCalled(); orientation(10, 0);
  expect(input.update(1 / 60)).not.toBeNull();
});

it('does not treat a single bad orientation event as a continuous sensor fault', async () => {
  const problem = vi.fn(), input = await started(0, 0, problem);
  orientation(null, null);
  for (let i = 0; i < 8; i++) { heartbeat(); vi.advanceTimersByTime(500); }
  expect(problem).not.toHaveBeenCalled(); orientation(10, 0);
  expect(input.update(1 / 60)).not.toBeNull();
});

it('releases every subscription and timer on stop', async () => {
  const removeWindow = vi.spyOn(sensorWindow, 'removeEventListener');
  const removeScreen = vi.spyOn(sensorWindow.screen.orientation, 'removeEventListener');
  const removeDocument = vi.spyOn(sensorDocument, 'removeEventListener');
  const input = await started(); expect(vi.getTimerCount()).toBe(1);
  input.stop();
  expect(removeWindow.mock.calls.map(call => call[0]).sort()).toEqual(['devicemotion', 'deviceorientation', 'orientationchange']);
  expect(removeScreen.mock.calls[0][0]).toBe('change');
  expect(removeDocument.mock.calls[0][0]).toBe('visibilitychange');
  expect(vi.getTimerCount()).toBe(0);
});

it('stops once motion heartbeats stop and cannot apply stale rotation afterward', async () => {
  const problem = vi.fn(), input = await started(0, 0, problem);
  orientation(20, 0); vi.advanceTimersByTime(2000);
  expect(problem).toHaveBeenCalledTimes(1); expect(problem.mock.calls[0][0]).toContain('届かなく');
  heartbeat(); orientation(30, 0); expect(input.update(1 / 60)).toBeNull();
  vi.advanceTimersByTime(10000); expect(problem).toHaveBeenCalledTimes(1);
});

it('stops after continuously invalid orientation data', async () => {
  const problem = vi.fn(), input = await started(0, 0, problem);
  for (let i = 0; i < 5; i++) { orientation(null, null); heartbeat(); vi.advanceTimersByTime(250); }
  expect(problem).toHaveBeenCalledTimes(1); expect(input.update(1 / 60)).toBeNull();
});

it('stops after motion events lose all usable values', async () => {
  const problem = vi.fn(), input = await started(0, 0, problem);
  for (let i = 0; i < 5; i++) {
    sensorWindow.dispatchEvent(Object.assign(new Event('devicemotion'), {accelerationIncludingGravity: null, rotationRate: null}));
    vi.advanceTimersByTime(250);
  }
  expect(problem).toHaveBeenCalledTimes(1); expect(input.update(1 / 60)).toBeNull();
});

it.each(['direction', 'visibility'])('stops on %s change and does not auto-resume', async kind => {
  const problem = vi.fn(), input = await started(0, 0, problem);
  if (kind === 'direction') { sensorWindow.screen.orientation.angle = 90; sensorWindow.screen.orientation.dispatchEvent(new Event('change')); }
  else { sensorDocument.visibilityState = 'hidden'; sensorDocument.dispatchEvent(new Event('visibilitychange')); }
  expect(problem).toHaveBeenCalledTimes(1); sensorDocument.visibilityState = 'visible';
  orientation(15, 0); heartbeat(); expect(input.update(1 / 60)).toBeNull();
});

it('times out waiting for the first finite orientation and cleans up', async () => {
  const problem = vi.fn(), input = controller(problem), pending = expect(input.start()).rejects.toThrow('取得できません');
  vi.advanceTimersByTime(5000); await pending;
  orientation(15, 0); expect(input.update(1 / 60)).toBeNull(); expect(problem).not.toHaveBeenCalled();
});

it('cancels a pending start and discards its late sensor events', async () => {
  const input = controller(), pending = expect(input.start()).rejects.toThrow('中止'); input.stop();
  orientation(15, 0); heartbeat(); await pending; expect(input.update(1 / 60)).toBeNull();
  const second = input.start(); orientation(35, 0); heartbeat(); await second;
  expect(input.update(1 / 60)).toBeNull();
});

it('a second start replaces the first subscription and uses a fresh neutral', async () => {
  const input = controller(), first = expect(input.start()).rejects.toThrow('中止');
  const second = input.start(); await first; orientation(45, 0); heartbeat(); await second;
  expect(input.update(1 / 60)).toBeNull(); orientation(55, 0);
  expect(run(input).angleTo(new Quaternion())).toBeCloseTo(10 * RAD, 8);
});

describe('permission requests', () => {
  it('starts both platform requests synchronously within the button activation', async () => {
    let release!: (value: string) => void;
    const orientationRequest = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const motionRequest = vi.fn(() => Promise.resolve('granted'));
    sensorWindow.DeviceOrientationEvent = {requestPermission: orientationRequest};
    sensorWindow.DeviceMotionEvent = {requestPermission: motionRequest};
    const pending = requestTiltPermission();
    expect(orientationRequest).toHaveBeenCalledTimes(1); expect(motionRequest).toHaveBeenCalledTimes(1);
    release('granted'); await pending;
  });
  it('still starts the second request when the first throws synchronously', async () => {
    sensorWindow.DeviceOrientationEvent = {requestPermission: () => { throw new Error('denied'); }};
    const motionRequest = vi.fn(() => Promise.resolve('granted')); sensorWindow.DeviceMotionEvent = {requestPermission: motionRequest};
    await expect(requestTiltPermission()).rejects.toThrow('許可されません'); expect(motionRequest).toHaveBeenCalledTimes(1);
  });
  it('handles rejection or denial using a Japanese fallback message', async () => {
    sensorWindow.DeviceOrientationEvent = {requestPermission: () => Promise.resolve('denied')};
    sensorWindow.DeviceMotionEvent = {requestPermission: () => Promise.reject(new Error('blocked'))};
    await expect(requestTiltPermission()).rejects.toThrow('指操作で遊べます');
  });
  it('allows platforms without explicit requestPermission methods', async () => { await expect(requestTiltPermission()).resolves.toBeUndefined(); });
  it('returns a readable fallback when the sensor interfaces are unavailable', async () => {
    sensorWindow.DeviceOrientationEvent = undefined as unknown as object;
    await expect(requestTiltPermission()).rejects.toThrow('対応していません');
  });
  it('rejects an insecure context before starting requests', async () => {
    sensorWindow.isSecureContext = false;
    await expect(requestTiltPermission()).rejects.toThrow('HTTPS');
  });
});
