import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';
export type V3 = [number, number, number];
export type NatureMaterial = 'wood' | 'soil' | 'moss' | 'stone' | 'water';
export interface Block { position: V3; size: V3; rotation: [number, number, number, number]; material: NatureMaterial; terrain: boolean }
export interface Marker { position: V3; up: V3 }
export interface PathPoint { position: V3; up: V3; tangent: V3; distance: number }
export interface Level {
  id: string; number: string; name: string; subtitle: string; description: string;
  difficulty: string; materialLabel: string; blocks: Block[]; start: Marker;
  checkpoints: Marker[]; goal: Marker; center: V3; halfSize: number;
  route: PathPoint[]; corridorRadius: number; routeLength: number; trackMaterial: NatureMaterial;
}
export const BALL_RADIUS = .23;
export const CLEARANCE = BALL_RADIUS;
export const TRACK_WIDTH = 1.48;
export const TRACK_BEVEL = .04;
export const TRACK_END_PADDING = .55;
export const TRACK_CENTER_LIMIT = TRACK_WIDTH/2-TRACK_BEVEL-BALL_RADIUS-.02;
const v = (p: V3) => new Vector3(...p);
export function spawnPosition(m: Marker): Vector3 { return v(m.position).addScaledVector(v(m.up), CLEARANCE); }
function marker(node: PathPoint): Marker { return { position:v(node.position).addScaledVector(v(node.up),-CLEARANCE).toArray() as V3, up:node.up }; }
export function nearestOnRoute(position: {x:number;y:number;z:number}, route: PathPoint[]) {
  let distanceSquared=Infinity, x=0,y=0,z=0,index=0,t=0;
  for(let i=0;i<route.length-1;i++){
    const a=route[i].position,b=route[i+1].position;
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
    const lengthSquared=dx*dx+dy*dy+dz*dz;
    const u=Math.max(0,Math.min(1,((position.x-a[0])*dx+(position.y-a[1])*dy+(position.z-a[2])*dz)/lengthSquared));
    const px=a[0]+dx*u,py=a[1]+dy*u,pz=a[2]+dz*u;
    const d=(position.x-px)**2+(position.y-py)**2+(position.z-pz)**2;
    if(d<distanceSquared){distanceSquared=d;x=px;y=py;z=pz;index=i;t=u;}
  }
  return {distanceSquared,x,y,z,index,t};
}
// Rendering and contacts use the same continuous frame at every segment boundary.
export function routeFrame(route:PathPoint[],index:number,t:number){
  const a=route[index],b=route[index+1];
  const tangent=v(a.tangent).lerp(v(b.tangent),t).normalize();
  const up=v(a.up).lerp(v(b.up),t);up.addScaledVector(tangent,-up.dot(tangent)).normalize();
  return {tangent,up,side:new Vector3().crossVectors(up,tangent).normalize()};
}
interface Guide { p:V3; up:V3 }
function smoothRoute(guides:Guide[]):PathPoint[]{
  const curve=new CatmullRomCurve3(guides.map(n=>v(n.p)),false,'centripetal');
  curve.arcLengthDivisions=Math.max(1000,guides.length*200);curve.updateArcLengths();
  const count=Math.ceil(curve.getLength()/.05);
  const samples=Array.from({length:count+1},(_,i)=>({t:curve.getUtoTmapping(i/count,0),guide:-1}));
  // Include exact face anchors alongside evenly spaced samples.
  guides.forEach((_,i)=>samples.push({t:i/(guides.length-1),guide:i}));
  samples.sort((a,b)=>a.t-b.t);
  const unique:typeof samples=[];
  for(const sample of samples){
    if(unique.length&&Math.abs(sample.t-unique.at(-1)!.t)<1e-9){if(sample.guide>=0)unique[unique.length-1]=sample;}
    else unique.push(sample);
  }
  const route:PathPoint[]=[],anchors:{index:number;angle:number}[]=[];
  let up=v(guides[0].up),previousTangent=curve.getTangent(0).normalize(),distance=0;
  up.addScaledVector(previousTangent,-up.dot(previousTangent)).normalize();
  for(const sample of unique){
    const tangent=curve.getTangent(sample.t).normalize(),position=curve.getPoint(sample.t);
    up.applyQuaternion(new Quaternion().setFromUnitVectors(previousTangent,tangent));
    up.addScaledVector(tangent,-up.dot(tangent)).normalize();
    if(route.length)distance+=position.distanceTo(v(route.at(-1)!.position));
    route.push({position:position.toArray() as V3,up:up.toArray() as V3,tangent:tangent.toArray() as V3,distance});
    if(sample.guide>=0){
      const target=v(guides[sample.guide].up);target.addScaledVector(tangent,-target.dot(tangent));
      // A face normal parallel to travel cannot define a floor. Transport through it.
      if(target.lengthSq()>.09){
        target.normalize();let angle=Math.atan2(tangent.dot(new Vector3().crossVectors(up,target)),up.dot(target));
        const previous=anchors.at(-1)?.angle??angle;
        while(angle-previous>Math.PI)angle-=Math.PI*2;
        while(angle-previous< -Math.PI)angle+=Math.PI*2;
        anchors.push({index:route.length-1,angle});
      }
    }
    previousTangent.copy(tangent);
  }
  let anchor=0;
  route.forEach((node,i)=>{
    while(anchor<anchors.length-2&&i>anchors[anchor+1].index)anchor++;
    const a=anchors[anchor],b=anchors[Math.min(anchor+1,anchors.length-1)];
    const span=route[b.index].distance-route[a.index].distance;
    const t=span?Math.max(0,Math.min(1,(node.distance-route[a.index].distance)/span)):0;
    const blend=t*t*t*(t*(t*6-15)+10);
    node.up=v(node.up).applyAxisAngle(v(node.tangent),a.angle+(b.angle-a.angle)*blend).normalize().toArray() as V3;
  });
  return route;
}
function makeLevel(index:number,halfSize:number,guides:Guide[],theme:NatureMaterial):Level {
  const route=smoothRoute(guides),count=route.length-1;
  const corridorRadius=.62;
  const blocks:Block[]=[];
  // Terrain is visual only. Carve continuous tunnels before merging the voxels.
  // Physics uses the route surfaces and an invisible, seamless corridor boundary.
  const cells=[5,7,9][index],unit=2*halfSize/cells;
  for(let x=0;x<cells;x++)for(let y=0;y<cells;y++)for(let z=0;z<cells;z++){
    const p:V3=[-halfSize+(x+.5)*unit,-halfSize+(y+.5)*unit,-halfSize+(z+.5)*unit];
    const d=Math.sqrt(nearestOnRoute(v(p),route).distanceSquared);
    if(d<corridorRadius+BALL_RADIUS+unit*.87)continue;
    let material:NatureMaterial=theme==='wood'?'wood':y>cells*.65?'soil':'stone';
    if(y===cells-1)material='moss';
    if(theme==='water'&&y===cells-1&&x>=cells*.5&&z<=cells*.5)material='water';
    blocks.push({position:p,size:[unit*.985,unit*.985,unit*.985],rotation:[0,0,0,1],material,terrain:true});
  }
  const names=['木漏れ日の箱庭','土の中の回廊','水を抱く大地'];
  const subtitles=['WOODLAND CUBE','EARTHEN PASSAGES','WATER WILDERNESS'];
  const descriptions=['木の外周から、森の内側へ。','土の層をくぐり、反対側の景色へ。','大きな大地の外と内を、ゆっくり巡る。'];
  const markerIndices=index===0?[Math.floor(count*.42)]:[Math.floor(count*.32),Math.floor(count*.68)];
  return {id:['woodland-cube','earthen-passages','water-wilderness-lowlands'][index],number:String(index+1).padStart(2,'0'),name:names[index],subtitle:subtitles[index],description:descriptions[index],difficulty:['小さな森','広い回廊','大きな大地'][index],materialLabel:['WOOD / MOSS','EARTH / ROOTS','WATER / STONE'][index],blocks,start:marker(route[0]),checkpoints:markerIndices.map(i=>marker(route[i])),goal:marker(route.at(-1)!),center:[0,0,0],halfSize,route,corridorRadius,routeLength:route.at(-1)!.distance,trackMaterial:theme};
}
function guides(h:number,index:number):Guide[]{
  const e=h+.65;
  const g=(p:V3,up:V3=[0,1,0]):Guide=>({p,up});
  // Top ledge -> right outer face -> carved interior -> left exit -> front ledge.
  const nodes=[
    g([-h*.72,e,h*.5]),g([h*.55,e,h*.5]),
    g([e,h*.58,h*.5],[1,0,0]),g([e,0,h*.2],[1,0,0]),
    g([h*.5,0,h*.2]),g([0,-h*.15,-h*.25]),g([-h*.5,-h*.25,-h*.2]),
    g([-e,-h*.25,-h*.2],[-1,0,0]),g([-e,-h*.48,h*.6],[-1,0,0]),
    g([-h*.55,-h*.48,e],[0,0,1]),g([h*.4,-h*.48,e],[0,0,1]),
  ];
  if(index>=1){
    // A second tunnel returns through the lower center without intersecting the first.
    nodes.push(g([h*.45,-h*.55,h*.45]),g([h*.15,-h*.6,-h*.4]),g([h*.55,-h*.6,-e],[0,0,-1]));
  }
  if(index===2){
    // Finish on a low, level ledge rather than climbing back to the top.
    // The right-side exit stays clear of both tunnels and gently levels its floor.
    nodes.push(g([e,-h*.6,-h*.55],[1,0,0]),g([e,-h*.65,-h*.1],[1,0,0]),g([e,-h*.65,h*.35]));
  }
  return nodes;
}
export const levels:Level[]=[2.2,3.6,5.4].map((h,i)=>makeLevel(i,h,guides(h,i),(['wood','soil','water'] as const)[i]));
