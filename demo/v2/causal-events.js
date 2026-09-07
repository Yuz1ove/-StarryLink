import * as THREE from 'three';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const clamp=x=>Math.max(0,Math.min(1,x));

/** Exhibition-only choreography. Targets and damage come from the backend frame. */
export class CausalEvents {
 constructor(parent,h){
  Object.assign(this,h);this.root=new THREE.Group();parent.add(this.root);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.18,'rgba(255,255,255,.9)');gradient.addColorStop(.5,'rgba(255,255,255,.25)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);this.particleTexture=new THREE.CanvasTexture(canvas);
  this.ship=new THREE.Group();this.root.add(this.ship);this.buildShip();
  this.attack=[];this.damage=[];this.slides=[];
  this.waves=Array.from({length:3},()=>{const wave=this.line(Array.from({length:81},()=>V(0,0,0)),0xe8b975,.5);this.root.add(wave);return wave;});
  for(let i=0;i<3;i++){
   const path=this.line(Array.from({length:61},()=>V(0,0,0)),0xff9d70,.9);this.root.add(path);
   const head=this.mesh(this.root,new THREE.SphereGeometry(.038,10,8),0xffedbf);head.material=new THREE.MeshBasicMaterial({color:0xffefc2});
   this.attack.push({path,head});
  }
  for(let i=0;i<8;i++)this.damage.push(this.buildDamage());
  const ridge=[[121.15,24.18],[121.10,23.95],[121.03,23.72]];
  for(const [lng,lat] of ridge){
   const group=new THREE.Group();const [x,z]=this.ll(lng,lat);group.position.set(x,this.elevation(lng,lat)+.04,z);this.root.add(group);
   const vertices=[];const base=this.elevation(lng,lat);const point=(i,side)=>{const t=i/10,dx=-t*.68,dz=t*.13+side*(.025+t*.09+Math.sin(i*7)*.012);return [dx,this.elevation(lng+dx/3.05,lat-dz/3.28)-base+.018,dz];};
   for(let i=0;i<10;i++){const a=point(i,-1),b=point(i,1),c=point(i+1,-1),d=point(i+1,1);vertices.push(...a,...b,...c,...b,...d,...c);}const scarGeo=new THREE.BufferGeometry();scarGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));scarGeo.computeVertexNormals();const scar=this.mesh(group,scarGeo,0x9c805d);scar.material.side=THREE.DoubleSide;
   const rocks=[];
   for(let i=0;i<18;i++){const rock=this.mesh(group,new THREE.DodecahedronGeometry(.025+(i%3)*.01,0),0x85715b);rock.userData.seed=i;rocks.push(rock);}
   const dust=this.particles(group,72,0xd9bc92,.075);this.slides.push({group,rocks,dust,scar,lng,lat,base});
  }
  this.ridgeLabel=this.label('CENTRAL MOUNTAIN RANGE','#d7c5a3',.60);this.ridgeLabel.position.set(1.6,1.9,0);this.root.add(this.ridgeLabel);
  this.losLabel=this.label('TERRAIN / LOS OBSTRUCTION','#edbe79',.52);this.losLabel.position.set(1.6,1.68,0);this.root.add(this.losLabel);
  this.fault=this.line([V(-.2,.8,-1.9),V(.08,.7,-1.35),V(-.12,.75,-.95),V(.12,.66,-.35)],0xe6b581,.95);this.root.add(this.fault);
  this.brokenRoad=new THREE.Group();this.root.add(this.brokenRoad);
  for(let i=0;i<12;i++){const lng=120.88+i*.027,lat=24.13;const [x,z]=this.ll(lng,lat);const road=this.mesh(this.brokenRoad,new THREE.BoxGeometry(.06,.015,.05),0xbda88b);road.position.set(x,this.elevation(lng,lat)+.035,z);road.userData.base=road.position.clone();road.userData.index=i;}
 }
 mesh(group,geo,color){const m=new THREE.Mesh(geo,this.material(color));group.add(m);return m;}
 glow(group,size){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.particleTexture,color:0xffc789,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.userData.size=size;sprite.scale.setScalar(size);group.add(sprite);return sprite;}
 particles(group,count,color,size){const p=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(count*3),3)),new THREE.PointsMaterial({map:this.particleTexture,color,size,transparent:true,opacity:.8,depthWrite:false}));group.add(p);return p;}
 buildShip(){
  // Shaped waterline, tapered bow, deck equipment and lit bridge; no weapon parameters.
  const hull=new THREE.Shape();hull.moveTo(-.18,-.75);hull.lineTo(.18,-.75);hull.lineTo(.25,.30);hull.quadraticCurveTo(.18,.69,0,.95);hull.quadraticCurveTo(-.18,.69,-.25,.30);hull.closePath();
  const geo=new THREE.ExtrudeGeometry(hull,{depth:.16,bevelEnabled:true,bevelSize:.045,bevelThickness:.035,bevelSegments:3,steps:1});geo.rotateX(Math.PI/2);
  const hullMesh=this.mesh(this.ship,geo,0x46505a);hullMesh.position.y=.08;
  const box=(w,h,d,x,y,z,color)=>{const m=this.mesh(this.ship,new THREE.BoxGeometry(w,h,d),color);m.position.set(x,y,z);return m;};
  box(.33,.12,.62,0,.12,.06,0x697780);box(.27,.16,.24,0,.25,.02,0x84939b);box(.32,.055,.27,0,.355,.01,0x566c77);
  for(const x of [-.12,-.06,0,.06,.12])box(.036,.032,.006,x,.335,.152,0xb6dfe2);
  box(.10,.17,.13,0,.24,-.32,0x34434c);box(.11,.012,.14,0,.33,-.32,0x1c2930);
  const mast=this.mesh(this.ship,new THREE.CylinderGeometry(.012,.02,.4,8),0x95a6ad);mast.position.set(0,.49,-.1);
  this.radar=this.mesh(this.ship,new THREE.BoxGeometry(.28,.08,.035),0x9fb4ba);this.radar.position.set(0,.70,-.1);
  for(const x of [-.19,.19])for(let i=0;i<11;i++){const rail=box(.006,.055,.006,x,.135,-.62+i*.11,0xa2afb1);rail.material.roughness=.8;}
  for(const z of [-.55,.40]){const boat=box(.08,.045,.20,.22,.17,z,0x657a85);boat.rotation.y=.05;}
  this.weapon=new THREE.Group();this.weapon.position.set(0,.17,.47);this.ship.add(this.weapon);
  const turret=this.mesh(this.weapon,new THREE.SphereGeometry(.12,20,12),0x8798a3);turret.scale.set(1,.65,1);
  const barrel=this.mesh(this.weapon,new THREE.CylinderGeometry(.016,.025,.34,12),0xa5b2b8);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.045,.21);
  this.muzzle=this.glow(this.weapon,.45);this.muzzle.position.set(0,.045,.4);
  this.launchSmoke=this.particles(this.weapon,36,0xb6b9b8,.065);
  for(const [x,c] of [[-.22,0xf97769],[.22,0x87e2b6]]){const nav=this.mesh(this.ship,new THREE.SphereGeometry(.016,8,6),c);nav.position.set(x,.2,.05);nav.material=new THREE.MeshBasicMaterial({color:c});}
  this.wake=[];
  for(let i=0;i<6;i++){const w=this.line([V(-.19-i*.045,-.10,-.55-i*.18),V(0,-.10,-.80-i*.18),V(.19+i*.045,-.10,-.55-i*.18)],0x8bb8bc,.28);this.ship.add(w);this.wake.push(w);}
  this.shipLabel=this.label('HOSTILE PLATFORM DETECTED','#efab92',.85);this.shipLabel.position.set(0,.95,0);this.ship.add(this.shipLabel);
  this.ship.rotation.y=1.12;this.ship.scale.setScalar(1.3);
 }
 buildDamage(){
  const group=new THREE.Group();this.root.add(group);
  const flash=this.glow(group,.85);
  const sparks=this.particles(group,42,0xffd490,.035),debris=[];
  for(let i=0;i<12;i++)debris.push(this.mesh(group,new THREE.TetrahedronGeometry(.025+(i%3)*.009),0x7e8988));
  const smoke=[];for(let i=0;i<9;i++){const m=this.mesh(group,new THREE.SphereGeometry(.12,10,8),0x42464a);m.material.transparent=true;m.material.depthWrite=false;smoke.push(m);}
  const fire=[];for(let i=0;i<4;i++){const m=this.mesh(group,new THREE.SphereGeometry(.075,10,8),0xffa451);m.material=new THREE.MeshBasicMaterial({color:i%2?0xffbe66:0xed6538,transparent:true,opacity:.8});fire.push(m);}
  const dust=this.particles(group,60,0xd5ba96,.07);
  return {group,flash,sparks,debris,smoke,fire,dust};
 }
 update(frame,layer,time){
  this.root.visible=!!frame&&layer!=='space'&&layer!=='sea';if(!frame)return;
  const hostile=frame.hazard.type==='infrastructure-disruption',impact=frame.hazard.impactSeconds;
  const age=Math.max(0,time-impact),hit=time>=impact;
  this.ship.visible=hostile;
  if(hostile){const [x,z]=this.ll(frame.hazard.platform.lng,frame.hazard.platform.lat);this.ship.position.set(x,.025+Math.sin(time*1.3)*.012,z);this.ship.rotation.z=Math.sin(time*.9)*.01;this.radar.rotation.y=time*.5;this.shipLabel.visible=frame.phase>=1;this.weapon.rotation.y=.30*clamp((time-4)/2);
   const firing=time>=6&&time<8,beat=(time-6)*3%1;this.muzzle.visible=firing;this.muzzle.scale.setScalar((.3+.7*(1-beat))*.45);this.muzzle.material.opacity=1-beat;
   this.launchSmoke.visible=firing||frame.phase===3;const a=this.launchSmoke.geometry.attributes.position;
   for(let i=0;i<a.count;i++){const t=(i/a.count+time*.4)%1;a.setXYZ(i,Math.sin(i*4)*t*.14,.05+t*.45,.4+t*.3);}a.needsUpdate=true;
   this.wake.forEach((w,i)=>{w.material.opacity=.12+.13*(.5+.5*Math.sin(time*1.2-i));});
  }
  this.attack.forEach((o,i)=>{
   const n=frame.networkState.nodes.find(n=>n.id===frame.hazard.targets?.[i]);o.path.visible=o.head.visible=hostile&&!!n&&time>=6&&time<=8.6;if(!n||!o.path.visible)return;
   const [x,z]=this.ll(n.position.lng,n.position.lat),start=this.ship.position.clone().add(V(.35,.3,0)),end=V(x,this.elevation(n.position.lng,n.position.lat)+.3,z),mid=start.clone().lerp(end,.5);mid.y=1.8+i*.23;
   const curve=new THREE.QuadraticBezierCurve3(start,mid,end),progress=clamp((time-6)/2),a=o.path.geometry.attributes.position;
   for(let j=0;j<a.count;j++){const p=curve.getPoint(Math.max(0,progress-.40)+j/(a.count-1)*Math.min(.40,progress));a.setXYZ(j,p.x,p.y,p.z);}a.needsUpdate=true;o.path.geometry.computeBoundingSphere();o.head.position.copy(curve.getPoint(progress));o.path.material.opacity=time>8?clamp((8.6-time)/.6):.9;
  });
  this.damage.forEach((o,i)=>{
   const f=frame.failures[i];o.group.visible=!!f&&hit&&['direct_impact','tower_backhaul','fiber_severed','terrain_obstruction'].includes(f.mode);if(!f)return;
   const [x,z]=this.ll(f.position.lng,f.position.lat);o.group.position.set(x,this.elevation(f.position.lng,f.position.lat)+.06,z);
   const direct=hostile&&f.mode==='direct_impact';o.flash.visible=direct&&age<.7;o.flash.scale.setScalar((1.3+Math.sin(clamp(age/.7)*Math.PI)*.8)*.85);o.flash.material.opacity=1-clamp(age/.7);
   o.sparks.visible=direct&&age<1.6;const a=o.sparks.geometry.attributes.position;
   for(let j=0;j<a.count;j++){const r=age*(.18+(j%7)*.06);a.setXYZ(j,Math.sin(j*2.4)*r,.1+age*(.5+(j%4)*.16)-age*age*.5,Math.cos(j*2.4)*r);}a.needsUpdate=true;
   o.debris.forEach((m,j)=>{const t=Math.min(age,1.3);m.position.set(Math.sin(j*2.4)*t*.32,Math.max(.02,t*.5-t*t*.34),Math.cos(j*2.4)*t*.32);m.rotation.set(t*j,t*j*.7,0);});
   o.smoke.forEach((m,j)=>{m.visible=direct;const t=(j/9+age*.13)%1;m.position.set(Math.sin(j*5)*.09+t*.18,.1+t*1.0,Math.cos(j*3)*.08);m.scale.setScalar(.4+t*1.7);m.material.opacity=(1-t)*.55*clamp(age*2+.1);});
   o.fire.forEach((m,j)=>{m.visible=direct;m.position.set(Math.sin(j*3)*.1,.08+(j%2)*.07,Math.cos(j*3)*.1);m.scale.set(.8,1.2+.5*Math.sin(time*13+j),.8);});
   o.dust.visible=!hostile;const d=o.dust.geometry.attributes.position;for(let j=0;j<d.count;j++){const t=(j/d.count+age*.09)%1;d.setXYZ(j,Math.sin(j*4)*(.1+t*.3),t*.4,Math.cos(j*4)*(.1+t*.3));}d.needsUpdate=true;o.dust.material.opacity=age<6?.7:.25;
  });
  this.waves.forEach((w,i)=>{w.visible=!hostile&&time>=3&&time<8;if(!w.visible)return;const radius=.06+((time-3)*.24+i*.25)%1*.7,a=w.geometry.attributes.position;for(let j=0;j<a.count;j++){const angle=j/(a.count-1)*Math.PI*2,lng=frame.hazard.epicenter.lng+Math.cos(angle)*radius,lat=frame.hazard.epicenter.lat+Math.sin(angle)*radius*.8,[x,z]=this.ll(lng,lat);a.setXYZ(j,x,this.elevation(lng,lat)+.03,z);}a.needsUpdate=true;w.geometry.computeBoundingSphere();w.material.opacity=.5*(1-radius/.8);});
  this.ridgeLabel.visible=!hostile;this.losLabel.visible=!hostile&&frame.phase>=2&&frame.phase<=6;this.fault.visible=!hostile&&time>=3;this.brokenRoad.visible=!hostile;
  this.brokenRoad.children.forEach(m=>{m.position.copy(m.userData.base);const damaged=time>=3&&m.userData.index>3&&m.userData.index<9;m.position.y-=damaged?.035:0;m.rotation.z=damaged?.2*Math.sin(m.userData.index):0;});
  this.slides.forEach((o,k)=>{o.group.visible=!hostile&&time>=3;const progress=clamp((time-3)/4);o.scar.geometry.setDrawRange(0,Math.max(6,Math.floor(progress*10)*6));o.rocks.forEach((r,i)=>{const t=clamp(progress-i*.015);const dx=-t*.68,dz=Math.sin(i*4)*.12+t*.13;r.position.set(dx,this.elevation(o.lng+dx/3.05,o.lat-dz/3.28)-o.base+.05,dz);r.rotation.set(t*i,t*i*.7,0);});const a=o.dust.geometry.attributes.position;for(let i=0;i<a.count;i++){const t=(i/a.count+(time-3)*.10)%1;a.setXYZ(i,Math.sin(i*7)*.17-progress*.20,.1+t*.18-progress*.2,progress*.4+Math.cos(i*3)*.18);}a.needsUpdate=true;o.dust.material.opacity=time<10?.65:.18;});
 }
}
