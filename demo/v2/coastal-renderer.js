import * as T from 'three';
import {OrbitControls} from '../assets/vendor/OrbitControls.js';
import {AssetPool,palette,towerModel,droneModel,terminalModel,centerModel,vesselModel,buildTown} from './coastal-models.js';
import {terrainHeight,flightPosition,smooth} from './coastal-contract.js';

const V=a=>new T.Vector3(...a);
const STATUS={QUALIFIED:0x7d9f9c,REJECTED:0xdcad70,UNVERIFIED:0x999e9a,FAILED:0xb35e4e,WAITING:0xb8a77c};
export class CoastalRenderer {
 constructor(host,state,{select,onFree,onFailure,reduced=false,quality='standard'}={}){
  this.host=host;this.state=state;this.layout=state.sceneContract.layout;this.select=select;this.onFree=onFree;this.onFailure=onFailure;this.reduced=reduced;this.quality=quality;
  this.pool=new AssetPool();this.m=palette(this.pool);this.nodes=new Map();this.edges=new Map();this.labels=new Map();this.events=new AbortController();this.frameTimes=[];this.renderCount=0;
  this.canvas=document.createElement('canvas');this.canvas.className='coastal-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','虛構星灣立體地景。拖曳旋轉、雙指縮放；方向鍵旋轉，另有定位與節點清單。');host.prepend(this.canvas);
  try{this.renderer=new T.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){this.pool.dispose();this.canvas.remove();throw e;}
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.10;
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='low'?1:1.5));this.renderer.shadowMap.enabled=quality!=='low';this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();const conflict=state.scenarioId==='conflict';this.scene.background=new T.Color(conflict?0x818e91:0xb1bdba);this.scene.fog=new T.Fog(conflict?0x818e91:0xb1bdba,42,90);
  const sky=document.createElement('canvas');sky.width=512;sky.height=256;const ctx=sky.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#aebfc8');gradient.addColorStop(.48,conflict?'#dec2a6':'#e1e5d5');gradient.addColorStop(.56,'#88948d');gradient.addColorStop(1,'#48524a');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  const skyTexture=new T.CanvasTexture(sky);skyTexture.colorSpace=T.SRGBColorSpace;skyTexture.mapping=T.EquirectangularReflectionMapping;
  const pmrem=new T.PMREMGenerator(this.renderer);this.environment=this.pool.own(pmrem.fromEquirectangular(skyTexture));this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.55;skyTexture.dispose();pmrem.dispose();
  this.camera=new T.PerspectiveCamera(39,1,.07,230);this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=1.1;this.controls.maxDistance=90;this.controls.maxPolarAngle=Math.PI*.47;this.controls.target.set(2,1,0);
  this.controls.addEventListener('start',()=>{this.cameraGoal=null;this.targetGoal=null;this.onFree?.();});
  this.scene.add(new T.HemisphereLight(conflict?0xb7c6d1:0xe3ecde,0x746454,conflict?1.2:1.35));
  const sun=new T.DirectionalLight(conflict?0xffc39a:0xffeed0,conflict?2.0:2.3);sun.position.set(-20,28,-28);sun.castShadow=true;sun.shadow.mapSize.setScalar(quality==='high'?2048:1024);Object.assign(sun.shadow.camera,{left:-32,right:32,top:28,bottom:-28,near:1,far:100});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;this.scene.add(sun);this.sun=sun;
  const fill=new T.DirectionalLight(0xc2dbe2,.45);fill.position.set(10,15,20);this.scene.add(fill);
  this.world=new T.Group();this.scene.add(this.world);this.buildLandscape();this.pool.instanceStatic(this.world,[this.ship,this.water,this.town.damageRoad]);this.buildNodes();this.buildEvents();
  this.pool.flush(this.world);
  this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();this.listen('pointerdown',e=>{this.down=[e.clientX,e.clientY];});
  this.listen('pointerup',e=>{if(!this.down||Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>6)return;const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hits=this.raycaster.intersectObjects([...this.nodes.values()],true),id=hits[0]?.object.userData.nodeId;if(id)this.select?.(id);});
  this.listen('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();e.stopPropagation();this.cameraGoal=null;this.onFree?.();if(e.key==='+'||e.key==='-')this.zoom(e.key==='+'?.8:1.2);else{const v=this.camera.position.clone().sub(this.controls.target);if(e.key==='ArrowLeft'||e.key==='ArrowRight')v.applyAxisAngle(new T.Vector3(0,1,0),e.key==='ArrowLeft'?.15:-.15);else v.y=Math.max(.4,v.y+(e.key==='ArrowUp'?1:-1));this.camera.position.copy(v.add(this.controls.target));}}});
  this.listen('webglcontextlost',e=>{e.preventDefault();this.lost=true;host.dataset.render='unavailable';this.canvas.hidden=true;for(const label of this.labels.values())label.hidden=true;this.onFailure?.('WebGL context lost；請以文字與節點清單繼續，或重新載入 3D。');});
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
  this.observer=new IntersectionObserver(es=>{this.visible=es[0].isIntersecting;});this.observer.observe(host);this.visible=true;this.resize();this.focus('overview',true);
  this.setFrame(state.timeline.frames[0],0);this.render(0);host.dataset.render='ready';
 }
 listen(type,fn){this.canvas.addEventListener(type,fn,{signal:this.events.signal});}
 point(a){return new T.Vector3(a[0]*.02,a[1]*.025,a[2]*.02);}
 ground(x,z,offset=0){return new T.Vector3(x*.02,terrainHeight(this.layout,x,z)*.025+offset,z*.02);}
 buildLandscape(){
  const p=this.pool,m=this.m,l=this.layout,[xmin,xmax,zmin,zmax]=l.boundsM;
  const nx=250,nz=220,geo=p.own(new T.PlaneGeometry((xmax-xmin)*.02,(zmax-zmin)*.02,nx,nz));geo.rotateX(-Math.PI/2);geo.translate((xmin+xmax)*.01,0,(zmin+zmax)*.01);
  const pos=geo.attributes.position,colors=[];
  for(let i=0;i<pos.count;i++){
   const u=(pos.getX(i)/.02-xmin)/(xmax-xmin),v=(pos.getZ(i)/.02-zmin)/(zmax-zmin);const spread=(t,lo,hi,focus,half)=>t<.18?lo+(focus-half-lo)*t/.18:t>.82?focus+half+(hi-focus-half)*(t-.82)/.18:focus-half+(t-.18)/.64*2*half;const x=spread(u,xmin,xmax,280,1100),z=spread(v,zmin,zmax,0,1000),h=terrainHeight(l,x,z);pos.setXYZ(i,x*.02,h*.025,z*.02);
   const slope=Math.hypot(terrainHeight(l,x+4,z)-h,terrainHeight(l,x,z+4)-h)/4;
   const c=new T.Color(h<4?0xa6977d:h>85?0x626f59:0x626e4f);c.lerp(new T.Color(0x9b9284),Math.min(.9,slope*.9));c.multiplyScalar(.97+.05*((Math.sin(x*12.9898+z*78.233)*43758.5453)%1));colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const land=new T.Mesh(geo,p.mat('terrain',0xffffff,.99,0,{vertexColors:true}));land.receiveShadow=true;land.castShadow=false;this.world.add(land);
  // Geometric water normals, directional fine waves, matte shore and opaque sea.
  const seaGeo=p.own(new T.PlaneGeometry(170,160,100,90));seaGeo.rotateX(-Math.PI/2);seaGeo.translate(-20,0,0);
  this.waveUniform={value:0};const waterMat=m.water;
  waterMat.onBeforeCompile=shader=>{shader.uniforms.waveTime=this.waveUniform;
   // r185's module-scoped DFG texture otherwise retains each renderer through
   // its dispose listener. Capture the public shader uniform; the mutually
   // exclusive scene owner releases this GPU texture before renderer.dispose.
   this.dfgUniform=shader.uniforms.dfgLUT;
   shader.vertexShader='varying vec3 vWaterPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWaterPosition=position;');
   shader.fragmentShader='uniform float waveTime; varying vec3 vWaterPosition;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n vec3 surfaceNormal=normalize(vec3(.075*sin(vWaterPosition.x*23.0+vWaterPosition.z*5.0+waveTime),1.0,.06*cos(vWaterPosition.x*31.0-vWaterPosition.z*14.0+waveTime*.7))); normal=normalize(mat3(viewMatrix)*surfaceNormal);');
  };
  const water=new T.Mesh(seaGeo,waterMat);water.receiveShadow=true;this.world.add(water);this.water=water;
  const shore=[];for(let z=zmin;z<=zmax;z+=5){const x=l.terrain.coastX+l.terrain.coastAmplitude*Math.sin(z/210);shore.push(this.ground(x+2,z,.025));}
  this.world.add(new T.Line(p.own(new T.BufferGeometry().setFromPoints(shore)),p.own(new T.LineBasicMaterial({color:0xc9c8b1,transparent:true,opacity:.36}))));
  this.town=buildTown(p,m,l,this.world);
  // Landing pads are configured assets; no unconfigured backup models.
  for(const n of this.state.baselineNetwork.nodes.filter(n=>n.flight)){
   const g=new T.Group();g.position.copy(this.point(n.flight.startM));g.position.y-=.06;this.world.add(g);p.mesh(g,'cylinder',m.concrete,[0,0,0],[.20,.025,.20]);p.mesh(g,'box',m.stripe,[0,.018,0],[.22,.005,.022]);for(const x of [-.1,.1])p.mesh(g,'box',m.stripe,[x,.018,0],[.018,.005,.15]);
  }
  const ship=vesselModel(p,m);ship.position.copy(this.point(l.vessel.positionM));ship.rotation.y=-.25;ship.visible=this.state.scenarioId==='conflict';this.world.add(ship);this.ship=ship;
  const wakePoints=[];ship.updateMatrixWorld(true);for(const side of [-1,1])for(const a of [[1.28,.01,side*.13],[4.0,.01,side*.62],[3.8,.01,side*.45]])wakePoints.push(...ship.localToWorld(V(a)).toArray());const wakeGeo=p.own(new T.BufferGeometry());wakeGeo.setAttribute('position',new T.Float32BufferAttribute(wakePoints,3));
  this.wake=new T.Mesh(wakeGeo,p.own(new T.MeshBasicMaterial({color:0xd7d5b8,transparent:true,opacity:.18,side:T.DoubleSide,depthWrite:false})));this.wake.visible=ship.visible;this.world.add(this.wake);
 }
 buildNodes(){
  const p=this.pool,m=this.m;
  for(const n of this.state.baselineNetwork.nodes){
   let g=n.layer==='air'?droneModel(p,m):n.type==='base_station'?towerModel(p,m):n.type==='emergency_center'?centerModel(p,m):n.type==='mobile_relay'?terminalModel(p,m):new T.Group();
   if(n.type==='citizen_device'){
    p.mesh(g,'box',m.concrete,[0,.01,0],[.3,.02,.25]);p.mesh(g,'cone',m.green,[0,.13,0],[.17,.24,.13]);p.mesh(g,'box',m.steel,[.19,.10,.02],[.045,.10,.013]);p.mesh(g,'box',m.light,[.19,.10,.029],[.037,.075,.003]);
   }else if(n.type==='fiber_node'){
    p.mesh(g,'box',m.concrete,[0,.025,0],[.45,.05,.32]);p.mesh(g,'box',m.edge,[0,.12,0],[.24,.19,.20]);p.mesh(g,'box',m.steel,[0,.12,.104],[.20,.14,.007]);for(let y=.07;y<.19;y+=.025)p.mesh(g,'box',m.metal,[.06,y,.111],[.06,.004,.009]);
   }else if(n.layer==='sea')p.mesh(g,'cylinder',m.rubber,[0,0,0],[.08,.11,.08]);
   const hit=new T.Mesh(p.geo('hit',()=>new T.SphereGeometry(.22,8,6)),p.mat('hit',0xffffff,1,0,{visible:false}));g.add(hit);
   g.traverse(o=>{o.userData.nodeId=n.id;});g.userData.node=n;this.nodes.set(n.id,g);this.world.add(g);
   if(n.layer==='air')g.scale.setScalar(n.modelScale);
  }
  for(const l of this.state.baselineNetwork.links){
   const geom=p.own(new T.BufferGeometry());geom.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(33*3),3));
   const mat=p.own(new T.LineDashedMaterial({color:0x92a9a1,dashSize:.13,gapSize:.07,transparent:true,opacity:.65,depthWrite:false}));
   const line=new T.Line(geom,mat);line.frustumCulled=false;line.userData.linkId=l.id;line.visible=false;this.edges.set(l.id,line);this.world.add(line);
   const tube=new T.Mesh(this.pool.own(new T.BufferGeometry()),this.pool.own(new T.MeshBasicMaterial({color:0x8cb8a5,transparent:true,opacity:.82,depthWrite:false})));tube.visible=false;line.userData.tube=tube;this.world.add(tube);
  }
  for(const id of ['citizen-01','ground-bs-01','emergency-center','users-b','uav-spare-a']){
   const n=this.state.baselineNetwork.nodes.find(n=>n.id===id),el=document.createElement('button');el.className='coastal-pin';el.dataset.coastalNode=id;el.textContent=n.label;el.setAttribute('aria-label',`查看 ${n.label}`);this.host.append(el);this.labels.set(id,el);
  }
 }
 buildEvents(){
  const p=this.pool,m=this.m;this.damage=new T.Group();this.world.add(this.damage);
  const slope=this.layout.landslide,c=this.ground(...slope.center),geo=p.own(new T.PlaneGeometry(2.8,3.6,12,16));geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;for(let i=0;i<pos.count;i++){const localZ=pos.getZ(i),taper=.64+.25*Math.cos(localZ*.85)+.1*Math.sin(localZ*4.7),x=c.x+pos.getX(i)*taper,z=c.z+localZ+.07*Math.sin(pos.getX(i)*6);pos.setXYZ(i,x,terrainHeight(this.layout,x/.02,z/.02)*.025+.045,z);}geo.computeVertexNormals();
  this.scar=new T.Mesh(geo,p.mat('scar',0x998169,.98));this.scar.receiveShadow=true;this.damage.add(this.scar);
  this.rocks=[];for(let i=0;i<38;i++){const a=i*2.399,r=.25+Math.sqrt(i/38)*1.2,x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r*.85;const rock=new T.Mesh(p.geo('rubble',()=>new T.IcosahedronGeometry(1,0)),i%3?m.rock:m.soil);rock.scale.set(.07+(i%5)*.025,.05+(i%4)*.024,.09+(i%3)*.03);rock.rotation.set(i*.3,i*.7,i);rock.userData.final=new T.Vector3(x,terrainHeight(this.layout,x/.02,z/.02)*.025+.08,z);rock.castShadow=true;this.damage.add(rock);this.rocks.push(rock);}
  const crackPoints=[];for(let i=0;i<14;i++){const x=c.x-1.1+i*.16,z=c.z+.15*Math.sin(i*2);crackPoints.push(new T.Vector3(x,terrainHeight(this.layout,x/.02,z/.02)*.025+.07,z));}this.damage.add(new T.Line(p.own(new T.BufferGeometry().setFromPoints(crackPoints)),p.own(new T.LineBasicMaterial({color:0x3b342c}))));
  this.smoke=[];
  for(const event of this.state.sceneContract.events.filter(e=>['impact','earthquake'].includes(e.kind))){
   const group=new T.Group();this.world.add(group);const center=this.point(event.positionM);center.y=terrainHeight(this.layout,event.positionM[0],event.positionM[2])*.025;
   for(let i=0;i<13;i++){const mat=p.own(new T.MeshStandardMaterial({color:event.kind==='earthquake'?0x978c77:0x777570,roughness:1,transparent:true,opacity:0,depthWrite:false}));const mesh=new T.Mesh(p.geo('smoke-puff',()=>new T.SphereGeometry(1,10,7)),mat);group.add(mesh);this.smoke.push({mesh,event,center,index:i});}
  }
  this.flash=new T.PointLight(0xffa751,0,5,1.8);this.world.add(this.flash);
  this.launchFlash=new T.Mesh(p.geo('flash',()=>new T.SphereGeometry(.09,10,8)),p.mat('flash',0xffc274,.7,0,{emissive:0xffb34b,emissiveIntensity:2}));this.world.add(this.launchFlash);
  this.trace=new T.Line(p.own(new T.BufferGeometry().setFromPoints(Array.from({length:25},()=>new T.Vector3()))),p.own(new T.LineBasicMaterial({color:0xe8c598,transparent:true,opacity:.65})));this.trace.frustumCulled=false;this.world.add(this.trace);
  this.packet=new T.Mesh(p.geo('packet',()=>new T.SphereGeometry(.053,10,7)),p.mat('packet',0xbbe9d0,.7,0,{emissive:0x769889,emissiveIntensity:.7}));this.world.add(this.packet);
  this.buildingDamage=new T.Group();this.world.add(this.buildingDamage);const building=this.layout.buildings.find(b=>b.id==='building-2-2');
  if(building){const base=this.ground(building.x,building.z),h=building.height*.025,d=building.depth*.02,w=building.width*.02;
   const points=[[-.14,h*.9],[-.08,h*.72],[-.13,h*.58],[.01,h*.39],[-.06,h*.18]].map(([x,y])=>new T.Vector3(base.x+x,base.y+y,base.z+d/2+.026));
   this.buildingDamage.add(new T.Line(p.own(new T.BufferGeometry().setFromPoints(points)),p.own(new T.LineBasicMaterial({color:0x292a27}))));
   for(let i=0;i<6;i++){const rock=new T.Mesh(p.geo('rubble',()=>new T.IcosahedronGeometry(1,0)),m.concrete);rock.scale.set(.055,.034,.055);rock.position.copy(base).add(new T.Vector3(-w*.3+i*.06,.035,d/2+.07+Math.sin(i)*.04));this.buildingDamage.add(rock);}
  }
 }
 setFrame(frame,time){this.frame=frame;this.time=time;this.nodeData=new Map(frame.networkState.nodes.map(n=>[n.id,n]));this.active=new Set(frame.candidates.find(c=>c.id===frame.routeId)?.links||[]);if(frame.phase===0){this.active=new Set(frame.regions.flatMap(r=>r.candidates[0]?.links||[]));}this.update(time);}
 update(time){
  if(!this.frame)return;this.time=time;const f=this.frame;
  for(const [id,g] of this.nodes){const n=this.nodeData.get(id),a=n.layer==='air'?flightPosition(n,time):n.anchorM;
   g.position.copy(n.layer==='air'?this.point(a):this.ground(a[0],a[2]));
   if(n.layer==='sea')g.position.copy(this.point(a));g.visible=n.layer!=='sea'||this.cutaway;
   if(g.userData.structure)g.userData.structure.rotation.z=n.modelState==='damaged'?Math.min(1,Math.max(0,time-8))*1.2:0;
   if(g.userData.lamp)g.userData.lamp.visible=n.operation==='serving';
   if(n.layer==='air'){
    const flying=n.operation!=='standby'&&(n.operation!=='failed'||n.failureMode==='relay_fault');const t=n.flight;const travel=time>t.launchSeconds+2&&time<t.arrivalSeconds;
    g.rotation.z=travel?-.08*Math.sin(Math.PI*(time-t.launchSeconds)/(t.arrivalSeconds-t.launchSeconds)):0;
    for(const rotor of g.userData.rotors)rotor.rotation.y=flying&&!this.reduced?time*40:0;
   }
  }
  for(const l of f.networkState.links){const edge=this.edges.get(l.id),a=this.point(l.source&&this.nodeData.get(l.source).layer==='air'?flightPosition(this.nodeData.get(l.source),time):this.nodeData.get(l.source).anchorM),b=this.point(this.nodeData.get(l.target).layer==='air'?flightPosition(this.nodeData.get(l.target),time):this.nodeData.get(l.target).anchorM);
   const active=this.active.has(l.id)&&l.qualification==='QUALIFIED';const rejected=l.qualification==='REJECTED'||l.qualification==='UNVERIFIED';const selected=this.selectedLink===l.id;
   const air=[l.source,l.target].some(id=>this.nodeData.get(id).layer==='air');
   edge.visible=(selected||active||this.topology||rejected&&f.phase>=2||l.qualification==='FAILED'&&!!l.causeEventId)&&(!air||f.phase>=5)&&(l.renderMode!=='cutaway'||this.cutaway);
   const geometryKey=f.snapshotId+(air&&[l.source,l.target].some(id=>this.nodeData.get(id).operation==='deploying')?time:'');
   if(edge.userData.geometryKey!==geometryKey){const points=[],positions=edge.geometry.attributes.position;for(let i=0;i<=32;i++){const t=i/32;const v=a.clone().lerp(b,t);if(l.medium==='fiber'&&l.renderMode!=='cutaway')v.y=Math.max(v.y,terrainHeight(this.layout,v.x/.02,v.z/.02)*.025+.05);if(l.medium!=='fiber')v.y+=Math.sin(Math.PI*t)*.18;positions.setXYZ(i,v.x,v.y,v.z);points.push(v);}positions.needsUpdate=true;edge.computeLineDistances();
    if(active){const tube=edge.userData.tube;tube.geometry.dispose();this.pool.resources.delete(tube.geometry);tube.geometry=this.pool.own(new T.TubeGeometry(new T.CatmullRomCurve3(points),48,.024,5,false));}edge.userData.geometryKey=geometryKey;}
   edge.material.color.setHex(active?(f.confirmed?0xa6dbc0:f.phase===0?0x80b4a5:0xc5a8e4):STATUS[l.qualification]);edge.material.opacity=active?.94:selected?.95:rejected?.68:.28;
   edge.material.dashSize=active?1000:l.qualification==='UNVERIFIED'?.03:.16;edge.material.gapSize=active?0:.1;edge.material.depthTest=!this.topology;edge.renderOrder=this.topology?5:0;
   const tube=edge.userData.tube;tube.visible=edge.visible&&active;tube.material.color.copy(edge.material.color);tube.material.depthTest=!this.topology;tube.renderOrder=this.topology?5:0;
  }
  this.damage.visible=this.state.scenarioId==='disaster'&&f.networkState.damageAssets.includes('slope-east');
  this.town.damageRoad.visible=!this.damage.visible;
  this.buildingDamage.visible=f.networkState.damageAssets.includes('building-2-2');
  this.world.position.x=!this.reduced&&this.state.scenarioId==='disaster'&&time>=5&&time<5.7?Math.sin((time-5)*55)*.012:0;
  if(this.damage.visible){const t=smooth((time-5)/3);for(const rock of this.rocks){rock.position.copy(rock.userData.final);rock.position.y+=(1-t)*1.5;rock.position.x+=(1-t)*.7;}}
  for(const {mesh,event,center,index:i} of this.smoke){const age=time-event.seconds;
   const duration=event.kind==='earthquake'?7:15,life=Math.max(0,1-age/duration),size=.17+i*.027;
   mesh.visible=!this.reduced&&age>=0&&age<duration;
   mesh.position.copy(center).add(new T.Vector3(Math.sin(i*2.4)*.30+age*.025,.15+Math.max(0,age)*(.12+i*.006),Math.cos(i*2.4)*.22));mesh.scale.setScalar(size+Math.max(0,age)*.018);mesh.material.opacity=.18*life;
  }
  const conflict=this.state.scenarioId==='conflict';const events=this.state.sceneContract.events;const event=events.find(e=>e.kind==='impact'&&time>=e.seconds&&time<e.seconds+.45);
  this.flash.intensity=event&&!this.reduced?28*(1-(time-event.seconds)/.45):0;if(event)this.flash.position.copy(this.point(event.positionM));
  const shot=conflict?events.find(e=>e.kind==='impact'&&time>=e.seconds-2&&time<e.seconds):null;
  this.trace.visible=!!shot&&!this.reduced;this.launchFlash.visible=!!shot&&!this.reduced&&time<shot.seconds-1.8;
  if(shot){const from=this.ship.localToWorld(this.ship.userData.muzzle.clone()),to=this.point(shot.positionM),end=smooth((time-shot.seconds+2)/2);this.launchFlash.position.copy(from);
   const pos=this.trace.geometry.attributes.position;for(let i=0;i<25;i++){const t=Math.max(0,end-.16)+i/24*Math.min(.16,end),v=from.clone().lerp(to,t);v.y+=Math.sin(Math.PI*t)*1.5;pos.setXYZ(i,v.x,v.y,v.z);}pos.needsUpdate=true;}
  this.waveUniform.value=this.reduced?0:time;
  this.water.material.transparent=!!this.cutaway;this.water.material.opacity=this.cutaway?.20:1;this.water.material.depthWrite=!this.cutaway;
  this.packet.visible=false;const activeEdge=[...this.edges.values()].find(e=>this.active.has(e.userData.linkId)&&e.visible);
  if(activeEdge&&f.phase>=10&&!this.reduced){this.packet.visible=true;const pos=activeEdge.geometry.attributes.position;const v=(time%2)/2,i=Math.min(32,Math.floor((f.confirmed?1-v:v)*32));this.packet.position.fromBufferAttribute(pos,i);}
 }
 focus(name,immediate=false){
  let target,eye;const narrow=this.host.clientWidth<700;
  if(name==='overview'){target=new T.Vector3(1.7,1.0,0);eye=new T.Vector3(-22,20,28);if(narrow)eye.set(-28,36,45);}
  else if(name==='vessel'){target=this.ship.position.clone().add(new T.Vector3(0,.4,0));eye=target.clone().add(new T.Vector3(-3.8,2.4,4.7));}
  else {const id=name==='fault'?'ground-bs-01':name==='source'?'citizen-01':name==='center'?'emergency-center':name==='relay'?'uav-spare-a':name;const n=this.nodeData.get(id);if(!n)return;target=this.point(n.layer==='air'?flightPosition(n,this.time):n.anchorM);eye=target.clone().add(new T.Vector3(-4,3.4,5.0));}
  if(immediate||this.reduced){this.controls.target.copy(target);this.camera.position.copy(eye);this.camera.lookAt(target);this.cameraGoal=null;}else{this.cameraGoal=eye;this.targetGoal=target;}
 }
 zoom(factor){this.cameraGoal=null;const v=this.camera.position.clone().sub(this.controls.target);v.multiplyScalar(factor).clampLength(1.1,90);this.camera.position.copy(this.controls.target).add(v);this.onFree?.();}
 resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(w&&h){this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.scene.fog.near=w<700?70:42;this.scene.fog.far=w<700?140:90;}}
 render(time){if(this.disposed||this.lost||!this.visible||document.hidden)return;
  const now=performance.now();if(this.lastRender){const dt=now-this.lastRender;if(dt<200)this.frameTimes.push(dt);if(this.frameTimes.length>900)this.frameTimes.shift();}this.lastRender=now;
  this.update(time);if(this.cameraGoal){this.camera.position.lerp(this.cameraGoal,.1);this.controls.target.lerp(this.targetGoal,.1);if(this.camera.position.distanceTo(this.cameraGoal)<.004)this.cameraGoal=null;}
  this.controls.update();
  for(const model of [...this.nodes.values(),this.ship]){const near=model.position.distanceTo(this.camera.position)<16;if(model.userData.near!==near){model.userData.near=near;model.traverse(o=>{if(o.userData.fineDetail)o.visible=near;});}}
  this.renderer.render(this.scene,this.camera);this.renderCount++;
  for(const [id,el] of this.labels){const n=this.nodeData.get(id);const pos=this.point(n.layer==='air'?flightPosition(n,time):n.anchorM);pos.y+=.23;pos.project(this.camera);el.hidden=this.lost||pos.z>1||Math.abs(pos.x)>.93||Math.abs(pos.y)>.88||this.host.clientWidth<700&&['uav-spare-a','users-b'].includes(id);el.style.left=`${(pos.x*.5+.5)*100}%`;el.style.top=`${(-pos.y*.5+.5)*100}%`;el.dataset.status=n.operation;}
 }
 stats(){const a=[...this.frameTimes].sort((a,b)=>a-b),q=p=>a[Math.min(a.length-1,Math.floor(a.length*p))]??null;return {owner:'CoastalRenderer',ready:!this.lost,quality:this.quality,dpr:this.renderer.getPixelRatio(),renderCount:this.renderCount,
  geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,programs:this.renderer.info.programs.length,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,
  frameMs:{samples:a.length,p50:q(.5),p95:q(.95),max:a.at(-1)??null},camera:{eye:this.camera.position.toArray(),target:this.controls.target.toArray()},
  roadSurfaceMinNormalY:Math.min(...this.town.roadSurfaces.flatMap(m=>Array.from(m.geometry.attributes.normal.array).filter((_,i)=>i%3===1))),
  nodeIds:[...this.nodes.keys()],uavs:[...this.nodes].filter(([id])=>this.nodeData.get(id).layer==='air').map(([id,g])=>({id,operation:this.nodeData.get(id).operation,position:g.position.toArray()})),
  visibleEdges:[...this.edges.values()].filter(e=>e.visible).map(e=>({id:e.userData.linkId,active:this.active.has(e.userData.linkId)})),time:this.time,cutaway:!!this.cutaway,topology:!!this.topology};}
 dispose(){if(this.disposed)return;this.disposed=true;this.events.abort();this.resizeObserver?.disconnect();this.observer?.disconnect();this.controls?.dispose();for(const e of this.labels.values())e.remove();this.sun?.shadow.map?.dispose();this.dfgUniform?.value?.dispose();this.dfgUniform=null;this.pool.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();this.scene.clear();}
}
