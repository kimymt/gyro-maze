import {createIntent,hash,receiptIntentId,validReceipt,ORIGIN,type Intent,type Receipt} from './payments';
interface Env {ASSETS:Fetcher;PAYMENTS:KVNamespace;PAYMENT_LIMITER:RateLimit}
async function readBody(request:Request){
  if(Number(request.headers.get('Content-Length'))>2048)throw new RangeError('Request too large');
  const reader=request.body?.getReader();if(!reader)return '';
  const chunks:Uint8Array[]= [];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw new RangeError('Request too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    if(url.pathname==='/api/lightning/receipts'){
      if(request.headers.get('Accept')?.includes('application/nostr+json'))return new Response(JSON.stringify({name:'GYRO payment receipts',description:'Private payment receipt inbox. No public subscriptions.',supported_nips:[1,11,57]}),{headers:{'Content-Type':'application/nostr+json','Access-Control-Allow-Origin':'*'}});
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket required'},426);
      const pair=new WebSocketPair();const [client,socket]=Object.values(pair);socket.accept();
      let messages=0;
      const timeout=setTimeout(()=>socket.close(1000,'Receipt window ended'),20000);
      socket.addEventListener('close',()=>clearTimeout(timeout));
      socket.addEventListener('message',async({data})=>{
        if(++messages>4||typeof data!=='string'||data.length>16000){socket.close(1008,'Invalid message');return;}
        try{
          const message=JSON.parse(data);
          if(!Array.isArray(message)||message[0]!=='EVENT'){socket.send(JSON.stringify(['NOTICE','Only payment receipts accepted']));return;}
          const event=message[1],id=receiptIntentId(event);
          const intent=id?await env.PAYMENTS.get<Intent>('intent:'+id,'json'):null;
          if(!intent||!await validReceipt(event,intent)){socket.send(JSON.stringify(['OK',event?.id??'',false,'invalid: Unrecognized receipt']));return;}
          // Separate immutable invoice and settlement keys prevent status/expiry
          // reads from overwriting a verified payment. Duplicate receipts are safe.
          await env.PAYMENTS.put('paid:'+id,JSON.stringify({paidAt:Date.now()} satisfies Receipt));
          socket.send(JSON.stringify(['OK',event.id,true,'']));
        }catch{socket.send(JSON.stringify(['NOTICE','Receipt could not be stored; retry']));}
      });
      return new Response(null,{status:101,webSocket:client});
    }
    if(request.method!=='POST')return json({error:'Method not allowed'},405);
    const origin=request.headers.get('Origin');
    if(origin!==url.origin||(!['localhost','127.0.0.1'].includes(url.hostname)&&origin!==ORIGIN))return json({error:'Origin rejected'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
    try{
      const body=await readBody(request);
      const input=JSON.parse(body);
      if(url.pathname==='/api/lightning/invoice'){
        if(!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>100_000_000)return json({error:'1 sat以上の整数を入力してください。'},400);
        if(!(await env.PAYMENT_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'local'})).success)return json({error:'少し待ってから再度お試しください。'},429);
        const {intent,secret}=await createIntent(input.amount);
        // Keep the recovery record after expiry: a delayed signed receipt can still
        // settle the same invoice, and already paid users can restore indefinitely.
        await env.PAYMENTS.put('intent:'+intent.id,JSON.stringify(intent));
        return json({id:intent.id,secret,invoice:intent.invoice,amount:intent.amount,expiresAt:intent.expiresAt});
      }
      if(url.pathname==='/api/lightning/status'){
        if(!/^[a-f0-9]{48}$/.test(input.id)||!/^[a-f0-9]{48}$/.test(input.secret))return json({error:'復元コードを確認してください。'},400);
        const intent=await env.PAYMENTS.get<Intent>('intent:'+input.id,'json');
        if(!intent||intent.tokenHash!==await hash(input.secret))return json({error:'復元コードを確認してください。'},404);
        const paid=await env.PAYMENTS.get<Receipt>('paid:'+intent.id,'json');
        return json({status:paid?'paid':Date.now()>=intent.expiresAt?'expired':'pending',amount:intent.amount,expiresAt:intent.expiresAt,invoice:intent.invoice});
      }
      return json({error:'Not found'},404);
    }catch(error){if(error instanceof RangeError)return json({error:'Request too large'},413);if(error instanceof SyntaxError)return json({error:'Invalid JSON'},400);console.error('Payment API failed',error instanceof Error?error.message:'Unknown error');return json({error:'通信できませんでした。解放は行っていません。時間をおいて再確認してください。'},503);}
  }
} satisfies ExportedHandler<Env>;
