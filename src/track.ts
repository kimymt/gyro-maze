import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three';
import {CLEARANCE,TRACK_WIDTH,TRACK_BEVEL,TRACK_END_PADDING,type Level,type NatureMaterial,routeFrame} from './levels';

// Shared cross sections form one ribbon: no overlapping tiles or ledges at face changes.
export function trackGeometries(level:Level):{geometry:BufferGeometry;kind:NatureMaterial}[]{
  // End markers are inside the visible deck. Physics stops at the marker center,
  // while this flat extension supports the complete sphere and goal ring.
  const first=level.route[0],last=level.route.at(-1)!;
  const extend=(node:typeof first,amount:number)=>({...node,
    position:new Vector3(...node.position).addScaledVector(new Vector3(...node.tangent),amount).toArray() as typeof node.position,
    distance:node.distance+amount});
  const route=[extend(first,-TRACK_END_PADDING),...level.route,extend(last,TRACK_END_PADDING)];
  const half=TRACK_WIDTH/2,bevel=TRACK_BEVEL,top=-CLEARANCE,bottom=top-.2;
  const profile=[[-half+bevel,top,0,1],[half-bevel,top,0,1],
    [half,top-bevel,1,0],[half,bottom+bevel,1,0],
    [half-bevel,bottom,0,-1],[-half+bevel,bottom,0,-1],
    [-half,bottom+bevel,-1,0],[-half,top-bevel,-1,0]];
  const result:{geometry:BufferGeometry;kind:NatureMaterial}[]=[];
  const materialAt=(index:number):NatureMaterial=>level.trackMaterial==='water'
    ?(route[index].distance/level.routeLength>.28&&route[index].distance/level.routeLength<.7?'water':'stone'):level.trackMaterial;
  let start=0;
  while(start<route.length-1){
    const kind=materialAt(start);let end=start+1;
    while(end<route.length-1&&route[end].distance-route[start].distance<3&&materialAt(end)===kind)end++;
    const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let i=start;i<=end;i++){
      const {up,side}=routeFrame(route,Math.min(i,route.length-2),i===route.length-1?1:0);
      const center=new Vector3(...route[i].position);
      for(let j=0;j<profile.length;j++){
        const [x,y,nx,ny]=profile[j];
        positions.push(...center.clone().addScaledVector(side,x).addScaledVector(up,y).toArray());
        normals.push(...side.clone().multiplyScalar(nx).addScaledVector(up,ny).normalize().toArray());
        uvs.push((x+half)/TRACK_WIDTH,route[i].distance/TRACK_WIDTH);
      }
      if(i<end)for(let j=0;j<profile.length;j++){
        const a=(i-start)*profile.length+j,b=(i-start)*profile.length+(j+1)%profile.length;
        indices.push(a,a+profile.length,b,b,a+profile.length,b+profile.length);
      }
    }
    // Only the actual route endpoints are capped; render-group borders remain seamless.
    for(const [i,flip] of [[0,true],[route.length-1,false]] as const){
      if(i<start||i>end)continue;
      const {tangent,up,side}=routeFrame(route,Math.min(i,route.length-2),i===0?0:1);
      const center=new Vector3(...route[i].position),normal=tangent.multiplyScalar(flip?-1:1),base=positions.length/3;
      for(const [x,y] of profile){positions.push(...center.clone().addScaledVector(side,x).addScaledVector(up,y).toArray());normals.push(...normal.toArray());uvs.push((x+half)/TRACK_WIDTH,(y-bottom)/.2);}
      for(let j=1;j<profile.length-1;j++)indices.push(base,base+(flip?j:j+1),base+(flip?j+1:j));
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
    result.push({geometry,kind});start=end;
  }
  return result;
}
