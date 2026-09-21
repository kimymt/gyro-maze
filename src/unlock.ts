import {PENDING_KEY,type AccessMethod} from './access';
interface Invoice {id:string;secret:string;invoice:string;amount:number;expiresAt:number}
const receiver='garbledaction736@walletofsatoshi.com';
const shareURL='https://gyro-maze.kei1127miyamoto.workers.dev/';
export function openUnlock(dialog:HTMLDialogElement,show:(html:string)=>void,grant:(method:AccessMethod)=>void){
  let timer:ReturnType<typeof setTimeout>|undefined,busy=false,generation=0;
  let pending:Invoice|undefined;
  try{const value=JSON.parse(localStorage.getItem(PENDING_KEY)??'null');if(value&&/^[a-f0-9]{48}$/.test(value.id)&&/^[a-f0-9]{48}$/.test(value.secret)&&typeof value.invoice==='string'&&Number.isFinite(value.expiresAt))pending=value;}catch{}
  const q=<T extends HTMLElement=HTMLElement>(s:string)=>dialog.querySelector<T>(s)!;
  const status=(text:string)=>{const element=dialog.querySelector('[data-payment-status]');if(element)element.textContent=text;};
  const clear=()=>{clearTimeout(timer);generation++;};
  const render=(html:string)=>{clear();show(html+'<p data-payment-status role="status" aria-live="polite"></p><button class="text-button" data-unlock="close">閉じる</button>');};
  const complete=(method:AccessMethod)=>{cleanup();dialog.close();grant(method);};
  async function api(path:string,body:unknown){
    const response=await fetch('/api/lightning/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error??'確認できませんでした。');return result;
  }
  function menu(){render('<h2>07〜12を解放する</h2><p>01〜06は無料です。次のどれか一つで、残りの6コースをまとめて遊べます。以前のBESTは残ります。</p><button class="secondary" data-unlock="share">SNSでシェア</button><button class="secondary" data-unlock="donation">寄付する</button><button class="secondary" data-unlock="lightning">Lightningで支援する</button><button class="text-button" data-unlock="restore">送金の復元コードを使う</button><p class="help-note">解放状態はこのブラウザに保存します。</p>');}
  async function check(manual=false){
    if(!pending||busy||!dialog.open||document.hidden)return;
    const version=generation;busy=true;
    try{
      const result=await api('status',{id:pending.id,secret:pending.secret});
      if(version!==generation)return;
      if(result.status==='paid'){complete('lightning');return;}
      if(result.status==='expired'){status('請求書の有効期限が切れました。送金済みの場合は、この復元コードを保管して再確認してください。');return;}
      status(manual?'まだ入金通知を確認できません。送金済みの場合は再送金せず、お待ちください。':'入金通知を待っています。送金済みの場合は、重ねて送金しないでください。');
    }catch{if(version===generation)status('入金を確認できません。通信を戻して再確認してください。送金済みなら再送金は不要です。');}
    finally{busy=false;if(version===generation&&dialog.open&&!document.hidden)timer=setTimeout(()=>void check(),10000);}
  }
  async function invoiceView(){
    if(!pending)return;
    render('<h2>Lightningで支援する</h2><p data-amount></p><p class="help-note">送金先：開発者<br>'+receiver+'</p><canvas class="payment-qr" aria-label="Lightning請求書のQRコード"></canvas><a class="primary payment-wallet">ウォレットを開く</a><button class="secondary" data-unlock="copy-invoice">請求書をコピー</button><label class="payment-field">復元コード<input readonly data-code aria-label="復元コード"></label><button class="text-button" data-unlock="copy-code">復元コードをコピー</button><p class="help-note">別端末やデータ削除後の復元に必要です。送金前に保管してください。復元コードを他人に渡さないでください。</p><button class="secondary" data-unlock="check">入金を再確認</button><button class="text-button" data-unlock="replace">未送金の請求書を作り直す</button>');
    q('[data-amount]').textContent=`${pending.amount} sat`;
    q<HTMLInputElement>('[data-code]').value=pending.id+'.'+pending.secret;
    q<HTMLAnchorElement>('.payment-wallet').href='lightning:'+pending.invoice;
    const version=generation,invoice=pending.invoice;
    try{const QR=await import('qrcode');if(version!==generation)return;await QR.toCanvas(q<HTMLCanvasElement>('canvas'),'lightning:'+invoice,{width:240,margin:3,errorCorrectionLevel:'M'});}catch{if(version===generation)status('QRコードを表示できません。請求書をコピーして送金できます。');}
    if(version===generation)void check();
  }
  function lightning(){
    if(pending){void invoiceView();return;}
    render('<h2>Lightningで支援する</h2><p>1 sat以上の好きな金額で、07〜12を解放できます。入金は自動で確認します。</p><p class="help-note">送金先：開発者<br>'+receiver+'</p><label class="payment-field">金額（sat）<input type="number" inputmode="numeric" min="1" max="100000000" step="1" value="1" data-amount-input></label><button class="primary" data-unlock="invoice">請求書を作る</button><p class="help-note">請求書の作成と入金確認には通信が必要です。</p>');
  }
  async function copy(text:string){try{await navigator.clipboard.writeText(text);status('コピーしました。');}catch{status('コピーできません。復元コードは入力欄から選択してコピーできます。');}}
  async function click(e:Event){
    const button=(e.target as HTMLElement).closest<HTMLElement>('[data-unlock]');if(!button)return;
    switch(button.dataset.unlock){
      case 'close':cleanup();dialog.close();break;
      case 'share':render('<h2>SNSでシェア</h2><p>GYROのリンクを、好きなSNSへ投稿してください。投稿後に下のボタンで申告すると、07〜12を解放します。</p><button class="primary" data-unlock="native-share">共有先を選ぶ</button><button class="secondary" data-unlock="copy-share">リンクをコピー</button><button class="secondary" data-unlock="shared">シェアしました</button>');break;
      case 'native-share':try{if(navigator.share)await navigator.share({title:'GYRO',text:'木と土、水の中を巡る立体迷路。',url:shareURL});else await copy(shareURL);}catch{status('共有は完了していません。投稿後に「シェアしました」を押してください。');}break;
      case 'copy-share':await copy(shareURL);break;
      case 'shared':complete('share');break;
      case 'donation':render('<h2>寄付する</h2><p>募金箱や団体は自由に選べます。寄付後に申告すると、07〜12を解放します。金額の指定はありません。</p><p class="help-note">寄付は選んだ先へ直接行ってください。GYROは寄付金を預からず、証明書の提出も求めません。</p><button class="primary" data-unlock="donated">寄付しました</button>');break;
      case 'donated':complete('donation');break;
      case 'lightning':lightning();break;
      case 'invoice':{
        if(busy)return;
        const amount=Number(q<HTMLInputElement>('[data-amount-input]').value);
        if(!Number.isSafeInteger(amount)||amount<1||amount>100_000_000){status('1 sat以上の整数を入力してください。');return;}
        busy=true;(button as HTMLButtonElement).disabled=true;status('請求書を作っています。');const version=generation;
        try{const result=await api('invoice',{amount});if(version!==generation)return;pending=result;try{localStorage.setItem(PENDING_KEY,JSON.stringify(result));}catch{}busy=false;await invoiceView();}
        catch{if(version===generation){status('請求書を作れませんでした。通信状態を確認して、再度お試しください。');(button as HTMLButtonElement).disabled=false;}}
        finally{busy=false;}break;
      }
      case 'replace':render('<h2>請求書を作り直す</h2><p>送金済みの場合は、作り直さず入金を再確認してください。古い復元コードも保管してください。</p><button class="secondary" data-unlock="lightning">今の請求書に戻る</button><button class="secondary" data-unlock="replace-confirm">未送金なので作り直す</button>');break;
      case 'replace-confirm':pending=undefined;try{localStorage.removeItem(PENDING_KEY);}catch{}lightning();break;
      case 'copy-invoice':if(pending)await copy(pending.invoice);break;
      case 'copy-code':if(pending)await copy(pending.id+'.'+pending.secret);break;
      case 'check':clearTimeout(timer);void check(true);break;
      case 'restore':render('<h2>送金から復元</h2><label class="payment-field">復元コード<input data-restore autocomplete="off" autocapitalize="off" spellcheck="false"></label><button class="primary" data-unlock="restore-check">入金を確認して復元</button>');break;
      case 'restore-check':{
        if(busy)return;
        const code=q<HTMLInputElement>('[data-restore]').value.trim();if(!/^[a-f0-9]{48}\.[a-f0-9]{48}$/.test(code)){status('復元コードを確認してください。');return;}
        const [id,secret]=code.split('.'),version=generation;busy=true;status('確認しています。');
        try{const result=await api('status',{id,secret});if(version!==generation)return;if(result.status==='paid')complete('lightning');else{pending={id,secret,...result};busy=false;await invoiceView();}}
        catch{if(version===generation)status('復元できませんでした。コードと通信状態を確認してください。');}finally{busy=false;}break;
      }
    }
  }
  const visibility=()=>{clearTimeout(timer);if(!document.hidden&&dialog.querySelector('[data-code]'))void check();};
  function cleanup(){clear();dialog.removeEventListener('click',click);dialog.removeEventListener('close',cleanup);dialog.removeEventListener('unlock-stop',cleanup);document.removeEventListener('visibilitychange',visibility);}
  dialog.addEventListener('click',click);dialog.addEventListener('close',cleanup);dialog.addEventListener('unlock-stop',cleanup);document.addEventListener('visibilitychange',visibility);menu();
}
