import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

// Soft, seeded alpha masks keep smoke volumetric at a few dozen triangles.
export function smokeTexture(pool){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
 const ctx=canvas.getContext('2d');
 for(let i=0;i<24;i++){
  const a=i*2.399,r=8+Math.sqrt(i/24)*25,x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;
  const gradient=ctx.createRadialGradient(x,y,0,x,y,20+i%11);gradient.addColorStop(0,'rgba(255,255,255,.16)');gradient.addColorStop(.5,'rgba(255,255,255,.09)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 }
 const texture=pool.own(new T.CanvasTexture(canvas));texture.colorSpace=T.SRGBColorSpace;return texture;
}

export function buildImpactSites(pool,m,layout,events,parent){
 return events.filter(e=>e.kind==='impact').map(event=>{
  const group=new T.Group();parent.add(group);const [x,,z]=event.positionM;
  const ground=(px,pz,offset=.022)=>new T.Vector3(px,terrainHeight(layout,px/.02,pz/.02)*.025+offset,pz);
  const center=ground(x*.02,z*.02),vertices=[],colors=[];
  const radius=event.id==='event-primary'?.64:.38;
  for(let i=0;i<40;i++){
   for(const a of [-1,i,i+1]){
    const r=a<0?0:radius*(.85+.14*Math.sin(a*7.17));const angle=a/40*Math.PI*2;
    vertices.push(...ground(center.x+Math.cos(angle)*r,center.z+Math.sin(angle)*r).toArray());
    const c=new T.Color(a<0?0x373732:0x686453);colors.push(c.r,c.g,c.b);
   }
  }
  const geometry=pool.own(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const scar=new T.Mesh(geometry,pool.mat('impact-ground',0xffffff,1,0,{vertexColors:true,side:T.DoubleSide}));scar.receiveShadow=true;group.add(scar);
  for(let i=0;i<14;i++){
   const angle=i*2.399,r=radius*(.3+Math.sqrt(i/14)*.65),pos=ground(center.x+Math.cos(angle)*r,center.z+Math.sin(angle)*r,.055);
   const mesh=pool.mesh(group,i%3===0?'box':'cone',i%4===0?m.steel:m.concrete,pos.toArray(),[.028+(i%3)*.015,.035+(i%4)*.018,.06]);mesh.rotation.set(i*.53,i*1.7,i*.83);
  }
  // A backhaul cabinet failure is visible without collapsing the adjacent tower.
  if(event.id==='event-port'){
   const door=pool.mesh(group,'box',m.steel,center.clone().add(new T.Vector3(.19,.075,.16)).toArray(),[.17,.012,.17]);door.rotation.set(.2,.6,.3);
   pool.beam(group,center.clone().add(new T.Vector3(.10,.12,.10)).toArray(),center.clone().add(new T.Vector3(.24,.025,.21)).toArray(),.009,m.rubber);
  }
  group.visible=false;return {group,event};
 });
}
