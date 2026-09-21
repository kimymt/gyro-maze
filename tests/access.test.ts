import {afterEach,expect,it,vi} from 'vitest';
import {Access,ACCESS_KEY} from '../src/access';
afterEach(()=>vi.unstubAllGlobals());
it('only courses 01-06 are free with missing or corrupt storage',()=>{
 for(const raw of [null,'{broken','{"version":2,"method":"share"}','{"version":1,"method":"unknown"}']){
  vi.stubGlobal('localStorage',{getItem:()=>raw});const access=new Access();
  for(let i=0;i<12;i++)expect(access.canPlay(i)).toBe(i<6);
 }
});
it.each(['share','breathing','gratitude','donation','lightning'] as const)('%s unlock persists without touching BEST',method=>{
 const values=new Map([['gyro-maze-save','old record']]);vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value)});
 const access=new Access();expect(access.grant(method)).toBe(true);expect(new Access().canPlay(11)).toBe(true);expect(values.get('gyro-maze-save')).toBe('old record');expect(JSON.parse(values.get(ACCESS_KEY)!)).toEqual({version:1,method});
});
it('storage denial preserves a session grant and reports persistence failure',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw Error();},setItem:()=>{throw Error();}});
 const access=new Access();expect(access.canPlay(6)).toBe(false);expect(access.grant('share')).toBe(false);expect(access.canPlay(11)).toBe(true);expect(new Access().canPlay(11)).toBe(false);
});
it('clears only retired invoice credentials when migrating',()=>{
 const values=new Map([[ACCESS_KEY,JSON.stringify({version:1,method:'lightning'})],['gyro-maze-save','old record'],['gyro-maze-lightning-v1','old invoice and token']]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key),removeItem:(key:string)=>values.delete(key)});
 expect(new Access().canPlay(11)).toBe(true);expect(values.has('gyro-maze-lightning-v1')).toBe(false);expect(values.get('gyro-maze-save')).toBe('old record');
});
