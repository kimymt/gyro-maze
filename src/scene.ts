import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALL_RADIUS, type Level, type Marker, type NatureMaterial } from './levels';
import { natureMaterial, natureTexture } from './nature';
import { trackGeometries } from './track';
export class Scene {
  renderer:T.WebGLRenderer;
  scene=new T.Scene();camera=new T.PerspectiveCamera(36,1,.1,200);
  pivot=new T.Group();content=new T.Group();ball:T.Mesh;
  orientation=new T.Quaternion();zoom=1;quality=1;needsRender=true;
  private meshes:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>[]=[];
  private ray=new T.Raycaster();private resizeObserver:ResizeObserver;
  private environment:T.WebGLRenderTarget;private shadowLight:T.DirectionalLight;
  private geometries:T.BufferGeometry[]=[];private materials:T.Material[]=[];
  private textures=new Map<NatureMaterial,T.CanvasTexture>();
  private baseDistance=17;private radius=5;private halfSize=2.2;
  constructor(public canvas:HTMLCanvasElement){
    this.renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x101b1f,0);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
    const generator=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=generator.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();generator.dispose();
    this.scene.add(new T.HemisphereLight(0xeaf3cf,0x554338,1.8));
    this.shadowLight=new T.DirectionalLight(0xffe8b2,3);this.shadowLight.position.set(-8,15,10);this.shadowLight.castShadow=true;
    this.shadowLight.shadow.mapSize.set(1024,1024);this.shadowLight.shadow.bias=-.001;this.scene.add(this.shadowLight);
    const rim=new T.DirectionalLight(0xb0dbe1,1.5);rim.position.set(5,2,-8);this.scene.add(rim);
    this.pivot.add(this.content);this.scene.add(this.pivot);
    for(const kind of ['wood','soil','moss','stone','water'] as NatureMaterial[])this.textures.set(kind,natureTexture(kind));
    const ballMaterial=new T.MeshStandardMaterial({color:0xffedba,metalness:.12,roughness:.25,emissive:0x987333,emissiveIntensity:.28});
    this.ball=new T.Mesh(new T.SphereGeometry(BALL_RADIUS,24,18),ballMaterial);this.ball.castShadow=true;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  resize(){
    this.needsRender=true;const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8)*this.quality);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
    const vertical=T.MathUtils.degToRad(this.camera.fov),horizontal=2*Math.atan(Math.tan(vertical/2)*this.camera.aspect);
    this.baseDistance=this.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.06;
    this.camera.far=Math.max(200,this.baseDistance*4);this.updateCamera();this.camera.updateProjectionMatrix();
  }
  updateCamera(){
    this.needsRender=true;
    const focus=this.zoom>1?this.ball.getWorldPosition(new T.Vector3()).multiplyScalar(T.MathUtils.clamp((this.zoom-1)/.8,0,1)):new T.Vector3();
    this.camera.position.set(.47,.58,.72).normalize().multiplyScalar(this.baseDistance/this.zoom).add(focus);this.camera.lookAt(focus);this.camera.updateMatrixWorld();
  }
  setQuality(low:boolean){this.quality=low?.65:1;this.renderer.shadowMap.enabled=!low;this.resize();}
  load(level:Level){
    this.content.clear();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();this.geometries=[];this.materials=[];this.meshes=[];
    this.halfSize=level.halfSize;
    this.radius=Math.max(level.halfSize*Math.sqrt(3),...level.route.map(n=>new T.Vector3(...n.position).length()))+.9;
    this.content.position.set(...level.center).negate();
    const buckets=new Map<string,{kind:NatureMaterial;terrain:boolean;geometries:T.BufferGeometry[]}>();
    for(const block of level.blocks){
      // Merge in small spatial groups to keep large worlds inexpensive to draw.
      const octant=block.position.map(n=>n>=0?'1':'0').join('');
      const key=`terrain-${block.material}-${octant}`;
      if(!buckets.has(key))buckets.set(key,{kind:block.material,terrain:block.terrain,geometries:[]});
      const geo=new RoundedBoxGeometry(...block.size,1,.045);
      geo.applyQuaternion(new T.Quaternion(...block.rotation));geo.translate(...block.position);buckets.get(key)!.geometries.push(geo);
    }
    for(const bucket of buckets.values()){
      const geometry=mergeGeometries(bucket.geometries)!;bucket.geometries.forEach(g=>g.dispose());this.geometries.push(geometry);
      const material=natureMaterial(bucket.kind,this.textures.get(bucket.kind)!);this.materials.push(material);
      const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.terrain=bucket.terrain;mesh.userData.kind=bucket.kind;this.meshes.push(mesh);this.content.add(mesh);
    }
    for(const {geometry,kind} of trackGeometries(level)){
      this.geometries.push(geometry);const material=natureMaterial(kind,this.textures.get(kind)!);this.materials.push(material);
      const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.userData.terrain=false;mesh.userData.kind=kind;this.meshes.push(mesh);this.content.add(mesh);
    }
    this.addMarker(level.start,0xddd9ac,.29);for(const m of level.checkpoints)this.addMarker(m,0xf5c767,.3);this.addMarker(level.goal,0xd6fa8a,.46);
    this.content.add(this.ball);this.orientation.identity();this.zoom=1;
    const lightDistance=level.halfSize<=5.4?Math.hypot(8,15,10):Math.max(Math.hypot(8,15,10),this.radius*1.5+2);
    this.shadowLight.position.set(-8,15,10).setLength(lightDistance);
    Object.assign(this.shadowLight.shadow.camera,{left:-this.radius,right:this.radius,top:this.radius,bottom:-this.radius,near:.1,far:Math.max(60,lightDistance+this.radius+2)});this.shadowLight.shadow.camera.updateProjectionMatrix();this.resize();
  }
  private addMarker(marker:Marker,color:number,radius:number){
    const mat=new T.MeshBasicMaterial({color,toneMapped:false,side:T.DoubleSide});
    const geo=new T.TorusGeometry(radius,.04,8,32);this.geometries.push(geo);this.materials.push(mat);
    const ring=new T.Mesh(geo,mat);ring.position.set(...marker.position).addScaledVector(new T.Vector3(...marker.up),.04);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...marker.up));this.content.add(ring);
  }
  rotate(delta:T.Quaternion){this.needsRender=true;const q=this.camera.quaternion.clone().multiply(delta).multiply(this.camera.quaternion.clone().invert());this.orientation.premultiply(q).normalize();}
  get focusZoom(){return this.halfSize<=5.4?2.2:this.halfSize/2.2;}
  setZoom(ratio:number){this.zoom=T.MathUtils.clamp(this.zoom*ratio,.75,this.halfSize<=5.4?3.2:this.focusZoom*1.6);this.updateCamera();}
  draw(position:{x:number;y:number;z:number},rotation?:{x:number;y:number;z:number;w:number}){
    this.pivot.quaternion.copy(this.orientation);this.ball.position.copy(position);if(rotation)this.ball.quaternion.copy(rotation);this.scene.updateMatrixWorld(true);
    if(this.zoom>1)this.updateCamera();
    const ballWorld=this.ball.getWorldPosition(new T.Vector3());const direction=ballWorld.clone().sub(this.camera.position);
    this.ray.set(this.camera.position,direction.clone().normalize());this.ray.far=Math.max(0,direction.length()-.26);
    const occluded=new Set(this.ray.intersectObjects(this.meshes,false).map(hit=>hit.object));
    const inside=Math.max(Math.abs(position.x),Math.abs(position.y),Math.abs(position.z))<this.halfSize+.05;
    for(const mesh of this.meshes){
      const fade=occluded.has(mesh)||(inside&&mesh.userData.terrain);
      mesh.material.opacity=fade?(mesh.userData.terrain?.1:.16):1;mesh.material.depthWrite=!fade;mesh.castShadow=!fade;
    }
    this.textures.get('water')!.offset.x=(performance.now()*.000008)%1;
    this.renderer.render(this.scene,this.camera);this.needsRender=false;
  }
  dispose(){this.resizeObserver.disconnect();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();for(const t of this.textures.values())t.dispose();this.ball.geometry.dispose();(this.ball.material as T.Material).dispose();this.environment.dispose();this.renderer.dispose();}
}
