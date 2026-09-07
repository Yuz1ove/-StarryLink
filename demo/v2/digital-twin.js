import * as THREE from 'three';
import {CinematicWorld,WORLD_PRESETS} from './cinematic-world.js';
import {frameAt} from './timeline.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';

export const LAYERS = {ground:{label:'地',name:'Ground',color:0x78bac6},sea:{label:'海',name:'Subsea',color:0x70e2c8},air:{label:'空',name:'Air',color:0x83dde0},space:{label:'星',name:'Orbit',color:0xa394ff}};
const STATUS = {healthy:0x72c6d5,online:0x72c6d5,degraded:0xe8b776,failed:0xea7775,offline:0xea7775,standby:0x718798,active:0x9ae7b4};
const V = (x,y,z)=>new THREE.Vector3(x,y,z);
const ll = (lng,lat)=>[(lng-121.02)*3.05,-(lat-23.66)*3.28];
const material = (color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.34,transparent:opacity<1,opacity});
function line(points,color,opacity=1) { return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false})); }
function disposeTree(group){group.traverse(o=>{o.geometry?.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.map?.dispose();m.dispose();});}});group.clear();}
function inside(x,y,points){let c=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;}
function elevation(lng,lat){
 const t=lat-23.6;
 const spine=121.05+t*.29+.035*Math.sin(lat*4.1);
 const mountainEnvelope=Math.max(0,Math.sin((lat-21.85)/3.57*Math.PI));
 const central=Math.exp(-Math.pow((lng-spine)/.13,2));
 const westRidge=Math.exp(-Math.pow((lng-spine+.17+.02*Math.sin(lat*9))/.11,2))*.48;
 const eastRidge=Math.exp(-Math.pow((lng-spine-.12)/.07,2))*.24;
 const peaks=.62+.15*Math.sin(lat*5.2)+.12*Math.sin(lat*11.8+lng*5);
 const detail=.025*Math.sin(lng*55+lat*12)*Math.sin(lat*37);
 return .055+mountainEnvelope*(central+westRidge+eastRidge)*(peaks+detail);
}
function label(text,color='#a4beca',size=1){
 const c=document.createElement('canvas');c.width=512;c.height=80;const x=c.getContext('2d');x.font=`500 ${Math.min(26,850/Math.max(text.length,1))}px system-ui`;x.fillStyle=color;x.textAlign='center';x.fillText(text,256,42);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,opacity:.85}));s.scale.set(size*2.7,size*.42,1);return s;
}
function makeNode(n){
 const group=new THREE.Group();const color=LAYERS[n.layer].color;
 const body=material(color);const metal=material(0x9caeba);
 const mesh=(geo,mat=body,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;};
 if(n.type.includes('satellite')&&n.layer==='space'){
  mesh(new THREE.BoxGeometry(.18,.18,.22),metal);
  mesh(new THREE.BoxGeometry(.5,.018,.32),material(0x416ea2),-.39,0,0);mesh(new THREE.BoxGeometry(.5,.018,.32),material(0x416ea2),.39,0,0);
  const dish=mesh(new THREE.ConeGeometry(.11,.1,16),metal,0,.15,0);dish.rotation.z=-.5;
 }else if(n.layer==='air'){
  mesh(new THREE.BoxGeometry(.17,.065,.13),metal);
  for(const x of [-1,1])for(const z of [-1,1]){const arm=line([V(0,0,0),V(x*.19,0,z*.19)],color);group.add(arm);const rotor=mesh(new THREE.TorusGeometry(.10,.008,4,20),body,x*.19,.01,z*.19);rotor.rotation.x=Math.PI/2;const blade=mesh(new THREE.BoxGeometry(.16,.005,.016),metal,x*.19,.014,z*.19);blade.userData.rotor=true;}
  mesh(new THREE.CylinderGeometry(.008,.008,.14,5),metal,0,.1,0);
  const nav=mesh(new THREE.SphereGeometry(.018,8,6),new THREE.MeshBasicMaterial({color:0x8ce8bd}),.09,.04,0);nav.userData.navigation=true;
  const cone=mesh(new THREE.ConeGeometry(.45,.9,24,1,true),new THREE.MeshBasicMaterial({color:0x8fdcdf,side:THREE.DoubleSide,transparent:true,opacity:.065,depthWrite:false}),0,-.47,0);cone.userData.signalCone=true;
 }else if(n.layer==='sea'){
  mesh(new THREE.CylinderGeometry(.07,.15,.12,6),metal,0,.07,0);mesh(new THREE.CylinderGeometry(.015,.015,.23,8),body,0,.2,0);
 }else if(n.type==='satellite_gateway'){
  mesh(new THREE.BoxGeometry(.13,.09,.14),metal,0,.04,0);
  const dish=mesh(new THREE.SphereGeometry(.14,20,12,0,Math.PI*2,0,Math.PI*.45),metal,0,.2,0);dish.rotation.z=.55;
  mesh(new THREE.CylinderGeometry(.009,.014,.28,6),body,0,.14,0);
 }else if(n.type==='base_station'){
  for(const x of [-.065,.065])for(const z of [-.065,.065]){
   const leg=line([V(x,0,z),V(x*.4,.58,z*.4)],color);group.add(leg);
   for(let i=0;i<4;i++)group.add(line([V(x*(1-i*.15),i*.14,z),V(-x*(1-(i+1)*.15),(i+1)*.14,z)],color));
  }
  for(const x of [-.07,.07])mesh(new THREE.BoxGeometry(.045,.17,.045),metal,x,.48,0);
  mesh(new THREE.BoxGeometry(.12,.09,.12),metal,.15,.045,0);
 }else{
  mesh(new THREE.CylinderGeometry(.055,.09,.04,12),metal);mesh(new THREE.CylinderGeometry(.012,.018,.22,6),body,0,.12,0);
  mesh(new THREE.BoxGeometry(.09,.1,.035),body,0,.24,0);
 }
 const halo=new THREE.Mesh(new THREE.RingGeometry(.13,.15,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.7}));halo.rotation.x=-Math.PI/2;halo.position.y=.013;group.add(halo);
 const hit=new THREE.Mesh(new THREE.SphereGeometry(.23,8,6),new THREE.MeshBasicMaterial({visible:false}));group.add(hit);
 group.traverse(o=>{o.userData.nodeId=n.id;});group.userData.node=n;return group;
}

export class DigitalTwin {
 constructor(onNode,onLayer){
  this.events=new AbortController();this.disposed=false;this.cameraMode='TACTICAL';this.followTarget='uav';this.sceneTime=0;this.playing=false;this.onNode=onNode;this.onLayer=onLayer;this.layer='all';this.phase=0;this.view='network';this.mode='twin';this.selectedLayer=0;this.frameCount=0;
  this.canvas=document.createElement('canvas');this.canvas.className='twin-canvas';this.canvas.setAttribute('aria-label','台灣立體通訊模型。拖曳旋轉、滾輪縮放；節點也可由旁邊清單選擇。');this.canvas.tabIndex=0;
  this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));this.renderer.setClearColor(0x080e15,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
  this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0x080e15,.017);
  this.camera=new THREE.PerspectiveCamera(35,1,.1,110);this.camera.position.set(10,12,15);
  this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.minDistance=8;this.controls.maxDistance=32;this.controls.maxPolarAngle=Math.PI*.48;this.controls.enablePan=false;this.controls.target.set(0,.6,0);
  this.scene.add(new THREE.HemisphereLight(0xcfeaf4,0x102e39,2.8));const key=new THREE.DirectionalLight(0xdaf2ed,3.4);key.position.set(-5,12,3);this.scene.add(key);const fill=new THREE.DirectionalLight(0x577ac1,2.2);fill.position.set(5,4,-6);this.scene.add(fill);
  this.twin=new THREE.Group();this.graph=new THREE.Group();this.terrain=new THREE.Group();this.twin.add(this.terrain,this.graph);this.scene.add(this.twin);
  this.arci=new THREE.Group();this.arci.visible=false;this.scene.add(this.arci);this.buildSpheres();
  this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
  this.listen('pointerdown',e=>{this.start=[e.clientX,e.clientY];this.cinematic=false;if(this.mode==='twin')this.setCameraMode('FREE');});
  this.listen('pointerup',e=>{if(this.start&&Math.hypot(e.clientX-this.start[0],e.clientY-this.start[1])<5)this.pick(e,true);});
  this.listen('pointermove',e=>{if(!e.buttons)this.pick(e,false);});
  this.listen('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();this.cinematic=false;if(this.mode==='twin')this.setCameraMode('FREE');if(e.key==='+'||e.key==='-')this.zoom(e.key==='+'?.85:1.15);else{const v=this.camera.position.clone().sub(this.controls.target);if(e.key==='ArrowLeft'||e.key==='ArrowRight')v.applyAxisAngle(V(0,1,0),e.key==='ArrowLeft'?.15:-.15);else v.y=Math.max(2,v.y+(e.key==='ArrowUp'?1:-1));this.camera.position.copy(v.add(this.controls.target));}}});
  this.resizeObserver=new ResizeObserver(()=>this.resize());
  this.intersectionObserver=new IntersectionObserver(e=>{this.inView=e[0]?.isIntersecting;},{threshold:.01});
  this.listen('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.canvas.parentElement.dataset.render='unavailable';});
  this.listen('webglcontextrestored',()=>{this.lost=false;this.canvas.parentElement.dataset.render='ready';});
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||new URLSearchParams(location.search).get('motion')==='reduce';
  this.nodeObjects=[];this.linkObjects=[];this.packets=[];this.last=0;this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
 }
 listen(type,fn){this.canvas.addEventListener(type,fn,{signal:this.events.signal});}
 async initialize(signal){
  const response=await fetch('./v2/taiwan-coast.json',{signal});if(!response.ok)throw new Error('Taiwan coastline unavailable');const data=await response.json();if(this.disposed||signal?.aborted)return this;this.buildTerrain(data.coordinates);return this;
 }
 buildTerrain(coast){
  const polygon=coast.map(([lng,lat])=>ll(lng,lat));const positions=[],colors=[];
  const xmin=119.98,xmax=122.02,ymin=21.88,ymax=25.31,nx=108,ny=164;
  const height=(x,y)=>{const [px,pz]=ll(x,y);let dist=Infinity;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(pz-a[1])*dz)/(dx*dx+dz*dz||1)));dist=Math.min(dist,Math.hypot(px-a[0]-t*dx,pz-a[1]-t*dz));}return Math.min(elevation(x,y),.05+dist*1.8);};
  for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
   const x=xmin+(xmax-xmin)*ix/nx,y=ymin+(ymax-ymin)*iy/ny,dx=(xmax-xmin)/nx,dy=(ymax-ymin)/ny;
   const points=[[x,y],[x+dx,y],[x,y+dy],[x+dx,y+dy]];
   for(const tri of [[0,1,2],[1,3,2]]){const cx=tri.reduce((s,i)=>s+points[i][0],0)/3,cy=tri.reduce((s,i)=>s+points[i][1],0)/3;if(!inside(...ll(cx,cy),polygon))continue;
    for(const i of tri){const [lng,lat]=points[i], [px,pz]=ll(lng,lat),h=height(lng,lat);positions.push(px,h,pz);const c=new THREE.Color().lerpColors(new THREE.Color(0x203f43),new THREE.Color(0x7c9692),Math.min(1,h*.78));colors.push(c.r,c.g,c.b);}
   }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const land=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.92,metalness:.10,flatShading:true}));this.terrain.add(land);this.land=land;land.material.color.setHex(0x688580);
  this.quakeUniforms={quake:{value:0},displacement:{value:0},eventTime:{value:0}};
  land.material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.quakeUniforms);shader.vertexShader='uniform float quake; uniform float displacement; uniform float eventTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.y += displacement * smoothstep(0.1,0.5,position.x) * exp(-distance(position.xz, vec2(0.48,-1.44)) * 1.5); transformed.y += quake * sin(position.x * 19.0 + position.z * 13.0 + eventTime * 24.0) * exp(-distance(position.xz, vec2(0.48,-1.44)) * 0.6);');};
  const wire=new THREE.LineSegments(new THREE.WireframeGeometry(geo),new THREE.LineBasicMaterial({color:0xabc8c3,transparent:true,opacity:.033}));this.terrain.add(wire);
  const contourPositions=[];
  for(const h of [.18,.32,.46,.60,.74,.88])for(let t=0;t<positions.length;t+=9){
   const cross=[];for(const [a,b] of [[0,3],[3,6],[6,0]]){const y1=positions[t+a+1],y2=positions[t+b+1];if((y1<h&&y2>=h)||(y2<h&&y1>=h)){const f=(h-y1)/(y2-y1);cross.push([positions[t+a]+f*(positions[t+b]-positions[t+a]),h+.007,positions[t+a+2]+f*(positions[t+b+2]-positions[t+a+2])]);}}
   if(cross.length===2)contourPositions.push(...cross[0],...cross[1]);
  }
  const contourGeo=new THREE.BufferGeometry();contourGeo.setAttribute('position',new THREE.Float32BufferAttribute(contourPositions,3));this.terrain.add(new THREE.LineSegments(contourGeo,new THREE.LineBasicMaterial({color:0xb4c9bc,transparent:true,opacity:.14})));
  this.terrain.add(line(polygon.map(([x,z])=>V(x,.055,z)),0x68a6ac,.75));
  const side=[];for(let i=0;i<polygon.length-1;i++){const a=polygon[i],b=polygon[i+1];side.push(a[0],.04,a[1],b[0],.04,b[1],a[0],-.10,a[1],b[0],.04,b[1],b[0],-.10,b[1],a[0],-.10,a[1]);}const edge=new THREE.BufferGeometry();edge.setAttribute('position',new THREE.Float32BufferAttribute(side,3));edge.computeVertexNormals();this.terrain.add(new THREE.Mesh(edge,material(0x142d35)));
  const water=new THREE.Mesh(new THREE.PlaneGeometry(24,25),new THREE.MeshBasicMaterial({color:0x112430,transparent:true,opacity:.30,depthWrite:false}));water.rotation.x=-Math.PI/2;water.position.y=-.19;this.terrain.add(water);this.water=water;
  const grid=new THREE.GridHelper(26,52,0x2d4a55,0x203945);grid.position.y=-.23;grid.material.transparent=true;grid.material.opacity=.22;this.terrain.add(grid);this.mapGrid=grid;
  for(let r=6;r<=11;r+=2){const ring=new THREE.Mesh(new THREE.RingGeometry(r,r+.009,120),new THREE.MeshBasicMaterial({color:0x406472,transparent:true,opacity:.28,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.18;this.terrain.add(ring);ring.userData.mapDecoration=true;}
  const ocean=label('P A C I F I C   O C E A N','#526e81',.8);ocean.position.set(5,-.05,1.5);this.terrain.add(ocean);ocean.userData.mapDecoration=true;
  const strait=label('T A I W A N   S T R A I T','#526e81',.7);strait.position.set(-4,-.05,.5);this.terrain.add(strait);strait.userData.mapDecoration=true;
  const scan=new THREE.Mesh(new THREE.RingGeometry(.95,1,96),new THREE.MeshBasicMaterial({color:0xe1aa74,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));scan.rotation.x=-Math.PI/2;scan.position.set(1.65,.08,-.8);this.twin.add(scan);this.scan=scan;
  this.terrainTriangles=positions.length/9;this.world=new CinematicWorld(this.twin,{ll,elevation,label,line,material});
 }
 nodePosition(n){const [x,z]=ll(n.position.lng,n.position.lat);const y=n.layer==='space'?4.5:n.layer==='air'?elevation(n.position.lng,n.position.lat)+.9:n.layer==='sea'?-.07:elevation(n.position.lng,n.position.lat)+.04;return V(x,y,z);}
 setState(state){this.state=state;disposeTree(this.graph);this.nodeObjects=[];this.linkObjects=[];this.packets=[];if(!state){this.frame=null;this.world?.update(null,this.layer,0);return;}
  const positions=new Map();for(const n of state.networkState.nodes){const o=makeNode(n);o.position.copy(this.nodePosition(n));positions.set(n.id,o.position);this.graph.add(o);this.nodeObjects.push(o);
   if(['direct_impact','tower_backhaul'].includes(n.failureMode)){
    o.userData.statusLabels={};for(const [status,color] of [['ONLINE','#8fdddd'],['IMPACT','#ffe0aa'],['OFFLINE','#f69a84']]){const badge=label(status,color,.45);badge.visible=false;this.graph.add(badge);o.userData.statusLabels[status]=badge;}
   }
   if(['citizen-01','emergency-center','leo-sat-01'].includes(n.id)||n.clusterLead||n.type==='satellite_gateway'){const l=label(n.clusterLead?n.clusterLabel:n.label,'#bdd4d8',n.clusterLead?.85:.8);l.position.copy(o.position).add(V(0,.48,0));l.userData.nodeId=n.id;this.graph.add(l);o.userData.label=l;}
   if(n.layer==='space'){const ellipse=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;ellipse.push(V(o.position.x+Math.cos(a)*2.8,.10,o.position.z+Math.sin(a)*1.9));}const coverage=line(ellipse,0x819fc1,.22);this.graph.add(coverage);o.userData.coverage=coverage;}
  }
  for(const l of state.networkState.links){const a=positions.get(l.source),b=positions.get(l.target);if(!a||!b)continue;const sea=l.id.includes('cable')||l.id.includes('maritime');const center=a.clone().lerp(b,.5);center.y=sea?-.28:Math.max(a.y,b.y)+Math.min(a.distanceTo(b)*.2,1.0);const curve=new THREE.QuadraticBezierCurve3(a,center,b);const path=line(curve.getPoints(42),0x4c7488,.3);path.userData.link=l;path.userData.curve=curve;this.graph.add(path);this.linkObjects.push(path);
   if(sea){const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,42,.016,5,false),new THREE.MeshBasicMaterial({color:0x70e2c8,transparent:true,opacity:.8}));this.graph.add(tube);path.userData.tube=tube;}
   const dot=new THREE.Mesh(new THREE.SphereGeometry(.047,7,5),new THREE.MeshBasicMaterial({color:0x9ce6ef}));dot.visible=false;this.graph.add(dot);this.packets.push({dot,path,curve});
  }
  this.refresh();
 }
 setPresentation({phase=this.phase,layer=this.layer,view=this.view,routeId=this.routeId,playing=false}={}){
  const changed=phase!==this.phase,layerChanged=layer!==this.layer;
  this.phase=phase;this.layer=layer;this.view=view;this.routeId=routeId;this.playing=playing;
  this.frame=frameAt(this.state,view==='normal'?0:phase);if(changed||!this.sceneTime)this.sceneTime=this.frame?.seconds||0;
  this.refresh();if(layerChanged)this.frameLayer();else if(changed&&this.cameraMode==='CINEMATIC')this.directShot();
 }
 refresh(){if(!this.state)return;
  this.frame=frameAt(this.state,this.view==='normal'?0:this.phase);const f=this.frame;if(!f)return;
  const selected=f.candidates.find(c=>c.id===f.routeId);const activeLinks=new Set(selected?.links||[]),activeNodes=new Set(selected?.nodes||[]);
  const probeLinks=new Set(f.phase===5||f.phase===6?f.candidates.flatMap(c=>c.links):[]);
  const showRoute=f.phase>=7, sea=this.layer==='sea';
  for(const o of this.nodeObjects){const n=f.networkState.nodes.find(n=>n.id===o.userData.node.id);const isActive=showRoute&&activeNodes.has(n.id);const color=isActive?(f.confirmed?0x9ae7b4:f.phase<8?0xe8b776:0xb6a0ff):STATUS[n.status]||0x72c6d5;
   const alpha=this.layer==='all'||n.layer===this.layer?1:.16;
   o.traverse(m=>{if(m.material&&m.material.visible!==false){m.material.transparent=true;m.material.opacity=m.userData.signalCone?(f.phase>=4?alpha*.07:0):alpha;m.material.color.setHex(color);}});
   o.visible=n.layer!=='air'||f.phase>=5;
   o.scale.setScalar((n.id===this.selectedNode?1.25:1)*(n.layer==='air'?.42:1));o.position.copy(this.nodePosition(n));
   if(n.layer==='air'&&n.region){const peers=f.networkState.nodes.filter(p=>p.layer==='air'&&p.region===n.region);const center=peers.map(p=>this.nodePosition(p)).reduce((a,b)=>a.add(b),V(0,0,0)).multiplyScalar(1/peers.length);o.position.x=center.x+(o.position.x-center.x)*2.2;o.position.z=center.z+(o.position.z-center.z)*2.2;}
   if(n.layer==='air')o.position.y=this.nodePosition(n).y*(.6+.4*f.relayProgress);
   if(n.layer==='sea')o.position.y=sea?-1.9:-.1;
   o.rotation.z=n.status==='failed'&&['direct_impact','tower_backhaul'].includes(n.failureMode)?.35:n.status==='degraded'&&n.failureMode==='tower_backhaul'?.12:0;
   if(o.userData.label){o.userData.label.visible=o.visible&&(n.clusterLead?f.phase>=5:n.id==='citizen-01'?f.phase<5:n.type==='satellite_gateway'?f.phase>=7&&this.layer!=='all':true);o.userData.label.material.opacity=alpha*.85;o.userData.label.position.copy(o.position).add(V(0,.48,0));}
   if(o.userData.coverage)o.userData.coverage.material.opacity=this.layer==='space'?.5:this.layer==='all'?.15:.03;
  }
  for(const p of this.linkObjects){const l=f.networkState.links.find(l=>l.id===p.userData.link.id),active=showRoute&&activeLinks.has(l.id),failed=l.status==='failed';const a=this.nodeObjects.find(n=>n.userData.node.id===l.source),b=this.nodeObjects.find(n=>n.userData.node.id===l.target);const isolated=this.layer!=='all'&&a.userData.node.layer!==this.layer&&b.userData.node.layer!==this.layer;
   const curve=p.userData.curve;curve.v0.copy(a.position);curve.v2.copy(b.position);curve.v1.copy(a.position).lerp(b.position,.5);curve.v1.y=sea&&(a.userData.node.layer==='sea'||b.userData.node.layer==='sea')?-2.15:Math.max(a.position.y,b.position.y)+Math.min(a.position.distanceTo(b.position)*.2,1);
   const pos=p.geometry.attributes.position;curve.getPoints(42).forEach((v,i)=>pos.setXYZ(i,v.x,v.y,v.z));pos.needsUpdate=true;p.geometry.computeBoundingSphere();if(p.userData.tube){p.userData.tube.visible=sea&&!failed;p.userData.tube.geometry.dispose();p.userData.tube.geometry=new THREE.TubeGeometry(curve,42,.016,5,false);p.userData.tube.material.color.setHex(failed?0xe07b69:0x70e2c8);p.userData.tube.material.opacity=failed?.20:.85;}
   p.material.color.setHex(failed?0xe07b69:active?(f.confirmed?0x9ae7b4:f.phase<8?0xe8b776:0xb6a0ff):l.status==='degraded'?0xe0a26b:probeLinks.has(l.id)?0xe6b872:sea?0x70e2c8:0x71949f);
   p.material.opacity=isolated?.04:failed?.26:active?.9:sea?.65:.23;p.userData.active=(active&&!failed&&f.phase>=8)||(f.phase===0&&!failed&&l.medium==='fiber');p.visible=!failed&&((a.userData.node.layer!=='air'&&b.userData.node.layer!=='air')||f.phase>=5)&&(this.view!=='relay'||active||a.userData.node.layer==='air'||b.userData.node.layer==='air');
   if((a.userData.node.layer==='space'||b.userData.node.layer==='space')&&f.phase<5)p.visible=false;
   if(l.role==='airborne-mesh'&&f.phase>=5){p.material.opacity=isolated?.06:.7;p.material.color.setHex(active?0xb6a0ff:0x71dad7);}
   p.userData.active=p.visible&&p.userData.active;
  }
  if(this.world)this.world.update(f,this.layer,this.sceneTime);if(this.water)this.water.visible=this.layer!=='space';if(this.mapGrid)this.mapGrid.visible=this.layer!=='space';this.terrain.children.forEach(o=>{if(o.userData.mapDecoration)o.visible=this.layer!=='space';});
  if(this.mode==='twin'){const w=WORLD_PRESETS[this.layer];this.scene.fog.color.setHex(w.fog);this.scene.fog.density=w.density;if(this.host){this.host.dataset.world=this.layer;this.host.dataset.phase=f.stage;this.host.dataset.camera=this.cameraMode;}}
  this.canvas.dataset.renderStats=JSON.stringify(this.stats());
 }
 setCameraMode(mode){this.cameraMode=mode;this.cinematic=false;this.cameraGoal=null;this.targetGoal=null;this.controls.enablePan=mode==='FREE';this.controls.enabled=mode==='FREE';this.controls.minDistance=2;this.controls.maxDistance=48;this.controls.maxPolarAngle=Math.PI*.85;
  if(mode==='TACTICAL')this.frameLayer();if(mode==='CINEMATIC')this.directShot();if(this.host)this.host.dataset.camera=mode;
  this.canvas.dispatchEvent(new CustomEvent('camera-mode-change',{bubbles:true,detail:mode}));
 }
 moveCamera(eye,target){this.cameraGoal=V(...eye);this.targetGoal=V(...target);if(this.reduced){this.camera.position.copy(this.cameraGoal);this.controls.target.copy(this.targetGoal);}}
 frameLayer(){const w=WORLD_PRESETS[this.layer]||WORLD_PRESETS.all;this.moveCamera(w.eye,w.target);}
 directShot(){if(this.mode!=='twin')return;const f=this.frame;if(!f){this.frameLayer();return;}
  if(this.layer!=='all'){this.frameLayer();return;}
  if(f.hazard.type==='infrastructure-disruption'&&f.phase>=1&&f.phase<=4){this.moveCamera([3.2,6.5,11.5],[-1.6,.5,.1]);return;}
  if(f.phase>=5&&f.phase<=9){this.moveCamera([7.5,8.5,13.5],[-.4,1,.3]);return;}
  let focus;if(f.phase===0){this.frameLayer();return;}if(f.phase<=3){const n=(f.phase===3?f.failures.find(f=>['direct_impact','tower_backhaul'].includes(f.mode))?.position:null)||f.hazard.epicenter;const [x,z]=ll(n.lng,n.lat);focus=V(x,.4,z);}else if(f.phase<=6)focus=this.nodeObjects.find(n=>n.userData.node.layer==='air')?.position;else if(f.phase<=9)focus=this.nodeObjects.find(n=>n.userData.node.layer==='space')?.position;else focus=this.nodeObjects.find(n=>n.userData.node.id==='emergency-center')?.position;
  if(focus)this.moveCamera([focus.x+4.2,focus.y+3.2,focus.z+5.6],[focus.x,focus.y,focus.z]);
 }
 updateDirector(){if(this.mode!=='twin')return;
  if(this.cameraMode==='FOLLOW'){
   const n=this.followTarget==='uav'?this.nodeObjects.find(o=>o.visible&&o.userData.node.layer==='air'):this.followTarget==='satellite'?this.nodeObjects.find(o=>o.userData.node.layer==='space'):this.nodeObjects.find(o=>o.userData.node.id===this.selectedNode);
   const packet=this.packets.find(p=>p.dot.visible);const route=this.linkObjects.find(p=>p.userData.active);const target=this.followTarget==='packet'?packet?.dot.position:this.followTarget==='route'?route?.userData.curve.getPoint(.5):n?.position;
   if(this.host)this.host.dataset.followStatus=target?'TRACKING':'WAITING';
   if(!target){this.frameLayer();}
   if(target){this.targetGoal=target.clone();this.cameraGoal=target.clone().add(V(3,2.3,4.8));}
  }
  if(this.cameraGoal){this.camera.position.lerp(this.cameraGoal,this.reduced?1:.075);this.controls.target.lerp(this.targetGoal,this.reduced?1:.075);this.camera.lookAt(this.controls.target);}
 }
 selectNode(id){this.selectedNode=id;this.refresh();}
 mount(host,mode='twin'){
  if(this.host)this.resizeObserver.unobserve(this.host);this.intersectionObserver.disconnect();this.host=host;host.prepend(this.canvas);this.resizeObserver.observe(host);this.intersectionObserver.observe(host);this.inView=true;this.mode=mode;this.canvas.setAttribute('aria-label',mode==='arci'?'ARCI 七層球中球模型。拖曳旋轉、滾輪縮放；各層也可由側邊按鈕選擇。':'台灣立體通訊模型。拖曳旋轉、滾輪縮放；節點也可由旁邊清單選擇。');this.twin.visible=mode==='twin';this.arci.visible=mode==='arci';this.resetCamera();if(mode==='twin'){this.setCameraMode(this.cameraMode);this.refresh();}else{this.controls.enabled=true;this.controls.enablePan=false;this.controls.maxPolarAngle=Math.PI*.48;this.scene.fog.color.setHex(0x080e15);this.scene.fog.density=.017;this.cameraGoal=null;this.targetGoal=null;}this.resize();host.dataset.render='ready';
 }
 resize(){if(!this.host)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
 resetCamera(preset='perspective'){
  const target=this.mode==='arci'?V(0,0,0):V(0,.65,0);this.controls.target.copy(target);const narrow=this.host?.clientWidth<500;
  this.camera.position.copy(this.mode==='arci'?V(0,2,14.2):preset==='top'?V(.01,20,.1):preset==='east'?V(17,8,1):V(9.5,11.5,14));if(narrow)this.camera.position.multiplyScalar(1.16);this.controls.minDistance=this.mode==='arci'?8:8;this.controls.maxDistance=32;this.controls.update();this.cinematic=false;
 }
 zoom(scale){if(this.mode==='twin')this.setCameraMode('FREE');this.camera.position.sub(this.controls.target).multiplyScalar(scale).clampLength(8,32).add(this.controls.target);this.cinematic=false;}
 pick(e,click){const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
  if(this.mode==='arci'){const hits=this.raycaster.intersectObjects(this.sphereHits,false);if(hits.length){const id=hits[0].object.userData.layer;if(id!==this.selectedLayer||click){this.setSphereLayer(id);this.onLayer(id);}this.canvas.style.cursor='pointer';}else this.canvas.style.cursor='grab';}
  else{const hits=this.raycaster.intersectObjects(this.nodeObjects,true);this.canvas.style.cursor=hits.length?'pointer':'grab';const id=hits[0]?.object.userData.nodeId;const n=this.frame?.networkState.nodes.find(n=>n.id===id);this.canvas.title=n?`${n.label} / ${n.status} / fixture`:'';if(click&&id){this.selectNode(id);this.onNode(id);}}
 }
 buildSpheres(){this.shells=[];this.sphereHits=[];
  for(let i=0;i<7;i++){
   const radius=3.65-i*.45;const g=new THREE.Group();const color=new THREE.Color().setHSL(.66+i*.017,.30,.50+i*.035);
   // An open longitudinal sector reveals the nested interior from the camera.
   const geo=new THREE.SphereGeometry(radius,64,40,2.35,4.68,.07,Math.PI-.14);
   const surface=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:i===6?.7:.075,roughness:.27,metalness:.4,side:THREE.DoubleSide,depthWrite:false}));surface.userData.layer=i;g.add(surface);this.sphereHits.push(surface);
   const grid=[];
   for(let k=0;k<=16;k++){const phi=2.35+k/16*4.68;for(let j=0;j<32;j++){for(const v of [j,j+1]){const t=.07+v/32*(Math.PI-.14);grid.push(-radius*Math.cos(phi)*Math.sin(t),radius*Math.cos(t),radius*Math.sin(phi)*Math.sin(t));}}}
   for(let j=1;j<12;j++){const theta=j/12*Math.PI;for(let k=0;k<64;k++){for(const v of [k,k+1]){const phi=2.35+v/64*4.68;grid.push(-radius*Math.cos(phi)*Math.sin(theta),radius*Math.cos(theta),radius*Math.sin(phi)*Math.sin(theta));}}}
   const gridGeometry=new THREE.BufferGeometry();gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));
   const wire=new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.15,depthWrite:false}));g.add(wire);
   for(const phi of [2.35,7.03]){const pts=[];for(let j=0;j<=70;j++){const t=j/70*Math.PI;pts.push(V(-radius*Math.cos(phi)*Math.sin(t),radius*Math.cos(t),radius*Math.sin(phi)*Math.sin(t)));}g.add(line(pts,0xb5a7db,.7));}
   const ring=[];for(let k=0;k<=100;k++){const a=k/100*Math.PI*2;ring.push(V(Math.cos(a)*radius,0,Math.sin(a)*radius));}g.add(line(ring,0x9c90cb,.35));this.arci.add(g);this.shells.push(g);
  }
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),new THREE.MeshStandardMaterial({color:0xcac2ed,emissive:0x675695,emissiveIntensity:.5,roughness:.3,metalness:.65}));this.arci.add(core);this.core=core;this.arci.rotation.y=-.2;this.setSphereLayer(0);
 }
 setSphereLayer(index){this.selectedLayer=index;this.shells.forEach((g,i)=>{g.children.forEach((o,j)=>{if(o.material)o.material.opacity=i===index?(j===0?.18:j===1?.28:.95):(j===0?.06:j===1?.05:.40);});});}
 setExploded(value){this.shells.forEach((g,i)=>{g.position.x=value?(i-3)*.32:0;});}
 tick(t){this.raf=requestAnimationFrame(this.tick);if(!this.host||!this.inView||document.hidden||this.lost||t-this.last<30)return;const dt=this.last?Math.min((t-this.last)/1000,.1):0;this.last=t;this.frameCount++;
  this.controls.update();this.updateDirector();
  if(this.mode==='twin'&&this.playing&&!this.reduced)this.sceneTime=Math.min((this.frame?.nextSeconds||32)-.001,this.sceneTime+dt);
  if(this.mode==='twin'){this.world?.update(this.frame,this.layer,this.sceneTime);if(this.quakeUniforms){this.quakeUniforms.quake.value=this.frame?.hazard.type==='earthquake'&&[1,2].includes(this.phase)?.025:0;this.quakeUniforms.displacement.value=this.frame?.hazard.type==='earthquake'&&this.phase>=1?.06:0;this.quakeUniforms.eventTime.value=this.sceneTime;}for(const node of this.nodeObjects){node.traverse(m=>{if(m.userData.rotor)m.rotation.y=this.sceneTime*35;});
   const n=this.frame?.networkState.nodes.find(n=>n.id===node.userData.node.id);
   if(node.userData.statusLabels){const age=this.sceneTime-this.frame.hazard.impactSeconds;const status=n.status==='failed'?(age<.9?'IMPACT':'OFFLINE'):'ONLINE';for(const [name,badge] of Object.entries(node.userData.statusLabels)){badge.visible=name===status&&this.phase<5&&(this.layer==='all'||this.layer==='ground');badge.position.copy(this.nodePosition(n)).add(V(0,.78,0));}}
   if(n?.status==='failed'&&['direct_impact','tower_backhaul'].includes(n.failureMode)){const age=Math.max(0,this.sceneTime-this.frame.hazard.impactSeconds);node.rotation.z=Math.min(1,age/.9)*1.38;node.position.y=this.nodePosition(n).y-Math.min(1,age/.9)*.025;}
  }}
  if(!this.reduced){
   if(this.cinematic){this.camera.position.applyAxisAngle(V(0,1,0),.0008);this.camera.lookAt(this.controls.target);}
   if(this.mode==='twin'){
    for(const p of this.packets){p.dot.visible=p.path.userData.active;if(p.dot.visible){const ack=this.frame?.confirmed;const f=(this.sceneTime/2.4)%1;p.dot.position.copy(p.curve.getPoint(ack?1-f:f));p.dot.material.color.setHex(ack?0x9beaaf:0x9ce6ef);}}
    if(this.scan){const active=false;const f=(t/3400)%1;this.scan.scale.setScalar(1+f*3.2);this.scan.material.opacity=active?(1-f)*.40:0;}
   }else{this.core.rotation.y+=.004;}
  }else{this.packets.forEach(p=>{p.dot.visible=p.path.userData.active;p.dot.position.copy(p.curve.getPoint(.5));});if(this.scan)this.scan.material.opacity=0;}
  this.renderer.render(this.scene,this.camera);if(this.frameCount%30===0)this.canvas.dataset.renderStats=JSON.stringify(this.stats());
 }
 stats(){return {visibleEdges:this.linkObjects.filter(p=>p.visible).map(p=>p.userData.link.id),visibleUavs:this.nodeObjects.filter(n=>n.visible&&n.userData.node.layer==='air').length,hostileVessel:!!this.world?.causal?.ship.visible,world:this.layer,cameraMode:this.cameraMode,sceneTime:this.sceneTime,stage:this.frame?.stage,triangles:this.renderer.info.render.triangles,drawCalls:this.renderer.info.render.calls,terrainTriangles:this.terrainTriangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,frames:this.frameCount,pixelRatio:this.renderer.getPixelRatio()};}
 dispose(){if(this.disposed)return;this.disposed=true;this.events.abort();cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.intersectionObserver.disconnect();this.controls.dispose();disposeTree(this.scene);this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();this.host=null;}
}
