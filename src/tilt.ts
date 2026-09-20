import {MathUtils, Quaternion, Vector3} from 'three';

const RAD = Math.PI / 180;
const MAX_ANGLE = 28 * RAD;
const DEAD_ENTER = 1.5 * RAD;
const DEAD_EXIT = 1 * RAD;
const TARGET_NOISE = .15 * RAD;
const SETTLED = .01 * RAD;
const RESPONSE_SECONDS = .09;
const MAX_SPEED = 75 * RAD;
const INITIAL_TIMEOUT_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 2000;
const INVALID_TIMEOUT_MS = 1000;
const IDENTITY = new Quaternion();
const SCREEN_AXIS = new Vector3(0, 0, 1);

// Gravity expressed in device axes; independent of compass/alpha and continuous at beta ±180°.
export function orientationGravity(beta: number, gamma: number): Vector3 {
  const b = beta * RAD, g = gamma * RAD;
  return new Vector3(-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g));
}

function screenAngle(): number {
  const angle = window.screen?.orientation?.angle ?? (window as Window & {orientation?: number}).orientation ?? 0;
  return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0;
}

export class TiltInput {
  private generation = 0;
  private listening = false;
  private initialized = false;
  private cleanup: (() => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private neutral = new Vector3();
  private current = new Vector3();
  private target = new Quaternion();
  private offset = new Quaternion();
  private engaged = false;
  private angle = 0;
  private lastMotion = 0;
  private invalidOrientationSince: number | null = null;
  private invalidMotionSince: number | null = null;
  private invalidOrientationCount = 0;
  private invalidMotionCount = 0;

  constructor(private onProblem: (message: string) => void) {}

  start(): Promise<void> {
    this.stop();
    if (document.visibilityState === 'hidden') return Promise.reject(new Error('画面を開いてから傾き操作を開始してください。'));
    const generation = this.generation;
    this.listening = true;
    this.angle = screenAngle();
    this.lastMotion = performance.now();
    this.invalidOrientationSince = this.invalidMotionSince = null;
    this.invalidOrientationCount = this.invalidMotionCount = 0;
    return new Promise<void>((resolve, reject) => {
      this.pendingReject = reject;
      const currentSession = () => this.listening && this.generation === generation;
      const orientation = (event: DeviceOrientationEvent) => {
        if (!currentSession()) return;
        if (screenAngle() !== this.angle) { this.fail('画面の向きが変わったため一時停止しました。持ち方を決めて再開してください。'); return; }
        const {beta, gamma} = event;
        if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma) || Math.abs(beta) > 180 || Math.abs(gamma) > 90) {
          this.invalidOrientationSince ??= performance.now();
          this.invalidOrientationCount++;
          return;
        }
        this.invalidOrientationSince = null;
        this.invalidOrientationCount = 0;
        this.current.copy(orientationGravity(beta, gamma));
        if (!this.initialized) {
          this.initialized = true;
          this.recalibrate();
          this.pendingReject = null;
          clearTimeout(initialTimeout);
          resolve();
        }
      };
      const motion = (event: DeviceMotionEvent) => {
        if (!currentSession()) return;
        const values = [event.accelerationIncludingGravity?.x, event.accelerationIncludingGravity?.y, event.accelerationIncludingGravity?.z,
          event.rotationRate?.alpha, event.rotationRate?.beta, event.rotationRate?.gamma];
        if (!values.some(value => typeof value === 'number' && Number.isFinite(value))) {
          this.invalidMotionSince ??= performance.now();
          this.invalidMotionCount++;
          return;
        }
        this.invalidMotionSince = null;
        this.invalidMotionCount = 0;
        this.lastMotion = performance.now();
      };
      const visibility = () => { if (currentSession() && document.visibilityState === 'hidden') this.fail('画面を離れたため一時停止しました。'); };
      const direction = () => { if (currentSession() && screenAngle() !== this.angle) this.fail('画面の向きが変わったため一時停止しました。持ち方を決めて再開してください。'); };
      const initialTimeout = setTimeout(() => { if (currentSession()) this.fail('端末の傾きを取得できませんでした。指操作で遊べます。'); }, INITIAL_TIMEOUT_MS);
      const watchdog = setInterval(() => {
        if (!currentSession()) return;
        const now = performance.now();
        if (this.invalidOrientationCount >= 3 && this.invalidOrientationSince !== null && now - this.invalidOrientationSince >= INVALID_TIMEOUT_MS ||
          this.invalidMotionCount >= 3 && this.invalidMotionSince !== null && now - this.invalidMotionSince >= INVALID_TIMEOUT_MS) {
          this.fail('端末の動きを読み取れなくなったため一時停止しました。');
        } else if (this.initialized && now - this.lastMotion >= HEARTBEAT_TIMEOUT_MS) {
          this.fail('端末の動きが届かなくなったため一時停止しました。');
        }
      }, 250);
      window.addEventListener('deviceorientation', orientation);
      window.addEventListener('devicemotion', motion);
      window.addEventListener('orientationchange', direction);
      window.screen?.orientation?.addEventListener('change', direction);
      document.addEventListener('visibilitychange', visibility);
      this.cleanup = () => {
        clearTimeout(initialTimeout);
        clearInterval(watchdog);
        window.removeEventListener('deviceorientation', orientation);
        window.removeEventListener('devicemotion', motion);
        window.removeEventListener('orientationchange', direction);
        window.screen?.orientation?.removeEventListener('change', direction);
        document.removeEventListener('visibilitychange', visibility);
      };
    });
  }

  stop(): void {
    this.generation++;
    this.listening = false;
    this.initialized = false;
    this.cleanup?.();
    this.cleanup = null;
    const reject = this.pendingReject;
    this.pendingReject = null;
    reject?.(new Error('傾き操作の開始を中止しました。'));
    this.target.identity();
    this.offset.identity();
    this.engaged = false;
  }

  // Rebase the controller only. The maze and ball remain where the player left them.
  recalibrate(): void {
    if (!this.listening || !this.initialized) return;
    this.neutral.copy(this.current);
    this.target.identity();
    this.offset.identity();
    this.engaged = false;
  }

  update(dt: number): Quaternion | null {
    if (!this.listening || !this.initialized || !Number.isFinite(dt) || dt <= 0) return null;
    const candidate = new Quaternion().setFromUnitVectors(this.current, this.neutral);
    // Screen angle is the physical counter-clockwise turn: at 90°, device +X is screen +Y.
    const screenRotation = new Quaternion().setFromAxisAngle(SCREEN_AXIS, this.angle * RAD);
    candidate.premultiply(screenRotation).multiply(screenRotation.invert()).normalize();
    const angle = IDENTITY.angleTo(candidate);
    if (angle <= DEAD_EXIT) this.engaged = false;
    else if (angle >= DEAD_ENTER) this.engaged = true;
    if (!this.engaged) candidate.identity();
    else if (angle > MAX_ANGLE) candidate.slerp(IDENTITY, 1 - MAX_ANGLE / angle);
    // Hysteresis also suppresses tiny fluctuations while holding a non-neutral tilt.
    if (this.target.angleTo(candidate) > TARGET_NOISE || !this.engaged && this.target.angleTo(IDENTITY) > 0) this.target.copy(candidate);
    if (this.offset.equals(this.target)) return null;
    const remaining = this.offset.angleTo(this.target);
    if (remaining < 1e-8) return null;
    const next = this.offset.clone();
    const elapsed = MathUtils.clamp(dt, 0, .05);
    const step = Math.min(remaining * (1 - Math.exp(-elapsed / RESPONSE_SECONDS)), MAX_SPEED * elapsed);
    if (remaining <= SETTLED && remaining <= MAX_SPEED * elapsed) next.copy(this.target);
    else next.slerp(this.target, step / remaining);
    const delta = next.clone().multiply(this.offset.clone().invert()).normalize();
    this.offset.copy(next);
    return delta;
  }

  private fail(message: string): void {
    const initialized = this.initialized;
    const reject = this.pendingReject;
    this.pendingReject = null;
    this.stop();
    reject?.(new Error(message));
    if (initialized) this.onProblem(message);
  }
}
