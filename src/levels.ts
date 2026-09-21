import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';
export type V3 = [number, number, number];
export type NatureMaterial = 'wood' | 'soil' | 'moss' | 'stone' | 'water';
export interface Block { position: V3; size: V3; rotation: [number, number, number, number]; material: NatureMaterial; terrain: boolean }
export interface Marker { position: V3; up: V3 }
export interface PathPoint { position: V3; up: V3; tangent: V3; distance: number }
export interface LevelDefinition {
  id: string; number: string; name: string; subtitle: string; description: string;
  difficulty: string; materialLabel: string; halfSize: number; theme: NatureMaterial;
}
export interface Level extends LevelDefinition {
  blocks: Block[]; start: Marker;
  checkpoints: Marker[]; goal: Marker; center: V3;
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
function smoothRoute(guides:Guide[],arcLengthDivisions=Math.max(1000,guides.length*200)):PathPoint[]{
  const curve=new CatmullRomCurve3(guides.map(n=>v(n.p)),false,'centripetal');
  curve.arcLengthDivisions=arcLengthDivisions;curve.updateArcLengths();
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
function makeLevel(index:number,definition:LevelDefinition,guides:Guide[]):Level {
  const {halfSize,theme}=definition;
  // Large worlds need a denser arc-length lookup to retain the same .05 floor spacing.
  const route=smoothRoute(guides,index>=3?Math.ceil(halfSize*1000):undefined),count=route.length-1;
  const corridorRadius=.62;
  const blocks:Block[]=[];
  // Terrain is visual only. Carve continuous tunnels before merging the voxels.
  // Physics uses the route surfaces and an invisible, seamless corridor boundary.
  const cells=Math.min(5+index*2,9),unit=2*halfSize/cells;
  for(let x=0;x<cells;x++)for(let y=0;y<cells;y++)for(let z=0;z<cells;z++){
    const p:V3=[-halfSize+(x+.5)*unit,-halfSize+(y+.5)*unit,-halfSize+(z+.5)*unit];
    if(index>=3&&!terrainAt(index,p.map(n=>n/halfSize) as V3))continue;
    const d=Math.sqrt(nearestOnRoute(v(p),route).distanceSquared);
    if(d<corridorRadius+BALL_RADIUS+unit*.87)continue;
    let material:NatureMaterial=theme==='wood'?'wood':y>cells*.65?'soil':'stone';
    if(index>=3&&theme==='moss'&&y>=cells-3)material='moss';
    if(y===cells-1)material='moss';
    if(theme==='water'&&y===cells-1&&x>=cells*.5&&z<=cells*.5)material='water';
    blocks.push({position:p,size:[unit*.985,unit*.985,unit*.985],rotation:[0,0,0,1],material,terrain:true});
  }
  const markerFractions=index===0?[.42]:index<3?[.32,.68]:[.25,.5,.75];
  const markerIndices=markerFractions.map(fraction=>Math.floor(count*fraction));
  return {...definition,blocks,start:marker(route[0]),checkpoints:markerIndices.map(i=>marker(route[i])),goal:marker(route.at(-1)!),center:[0,0,0],route,corridorRadius,routeLength:route.at(-1)!.distance,trackMaterial:theme};
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
// Menus read only this catalog. Geometry is generated when a world is selected.
export const levelDefinitions:readonly LevelDefinition[]=[
  {id:'woodland-cube',number:'01',name:'木漏れ日の箱庭',subtitle:'WOODLAND CUBE',description:'木の外周から、森の内側へ。',difficulty:'小さな森',materialLabel:'WOOD / MOSS',halfSize:2.2,theme:'wood'},
  {id:'earthen-passages',number:'02',name:'土の中の回廊',subtitle:'EARTHEN PASSAGES',description:'土の層をくぐり、反対側の景色へ。',difficulty:'広い回廊',materialLabel:'EARTH / ROOTS',halfSize:3.6,theme:'soil'},
  {id:'water-wilderness-lowlands',number:'03',name:'水を抱く大地',subtitle:'WATER WILDERNESS',description:'大きな大地の外と内を、ゆっくり巡る。',difficulty:'大きな大地',materialLabel:'WATER / STONE',halfSize:5.4,theme:'water'},
  {id:'fern-hollows-v2',number:'04',name:'苔の吹き抜け',subtitle:'FERN WELL',description:'苔の縁から、吹き抜けの底へ巻き込む。',difficulty:'吹き抜け',materialLabel:'MOSS / EARTH',halfSize:6.6,theme:'moss'},
  {id:'cedar-terraces-v2',number:'05',name:'杉の段丘',subtitle:'CEDAR TERRACES',description:'三段の木の斜面を、折り返して下る。',difficulty:'木の段丘',materialLabel:'WOOD / MOSS',halfSize:8,theme:'wood'},
  {id:'river-canyon-v2',number:'06',name:'峡谷の橋',subtitle:'CANYON BRIDGES',description:'深い谷を、異なる高さの橋で渡る。',difficulty:'峡谷の橋',materialLabel:'WATER / STONE',halfSize:9.6,theme:'water'},
  {id:'basalt-garden-v2',number:'07',name:'岩の螺旋',subtitle:'BASALT SPIRAL',description:'岩の塔を巻いて下り、中心を抜ける。',difficulty:'岩の螺旋',materialLabel:'STONE / MOSS',halfSize:11.4,theme:'stone'},
  {id:'emerald-caverns-v2',number:'08',name:'二重アーチ',subtitle:'TWIN ARCHES',description:'二つの岩窓をくぐり、道の上と下を巡る。',difficulty:'二重アーチ',materialLabel:'MOSS / STONE',halfSize:13.4,theme:'moss'},
  {id:'tidal-highlands-v2',number:'09',name:'水辺の島',subtitle:'TIDAL ISLANDS',description:'四つの島を渡り、外岸から地中へ潜る。',difficulty:'水辺の島',materialLabel:'WATER / EARTH',halfSize:15.6,theme:'water'},
  {id:'ancient-wilderness-v2',number:'10',name:'三層の大地',subtitle:'LAYERED WILDERNESS',description:'三層に重なる道を渡り、中庭の奥へ。',difficulty:'三層迷路',materialLabel:'EARTH / STONE',halfSize:18,theme:'soil'},
];

// Each world has a different massing, not just a recolored, rotated cube.
function terrainAt(index:number,[x,y,z]:V3):boolean {
  switch(index){
    case 3:return !(Math.abs(x)<.58&&Math.abs(z)<.58&&y>-.55); // Open well.
    case 4:return y<(x<-.4?1:x<.1?.55:.1); // Three broad timber terraces.
    case 5:return !(Math.abs(x)<.3&&y>-.65); // A ravine divides two banks.
    case 6:return y<-.55||Math.max(Math.abs(x),Math.abs(z))<(y>.3?.56:.78); // Stepped tower.
    case 7:return !(Math.abs(Math.abs(x)-.45)<.25&&Math.abs(z)<.8&&y>-.55&&y<.7); // Twin archways.
    case 8:return y<-.55||(Math.abs(x)>.2&&Math.abs(z)>.2); // Four islands on one base.
    case 9:return !(Math.abs(x)<.58&&Math.abs(z)<.58&&y>-.6)
      &&!(Math.abs(x)<.2&&y<-.05&&y>-.5); // Tiered courtyard with an open lower gate.
    default:return true;
  }
}
function expandedGuides(h:number,index:number):Guide[]{
  const e=1+.65/h;
  const g=(x:number,y:number,z:number,up:V3=[0,1,0]):Guide=>({p:[x*h,y*h,z*h],up});
  switch(index){
    case 3: // Descend into an open well, curl inward, then leave through its base.
      return [g(-.85,e,.75),g(.7,e,.75),g(e,.65,.2,[1,0,0]),
        g(.55,.32,-.5),g(-.45,.1,-.5),g(-.5,-.12,.4),g(.35,-.25,.5),
        g(.4,-.4,-.15),g(-.05,-.5,-.25),g(-e,-.62,-.25,[-1,0,0]),
        g(-e,-.8,.65,[-1,0,0]),g(-.3,-.8,e),g(.55,-.8,e)];
    case 4: // Parallel switchbacks step down the timber terraces, then enter the foundation.
      return [g(-.75,e,-.8),g(-.75,e,.75),g(-.3,.65,.85),g(-.3,.6,-.75),
        g(.35,.18,-.85),g(.35,.15,.75),g(e,-.08,.85,[1,0,0]),g(e,-.3,-.75,[1,0,0]),
        g(.5,-.4,-.5),g(-.5,-.55,-.5),g(-.75,-.78,.55),g(0,-.8,.65),g(.7,-.8,.65)];
    case 5: // Alternating bridges cross a full-depth ravine at different heights.
      return [g(-.8,e,-.85),g(-.8,e,.7),g(.8,.75,.7),g(.85,.65,-.65),
        g(-.8,.43,-.65),g(-.85,.32,.2),g(.8,.12,.2),g(e,-.1,-.75,[1,0,0]),
        g(.5,-.3,-e,[0,0,-1]),g(-.8,-.45,-e,[0,0,-1]),g(-.75,-.6,-.35),
        g(0,-.75,.1),g(.75,-.82,.65),g(e,-.82,.7),g(e,-.82,.1)];
    case 6: { // One and a half circuits of a square tower, followed by a radial tunnel.
      const perimeter:V3[]=[[-.8,0,e],[.8,0,e],[e,0,.8],[e,0,-.8],[.8,0,-e],[-.8,0,-e],[-e,0,-.8],[-e,0,.8]];
      const winding=Array.from({length:13},(_,i)=>{const [x,,z]=perimeter[i%8];return g(x,e-i*.12,z);});
      return [...winding,g(.6,-.48,-.65),g(.05,-.6,-.05),g(-.65,-.72,.65),g(-e,-.82,.75),g(-e,-.82,.1),g(-e,-.82,-.55)];
    }
    case 7: // Two broad loops share a crossing in plan, but pass at separate heights.
      return [g(-.85,e,-.75),g(-.75,e,.65),g(0,.85,.1),g(.8,.75,-.7),g(.85,.65,.75),
        g(.15,.5,.85),g(-.8,.4,-.25),g(-.85,.3,-e),g(.2,.18,-e),g(.85,.05,-.2),
        g(.75,-.08,.65),g(0,-.25,.1),g(-.8,-.4,-.65),g(-e,-.5,.65),
        g(-.1,-.62,e),g(.85,-.72,e),g(.75,-.82,.25),g(.05,-.82,-.05),g(-.55,-.82,-.25)];
    case 8: // Cross all four islands, sweep their outer shores, then cut through the base.
      return [g(-.8,e,.8),g(-.8,e,-.65),g(.75,.85,-.8),g(.8,.72,.7),g(-.65,.6,.8),
        g(-.75,.48,-.45),g(.5,.35,-.65),g(.65,.2,.45),g(-.45,.05,.65),
        g(-e,-.08,.1,[-1,0,0]),g(-e,-.2,-.8,[-1,0,0]),g(-.6,-.3,-e,[0,0,-1]),
        g(.75,-.4,-e,[0,0,-1]),g(e,-.5,-.6,[1,0,0]),g(e,-.58,.8,[1,0,0]),
        g(.5,-.66,e),g(-.65,-.72,e),g(-.6,-.82,.35),g(0,-.88,-.35),g(.65,-.88,-.35),g(.9,-.88,-.35)];
    case 9: { // Three decks of alternating traverses; outer ramps join the decks.
      const nodes:Guide[]=[];
      for(let floor=0;floor<3;floor++){
        const y=floor===0?e:floor===1?.25:-.55,sign=floor%2?-1:1;
        for(const [x,z] of [[-.8,-.75],[.8,-.75],[.8,0],[-.8,0],[-.8,.75],[.8,.75]])nodes.push(g(x*sign,y,z*sign));
        if(floor<2){nodes.push(g(e*sign,y-.15,.55*sign,[sign,0,0]),g(e*sign,y-.4,-.55*sign,[sign,0,0]));}
      }
      return [...nodes,g(e,-.72,.6,[1,0,0]),g(e,-.88,-.15),g(e,-.88,-.55),g(e,-.88,-.85)];
    }
    default:throw new RangeError('Unknown expanded course');
  }
}

const cache=new Map<number,Level>();
export function getLevel(index:number):Level {
  if(!Number.isInteger(index)||index<0||index>=levelDefinitions.length)throw new RangeError('Unknown stage index');
  let level=cache.get(index);
  if(!level){const definition=levelDefinitions[index];level=makeLevel(index,definition,index<3?guides(definition.halfSize,index):expandedGuides(definition.halfSize,index));cache.set(index,level);}
  return level;
}
// Compatibility for physics consumers: enumeration is lazy until an item is read.
export const levels:Level[]=new Array(levelDefinitions.length);
levelDefinitions.forEach((_,index)=>Object.defineProperty(levels,index,{enumerable:true,get:()=>getLevel(index)}));
