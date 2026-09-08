import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

// Physical context for the configured facilities. Only authoritative node/event
// state switches these meshes; this layer never creates a route or an ACK.
export function buildFacilityContext(pool, m, state, parent) {
 const layout=state.sceneContract.layout, sites=[];
 const steel=pool.mat('r3-oxidized-steel',0x685e4e,.84,.24);
 const insulator=pool.mat('r3-insulator',0x939c91,.4,.05);
 for(const id of ['ground-bs-01','backhaul-b']) {
  const node=state.baselineNetwork.nodes.find(n=>n.id===id);
  const [x,,z]=node.anchorM;
  const group=new T.Group();group.name=`facility-${id}`;
  group.position.set(x*.02,terrainHeight(layout,x,z)*.025,z*.02);parent.add(group);
  const port=id==='backhaul-b', w=port?.83:1.26,d=port?.65:.90;
  // A surveyed apron follows the same shared height field as the hillside.
  const top=group.position.y+.015;
  const surfaceAt=(px,pz)=>terrainHeight(layout,(group.position.x+px)/.02,(group.position.z+pz)/.02)*.025-group.position.y;
  const positions=[],uv=[];
  for(let a=0;a<8;a++)for(let b=0;b<6;b++){
   const verts=[];for(const [u,v]of [[a,b],[a+1,b],[a,b+1],[a+1,b+1]]){
    const px=(u/8-.5)*w,pz=(v/6-.5)*d;verts.push([px,surfaceAt(px,pz)+.009,pz,px/.04,pz/.04]);
   }
   for(const i of [0,2,1,1,2,3]){positions.push(...verts[i].slice(0,3));uv.push(...verts[i].slice(3));}
  }
  const pavement=new T.BufferGeometry();pavement.setAttribute('position',new T.Float32BufferAttribute(positions,3));pavement.setAttribute('uv',new T.Float32BufferAttribute(uv,2));pavement.computeVertexNormals();
  const apron=new T.Mesh(pool.own(pavement),m.r2Concrete||m.concrete);apron.receiveShadow=true;group.add(apron);
  const cabinet=new T.Group();const cx=port?-.31:.43,cz=port?-.14:-.17;
  cabinet.position.set(cx,surfaceAt(cx,cz)+.018,cz);group.add(cabinet);
  pool.mesh(cabinet,'box',m.concrete,[0,.02,0],[.25,.04,.24]);
  pool.mesh(cabinet,'box',m.edge,[0,.19,0],[.21,.34,.19]);
  pool.mesh(cabinet,'box',m.metal,[0,.36,0],[.245,.026,.22]);
  for(let i=0;i<6;i++)pool.mesh(cabinet,'box',m.darkMetal,[0,.19+i*.019,.097],[.14,.005,.004]);
  const door=pool.mesh(cabinet,'box',m.steel,[0,.14,.100],[.18,.21,.009]);
  const live=pool.mesh(cabinet,'box',pool.mat(`facility-lamp-${id}`,0xc0d6b6,.5,0,{emissive:0x9cbd8d,emissiveIntensity:.5}),[.066,.31,.1],[.015,.011,.004]);
  const broken=new T.Group();broken.name=`failed-feeder-${id}`;group.add(broken);
  for(let i=0;i<9;i++) {
   const a=i*2.399, r=.21+Math.sqrt(i/9)*.30;
   const slab=pool.mesh(broken,'box',i%3?m.concrete:steel,[Math.cos(a)*r,.04+top-group.position.y,Math.sin(a)*r],[.052+(i%3)*.029,.018,.047+(i%2)*.06]);
   slab.rotation.set(.17*Math.sin(i),a,.21*Math.cos(i));
  }
  // A visible severed feeder explains the failed tower/cabinet at rest.
  const wire=new T.CatmullRomCurve3([
   new T.Vector3(.43,.30+top-group.position.y,-.06),
   new T.Vector3(.46,.12+top-group.position.y,.10),
   new T.Vector3(.28,.022+top-group.position.y,.24),
   new T.Vector3(.15,.027+top-group.position.y,.32),
  ]);
  const cable=new T.Mesh(pool.own(new T.TubeGeometry(wire,14,.008,5,false)),m.rubber);broken.add(cable);
  pool.mesh(broken,'cylinder',insulator,[.32,.038+top-group.position.y,.26],[.018,.055,.018]).rotation.z=.8;
  for(const side of [-1,1]) {
   // Concrete shoulder curb, restrained hazard paint at the service entrance.
   for(let j=0;j<6;j++){const pz=-d*.36+j*d*.144;pool.mesh(group,'box',m.concrete,[side*w*.45,surfaceAt(side*w*.45,pz)+.020,pz],[.026,.035,d*.145]);}
   for(let i=0;i<4;i++)pool.mesh(group,'box',i%2?m.sand:m.darkMetal,[side*w*.45,surfaceAt(side*w*.45,-d*.24+i*d*.16)+.04,-d*.24+i*d*.16],[.042,.003,d*.09]);
  }
  pool.instanceStatic(group,[broken,door,live]);pool.instanceStatic(broken);
  broken.visible=false; sites.push({id,group,broken,door,live});
 }
 return {
  sites,
  update(frame) {
   for(const site of sites) {
    const n=frame.networkState.nodes.find(n=>n.id===site.id),failed=n.operation==='failed';
    site.live.visible=n.operation==='serving';site.broken.visible=failed;
    site.door.rotation.y=failed?-.72:0;
    site.door.material=failed?steel:m.steel;
   }
  },
  stats(){return sites.map(s=>({id:s.id,damaged:s.broken.visible,powered:s.live.visible}));}
 };
}
