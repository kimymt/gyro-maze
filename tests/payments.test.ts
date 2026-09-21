import {afterEach,expect,it,vi} from 'vitest';
import {bech32} from '@scure/base';
import {finalizeEvent,generateSecretKey,getPublicKey,type Event} from 'nostr-tools/pure';
import {createIntent,hash,invoiceFields,validReceipt,receiptIntentId,ORIGIN,type Intent} from '../server/payments';
import worker from '../server/index';
afterEach(()=>vi.unstubAllGlobals());
// Encoding fixture only, not a payable invoice. The trusted receiver's HTTPS
// response supplies invoices in production; Schnorr signatures are real here.
function invoice(descriptionHash:string,amount=1000){
 const n=(value:number,length:number)=>Array.from({length},(_,i)=>Math.floor(value/32**(length-i-1))%32);
 const bytes=Uint8Array.from(descriptionHash.match(/../g)!,s=>parseInt(s,16));
 const tag=bech32.toWords(bytes);
 return bech32.encode(`lnbc${amount*10}p`,[...n(Math.floor(Date.now()/1000),7),23,...n(tag.length,2),...tag,...bech32.toWords(new Uint8Array(65))],5000);
}
async function fixture(){
 const signer=generateSecretKey(),recipient=getPublicKey(generateSecretKey());
 const request=JSON.stringify(finalizeEvent({kind:9734,created_at:1,tags:[['p',recipient],['amount','1000']],content:'GYRO support '+'a'.repeat(48)},generateSecretKey()));
 const intent:Intent={id:'a'.repeat(48),tokenHash:await hash('b'.repeat(48)),request,invoice:invoice(await hash(request)),amount:1,expiresAt:Date.now()+3600000,signer:getPublicKey(signer)};
 const event=finalizeEvent({kind:9735,created_at:2,content:'',tags:[['p',recipient],['description',request],['bolt11',intent.invoice]]},signer);
 return {intent,event,signer};
}
it('accepts only a matching, correctly signed provider receipt',async()=>{
 const {intent,event,signer}=await fixture();expect(receiptIntentId(event)).toBe(intent.id);expect(await validReceipt(event,intent)).toBe(true);
 expect(await validReceipt({...event,sig:'0'.repeat(128)},intent)).toBe(false);
 const forged=finalizeEvent({kind:9735,created_at:2,content:'',tags:event.tags},generateSecretKey());expect(await validReceipt(forged,intent)).toBe(false);
 for(const name of ['bolt11','description','p']){
  const tags=event.tags.map(t=>t[0]===name?[name,'wrong']:t);
  expect(await validReceipt(finalizeEvent({kind:9735,created_at:2,content:'',tags},signer),intent)).toBe(false);
 }
 expect(await validReceipt(event,{...intent,amount:2})).toBe(false);
 const duplicate=finalizeEvent({kind:9735,created_at:2,content:'',tags:[...event.tags,event.tags[0]]},signer);expect(await validReceipt(duplicate,intent)).toBe(false);
 // A previous successful verify must not make a modified event valid.
 event.content='tampered';expect(await validReceipt(event,intent)).toBe(false);
});
it('creates a bound invoice and rejects a changed receiver or amount',async()=>{
 let callbackRequest:URL|undefined;
 vi.stubGlobal('fetch',vi.fn(async(url:string|URL,options:RequestInit)=>{
  expect(options.redirect).toBe('manual');
  if(String(url).includes('/.well-known/'))return Response.json({tag:'payRequest',allowsNostr:true,nostrPubkey:'be1d89794bf92de5dd64c1e60f6a2c70c140abac9932418fee30c5c637fe9479',callback:'https://livingroomofsatoshi.com/api/v1/lnurl/payreq/test',minSendable:1000,maxSendable:100000000000});
  callbackRequest=new URL(url);return Response.json({pr:invoice(await hash(callbackRequest.searchParams.get('nostr')!),21000)});
 }));
 const {intent,secret}=await createIntent(21);expect(intent.amount).toBe(21);expect(intent.tokenHash).toBe(await hash(secret));expect(intent.request).not.toContain(secret);expect(invoiceFields(intent.invoice).amount).toBe(21000);
 expect(JSON.parse(callbackRequest!.searchParams.get('nostr')!).tags).toContainEqual(['relays',ORIGIN.replace('https:','wss:')+'/api/lightning/receipts']);
 await expect(createIntent(1)).rejects.toThrow('Invoice mismatch');
 for(const amount of [0,-1,1.5,NaN,Infinity,100000001])await expect(createIntent(amount)).rejects.toThrow('Invalid amount');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({callback:'https://attacker.invalid/',tag:'payRequest',allowsNostr:true})));
 await expect(createIntent(1)).rejects.toThrow('Receiver configuration changed');
});
it('status requires the private recovery token and never equates expiry with payment',async()=>{
 const {intent}=await fixture();const records=new Map<string,string>([['intent:'+intent.id,JSON.stringify(intent)]]);
 const env={PAYMENTS:{get:async(key:string)=>JSON.parse(records.get(key)??'null')},ASSETS:{fetch:vi.fn()},PAYMENT_LIMITER:{limit:async()=>({success:true})}};
 const request=(secret:string,origin=ORIGIN)=>new Request(ORIGIN+'/api/lightning/status',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:intent.id,secret})});
 const call=(req:Request)=>worker.fetch(req,env as never);
 expect((await call(request('c'.repeat(48)))).status).toBe(404);
 expect((await call(request('b'.repeat(48),'https://attacker.invalid'))).status).toBe(403);
 expect((await (await call(request('b'.repeat(48)))).json() as any).status).toBe('pending');
 records.set('intent:'+intent.id,JSON.stringify({...intent,expiresAt:0}));expect((await (await call(request('b'.repeat(48)))).json() as any).status).toBe('expired');
 records.set('paid:'+intent.id,JSON.stringify({paidAt:1}));const response=await call(request('b'.repeat(48)));expect((await response.json() as any).status).toBe('paid');expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('rejects oversized and malformed request bodies before contacting a receiver',async()=>{
 const upstream=vi.fn();vi.stubGlobal('fetch',upstream);
 for(const [body,status] of [['x'.repeat(4096),413],['{broken',400]] as const){
  const request=new Request(ORIGIN+'/api/lightning/invoice',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body});
  expect((await worker.fetch(request,{} as never)).status).toBe(status);
 }
 expect(upstream).not.toHaveBeenCalled();
});
