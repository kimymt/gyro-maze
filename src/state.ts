import { Quaternion, Vector3 } from 'three';
import { levelDefinitions } from './levels';
const recordIds=new Set([...levelDefinitions.map(level=>level.id),'water-wilderness']);
export type Phase = 'select' | 'playing' | 'paused' | 'result';
export function localGravity(orientation: Quaternion): Vector3 { return new Vector3(0,-9.81,0).applyQuaternion(orientation.clone().invert()); }
export class Progress {
  phase: Phase = 'select'; elapsed=0; falls=0; checkpoint=-1; goalDwell=0;
  start() { this.phase='playing';this.elapsed=0;this.falls=0;this.checkpoint=-1;this.goalDwell=0; }
  tick(dt: number, atGoal: boolean, speed: number) {
    if(this.phase!=='playing') return false;
    this.elapsed+=dt;
    this.goalDwell=atGoal&&speed<.55 ? this.goalDwell+dt : 0;
    if(this.goalDwell>=.65) { this.phase='result'; return true; } return false;
  }
  fall() { if(this.phase==='playing'){ this.falls++;this.goalDwell=0; } }
  pause() { if(this.phase==='playing') this.phase='paused'; }
  resume() { if(this.phase==='paused') this.phase='playing'; }
}
export interface RecordEntry { time: number; falls: number }
export interface SaveData { version: 1; records: Record<string, RecordEntry>; quality: 'auto'|'low'; }
export const SAVE_KEY='gyro-maze-save';
export function parseSave(raw: string|null): SaveData {
  const clean: SaveData={version:1,records:{},quality:'auto'};
  try { const data=JSON.parse(raw??'null');
    if(data?.version!==1) return clean;
    if(data.quality==='low') clean.quality='low';
    for(const [key,value] of Object.entries(data.records??{})) {
      const r=value as RecordEntry;
      if(recordIds.has(key)&&r&&Number.isFinite(r.time)&&r.time>=0&&Number.isInteger(r.falls)&&r.falls>=0) clean.records[key]={time:r.time,falls:r.falls};
    }
  } catch { /* Corrupt or unavailable storage must not prevent play. */ } return clean;
}
export function formatTime(seconds: number) { const s=Math.floor(seconds);return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
