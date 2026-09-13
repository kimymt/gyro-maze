import * as T from 'three';
import type {NatureMaterial} from './levels';
// Small deterministic local textures: no downloads, models or external services.
export function natureTexture(kind:NatureMaterial):T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!;const pixels=ctx.createImageData(128,128);
  const base:Record<NatureMaterial,number[]>={wood:[149,102,54],soil:[122,83,51],moss:[72,110,58],stone:[112,121,110],water:[40,139,154]};
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const noise=((Math.sin(x*127.1+y*311.7)*43758.5453)%1+1)%1;
    let detail=(noise-.5)*22;
    if(kind==='wood')detail+=Math.sin(x*.55+Math.sin(y*.065)*3+Math.sin(x*.08)*2)*17;
    if(kind==='water')detail+=Math.sin(x*.16+y*.23+Math.sin(y*.14)*2)*13+Math.cos(x*.3-y*.15)*9;
    if(kind==='moss')detail+=Math.sin(x*.11)*Math.cos(y*.15)*18;
    if(kind==='soil'||kind==='stone')detail+=Math.sin(x*.07+y*.06)*12;
    const i=(y*128+x)*4;for(let c=0;c<3;c++)pixels.data[i+c]=Math.max(0,Math.min(255,base[kind][c]+detail));pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;return texture;
}
export function natureMaterial(kind:NatureMaterial,texture:T.Texture):T.MeshStandardMaterial {
  return new T.MeshStandardMaterial({map:texture,color:0xffffff,roughness:kind==='water'?.19:kind==='wood'?.7:.95,metalness:kind==='water'?.12:0,envMapIntensity:kind==='water'?1.1:.35,transparent:true,opacity:1});
}
