export const ACCESS_KEY='gyro-maze-access-v1';
export type AccessMethod='share'|'donation'|'lightning';
export class Access {
  unlocked=false;
  constructor(){
    // Discard legacy invoice/recovery data; preserve access and game records.
    try{localStorage.removeItem('gyro-maze-lightning-v1');}catch{}
    try{const data=JSON.parse(localStorage.getItem(ACCESS_KEY)??'null');this.unlocked=data?.version===1&&['share','donation','lightning'].includes(data.method);}catch{}}
  canPlay(index:number){return index<6||this.unlocked;}
  grant(method:AccessMethod){
    this.unlocked=true;
    try{localStorage.setItem(ACCESS_KEY,JSON.stringify({version:1,method}));return true;}catch{return false;}
  }
}
