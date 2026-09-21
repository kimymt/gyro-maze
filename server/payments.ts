import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type Event } from 'nostr-tools/pure';
import { bech32 } from '@scure/base';
import { decode } from 'light-bolt11-decoder';

export const RECEIVER='garbledaction736@walletofsatoshi.com';
export const METADATA='https://walletofsatoshi.com/.well-known/lnurlp/garbledaction736';
export const ORIGIN='https://gyro-maze.kei1127miyamoto.workers.dev';
const SIGNER='be1d89794bf92de5dd64c1e60f6a2c70c140abac9932418fee30c5c637fe9479';
export interface Intent { id:string; tokenHash:string; request:string; invoice:string; amount:number; expiresAt:number; signer:string }
export interface Receipt { paidAt:number }
export const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
export function invoiceFields(invoice:string){
  // This parser checks encoding, not the invoice's ECDSA signature. Invoices are
  // obtained only from the fixed receiver over HTTPS; settlement needs a signed receipt.
  const sections=decode(invoice).sections as {name:string;value?:unknown}[];
  const value=(name:string)=>sections.find(s=>s.name===name)?.value;
  if(!invoice.startsWith('lnbc'))throw new Error('Bitcoin mainnet invoice required');
  return {amount:Number(value('amount')),descriptionHash:value('description_hash'),expiresAt:(Number(value('timestamp'))+Number(value('expiry')??3600))*1000};
}
async function remoteJSON(url:string|URL){
  const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'manual'});
  if(!response.ok)throw new Error(`Receiver HTTP ${response.status}`);
  const body=await response.text();if(body.length>20000)throw new Error('Invalid receiver response');
  return JSON.parse(body);
}
export async function createIntent(amount:number):Promise<{intent:Intent;secret:string}>{
  if(!Number.isSafeInteger(amount)||amount<1||amount>100_000_000)throw new Error('Invalid amount');
  const metadata=await remoteJSON(METADATA);
  const callback=new URL(metadata.callback);
  if(metadata.tag!=='payRequest'||metadata.allowsNostr!==true||metadata.nostrPubkey!==SIGNER||callback.origin!=='https://livingroomofsatoshi.com'||!callback.pathname.startsWith('/api/v1/lnurl/payreq/'))throw new Error('Receiver configuration changed');
  if(amount*1000<metadata.minSendable||amount*1000>metadata.maxSendable)throw new Error('Amount outside receiver limits');
  const id=random(),secret=random();
  const lnurl=bech32.encode('lnurl',bech32.toWords(new TextEncoder().encode(METADATA)),2000);
  // Anonymous application recipient, used solely to route this invoice's receipt.
  const request=JSON.stringify(finalizeEvent({kind:9734,created_at:Math.floor(Date.now()/1000),content:`GYRO support ${id}`,tags:[['p',getPublicKey(generateSecretKey())],['amount',String(amount*1000)],['lnurl',lnurl],['relays',ORIGIN.replace('https:','wss:')+'/api/lightning/receipts']]},generateSecretKey()));
  callback.searchParams.set('amount',String(amount*1000));callback.searchParams.set('nostr',request);callback.searchParams.set('lnurl',lnurl);
  const result=await remoteJSON(callback);
  if(typeof result.pr!=='string')throw new Error('Invoice unavailable');
  const fields=invoiceFields(result.pr);
  if(fields.amount!==amount*1000||fields.descriptionHash!==await hash(request)||!Number.isFinite(fields.expiresAt)||fields.expiresAt<=Date.now())throw new Error('Invoice mismatch');
  return {intent:{id,tokenHash:await hash(secret),request,invoice:result.pr,amount,expiresAt:fields.expiresAt,signer:SIGNER},secret};
}
export function receiptIntentId(event:Event):string|null{
  try{
    const descriptions=event.tags.filter(tag=>tag[0]==='description');
    if(descriptions.length!==1)return null;
    const request=JSON.parse(descriptions[0][1]);
    return /^GYRO support ([a-f0-9]{48})$/.exec(request.content)?.[1]??null;
  }catch{return null;}
}
export async function validReceipt(event:Event,intent:Intent):Promise<boolean>{
  try{
    // Parse fresh JSON at the boundary so nostr-tools' in-memory verification cache
    // cannot be injected by a caller or reused after mutation.
    const clean:Event=JSON.parse(JSON.stringify(event));
    if(clean.kind!==9735||clean.pubkey!==intent.signer||!verifyEvent(clean))return false;
    const single=(name:string)=>{const tags=clean.tags.filter(t=>t[0]===name);return tags.length===1?tags[0][1]:undefined;};
    if(single('bolt11')!==intent.invoice||single('description')!==intent.request)return false;
    const request:Event=JSON.parse(intent.request);
    if(single('p')!==request.tags.find(t=>t[0]==='p')?.[1])return false;
    const invoice=invoiceFields(intent.invoice);
    return invoice.amount===intent.amount*1000&&invoice.descriptionHash===await hash(intent.request);
  }catch{return false;}
}
