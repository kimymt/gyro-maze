// Local-only integration check. Creates no invoice and transfers no money.
import {finalizeEvent,generateSecretKey,getPublicKey} from 'nostr-tools/pure';
import {bech32} from '@scure/base';
import {createHash} from 'node:crypto';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const hash=text=>createHash('sha256').update(text).digest('hex');
const id='c'.repeat(48),secret='d'.repeat(48),origin='http://localhost:8787';
const key=generateSecretKey(),recipient=getPublicKey(generateSecretKey());
const request=JSON.stringify(finalizeEvent({kind:9734,created_at:1,content:`GYRO support ${id}`,tags:[['p',recipient],['amount','1000']]},generateSecretKey()));
const n=(value,length)=>Array.from({length},(_,i)=>Math.floor(value/32**(length-i-1))%32);
const tag=bech32.toWords(new Uint8Array(Buffer.from(hash(request),'hex')));
const invoice=bech32.encode('lnbc10000p',[...n(Math.floor(Date.now()/1000),7),23,...n(tag.length,2),...tag,...bech32.toWords(new Uint8Array(65))],5000);
const intent={id,tokenHash:hash(secret),request,invoice,amount:1,expiresAt:Date.now()+3600000,signer:getPublicKey(key)};
const event=finalizeEvent({kind:9735,created_at:2,content:'',tags:[['p',recipient],['description',request],['bolt11',invoice]]},key);
const dir=await mkdtemp(join(tmpdir(),'gyro-receipt-'));const file=join(dir,'intent.json');
try{
 await writeFile(file,JSON.stringify(intent));
 for(const k of ['intent:'+id,'paid:'+id])execFileSync('npx',['wrangler','kv','key','delete',k,'--binding','PAYMENTS','--local'],{stdio:'pipe'});
 execFileSync('npx',['wrangler','kv','key','put','intent:'+id,'--path',file,'--binding','PAYMENTS','--local'],{stdio:'pipe'});
 const status=async()=>{const response=await fetch(origin+'/api/lightning/status',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id,secret})});assert.equal(response.status,200);return (await response.json()).status;};
 const send=event=>new Promise((resolve,reject)=>{
  const socket=new WebSocket(origin.replace('http','ws')+'/api/lightning/receipts');const timer=setTimeout(()=>{socket.close();reject(Error('timeout'));},10000);
  socket.onopen=()=>socket.send(JSON.stringify(['EVENT',event]));socket.onerror=reject;socket.onmessage=({data})=>{clearTimeout(timer);socket.close();resolve(JSON.parse(data));};
 });
 assert.equal(await status(),'pending');
 assert.equal((await send({...event,sig:'0'.repeat(128)}))[2],false);assert.equal(await status(),'pending');
 assert.equal((await send(event))[2],true);assert.equal(await status(),'paid');
 assert.equal((await send(event))[2],true);assert.equal(await status(),'paid');
 console.log('PASS: local Worker rejects forged receipts, records valid receipts, restores paid state, and accepts duplicates safely. No payment made.');
}finally{await rm(dir,{recursive:true,force:true});}
