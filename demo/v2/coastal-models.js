import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

// Assets authored for this exhibition. Geometry/material ownership is per scene.
// Architectural details share geometry; repeated windows/trees use instances.
export class AssetPool {
 constructor(){this.resources=new Set();this.geometries=new Map();this.materials=new Map();this.batches=new Map();}
 own(r){this.resources.add(r);return r;}
 geo(key,make){if(!this.geometries.has(key))this.geometries.set(key,this.own(make()));return this.geometries.get(key);}
 mat(name,color,roughness=.8,metalness=0,extra={}){if(!this.materials.has(name))this.materials.set(name,this.own(new T.MeshStandardMaterial({color,roughness,metalness,...extra})));return this.materials.get(name);}
 mesh(parent,kind,mat,position=[0,0,0],scale=[1,1,1]){const geo=this.geo(kind,()=>kind==='box'?new T.BoxGeometry(1,1,1):kind==='sphere'?new T.SphereGeometry(1,16,10):kind==='cone'?new T.ConeGeometry(1,1,10):new T.CylinderGeometry(1,1,1,10));const m=new T.Mesh(geo,mat);m.position.fromArray(position);m.scale.fromArray(scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 beam(parent,a,b,r,mat){const v=new T.Vector3(...a),w=new T.Vector3(...b),m=this.mesh(parent,'cylinder',mat, v.clone().add(w).multiplyScalar(.5).toArray(),[r,v.distanceTo(w),r]);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),w.sub(v).normalize());m.userData.fineDetail=r<.008;return m;}
 batch(kind,mat,position,scale,rotation=0){const key=kind+mat.uuid;if(!this.batches.has(key))this.batches.set(key,{kind,mat,items:[]});this.batches.get(key).items.push({position,scale,rotation});}
 flush(parent){const dummy=new T.Object3D();for(const b of this.batches.values()){const geo=this.geo(b.kind,()=>b.kind==='cone'?new T.ConeGeometry(1,1,7):b.kind==='sphere'?new T.SphereGeometry(1,8,6):new T.BoxGeometry(1,1,1));const m=this.own(new T.InstancedMesh(geo,b.mat,b.items.length));b.items.forEach((o,i)=>{dummy.position.fromArray(o.position);dummy.scale.fromArray(o.scale);dummy.rotation.set(0,o.rotation,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();parent.add(m);}this.batches.clear();}
 instanceStatic(root,excluded=[]){root.updateMatrixWorld(true);const skip=new Set();for(const group of excluded)group?.traverse(o=>skip.add(o));const groups=new Map();root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||skip.has(o)||!o.visible)return;const key=o.geometry.uuid+o.material.uuid;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});for(const meshes of groups.values()){if(meshes.length<4)continue;const instance=this.own(new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length));meshes.forEach((o,i)=>{instance.setMatrixAt(i,o.matrixWorld);o.removeFromParent();});instance.castShadow=true;instance.receiveShadow=true;instance.computeBoundingSphere();root.add(instance);}}
 dispose(){for(const r of this.resources)r.dispose?.();this.resources.clear();this.batches.clear();this.geometries.clear();this.materials.clear();}
}

export function palette(p){return {
 concrete:p.mat('concrete',0xb3ada0,.93), edge:p.mat('edge',0xddd4bd,.88), plaster:p.mat('plaster',0xc9c1ad,.91),
 metal:p.mat('metal',0x6b7474,.44,.55), steel:p.mat('steel',0x3e4647,.53,.5), rubber:p.mat('rubber',0x252e30,.98),
 glass:p.mat('glass',0x52676c,.19,.32), roof:p.mat('roof',0x706963,.91), brick:p.mat('brick',0x9c7764,.95),
 water:p.mat('water',0x365e64,.29,.28), soil:p.mat('soil',0x8e7964,1), rock:p.mat('rock',0x8d8980,.96),
 leaf:p.mat('leaf',0x526449,1), leaf2:p.mat('leaf2',0x728365,.98), trunk:p.mat('trunk',0x645a49,1),
 road:p.mat('road',0x4c5352,.95), stripe:p.mat('stripe',0xbdb8a3,.91),
 light:p.mat('warm-window',0xcfbc90,.75,0,{emissive:0xe2b87c,emissiveIntensity:.24}),
 white:p.mat('white',0xd5d8cf,.68), red:p.mat('red',0xa9664f,.85), green:p.mat('green',0x5a9a89,.62),
 };}

function dish(p,g,m,pos,size=.24){
 const geo=p.geo('dish',()=>new T.SphereGeometry(1,24,14,0,Math.PI*2,0,Math.PI*.35));
 const a=new T.Mesh(geo,m.white);a.position.fromArray(pos);a.rotation.z=.55;a.scale.setScalar(size);a.material.side=T.DoubleSide;g.add(a);
 p.beam(g,[pos[0],pos[1]-.15,pos[2]],[pos[0]-.12,pos[1]+.16,pos[2]],.012,m.metal);
}
function rail(p,g,m,x,y,z,length,axis='x'){
 for(let i=0;i<=Math.ceil(length/.16);i++){const d=i/Math.ceil(length/.16)*length-length/2;p.beam(g,[x+(axis==='x'?d:0),y,z+(axis==='z'?d:0)],[x+(axis==='x'?d:0),y+.055,z+(axis==='z'?d:0)],.005,m.metal);}
 p.beam(g,[x-(axis==='x'?length/2:0),y+.055,z-(axis==='z'?length/2:0)],[x+(axis==='x'?length/2:0),y+.055,z+(axis==='z'?length/2:0)],.007,m.metal);
}

export function towerModel(p,m){
 const g=new T.Group(),structure=new T.Group();g.add(structure);g.userData.structure=structure;
 p.mesh(g,'box',m.concrete,[0,.025,0],[.35,.05,.35]);
 for(const x of [-1,1])for(const z of [-1,1]){
  p.beam(structure,[x*.10,0,z*.10],[x*.032,.7,z*.032],.009,m.metal);
  for(let i=0;i<5;i++){const y=i*.135,r=.1-y*.095,nr=.1-(y+.135)*.095;p.beam(structure,[x*r,y,z*r],[-x*nr,y+.135,z*nr],.005,m.metal);p.beam(structure,[x*r,y,z*r],[x*nr,y+.135,-z*nr],.005,m.metal);}
 }
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const panel=p.mesh(structure,'box',m.white,[Math.cos(a)*.066,.64,Math.sin(a)*.066],[.032,.20,.022]);panel.rotation.y=-a;}
 p.beam(structure,[0,.63,0],[0,.84,0],.006,m.steel);dish(p,structure,m,[.1,.4,0],.058);
 for(const x of [.26,.39]){p.mesh(g,'box',m.edge,[x,.055,.04],[.09,.11,.14]);p.mesh(g,'box',m.steel,[x,.061,.112],[.06,.064,.004]);}
 p.beam(g,[.26,.02,.04],[.0,.02,.0],.008,m.rubber);
 const lamp=p.mesh(structure,'sphere',p.mat('status-lamp',0x9acdc0,.6,0,{emissive:0x659687,emissiveIntensity:.6}),[0,.84,0],[.013,.013,.013]);g.userData.lamp=lamp;
 return g;
}

export function droneModel(p,m){
 const g=new T.Group();g.userData.rotors=[];
 const body=p.mesh(g,'sphere',m.white,[0,0,0],[.065,.026,.045]);
 p.mesh(g,'box',m.steel,[0,.016,0],[.07,.025,.064]);
 for(const x of [-1,1])for(const z of [-1,1]){
  p.beam(g,[x*.024,0,z*.02],[x*.106,0,z*.09],.009,m.steel);
  p.mesh(g,'cylinder',m.rubber,[x*.106,.008,z*.09],[.014,.031,.014]);
  const rotor=new T.Group();rotor.position.set(x*.106,.026,z*.09);g.add(rotor);
  p.mesh(rotor,'box',m.steel,[0,0,0],[.16,.002,.010]);p.mesh(rotor,'box',m.steel,[0,0,0],[.010,.002,.16]);g.userData.rotors.push(rotor);
  const disc=new T.Mesh(p.geo('rotor-disc',()=>new T.CircleGeometry(.08,24)),p.mat('rotor-disc',0x94a2a3,.9,0,{transparent:true,opacity:.10,side:T.DoubleSide,depthWrite:false}));disc.rotation.x=-Math.PI/2;rotor.add(disc);
 }
 for(const x of [-.045,.045]){p.beam(g,[x,0,.03],[x,-.055,.036],.004,m.metal);p.beam(g,[x,-.055,-.035],[x,-.055,.055],.004,m.metal);}
 p.mesh(g,'box',m.green,[0,-.045,0],[.032,.031,.04]);p.mesh(g,'sphere',m.glass,[0,-.06,.022],[.009,.009,.009]);
 p.beam(g,[.02,.025,0],[.02,.083,0],.002,m.steel);body.userData.body=true;return g;
}

export function terminalModel(p,m){
 const g=new T.Group();p.mesh(g,'box',m.concrete,[0,.015,0],[.52,.03,.4]);
 p.mesh(g,'box',m.white,[0,.095,0],[.30,.16,.19]);p.mesh(g,'box',m.glass,[0,.12,.097],[.17,.05,.006]);
 for(const x of [-.1,.1])for(const z of [-.07,.07]){const wheel=p.mesh(g,'cylinder',m.rubber,[x,.035,z],[.027,.018,.027]);wheel.rotation.z=Math.PI/2;}
 p.beam(g,[.18,0,0],[.18,.50,0],.009,m.metal);
 for(const y of [.36,.42,.48])p.beam(g,[.13,y,0],[.23,y,0],.004,m.metal);
 p.mesh(g,'box',m.green,[.0,.06,-.15],[.17,.08,.09]);p.beam(g,[.17,.03,0],[0,.03,-.15],.006,m.rubber);
 return g;
}

export function centerModel(p,m){
 const g=new T.Group();p.mesh(g,'box',m.concrete,[0,.025,0],[1.7,.05,1.15]);
 p.mesh(g,'box',m.road,[0,.015,1.0],[.4,.03,.9]);
 p.mesh(g,'box',m.plaster,[0,.19,0],[1.24,.34,.75]);p.mesh(g,'box',m.glass,[0,.17,.381],[1.10,.23,.015]);
 for(let x=-.5;x<=.51;x+=.10)p.mesh(g,'box',m.edge,[x,.18,.40],[.014,.30,.04]);
 p.mesh(g,'box',m.edge,[0,.385,0],[1.33,.045,.83]);p.mesh(g,'box',m.roof,[-.33,.51,-.06],[.35,.23,.42]);
 p.mesh(g,'box',m.edge,[0,.09,.58],[.40,.025,.37]);p.mesh(g,'box',m.metal,[0,.26,.52],[.5,.024,.3]);
 for(const x of [-.2,.2])p.beam(g,[x,.0,.65],[x,.26,.65],.013,m.edge);
 for(let i=0;i<3;i++)p.mesh(g,'box',m.metal,[.14+i*.16,.43,-.17],[.11,.05,.16]);
 dish(p,g,m,[.34,.53,.07],.15);p.beam(g,[-.5,.40,-.23],[-.5,.94,-.23],.012,m.metal);
 for(const y of [.73,.83])p.beam(g,[-.65,y,-.23],[-.35,y,-.23],.006,m.metal);
 rail(p,g,m,0,.41,-.39,1.26);rail(p,g,m,-.64,.41,0,.78,'z');
 return g;
}

export function vesselModel(p,m){
 const g=new T.Group();
 // Closed, tapered hull with separate submerged, waterline and deck rings.
 const outline=[[-1.4,0],[-1.08,-.22],[-.45,-.29],[.95,-.27],[1.34,-.17],[1.4,0],[1.34,.17],[.95,.27],[-.45,.29],[-1.08,.22]];
 const rings=[[-.13,.65],[-.035,.90],[.08,1],[.17,.97]],vertices=[],idx=[];
 for(const [y,s] of rings)for(const [x,z] of outline)vertices.push(x,y,z*s);
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length,a=r*10+i,b=r*10+j,c=(r+1)*10+i,d=(r+1)*10+j;idx.push(a,c,b,b,c,d);}
 const hullGeo=p.own(new T.BufferGeometry());hullGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));hullGeo.setIndex(idx);hullGeo.computeVertexNormals();
 const hull=new T.Mesh(hullGeo,m.metal);hull.castShadow=true;g.add(hull);
 const shape=new T.Shape(outline.map(([x,z])=>new T.Vector2(x,-z)));const deck=new T.Mesh(p.own(new T.ShapeGeometry(shape)),m.steel);deck.rotation.x=-Math.PI/2;deck.position.y=.175;g.add(deck);
 const waterline=[];for(const [x,z] of [...outline,outline[0]])waterline.push(new T.Vector3(x,0,z*.94));const wl=new T.Line(p.own(new T.BufferGeometry().setFromPoints(waterline)),p.own(new T.LineBasicMaterial({color:0x273b3c})));g.add(wl);
 p.mesh(g,'box',m.metal,[.08,.32,0],[.93,.29,.39]);p.mesh(g,'box',m.metal,[-.20,.52,0],[.37,.18,.32]);
 p.mesh(g,'box',m.glass,[-.24,.55,0],[.36,.061,.335]);p.mesh(g,'box',m.edge,[-.25,.645,0],[.42,.035,.38]);
 p.mesh(g,'box',m.steel,[.42,.46,0],[.16,.13,.19]);
 p.beam(g,[.0,.42,0],[.0,1.15,0],.016,m.metal);
 for(const y of [.79,.96]){p.beam(g,[-.16,y,0],[.16,y,0],.013,m.metal);p.beam(g,[0,y,-.13],[0,y,.13],.01,m.metal);}
 p.mesh(g,'box',m.steel,[.0,1.05,0],[.26,.11,.025]);p.mesh(g,'sphere',m.edge,[.21,.69,0],[.067,.067,.067]);
 p.mesh(g,'cylinder',m.metal,[-.82,.22,0],[.12,.08,.12]);p.mesh(g,'box',m.metal,[-.86,.28,0],[.18,.12,.19]);
 p.beam(g,[-.89,.31,0],[-1.16,.38,0],.015,m.steel);g.userData.muzzle=new T.Vector3(-1.16,.38,0);
 for(const z of [-.25,.25])rail(p,g,m,.3,.18,z,1.7);
 p.mesh(g,'box',m.roof,[.92,.185,0],[.6,.012,.41]);
 for(const x of [.70,1.14])p.mesh(g,'box',m.stripe,[x,.195,0],[.012,.006,.24]);p.mesh(g,'box',m.stripe,[.92,.195,0],[.43,.006,.014]);
 return g;
}

export function buildTown(p,m,layout,parent){
 const scale=layout.renderScale,to=(x,z,y=0)=>[x*scale[0],terrainHeight(layout,x,z)*scale[1]+y,z*scale[2]];
 const blocks=new Map(),roadSurfaces=[],damageRoad=new T.Group();parent.add(damageRoad);
 for(const b of layout.buildings){
  const g=new T.Group();g.position.fromArray(to(b.x,b.z));g.userData.assetId=b.id;parent.add(g);blocks.set(b.id,g);
  const w=b.width*.02,d=b.depth*.02,h=b.height*.025;
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>terrainHeight(layout,b.x+x*b.width/2,b.z+z*b.depth/2)*.025),top=Math.max(...corners),bottom=Math.min(...corners);g.position.y=top;
  p.mesh(g,'box',m.concrete,[0,-(top-bottom)/2,0],[w+.04,top-bottom+.035,d+.04]);
  p.mesh(g,'box',[m.plaster,m.concrete,m.brick,m.edge][b.style],[0,h/2,0],[w,h,d]);
  p.mesh(g,'box',m.roof,[0,h+.025,0],[w+.06,.05,d+.06]);
  // Four parapets, roof plant, entrance, balcony slabs; windows remain geometry.
  for(const z of [-d/2,d/2])p.mesh(g,'box',m.edge,[0,h+.06,z],[w,.08,.02]);
  for(const x of [-w/2,w/2])p.mesh(g,'box',m.edge,[x,h+.06,0],[.02,.08,d]);
  p.mesh(g,'box',m.metal,[-w*.22,h+.10,-d*.2],[w*.22,.1,d*.22]);
  if(b.roof===0){p.mesh(g,'cylinder',m.steel,[w*.26,h+.13,d*.15],[.09,.19,.09]);}
  if(b.roof===1){const roof=p.mesh(g,'box',m.glass,[w*.13,h+.13,0],[w*.55,.02,d*.6]);roof.rotation.z=.15;}
  p.mesh(g,'box',m.glass,[0,.095,d/2+.014],[.13,.19,.016]);
  p.mesh(g,'box',m.edge,[0,.23,d/2+.05],[.20,.025,.12]);
  const base=g.position;
  for(let y=.16;y<h-.08;y+=.16)for(let x=-w/2+.11;x<w/2-.04;x+=.17){
   for(const side of [-1,1]){
    p.batch('box',m.metal,[base.x+x,base.y+y,base.z+side*(d/2+.004)],[.101,.101,.012]);
    p.batch('box',b.style===2?m.light:m.glass,[base.x+x,base.y+y,base.z+side*(d/2+.012)],[.082,.08,.012]);
   }
  }
  for(let y=.16;y<h-.08;y+=.16)for(let z=-d/2+.11;z<d/2-.04;z+=.17)for(const side of [-1,1])p.batch('box',m.glass,[base.x+side*(w/2+.01),base.y+y,base.z+z],[.013,.085,.085]);
 }
 for(const road of layout.roads){
  const positions=[],cutPositions=[],curbPositions=[];
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),segments=Math.ceil(length/7),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
   for(let j=0;j<segments;j++){
    const t0=j/segments,t1=(j+1)/segments,x=a[0]+(b[0]-a[0])*(t0+t1)/2,z=a[1]+(b[1]-a[1])*(t0+t1)/2;
    const riverZ=layout.terrain.riverBaseZ+layout.terrain.riverAmplitude*Math.sin(x/180);
    const yAt=(px,pz,offset)=>{const y=terrainHeight(layout,px,pz)*.025;const river=layout.terrain.riverBaseZ+layout.terrain.riverAmplitude*Math.sin(px/180);return Math.abs(pz-river)<90?Math.max(y,.315)+offset:y+offset;};
    const ribbon=(width,offset,dest)=>{const verts=[];for(const t of [t0,t1])for(const sign of [-1,1]){const px=a[0]+(b[0]-a[0])*t-dz*width/2*sign,pz=a[1]+(b[1]-a[1])*t+dx*width/2*sign;verts.push([px*.02,yAt(px,pz,offset),pz*.02]);}for(const id of [0,1,2,1,3,2])dest.push(...verts[id]);};
    ribbon(road.widthM+4,.012,curbPositions);
    ribbon(road.widthM,.024,road.id==='ridge-road'&&x>595&&x<705?cutPositions:positions);
    if(j%3===0){const y=yAt(x,z,.028),angle=Math.atan2(dx,dz);p.batch('box',m.stripe,[x*.02,y,z*.02],[.02,.006,.07],angle);}
   }
  }
  const surface=(positions,mat,parent)=>{if(!positions.length)return;const geo=p.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();const mesh=new T.Mesh(geo,mat);mesh.receiveShadow=true;parent.add(mesh);roadSurfaces.push(mesh);};
  surface(curbPositions,m.concrete,parent);surface(positions,m.road,parent);surface(cutPositions,m.road,damageRoad);
 }
 // Bridge joins both banks, with piers, parapets and guardrails.
 const bridge=new T.Group(),br=layout.bridge;bridge.position.set(br.x*.02,.25,br.z*.02);parent.add(bridge);
 p.mesh(bridge,'box',m.concrete,[0,0,0],[br.widthM*.02,.11,br.lengthM*.02]);p.mesh(bridge,'box',m.road,[0,.07,0],[(br.widthM-4)*.02,.025,br.lengthM*.02]);
 for(const z of [-.75,.0,.75])for(const x of [-.13,.13])p.mesh(bridge,'box',m.concrete,[x,-.14,z],[.07,.25,.16]);
 for(const x of [-.23,.23])rail(p,bridge,m,x,.07,0,br.lengthM*.02,'z');
 const coastBridge=new T.Group();coastBridge.position.set(-3.96,.25,layout.terrain.riverBaseZ*.02-.57);parent.add(coastBridge);
 p.mesh(coastBridge,'box',m.concrete,[0,0,0],[.5,.11,3.6]);
 for(const z of [-1.3,0,1.3])p.mesh(coastBridge,'box',m.concrete,[0,-.14,z],[.18,.25,.16]);
 for(const x of [-.23,.23])rail(p,coastBridge,m,x,.09,0,3.6,'z');
 // Port quay, breakwater and cargo equipment have a coherent shore attachment.
 p.mesh(parent,'box',m.concrete,[-6.35,.05,10.5],[1.65,.22,4.6]);
 p.mesh(parent,'box',m.rock,[-8.0,-.05,13.1],[.44,.24,6.0]);p.mesh(parent,'box',m.rock,[-6.95,-.05,16.0],[2.55,.24,.44]);
 for(let i=0;i<7;i++){const x=-6.5+(i%2)*.5,z=9+Math.floor(i/2)*.8;p.mesh(parent,'box',i%2?m.red:m.metal,[x,.25,z],[.4,.35,.7]);}
 for(const z of [9.3,11.6]){p.beam(parent,[-6.05,.2,z],[-6.05,1.25,z],.045,m.metal);p.beam(parent,[-6.05,1.25,z],[-7.2,1.55,z],.045,m.metal);p.beam(parent,[-7.1,1.53,z],[-7.1,.65,z],.008,m.steel);}
 // Seeded trees avoid road corridors, river and building footprints.
 for(let i=0;i<520;i++){
  const n=(Math.sin(i*127.1+19)*43758.5453)%1,x=250+Math.abs(n)*1140,z=-900+((i*137.508)%1800),h=terrainHeight(layout,x,z);
  if(h<15||layout.buildings.some(b=>Math.abs(b.x-x)<b.width*.7&&Math.abs(b.z-z)<b.depth*.7)||Math.abs(z+430)<35||Math.abs(x-160)<30||Math.abs(z-380)<30)continue;
  const pos=to(x,z),size=.16+Math.abs(Math.sin(i*4.1))*.12;
  p.batch('box',m.trunk,[pos[0],pos[1]+size*.4,pos[2]],[.027,size*.8,.027]);
  p.batch('sphere',i%2?m.leaf:m.leaf2,[pos[0],pos[1]+size*1.25,pos[2]],[size*.78,size*.72,size*.74]);
  p.batch('sphere',m.leaf,[pos[0]-size*.46,pos[1]+size*.94,pos[2]+size*.19],[size*.59,size*.53,size*.6]);
  p.batch('sphere',m.leaf2,[pos[0]+size*.4,pos[1]+size*1.02,pos[2]-size*.27],[size*.55,size*.64,size*.5]);
 }
 return {blocks,bridge,damageRoad,roadSurfaces};
}
