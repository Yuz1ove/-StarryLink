import * as THREE from 'three';
import {CausalEvents} from './causal-events.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const cities=[['TAIPEI',121.56,25.04],['HSINCHU',121.00,24.80],['TAICHUNG',120.67,24.15],['CHIAYI',120.45,23.49],['TAINAN',120.22,23.00],['KAOHSIUNG',120.31,22.63],['HUALIEN',121.61,23.98]];
export const WORLD_PRESETS={
 all:{eye:[8.7,9.2,12.6],target:[0,.6,0],fog:0x0a151d,density:.014,title:'TAIWAN / RESILIENCE DIGITAL TWIN',detail:'城市燈光 · 山脈 · 跨層通訊'},
 ground:{eye:[5.6,4.6,7.9],target:[0,.2,-.6],fog:0x102624,density:.025,title:'GROUND / INFRASTRUCTURE',detail:'城市 · 地面骨幹 · 行動通訊'},
 sea:{eye:[8.6,-.72,11.8],target:[1,-1.8,.3],fog:0x061d30,density:.042,title:'SUBSEA / BELOW THE SURFACE',detail:'海纜 · 水下中繼 · 登陸站'},
 air:{eye:[7.8,6.4,9.2],target:[0,2.2,-.5],fog:0x163045,density:.021,title:'AIR / ADAPTIVE RELAY',detail:'無人機 · 臨時網狀網路 · 高空中繼'},
 space:{eye:[17,12,24],target:[0,.7,0],fog:0x08091c,density:.007,title:'ORBIT / THE NEXT HORIZON',detail:'LEO 軌道 · 覆蓋投影 · 地面接續'}
};

/** Procedural scenery and incident effects. Only backend frame records activate damage. */
export class CinematicWorld {
 constructor(parent,{ll,elevation,label,line,material}){
  Object.assign(this,{ll,elevation,label,line,material});this.root=new THREE.Group();parent.add(this.root);this.cityObjects=[];this.clouds=[];this.fx=[];
  this.ground=new THREE.Group();this.sea=new THREE.Group();this.air=new THREE.Group();this.orbit=new THREE.Group();this.effects=new THREE.Group();this.root.add(this.ground,this.sea,this.air,this.orbit,this.effects);
  this.buildCities();this.buildSea();this.buildAir();this.buildOrbit();this.buildEffects();
 }
 mesh(group,geo,color,x,y,z,opacity=1){const m=new THREE.Mesh(geo,this.material(color,opacity));m.position.set(x,y,z);group.add(m);return m;}
 buildCities(){
  const box=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
  for(const [name,lng,lat] of cities){
   const [x,z]=this.ll(lng,lat),y=this.elevation(lng,lat)+.02;
   const mat=new THREE.MeshStandardMaterial({color:0x1b302e,emissive:0xd8a265,emissiveIntensity:.22,roughness:.86,metalness:.12});
   const blocks=new THREE.InstancedMesh(box,mat,48),dots=[];
   for(let i=0;i<48;i++){const dx=(i%8-3.5)*.075,dz=(Math.floor(i/8)-2.5)*.085,h=.04+((i*17+name.length*3)%13)/70;dummy.position.set(x+dx,y+h/2,z+dz);dummy.scale.set(.042,h,.052);dummy.updateMatrix();blocks.setMatrixAt(i,dummy.matrix);dots.push(x+dx,y+h+.005,z+dz,x+dx+.027,y+.012,z+dz+.038);}
   this.ground.add(blocks);
   const lights=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(dots,3)),new THREE.PointsMaterial({color:0xffcf8f,size:.039,transparent:true,opacity:.94,depthWrite:false}));this.ground.add(lights);
   const l=this.label(name,'#dacbaf',.50);l.position.set(x,y+.33,z+.30);this.ground.add(l);
   const streets=[];for(let i=-3;i<=3;i++)streets.push(V(x-.34,y+.01,z+i*.085),V(x+.34,y+.01,z+i*.085));
   const roads=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(streets),new THREE.LineBasicMaterial({color:0xc59c62,transparent:true,opacity:.38}));this.ground.add(roads);
   this.cityObjects.push({name,blocks,lights,roads,label:l});
  }
  // Western transport / fibre corridor follows the schematic terrain elevation.
  const west=cities.filter(c=>c[0]!=='HUALIEN').map(([,lng,lat])=>{const [x,z]=this.ll(lng,lat);return V(x,this.elevation(lng,lat)+.017,z);});this.road=this.line(west,0xbbac86,.42);this.ground.add(this.road);
  for(const [lng,lat] of [[121.29,23.46],[121.56,25.04]]){const [x,z]=this.ll(lng,lat),y=this.elevation(lng,lat)+.08;const unit=new THREE.Group();this.ground.add(unit);this.mesh(unit,new THREE.BoxGeometry(.19,.10,.10),0xc4c8bb,x,y,z);this.mesh(unit,new THREE.BoxGeometry(.07,.08,.10),0x658e94,x+.12,y-.015,z);for(const dx of [-.06,.10])for(const dz of [-.06,.06]){const wheel=this.mesh(unit,new THREE.CylinderGeometry(.025,.025,.02,8),0x263035,x+dx,y-.05,z+dz);wheel.rotation.x=Math.PI/2;}this.mesh(unit,new THREE.CylinderGeometry(.007,.009,.25,5),0x86dfdc,x-.03,y+.14,z);}
 }
 buildSea(){
  const geo=new THREE.PlaneGeometry(25,27,55,55);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,-2.6+.20*Math.sin(x*.9)*Math.cos(z*.7)+.10*Math.sin(z*2+x));}geo.computeVertexNormals();
  this.seabed=new THREE.Group();this.sea.add(this.seabed);this.seabed.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x06121d,roughness:.93,metalness:.2,side:THREE.DoubleSide})));
  const wire=new THREE.LineSegments(new THREE.WireframeGeometry(geo),new THREE.LineBasicMaterial({color:0x63bdc6,transparent:true,opacity:.07}));this.seabed.add(wire);
  const boat=new THREE.Group();this.sea.add(boat);this.mesh(boat,new THREE.BoxGeometry(.21,.10,.55),0xc5d4d3,3.8,.02,2);this.mesh(boat,new THREE.BoxGeometry(.14,.14,.19),0x719ba9,3.8,.13,1.9);this.mesh(boat,new THREE.CylinderGeometry(.01,.01,.35,5),0xaacacc,3.8,.33,1.9);boat.add(this.line([V(3.8,.05,2.2),V(3.6,-.8,2.3),V(3.3,-2,2.5)],0xe8c58a,.7));
  const l=this.label('CABLE REPAIR / STANDBY','#7ecdbf',.7);l.position.set(4.1,.48,2);this.sea.add(l);
  const bubbles=[];for(let i=0;i<120;i++)bubbles.push(Math.sin(i*7.23)*10,-2.4+(i%17)/8,Math.cos(i*3.41)*10);this.sea.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(bubbles,3)),new THREE.PointsMaterial({color:0x97d9e5,size:.016,transparent:true,opacity:.38})));
 }
 buildAir(){
  // Bounded translucent cloud banks; no textures or external media.
  for(let i=0;i<12;i++){const c=this.mesh(this.air,new THREE.SphereGeometry(1,16,10),0xb8d7e5,Math.sin(i*2.3)*5,1.5+(i%4)*.26,Math.cos(i*2.3)*5,.055);c.scale.set(1.4,.13,.6);c.material.depthWrite=false;this.clouds.push(c);}
  const haps=new THREE.Group();haps.position.set(-2.3,3.3,-2.6);this.air.add(haps);this.mesh(haps,new THREE.SphereGeometry(.3,16,10),0xd8e9e9,0,0,0,.7).scale.set(1,.32,.32);this.mesh(haps,new THREE.BoxGeometry(.85,.014,.15),0x698eac,0,0,0);const l=this.label('HAPS / RESERVE','#a7dbea',.65);l.position.set(0,.35,0);haps.add(l);
 }
 buildOrbit(){
  // Curvature context only; not an ephemeris or geographic globe dataset.
  this.earth=this.mesh(this.orbit,new THREE.SphereGeometry(18,80,40),0x101b45,0,-18.38,0);this.earth.material.roughness=.9;
  const atmosphere=this.mesh(this.orbit,new THREE.SphereGeometry(18.13,64,32),0x597beb,0,-18.38,0,.065);atmosphere.material.side=THREE.BackSide;atmosphere.material.depthWrite=false;
  for(let ring=0;ring<3;ring++){const pts=[];for(let i=0;i<=180;i++){const a=i/180*Math.PI*2;pts.push(V(Math.cos(a)*(7+ring*1.3),3.6+Math.sin(a)*(1+ring*.5),Math.sin(a)*(6+ring)));}this.orbit.add(this.line(pts,[0x8b79e7,0x68a7f9,0x555dbe][ring],.35));}
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const sat=new THREE.Group();sat.position.set(Math.cos(a)*8.3,3.6+Math.sin(a)*1.5,Math.sin(a)*7);this.orbit.add(sat);sat.userData.orbitAngle=a;this.mesh(sat,new THREE.BoxGeometry(.11,.12,.17),0xd6e5ef,0,0,0);for(const side of [-1,1])this.mesh(sat,new THREE.BoxGeometry(.30,.01,.20),0x525cbd,side*.24,0,0);}
  const stars=[];for(let i=0;i<240;i++){const a=i*2.39996,r=30+(i%11);stars.push(Math.cos(a)*r,8+(i%17),Math.sin(a)*r);}this.orbit.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(stars,3)),new THREE.PointsMaterial({color:0xc9d8ff,size:.045,transparent:true,opacity:.7})));
 }
 buildEffects(){this.causal=new CausalEvents(this.effects,{ll:this.ll,elevation:this.elevation,label:this.label,line:this.line,material:this.material});}
 update(frame,layer,time){
  this.frame=frame;this.layer=layer;const sea=layer==='sea',space=layer==='space';this.ground.visible=!sea;this.sea.visible=sea||layer==='all';this.seabed.visible=sea;this.air.visible=layer==='air';this.orbit.visible=space;this.effects.visible=!!frame&&!space;
  for(const satellite of this.orbit.children){if(satellite.userData.orbitAngle!=null){const a=satellite.userData.orbitAngle+time*.015;satellite.position.set(Math.cos(a)*8.3,3.6+Math.sin(a)*1.5,Math.sin(a)*7);}}
  const seconds=frame?.seconds||0,elapsed=Math.max(0,time-seconds);
  for(const city of this.cityObjects){const failures=frame?.failures.filter(f=>f.city===city.name)||[];const outage=failures.some(f=>['power_loss','direct_impact','tower_backhaul'].includes(f.mode));const shaking=[1,2].includes(frame?.phase)&&frame.hazard.type==='earthquake'&&frame.hazard.pgaG>=frame.hazard.thresholdG;const flicker=(outage||shaking)&&frame.phase===2?(.3+.25*Math.sin(elapsed*17)) : 1;city.lights.material.opacity=outage?(frame.phase>=3?.07:flicker):shaking?flicker:.9;city.blocks.material.emissiveIntensity=outage?.025:.22;city.roads.material.opacity=outage?.07:.4;}
  this.causal.update(frame,layer,time);
 }
}
