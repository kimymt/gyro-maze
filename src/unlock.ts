import type {AccessMethod} from './access';
export const LIGHTNING_ADDRESS='garbledaction736@walletofsatoshi.com';
// Fixed receiver LNURL. The player's wallet contacts the receiver directly;
// GYRO never creates an invoice, checks a payment, or sends a declaration.
export const LIGHTNING_URL='lightning:lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkwctjvfkx2erpvd6xjmmwxuenvyj4066';
const shareURL='https://gyro.mymt.casa/';
export function openUnlock(dialog:HTMLDialogElement,show:(html:string)=>void,grant:(method:AccessMethod)=>void){
  let generation=0;
  const status=(text:string)=>{const element=dialog.querySelector('[data-payment-status]');if(element)element.textContent=text;};
  const render=(html:string)=>{generation++;show(html+'<p data-payment-status role="status" aria-live="polite"></p><button class="text-button" data-unlock="close">閉じる</button>');};
  const complete=(method:AccessMethod)=>{cleanup();dialog.close();grant(method);};
  function menu(){render('<h2>07〜12を解放する</h2><p>01〜06は無料です。次のどれか一つで、残りの6コースをまとめて遊べます。以前のBESTは残ります。</p><button class="secondary" data-unlock="share">SNSでシェア</button><button class="secondary" data-unlock="breathing">3回深呼吸する</button><button class="secondary" data-unlock="gratitude">感謝したい人の顔を思い浮かべる</button><button class="secondary" data-unlock="donation">寄付する</button><button class="secondary" data-unlock="lightning">Lightningで支援する</button><p class="help-note">いずれも実施後の自己申告です。解放状態はこのブラウザだけに保存します。別端末やデータ削除後は、再送金せずにもう一度申告してください。</p>');}
  async function lightning(){
    render('<h2>Lightningで支援する</h2><p>1 sat以上の好きな金額を、ウォレットから送金してください。送金後の自己申告で07〜12を解放します。</p><label class="payment-field">送金先：開発者<input type="text" readonly data-address aria-label="Lightning送金先"></label><button class="secondary" data-unlock="copy-address">送金先をコピー</button><canvas class="payment-qr" aria-label="Lightning送金先のQRコード"></canvas><a class="secondary payment-wallet" href="'+LIGHTNING_URL+'">ウォレットを開く</a><button class="primary" data-unlock="sent">送金しました</button><p class="help-note">すでに送金した方は、再送金せず「送金しました」を押してください。GYROのサーバーには送金記録を保存しません。</p>');
    dialog.querySelector<HTMLInputElement>('[data-address]')!.value=LIGHTNING_ADDRESS;
    const version=generation;
    try{const QR=await import('qrcode');if(version!==generation)return;await QR.toCanvas(dialog.querySelector<HTMLCanvasElement>('canvas')!,LIGHTNING_URL,{width:220,margin:3,errorCorrectionLevel:'M'});}catch{if(version===generation)status('QRコードを表示できません。送金先をコピーしてウォレットに貼り付けてください。');}
  }
  async function copy(text:string){try{await navigator.clipboard.writeText(text);status('コピーしました。');}catch{status('コピーできません。表示された送金先を選択してコピーしてください。');}}
  async function click(e:Event){
    const button=(e.target as HTMLElement).closest<HTMLElement>('[data-unlock]');if(!button)return;
    switch(button.dataset.unlock){
      case 'close':cleanup();dialog.close();break;
      case 'share':render('<h2>SNSでシェア</h2><p>GYROのリンクを、好きなSNSへ投稿してください。投稿後に下のボタンで申告すると、07〜12を解放します。</p><button class="primary" data-unlock="native-share">共有先を選ぶ</button><button class="secondary" data-unlock="copy-share">リンクをコピー</button><button class="secondary" data-unlock="shared">シェアしました</button>');break;
      case 'native-share':try{if(navigator.share)await navigator.share({title:'GYRO',text:'木と土、水の中を巡る立体迷路。',url:shareURL});else await copy(shareURL);}catch{status('共有は完了していません。投稿後に「シェアしました」を押してください。');}break;
      case 'copy-share':await copy(shareURL);break;
      case 'shared':complete('share');break;
      case 'breathing':render('<h2>3回深呼吸する</h2><p>自分のペースで、ゆっくり3回深呼吸してください。</p><button class="primary" data-unlock="breathed">3回深呼吸しました</button>');break;
      case 'breathed':complete('breathing');break;
      case 'gratitude':render('<h2>感謝したい人の顔を思い浮かべる</h2><p>感謝したい人の顔を、ひとり思い浮かべてください。</p><button class="primary" data-unlock="remembered">思い浮かべました</button>');break;
      case 'remembered':complete('gratitude');break;
      case 'donation':render('<h2>寄付する</h2><p>募金箱や団体は自由に選べます。寄付後に申告すると、07〜12を解放します。金額の指定はありません。</p><p class="help-note">寄付は選んだ先へ直接行ってください。GYROは寄付金を預からず、証明書の提出も求めません。</p><button class="primary" data-unlock="donated">寄付しました</button>');break;
      case 'donated':complete('donation');break;
      case 'lightning':void lightning();break;
      case 'copy-address':await copy(LIGHTNING_ADDRESS);break;
      case 'sent':complete('lightning');break;
    }
  }
  function cleanup(){generation++;dialog.removeEventListener('click',click);dialog.removeEventListener('close',cleanup);dialog.removeEventListener('unlock-stop',cleanup);}
  dialog.addEventListener('click',click);dialog.addEventListener('close',cleanup);dialog.addEventListener('unlock-stop',cleanup);menu();
}
