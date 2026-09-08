import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';
import {buildBridgePilot,bridgeRoadHeight} from './coastal-r2-bridge.js';
import {buildR3Settlement,buildR3Harbor,settlementBuildings} from './coastal-r3-settlement.js';

// Assets authored for this exhibition. Geometry/material ownership is per scene.
// Architectural details share geometry; repeated windows/trees use instances.
export class AssetPool {
 constructor(){this.resources=new Set();this.geometries=new Map();this.materials=new Map();this.batches=new Map();}
 own(r){this.resources.add(r);return r;}
 geo(key,make){if(!this.geometries.has(key))this.geometries.set(key,this.own(make()));return this.geometries.get(key);}
 grain(){
  if(this.surfaceGrain)return this.surfaceGrain;
  const size=128,data=new Uint8Array(size*size*4);let seed=19379;
  for(let i=0;i<size*size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=168+(seed>>>26);data.set([n,n,n,255],i*4);}
  const tex=this.own(new T.DataTexture(data,size,size));tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(7,7);tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return this.surfaceGrain=tex;
 }
 mat(name,color,roughness=.8,metalness=0,extra={}){if(!this.materials.has(name))this.materials.set(name,this.own(new T.MeshStandardMaterial({color,roughness,metalness,...extra})));return this.materials.get(name);}
 mesh(parent,kind,mat,position=[0,0,0],scale=[1,1,1]){const geo=this.geo(kind,()=>kind==='box'?new T.BoxGeometry(1,1,1):kind==='sphere'?new T.SphereGeometry(1,16,10):kind==='cone'?new T.ConeGeometry(1,1,10):new T.CylinderGeometry(1,1,1,10));const m=new T.Mesh(geo,mat);m.position.fromArray(position);m.scale.fromArray(scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 beam(parent,a,b,r,mat){const v=new T.Vector3(...a),w=new T.Vector3(...b),m=this.mesh(parent,'cylinder',mat, v.clone().add(w).multiplyScalar(.5).toArray(),[r,v.distanceTo(w),r]);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),w.sub(v).normalize());m.userData.fineDetail=r<.008;return m;}
 batch(kind,mat,position,scale,rotation=0){const key=kind+mat.uuid;if(!this.batches.has(key))this.batches.set(key,{kind,mat,items:[]});this.batches.get(key).items.push({position,scale,rotation});}
 flush(parent){const dummy=new T.Object3D();for(const b of this.batches.values()){const geo=this.geo(b.kind,()=>b.kind==='cone'?new T.ConeGeometry(1,1,7):b.kind==='sphere'?new T.SphereGeometry(1,8,6):new T.BoxGeometry(1,1,1));const m=this.own(new T.InstancedMesh(geo,b.mat,b.items.length));b.items.forEach((o,i)=>{dummy.position.fromArray(o.position);dummy.scale.fromArray(o.scale);dummy.rotation.set(0,o.rotation,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();parent.add(m);}this.batches.clear();}
 instanceStatic(root,excluded=[]){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),skip=new Set(),matrix=new T.Matrix4();for(const group of excluded)group?.traverse(o=>skip.add(o));const groups=new Map();
  root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||skip.has(o)||!o.visible)return;const key=o.geometry.uuid+o.material.uuid+Boolean(o.userData.fineDetail);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
  for(const meshes of groups.values()){if(meshes.length<4)continue;const instance=this.own(new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length));meshes.forEach((o,i)=>{instance.setMatrixAt(i,matrix.multiplyMatrices(inverse,o.matrixWorld));o.removeFromParent();});instance.castShadow=true;instance.receiveShadow=true;instance.userData.fineDetail=meshes[0].userData.fineDetail;instance.computeBoundingSphere();root.add(instance);}
 }
 dispose(){for(const r of this.resources)r.dispose?.();this.resources.clear();this.batches.clear();this.geometries.clear();this.materials.clear();}
}

export function palette(p){const grain=p.grain(),mineral={bumpMap:grain,bumpScale:.008},paint={bumpMap:grain,bumpScale:.002};return {
 concrete:p.mat('concrete',0xafa997,.91,0,mineral), edge:p.mat('edge',0xd9d1bc,.84,0,mineral), plaster:p.mat('plaster',0xc6bda5,.88,0,mineral),
 metal:p.mat('metal',0x748184,.42,.55,paint), steel:p.mat('steel',0x414e52,.52,.55,paint), rubber:p.mat('rubber',0x20292b,.98),
 glass:p.mat('glass',0x435f6a,.21,.36), roof:p.mat('roof',0x6b6860,.90,0,mineral), brick:p.mat('brick',0x97715b,.92,0,mineral),
 water:p.mat('water',0x315e66,.29,.28), soil:p.mat('soil',0x8e7964,1,0,mineral), rock:p.mat('rock',0x8d8980,.96,0,mineral),
 leaf:p.mat('leaf',0x526449,1), leaf2:p.mat('leaf2',0x728365,.98), trunk:p.mat('trunk',0x645a49,1),
 road:p.mat('road',0x424b4b,.96,0,mineral), stripe:p.mat('stripe',0xc5bba0,.91),
 light:p.mat('warm-window',0xc3b188,.75,0,{emissive:0xe2b87c,emissiveIntensity:.12}),
 white:p.mat('white',0xd4d8d2,.64,.05,paint), red:p.mat('red',0x985c47,.81,0,paint), green:p.mat('green',0x5a9a89,.62),
 naval:p.mat('naval-hull',0x77858a,.56,.42,paint), navalDeck:p.mat('naval-deck',0x4d5b60,.86,.20,paint),
 darkMetal:p.mat('dark-metal',0x2f3c40,.64,.42), sand:p.mat('quay-marking',0xc9b87e,.92),
 };}

// Shared bevel-free architectural primitives: tapered upper walls make readable
// roof/bridge silhouettes without an imported asset or additional texture fetch.
function taper(p,parent,mat,position,size,ratio=.8){
 const geo=p.geo('taper-'+ratio,()=>{const geo=new T.BoxGeometry(1,1,1),a=geo.attributes.position;for(let i=0;i<a.count;i++)if(a.getY(i)>0)a.setXYZ(i,a.getX(i)*ratio,a.getY(i),a.getZ(i)*ratio);geo.computeVertexNormals();return geo;});
 const mesh=new T.Mesh(geo,mat);mesh.position.fromArray(position);mesh.scale.fromArray(size);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

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
 p.mesh(g,'box',m.concrete,[0,.015,0],[.38,.04,.38]);
 for(const x of [-1,1])for(const z of [-1,1]){
  p.mesh(g,'box',m.edge,[x*.115,.044,z*.115],[.077,.052,.077]);p.mesh(structure,'box',m.darkMetal,[x*.105,.075,z*.105],[.043,.014,.043]);
  p.beam(structure,[x*.105,.06,z*.105],[x*.029,.76,z*.029],.01,m.metal);
  for(let i=0;i<5;i++){const y=.085+i*.125,r=.106-(y-.06)*.108,nr=r-.125*.108;
   p.beam(structure,[x*r,y,z*r],[-x*nr,y+.125,z*nr],.0045,m.metal);
   p.beam(structure,[x*r,y,z*r],[x*nr,y+.125,-z*nr],.0045,m.metal);
   p.beam(structure,[x*r,y,z*r],[-x*r,y,z*r],.005,m.steel);
  }
 }
 // Three sector antenna pairs, individual mounts and feeder cable run.
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3;for(const side of [-1,1]){
  const x=Math.cos(a)*.091+Math.sin(a)*side*.025,z=Math.sin(a)*.091-Math.cos(a)*side*.025;
  p.beam(structure,[0,.61,0],[x,.61,z],.005,m.steel);
  const panel=taper(p,structure,m.white,[x,.645,z],[.032,.205,.023],.86);panel.rotation.y=-a;
 }}
 p.beam(structure,[0,.72,0],[0,.91,0],.0045,m.steel);dish(p,structure,m,[.104,.425,0],.062);
 for(const x of [-.024,.024])p.beam(structure,[x,.085,-.069],[x,.70,-.021],.003,m.steel);
 for(let i=0;i<13;i++){const y=.095+i*.045;p.beam(structure,[-.024,y,-.075+y*.075],[.024,y,-.075+y*.075],.0028,m.metal);}
 p.beam(structure,[.021,.10,.075],[.021,.6,.03],.006,m.rubber);
 for(const x of [.27,.40]){
  p.mesh(g,'box',m.concrete,[x,.02,.025],[.12,.04,.18]);p.mesh(g,'box',m.edge,[x,.103,.025],[.10,.145,.145]);
  p.mesh(g,'box',m.metal,[x,.178,.025],[.111,.012,.16]);p.mesh(g,'box',m.steel,[x,.105,.100],[.072,.096,.006]);
  for(let i=0;i<5;i++)p.mesh(g,'box',m.metal,[x,.079+i*.012,.105],[.056,.004,.004]);
 }
 p.beam(g,[.27,.038,.025],[0,.038,0],.008,m.rubber);
 const lamp=p.mesh(structure,'sphere',p.mat('status-lamp',0x9acdc0,.6,0,{emissive:0x659687,emissiveIntensity:.6}),[0,.91,0],[.011,.011,.011]);g.userData.lamp=lamp;
 p.instanceStatic(structure,[lamp]);p.instanceStatic(g,[structure]);return g;
}

export function droneModel(p,m){
 const g=new T.Group();g.userData.rotors=[];
 const body=p.mesh(g,'sphere',m.white,[0,0,0],[.065,.026,.045]);
 p.mesh(g,'box',m.steel,[0,.016,0],[.07,.025,.064]);
 for(const x of [-1,1])for(const z of [-1,1]){
  p.beam(g,[x*.024,0,z*.02],[x*.106,0,z*.09],.009,m.steel);
  p.mesh(g,'cylinder',m.rubber,[x*.106,.008,z*.09],[.014,.031,.014]);
  const rotor=new T.Group();rotor.position.set(x*.106,.026,z*.09);g.add(rotor);
  // Both solid blades share one geometry/draw while each rotor retains its
  // independent transform. The geometry is the original two thin boxes.
  const blades=p.geo('rotor-blades',()=>{
   const box=new T.BoxGeometry(.16,.002,.010),first=box.toNonIndexed(),second=first.clone();second.rotateY(Math.PI/2);box.dispose();
   const geo=new T.BufferGeometry();for(const name of ['position','normal','uv']){const a=first.getAttribute(name),b=second.getAttribute(name),data=new Float32Array(a.array.length+b.array.length);data.set(a.array);data.set(b.array,a.array.length);geo.setAttribute(name,new T.BufferAttribute(data,a.itemSize));}first.dispose();second.dispose();return geo;
  });
  const blade=new T.Mesh(blades,m.steel);blade.castShadow=blade.receiveShadow=true;rotor.add(blade);g.userData.rotors.push(rotor);
  const disc=new T.Mesh(p.geo('rotor-disc',()=>new T.CircleGeometry(.08,24)),p.mat('rotor-disc',0x94a2a3,.9,0,{transparent:true,opacity:.10,side:T.DoubleSide,depthWrite:false}));disc.rotation.x=-Math.PI/2;rotor.add(disc);
 }
 for(const x of [-.045,.045]){p.beam(g,[x,0,.03],[x,-.055,.036],.004,m.metal);p.beam(g,[x,-.055,-.035],[x,-.055,.055],.004,m.metal);}
 p.mesh(g,'box',m.green,[0,-.045,0],[.032,.031,.04]);p.mesh(g,'sphere',m.glass,[0,-.06,.022],[.009,.009,.009]);
 p.beam(g,[.02,.025,0],[.02,.083,0],.002,m.steel);body.userData.body=true;p.instanceStatic(g,g.userData.rotors);return g;
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
 // Long pointed bow (-X), flared topsides, hard chine and squared transom.
 // Every ring is closed, including keel/deck caps; no open toy boat shell.
 const outline=[[-1.54,0],[-1.29,-.139],[-.89,-.225],[-.29,-.247],[.79,-.224],[1.38,-.187],[1.42,-.155],[1.42,.155],[1.38,.187],[.79,.224],[-.29,.247],[-.89,.225],[-1.29,.139]];
 const rings=[[-.14,.40,.95],[-.035,.87,1],[.055,.97,1],[.178,1,1]],vertices=[],idx=[],n=outline.length;
 const sheer=x=>Math.max(0,(-x-.55)/.99)*.056;
 for(const [y,s,sx] of rings)for(const [x,z] of outline)vertices.push(x*sx,y+(y>0?sheer(x):0),z*s);
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<n;i++){const j=(i+1)%n,a=r*n+i,b=r*n+j,c=(r+1)*n+i,d=(r+1)*n+j;idx.push(a,c,b,b,c,d);}
 const hullGeo=p.own(new T.BufferGeometry());hullGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));hullGeo.setIndex(idx);hullGeo.computeVertexNormals();
 const hull=new T.Mesh(hullGeo,m.naval);hull.castShadow=hull.receiveShadow=true;g.add(hull);
 const cap=(ring,mat,reverse=false)=>{const points=outline.map(([x,z])=>new T.Vector2(x,z)),triangles=T.ShapeUtils.triangulateShape(points,[]),v=[];for(const tri of triangles)for(const id of reverse?tri:tri.slice().reverse())v.push(...vertices.slice((ring*n+id)*3,(ring*n+id)*3+3));const geo=p.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.computeVertexNormals();const mesh=new T.Mesh(geo,mat);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);};
 cap(0,m.darkMetal,true);cap(3,m.navalDeck);
 const strip=[];for(let i=0;i<n;i++){const j=(i+1)%n;for(const [k,y] of [[i,-.016],[i,.008],[j,-.016],[i,.008],[j,.008],[j,-.016]])strip.push(outline[k][0]*1.001,y,outline[k][1]*.925);}
 const stripGeo=p.own(new T.BufferGeometry());stripGeo.setAttribute('position',new T.Float32BufferAttribute(strip,3));stripGeo.computeVertexNormals();g.add(new T.Mesh(stripGeo,m.darkMetal));
 // Recessed walkways and multiple sloped decks make the bridge read as a ship.
 taper(p,g,m.naval,[-.02,.31,0],[1.26,.255,.351],.87);
 taper(p,g,m.naval,[-.39,.497,0],[.54,.20,.315],.79);
 taper(p,g,m.glass,[-.411,.553,0],[.435,.061,.300],.90);
 p.mesh(g,'box',m.naval,[-.413,.593,0],[.48,.026,.325]);
 for(const z of [-.148,.148])for(const x of [-.57,-.45,-.33])p.mesh(g,'box',m.naval,[x,.555,z],[.013,.065,.010]);
 for(const z of [-.174,.174])for(let i=0;i<6;i++)p.mesh(g,'box',i%3?m.darkMetal:m.glass,[-.38+i*.14,.334,z],[.070,.050,.008]);
 taper(p,g,m.steel,[.33,.469,0],[.23,.225,.215],.67);p.mesh(g,'box',m.darkMetal,[.33,.589,0],[.155,.017,.14]);
 for(const z of [-.09,.09])p.beam(g,[.29,.40,z],[.29,.55,z],.009,m.metal);
 // A-frame sensor mast, planar radar, yardarms, radome and whip antennae.
 for(const z of [-.075,.075])p.beam(g,[-.02,.44,z],[-.01,.91,0],.014,m.naval);
 p.beam(g,[-.01,.85,0],[-.01,1.08,0],.007,m.metal);
 for(const y of [.75,.88]){p.beam(g,[-.11,y,0],[.115,y,0],.009,m.metal);p.beam(g,[0,y,-.14],[0,y,.14],.008,m.metal);}
 p.mesh(g,'box',m.naval,[-.01,.98,0],[.24,.082,.032]);p.mesh(g,'box',m.darkMetal,[-.01,.98,-.018],[.204,.059,.004]);
 p.mesh(g,'sphere',m.white,[.22,.69,0],[.071,.071,.071]);p.mesh(g,'cylinder',m.naval,[.22,.614,0],[.054,.08,.054]);
 for(const z of [-.115,.115])p.beam(g,[-.58,.60,z],[-.58,.85,z],.0025,m.steel);
 // Restrained forward turret is the existing event origin; no tactical model.
 p.mesh(g,'cylinder',m.naval,[-.96,.239,0],[.105,.067,.105]);taper(p,g,m.naval,[-.974,.307,0],[.199,.115,.166],.55);
 p.beam(g,[-1.02,.328,0],[-1.30,.38,0],.012,m.steel);g.userData.muzzle=new T.Vector3(-1.30,.38,0);
 p.mesh(g,'box',m.darkMetal,[-.72,.192,0],[.145,.018,.17]);
 for(const z of [-.199,.199]){
  rail(p,g,m,.32,.184,z,1.86);
  const boat=taper(p,g,m.rubber,[.39,.28,z*.95],[.37,.064,.085],.70);boat.rotation.y=.035;
  p.beam(g,[.23,.19,z],[.23,.38,z],.009,m.naval);p.beam(g,[.23,.38,z],[.43,.38,z],.009,m.naval);
 }
 // Flight deck graphic, tie-downs, mooring fittings, anchors and ventilation.
 p.mesh(g,'box',m.navalDeck,[.97,.186,0],[.72,.012,.327]);
 const ring=new T.Mesh(p.geo('deck-circle',()=>new T.RingGeometry(.114,.122,32)),m.stripe);ring.rotation.x=-Math.PI/2;ring.position.set(1,.194,0);g.add(ring);
 for(const z of [-.067,.067])p.mesh(g,'box',m.stripe,[1,.196,z],[.104,.004,.009]);p.mesh(g,'box',m.stripe,[1,.196,0],[.009,.004,.14]);
 for(const x of [-1.27,1.31])for(const z of [-.092,.092]){p.mesh(g,'cylinder',m.steel,[x,.216,z],[.014,.044,.014]);p.mesh(g,'box',m.steel,[x,.24,z],[.044,.011,.021]);}
 for(let i=0;i<5;i++)p.mesh(g,'box',m.darkMetal,[.20+i*.047,.441,.137],[.019,.061,.005]);
 p.instanceStatic(g);return g;
}

export function buildTown(p,m,layout,parent,r2=false){
 const scale=layout.renderScale,to=(x,z,y=0)=>[x*scale[0],terrainHeight(layout,x,z)*scale[1]+y,z*scale[2]];
 const blocks=new Map(),roadSurfaces=[],damageRoad=new T.Group();parent.add(damageRoad);
 const visualLayout=r2?{...layout,buildings:settlementBuildings(layout)}:layout;
 const settlement=r2?buildR3Settlement(p,m,layout,parent,blocks):null;
 if(!r2)for(const b of layout.buildings){
  const g=new T.Group();g.position.fromArray(to(b.x,b.z));g.userData.assetId=b.id;parent.add(g);blocks.set(b.id,g);
  const w=b.width*.02,d=b.depth*.02,h=b.height*.025;
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>terrainHeight(layout,b.x+x*b.width/2,b.z+z*b.depth/2)*.025),top=Math.max(...corners),bottom=Math.min(...corners);g.position.y=top;
  p.mesh(g,'box',m.concrete,[0,-(top-bottom)/2,0],[w+.04,top-bottom+.035,d+.04]);
  const facade=[m.plaster,m.concrete,m.brick,m.edge][b.style];
  p.mesh(g,'box',m.concrete,[0,.012,0],[w+.10,.028,d+.11]);
  p.mesh(g,'box',facade,[0,h/2,0],[w,h,d]);
  // A darker ground storey, visible floor bands and projecting balcony bays
  // create depth in an oblique still frame, rather than painted window dots.
  p.mesh(g,'box',m.steel,[0,.10,d/2+.004],[w*.86,.18,.014]);
  for(const x of [-w*.41,0,w*.41])p.mesh(g,'box',facade,[x,.105,d/2+.027],[.044,.21,.060]);
  for(let y=.32;y<h-.09;y+=.32){
   p.mesh(g,'box',m.edge,[0,y,d/2+.018],[w+.025,.020,.065]);
   if(b.style!==2){
    p.mesh(g,'box',m.concrete,[-w*.19,y-.045,d/2+.074],[w*.34,.025,.15]);
    p.mesh(g,'box',m.edge,[-w*.19,y+.006,d/2+.146],[w*.34,.079,.020]);
    for(const x of [-w*.35,-w*.03])p.mesh(g,'box',m.edge,[x,y+.006,d/2+.083],[.02,.079,.145]);
   }
  }
  if(b.style===2){for(const x of [-w*.46,w*.46])p.mesh(g,'box',m.edge,[x,h*.5,d/2+.029],[.034,h,.061]);}
  if(b.style===3){p.mesh(g,'box',m.plaster,[-w*.23,h+.135,-d*.19],[w*.41,.20,d*.45]);p.mesh(g,'box',m.edge,[-w*.23,h+.245,-d*.19],[w*.45,.026,d*.5]);}
  p.mesh(g,'box',m.roof,[0,h+.025,0],[w+.06,.05,d+.06]);
  // Four parapets, roof plant, entrance, balcony slabs; windows remain geometry.
  for(const z of [-d/2,d/2])p.mesh(g,'box',m.edge,[0,h+.06,z],[w,.08,.02]);
  for(const x of [-w/2,w/2])p.mesh(g,'box',m.edge,[x,h+.06,0],[.02,.08,d]);
  p.mesh(g,'box',m.metal,[-w*.22,h+.10,-d*.2],[w*.22,.1,d*.22]);
  for(let v=0;v<4;v++)p.mesh(g,'box',m.darkMetal,[-w*.22,h+.154,-d*.25+v*d*.033],[w*.19,.007,.008]);
  p.mesh(g,'box',m.darkMetal,[w*.40,h*.45,-d/2-.009],[.014,h*.9,.014]);
  if(b.roof===0){
   p.mesh(g,'box',m.concrete,[w*.26,h+.066,d*.15],[.23,.05,.23]);
   p.mesh(g,'cylinder',m.metal,[w*.26,h+.17,d*.15],[.085,.18,.085]);
   p.mesh(g,'cylinder',m.edge,[w*.26,h+.265,d*.15],[.09,.012,.09]);
   for(const y of [.12,.21])p.mesh(g,'cylinder',m.steel,[w*.26,h+y,d*.15],[.089,.009,.089]);
  }
  if(b.roof===1){
   for(const z of [-d*.16,d*.16]){const roof=p.mesh(g,'box',m.glass,[w*.13,h+.125,z],[w*.55,.02,d*.26]);roof.rotation.z=.15;
    p.mesh(g,'box',m.steel,[w*.13,h+.075,z],[w*.5,.04,.023]);}
  }
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
    const yAt=(px,pz,offset)=>{if(r2)return bridgeRoadHeight(layout,px,pz)+offset;const y=terrainHeight(layout,px,pz)*.025;const river=layout.terrain.riverBaseZ+layout.terrain.riverAmplitude*Math.sin(px/180);return Math.abs(pz-river)<90?Math.max(y,.315)+offset:y+offset;};
    const ribbon=(width,offset,dest)=>{const verts=[];for(const t of [t0,t1])for(const sign of [-1,1]){const px=a[0]+(b[0]-a[0])*t-dz*width/2*sign,pz=a[1]+(b[1]-a[1])*t+dx*width/2*sign;verts.push([px*.02,yAt(px,pz,offset),pz*.02]);}for(const id of [0,1,2,1,3,2])dest.push(...verts[id]);};
    ribbon(road.widthM+4,.012,curbPositions);
    ribbon(road.widthM,.024,road.id==='ridge-road'&&x>595&&x<705?cutPositions:positions);
    const pilotMark=r2&&x>=-270&&x<=510&&Math.abs(z-riverZ)<160;
    if(j%(pilotMark?2:3)===0){const y=yAt(x,z,.028),angle=Math.atan2(dx,dz);
     // Four realistic-width lanes at the two bridge approaches. Paint is
     // 0.175 m wide here; the old one-metre dots exaggerated the road scale.
     for(const cross of pilotMark?[-road.widthM/4,0,road.widthM/4]:[0])p.batch('box',m.stripe,[(x-dz*cross)*.02,y,(z+dx*cross)*.02],pilotMark?[.0035,.001,.070]:[.02,.006,.07],angle);
    }
   }
  }
  const surface=(positions,mat,parent)=>{if(!positions.length)return;const geo=p.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();const mesh=new T.Mesh(geo,mat);mesh.receiveShadow=true;parent.add(mesh);roadSurfaces.push(mesh);};
  surface(curbPositions,m.concrete,parent);surface(positions,m.road,parent);surface(cutPositions,m.road,damageRoad);
 }
 let bridge;
 if(r2)({bridge}=buildBridgePilot(p,m,layout,parent));else{
 // Bridge joins both banks, with piers, parapets and guardrails.
 bridge=new T.Group();const br=layout.bridge;bridge.position.set(br.x*.02,.25,br.z*.02);parent.add(bridge);
 p.mesh(bridge,'box',m.concrete,[0,0,0],[br.widthM*.02,.11,br.lengthM*.02]);p.mesh(bridge,'box',m.road,[0,.07,0],[(br.widthM-4)*.02,.025,br.lengthM*.02]);
 for(const z of [-.75,.0,.75])for(const x of [-.13,.13])p.mesh(bridge,'box',m.concrete,[x,-.14,z],[.07,.25,.16]);
 for(const x of [-.23,.23])rail(p,bridge,m,x,.07,0,br.lengthM*.02,'z');
 const coastBridge=new T.Group();coastBridge.position.set(-3.96,.25,layout.terrain.riverBaseZ*.02-.57);parent.add(coastBridge);
 p.mesh(coastBridge,'box',m.concrete,[0,0,0],[.5,.11,3.6]);
 for(const z of [-1.3,0,1.3])p.mesh(coastBridge,'box',m.concrete,[0,-.14,z],[.18,.25,.16]);
 for(const x of [-.23,.23])rail(p,coastBridge,m,x,.09,0,3.6,'z');
 }
 const harbor=r2?buildR3Harbor(p,m,layout,parent):null;
 if(!r2){
 // Shore-attached working harbour: a raised seawall, cargo apron and a
 // service connection lead from the existing coastal street into the quay.
 p.mesh(parent,'box',m.concrete,[-6.20,.045,10.5],[1.96,.35,4.65]);
 p.mesh(parent,'box',m.roof,[-5.50,.205,10.5],[1.45,.045,4.4]);
 p.mesh(parent,'box',m.edge,[-7.18,.235,10.5],[.08,.055,4.66]);
 p.mesh(parent,'box',m.concrete,[-4.54,.13,11.70],[2.0,.16,.73]);
 p.mesh(parent,'box',m.road,[-4.54,.220,11.70],[2.0,.025,.55]);
 for(let i=0;i<12;i++){
  const z=8.4+i*.38;
  p.mesh(parent,'box',m.darkMetal,[-7.225,.13,z],[.065,.15,.072]);
  p.mesh(parent,'box',m.sand,[-7.10,.266,z],[.056,.008,.14]);
  if(i%2===0){p.mesh(parent,'cylinder',m.steel,[-7.00,.29,z],[.022,.08,.022]);p.mesh(parent,'box',m.steel,[-7.00,.334,z],[.075,.017,.035]);}
 }
 for(let i=0;i<4;i++)p.mesh(parent,'box',m.sand,[-4.0-i*.35,.236,11.70],[.15,.006,.018]);
 // The breakwater uses irregular armouring, with a consistent service crest.
 p.mesh(parent,'box',m.rock,[-8.0,-.015,13.1],[.45,.29,6.0]);p.mesh(parent,'box',m.rock,[-6.95,-.015,16.0],[2.55,.29,.45]);
 p.mesh(parent,'box',m.concrete,[-8.0,.147,13.1],[.26,.032,5.95]);p.mesh(parent,'box',m.concrete,[-6.95,.147,16.0],[2.50,.032,.26]);
 const armourGeo=p.geo('harbour-armour',()=>new T.DodecahedronGeometry(1,0));
 for(let i=0;i<70;i++){
  const turn=i>=52,k=turn?i-52:i,x=turn?-8.1+k*.148:-8.0+Math.sin(i*2.4)*.19,z=turn?16+Math.sin(i*2.3)*.15:10.12+k*.115;
  const rock=new T.Mesh(armourGeo,i%3?m.rock:m.concrete);rock.position.set(x,.036+Math.sin(i)*.018,z);rock.scale.set(.115+(.021*(i%3)),.095,.13);rock.rotation.set(i*.71,i*.36,i*.18);rock.castShadow=rock.receiveShadow=true;parent.add(rock);
 }
 // Corrugated warehouse with a pitched roof, loading bays, canopy and vents.
 const warehouse=new T.Group();warehouse.position.set(-5.12,.23,9.50);parent.add(warehouse);
 p.mesh(warehouse,'box',m.edge,[0,.29,0],[.73,.58,1.48]);
 const roofGeo=p.geo('warehouse-roof',()=>{const shape=new T.Shape([new T.Vector2(-.5,0),new T.Vector2(0,.24),new T.Vector2(.5,0)]);const g=new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);return g;});
 const roof=new T.Mesh(roofGeo,m.roof);roof.position.y=.58;roof.scale.set(.81,.6,1.57);roof.castShadow=roof.receiveShadow=true;warehouse.add(roof);
 for(let i=0;i<13;i++)for(const side of [-1,1])p.mesh(warehouse,'box',m.concrete,[side*.37,.31,-.67+i*.112],[.017,.55,.023]);
 for(const z of [-.45,.10,.52]){
  p.mesh(warehouse,'box',m.darkMetal,[-.373,.185,z],[.014,.34,.285]);
  for(let y=.07;y<.32;y+=.045)p.mesh(warehouse,'box',m.metal,[-.384,y,z],[.010,.012,.272]);
  p.mesh(warehouse,'box',m.concrete,[-.44,.025,z],[.16,.05,.34]);
 }
 p.mesh(warehouse,'box',m.metal,[-.43,.41,0],[.22,.024,1.53]);
 for(const z of [-.46,.46])p.mesh(warehouse,'box',m.metal,[0,.77,z],[.16,.055,.20]);
 // Containers have end frames and corrugations, but one shared batch per
 // material after static consolidation regardless of the number of ribs.
 for(let i=0;i<8;i++){
  const x=-6.27+(i%2)*.43,z=10.16+Math.floor(i/2)*.53,h=.20,mat=i%3===0?m.red:i%3===1?m.metal:m.green;
  p.mesh(parent,'box',mat,[x,.24+h/2,z],[.36,h,.47]);
  for(let j=0;j<7;j++)for(const side of [-1,1])p.mesh(parent,'box',mat,[x+side*.184,.24+h/2,z-.19+j*.062],[.012,h*.90,.014]);
  for(const dx of [-.15,.15])p.mesh(parent,'box',m.steel,[x+dx,.24+h/2,z+.242],[.012,h*.95,.012]);
  p.mesh(parent,'box',m.edge,[x,.25+h,z],[.34,.013,.45]);
 }
 // Two compact lattice dock cranes: four legs, braced jib, counterweight,
 // control cabin and a single cable terminate visibly above the apron.
 for(const z of [8.78,12.12]){
  const crane=new T.Group();crane.position.set(-6.79,.25,z);parent.add(crane);
  for(const x of [-.15,.15])for(const zz of [-.14,.14]){
   p.mesh(crane,'box',m.steel,[x,.055,zz],[.085,.11,.10]);p.beam(crane,[x,.09,zz],[x*.64,.82,zz*.6],.022,m.metal);
   p.beam(crane,[x,.12,zz],[-x*.64,.75,zz*.6],.009,m.metal);
  }
  p.mesh(crane,'box',m.naval,[0,.81,0],[.39,.105,.34]);p.mesh(crane,'cylinder',m.steel,[0,.91,0],[.115,.1,.115]);
  p.beam(crane,[.03,.92,-.068],[-1.05,1.37,-.068],.022,m.metal);p.beam(crane,[.03,.92,.068],[-1.05,1.37,.068],.022,m.metal);
  p.beam(crane,[.04,1.13,0],[-1.06,1.54,0],.023,m.metal);
  for(let i=0;i<7;i++){const t=i/7,next=(i+1)/7;for(const side of [-1,1])p.beam(crane,[.03-1.08*t,.92+.45*t,side*.068],[.04-1.1*next,1.13+.41*next,0],.007,m.steel);}
  p.beam(crane,[0,.93,0],[.43,1.02,0],.032,m.metal);p.mesh(crane,'box',m.darkMetal,[.38,1.025,0],[.24,.18,.25]);
  p.mesh(crane,'box',m.naval,[-.15,1.02,.16],[.20,.17,.17]);p.mesh(crane,'box',m.glass,[-.19,1.04,.248],[.105,.10,.009]);
  p.beam(crane,[-1.055,1.41,0],[-1.055,.51,0],.005,m.steel);p.mesh(crane,'box',m.darkMetal,[-1.055,.51,0],[.065,.065,.065]);
 }
 // Utility lamps and a short parked service vehicle stay subordinate to nodes.
 for(const z of [8.4,10.8,12.5]){p.beam(parent,[-5.65,.24,z],[-5.65,.81,z],.011,m.steel);p.beam(parent,[-5.65,.81,z],[-5.85,.84,z],.009,m.steel);p.mesh(parent,'box',m.edge,[-5.85,.84,z],[.13,.025,.054]);}
 taper(p,parent,m.white,[-5.02,.335,12.26],[.26,.13,.49],.78);p.mesh(parent,'box',m.glass,[-5.02,.405,12.11],[.20,.07,.09]);
 for(const x of [-5.15,-4.89])for(const z of [12.11,12.40]){const wheel=p.mesh(parent,'cylinder',m.rubber,[x,.283,z],[.045,.027,.045]);wheel.rotation.z=Math.PI/2;}
 }
 return {blocks,bridge,damageRoad,roadSurfaces,visualLayout,r3:{settlement:settlement?.userData.r3,harbor:harbor?.userData.r3}};
}
