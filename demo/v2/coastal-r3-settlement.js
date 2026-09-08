import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';
import {buildBuildingPilot,mergeArchitecturalGeometry} from './coastal-r2-buildings.js';

// Exhibition architecture, in fictional local metres. This derivative never
// mutates the source layout or any RF anchor, damage id, road or route.
const XY=.02,Y=.025;
const RESERVED_PADS=[[-80,-215,31],[90,400,59],[90,250,31],[-65,235,34],[-135,135,30],[-180,380,28],[-280,570,31],[420,-295,28],[480,-450,31]];
export function settlementBuildings(layout){
 const buildings=layout.buildings.map((b,i)=>{
  if(b.id==='building-2-2')return {...b,r3Style:0};
  const [,row,col]=b.id.split('-').map(Number),phase=(row*7+col*3)%5;
  const x=b.x+(col===0?-8:col===1?9:((phase-2)*8)),z=b.z+(phase-2)*9;
  const originalHeight=b.height;
  const height=col===0?[16,22,13,19][row%4]:col===1?[29,18,34,23][row%4]:[17,25,14,21][(row+col)%4];
  const v={...b,x,z,height:Math.min(originalHeight+3,height),width:b.width*(col===0?.86:1),r3Style:(row+col)%4,r3Rotation:(phase-2)*.017};
  if(b.id==='building-3-0')Object.assign(v,{x:-139,z:-188,height:13,r3Terrace:true});
  if(b.id==='building-0-2')Object.assign(v,{x:291,z:-666,width:75,depth:35,height:8.5,r3Industrial:true,r3Style:3});
  if(b.id==='building-1-2')Object.assign(v,{x:269,z:-534,width:51,depth:43,height:23,r3Stepped:true,r3Style:1});
  if(b.id==='building-4-1')Object.assign(v,{height:43,r3Style:1});
  if(row===5&&col>=2)Object.assign(v,{x:273+(col-2)*58,z:516+(col%2)*5,height:[16,26,12][col-2],r3Rotation:0,r3Stepped:col===3,r3Style:col===2?2:col===3?1:3});
  if(row===6&&col>=2)Object.assign(v,{x:273+(col-2)*54,z:632+(col%2)*3,height:[12,21,44][col-2],r3Rotation:0,r3Terrace:col===2,r3Stepped:col===3,r3Style:col===2?3:col===3?2:1});
  if(col===0&&row!==3)Object.assign(v,{height:Math.min(13,v.height),r3Terrace:true,r3Style:2});
  return v;
 });
 // Small adjoining shopfronts are grouped beside the two coastal streets,
 // leaving deliberate court/yard gaps. Dense low rooflines support a few
 // landmarks instead of twenty-six equally important isolated blocks.
 const plots=[[-149,-652,19,29,11],[-126,-652,19,29,14],[-146,-570,20,31,12],[-122,-570,20,31,10],
  [-149,-310,20,30,11],[-122,-353,18,31,15],[62,-558,23,33,17],[88,-558,20,33,13],
  [53,-310,20,28,11],[77,-313,19,28,14],[328,-550,22,34,15],[354,-550,22,34,12],
  [-145,638,21,28,12],[-120,638,21,28,16],[65,619,22,31,13],[92,622,22,31,10],
  [330,607,22,31,12],[357,607,22,31,15],[447,549,24,35,13],[476,549,24,35,11]];
 for(const [i,[x,z,width,depth,height]]of plots.entries()){
  const clear=RESERVED_PADS.every(([px,pz,r])=>Math.hypot(x-px,z-pz)>r+Math.max(width,depth)*.58)&&buildings.every(b=>Math.abs(x-b.x)>(width+b.width)/2+3||Math.abs(z-b.z)>(depth+b.depth)/2+3);
  if(clear)buildings.push({id:'r3-infill-'+i,x,z,width,depth,height,style:i%4,roof:1,r3Style:i%4,r3Terrace:true,r3Rotation:0});
 }
 return buildings;
}
function addMesh(p,parent,geometry,material,name){p.own(geometry);const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function metricUV(geo,tile=2){
 const pos=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
 for(let i=0;i<pos.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));uv.setXY(i,(nx>nz?pos.getZ(i):pos.getX(i))/tile,(ny>Math.max(nx,nz)?pos.getZ(i):pos.getY(i))/tile);}return geo;
}
function solid(p,parent,mat,pos,size,name='manufactured component'){
 const key='r3-box-'+size.join('-'),geo=p.geo(key,()=>metricUV(new T.BoxGeometry(...size))),o=addMesh(p,parent,geo,mat,name);o.position.fromArray(pos);return o;
}
function metricGroup(parent,x,y,z){const group=new T.Group();group.position.set(x*XY,y*Y,z*XY);group.scale.set(XY,Y,XY);parent.add(group);return group;}
function ribbon(p,parent,layout,points,width,mat,name,offset=.07){
 const pos=[],uv=[];
 for(let k=1;k<points.length;k++){
  const a=points[k-1],b=points[k],length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,n=Math.ceil(length/5);
  for(let i=0;i<n;i++){const v=[];for(const t of [i/n,(i+1)/n])for(const side of [-1,1]){const x=a[0]+(b[0]-a[0])*t-dz*side*width/2,z=a[1]+(b[1]-a[1])*t+dx*side*width/2;v.push([x*XY,(terrainHeight(layout,x,z)+offset)*Y,z*XY,x/2,z/2]);}for(const j of [0,1,2,1,3,2]){pos.push(...v[j].slice(0,3));uv.push(...v[j].slice(3));}}
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();return addMesh(p,parent,geo,mat,name);
}
function inhabitedGround(p,parent,layout,buildings){
 // Occupied lots have a continuous working surface and rear service strips.
 // Keep the actual terrain and protected node yards.
 const mat=p.mat('r3-occupied-lot-surface',0xffffff,.98,0,{vertexColors:true}),positions=[],colors=[],uv=[];
 let parcels=0;
 for(const [i,b]of buildings.entries()){
  const ex=b.r3Industrial?12:5+i%3*2,ez=b.r3Industrial?14:6+i%4*1.5;
  const w=b.width+ex*2,d=b.depth+ez*2;
  if(RESERVED_PADS.some(([x,z,r])=>Math.hypot(Math.max(0,Math.abs(x-b.x)-w/2),Math.max(0,Math.abs(z-b.z)-d/2))<r))continue;
  const nx=Math.ceil(w/5),nz=Math.ceil(d/5),base=new T.Color(b.r3Industrial?0x72786d:b.r3Terrace?0x929180:0x858c80);
  for(let a=0;a<nx;a++)for(let c=0;c<nz;c++){
   const corners=[];
   for(const [da,dc]of [[0,0],[1,0],[0,1],[1,1]]){
    const x=b.x-w/2+(a+da)*w/nx,z=b.z-d/2+(c+dc)*d/nz;
    // Damp, weathered margins meet the unpaved surface without a bright plinth.
    const edge=Math.min(a+da,nx-a-da,c+dc,nz-c-dc),v=base.clone().multiplyScalar(edge===0?.66:.86+.08*Math.sin(x*.34+z*.27));
    corners.push({x,z,y:terrainHeight(layout,x,z)+.21,v});
   }
   for(const j of [0,2,1,1,2,3]){const q=corners[j];positions.push(q.x*XY,q.y*Y,q.z*XY);colors.push(q.v.r,q.v.g,q.v.b);uv.push(q.x/3,q.z/3);}
  }
  parcels++;
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
 const mesh=addMesh(p,parent,geo,mat,'weathered occupied parcels and service courts');mesh.castShadow=false;
 return {parcels,triangles:positions.length/9,protectedNodeYards:true};
}
export function buildR3Settlement(p,m,layout,parent,blocks){
 const buildings=settlementBuildings(layout),group=new T.Group();group.name='R3 inhabited coastal quarters';parent.add(group);
 for(const b of buildings)blocks.set(b.id,buildBuildingPilot(p,m,layout,b,group));
 const laneMaterial=p.mat('r3-local-lane',0x4b504d,.97),paths=[
  [[-205,-606],[115,-606],[160,-590]], [[-201,-480],[-34,-480],[160,-490]],
  [[-202,-370],[111,-370],[160,-382]], [[-190,-255],[-43,-255],[125,-249],[160,-257]],
  [[160,-610],[365,-610]], [[160,-370],[342,-370]],
  [[-163,576],[130,576],[160,587]], [[160,562],[553,563]],
  [[-150,681],[130,681],[160,692]], [[160,682],[551,682]],
  [[222,460],[225,692]], [[455,460],[458,691]]
 ];
 for(const points of paths){ribbon(p,group,layout,points,9,m.r2Concrete,'street shoulder',.11);ribbon(p,group,layout,points,6,laneMaterial,'local access lane',.16);}
 // Short ground-following entries connect occupied lots with their side lane;
 // they are rendered infrastructure only and never become qualified RF links.
 for(const b of buildings){const nearby=paths.flatMap(path=>path.slice(1).map((v,i)=>{const a=path[i],dx=v[0]-a[0],dz=v[1]-a[1],q=T.MathUtils.clamp(((b.x-a[0])*dx+(b.z-a[1])*dz)/(dx*dx+dz*dz),0,1),x=a[0]+dx*q,z=a[1]+dz*q;return {x,z,d:Math.hypot(x-b.x,z-b.z)};})).sort((a,b)=>a.d-b.d)[0];
  if(nearby&&nearby.d>Math.max(b.width,b.depth)*.5+2&&nearby.d<74){const dx=nearby.x-b.x,dz=nearby.z-b.z,d=Math.hypot(dx,dz),edge=Math.min(b.width/Math.max(.01,Math.abs(dx/d)),b.depth/Math.max(.01,Math.abs(dz/d)))/2;ribbon(p,group,layout,[[b.x+dx/d*edge,b.z+dz/d*edge],[nearby.x,nearby.z]],3.3,m.r2Concrete,'grounded property entrance',.13);}
 }
 let triangles=0;group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 mergeArchitecturalGeometry(p,group);
 const ground=inhabitedGround(p,group,layout,buildings);triangles+=ground.triangles;
 group.userData.r3={triangles,draws:group.children.filter(o=>o.isMesh).length,canonicalBuildings:layout.buildings.length,infillBuildings:buildings.length-layout.buildings.length,localAccessLanes:paths.length,ground,authority:'visual architecture only; canonical layout and nodes unchanged'};
 return group;
}
function footprint(p,parent,outline,bottom,top,material,name,holes=[]){
 const shape=new T.Shape(outline.map(v=>new T.Vector2(...v)));
 for(const outline of holes){const hole=new T.Path(outline.map(v=>new T.Vector2(...v)));shape.holes.push(hole);}
 const geo=new T.ExtrudeGeometry(shape,{depth:top-bottom,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);geo.translate(0,bottom,0);return addMesh(p,parent,metricUV(geo),material,name);
}
function warehouse(p,g,m,x,z,w,d,h){
 const group=new T.Group();group.position.set(x,11.3,z);g.add(group);
 const wall=m.r3PortWall,roof=m.r3PortRoof;
 solid(p,group,m.r2Concrete,[0,.4,0],[w+1.1,.8,d+1.1],'warehouse ground footing');
 solid(p,group,wall,[0,h/2,0],[w,h,d],'industrial masonry and sheeted warehouse');
 const shape=new T.Shape([new T.Vector2(-w/2-.65,0),new T.Vector2(0,3.2),new T.Vector2(w/2+.65,0)]),geo=new T.ExtrudeGeometry(shape,{depth:d+1.2,bevelEnabled:false});geo.translate(0,h,-d/2-.6);addMesh(p,group,metricUV(geo),roof,'pitched standing seam roof');
 // Each roof plane has raised seams, open high-level clerestories and vents.
 for(let zz=-d/2;zz<=d/2;zz+=4.3)for(const side of [-1,1])p.beam(group,[0,h+3.24,zz],[side*(w/2+.6),h+.07,zz],.065,m.metal);
 for(const side of [-1,1])for(let zz=-d/2+2;zz<d/2;zz+=5.6)solid(p,group,m.metal,[side*(w/2+.09),h*.5,zz],[.18,h,.23],'industrial wall folded seam');
 for(let zz=-d/2+5;zz<d/2-2;zz+=13){
  solid(p,group,m.darkMetal,[-w/2-.08,3.4,zz],[.10,5.8,8.0],'deep loading door recess');
  solid(p,group,m.steel,[-w/2-.16,3.35,zz],[.15,5.55,7.5],'rolling warehouse door');
  for(let yy=1;yy<6;yy+=.42)solid(p,group,m.metal,[-w/2-.25,yy,zz],[.12,.09,7.35],'shutter corrugation');
  for(const dz of [-4.12,4.12])solid(p,group,m.r2Concrete,[-w/2-.46,3.4,zz+dz],[.64,6.5,.54],'door pier and battered loading corner');
  solid(p,group,m.r2Concrete,[-w/2-1.7,.45,zz],[3.5,.9,9.4],'truck loading landing');
  for(const dz of [-4.35,4.35])solid(p,group,m.rubber,[-w/2-3.49,.58,zz+dz],[.18,1.0,.40],'loading dock rubber bumper');
  solid(p,group,m.glass,[-w/2-.12,h-2.0,zz],[.15,1.5,8],'warehouse clerestory glazing');
 }
 solid(p,group,m.r3PortRoof,[-w/2-2.0,7.3,0],[4.6,.24,d+1.0],'cantilever loading canopy');
 for(let zz=-d/2+5;zz<d/2;zz+=13)p.beam(group,[-w/2-.1,9,zz],[-w/2-4.2,7.3,zz],.085,m.steel);
 for(const zz of [-d*.26,d*.26]){solid(p,group,m.metal,[0,h+3.0,zz],[3.7,1.7,5],'industrial ridge vent');solid(p,group,m.r3PortRoof,[0,h+3.94,zz],[4.8,.18,6],'vent rain cap');}
 return group;
}
function container(p,g,m,x,y,z,angle,variant){
 const group=new T.Group();group.position.set(x,y,z);group.rotation.y=angle;g.add(group);const body=[m.r3ContainerSlate,m.r3ContainerOxide,m.r3ContainerSand][variant%3],w=2.44,d=12.2,h=2.59;
 solid(p,group,body,[0,h/2,0],[w,h,d],'ISO 40 foot container');
 for(const side of [-1,1]){for(let zz=-5.8;zz<6;zz+=.43)solid(p,group,body,[side*(w/2+.035),h/2,zz],[.10,h-.16,.095],'pressed corrugated side');for(const yy of [.10,h-.10])solid(p,group,m.steel,[side*(w/2-.02),yy,0],[.08,.13,d],'container corner rail');}
 for(const xx of [-.96,.96]){solid(p,group,m.steel,[xx,h/2,d/2+.04],[.11,h-.12,.08],'container locking rod');for(const yy of [.09,h-.09])solid(p,group,m.metal,[xx,yy,d/2+.025],[.2,.18,.19],'corner casting');}
 return group;
}
function dockCrane(p,g,m,x,z){
 const crane=new T.Group();crane.position.set(x,11.3,z);g.add(crane);
 for(const xx of [-6.6,6.6])for(const zz of [-5.2,5.2]){solid(p,crane,m.steel,[xx,1.3,zz],[3.0,2.6,3.9],'rail carriage');p.beam(crane,[xx,2,zz],[xx*.64,25,zz*.56],.48,m.metal);p.beam(crane,[xx,4,zz],[-xx*.64,21,zz*.56],.17,m.steel);}
 solid(p,crane,m.r3CranePaint,[0,25,0],[15,2.7,11],'crane portal');solid(p,crane,m.steel,[0,27,0],[8,1.2,8],'slewing platform');
 for(const side of [-1,1]){p.beam(crane,[0,27,side*1.8],[-45,42,side*1.1],.36,m.r3CranePaint);p.beam(crane,[0,33,0],[-45,45,0],.4,m.r3CranePaint);for(let i=0;i<9;i++){const a=i/9,b=(i+1)/9;p.beam(crane,[-45*a,27+15*a,side*(1.8-.7*a)],[-45*b,33+12*b,0],.13,m.steel);}}
 p.beam(crane,[0,28,0],[16,30,0],.9,m.metal);solid(p,crane,m.darkMetal,[14,30,0],[9,6.2,8],'counterweight');
 solid(p,crane,m.r3CranePaint,[-5,30,6],[7,5.5,5.4],'operator cabin');solid(p,crane,m.glass,[-5,30.4,8.74],[5.8,3.3,.1],'recessed cabin windows');
 for(const side of [-1,1])p.beam(crane,[-44,42,side*.75],[-44,9,side*.75],.075,m.steel);
 solid(p,crane,m.sand,[-44,8.7,0],[3.0,.9,7.0],'suspended empty cargo spreader');
 for(let y=3;y<26;y+=1)solid(p,crane,m.metal,[6.0,y,5.7],[1.1,.1,.12],'maintenance ladder rung');
 return crane;
}
export function buildR3Harbor(p,m,layout,parent){
 const harbor=metricGroup(parent,0,0,0);harbor.name='R3 working coast harbor';
 // The wall scan contains formwork stripes which would read as timber on a
 // large horizontal apron. Reuse the local fine mineral scan for cast marine
 // concrete; preserve its normal/roughness detail under a neutral cement coat.
 const marineConcrete=p.own((m.r2Facade||m.concrete).clone());marineConcrete.name='R3 cast marine concrete';
 marineConcrete.normalScale?.set(.13,.13);marineConcrete.roughness=.96;
 marineConcrete.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(vec3(0.21,0.235,0.22),diffuseColor.rgb,0.10);');};
 marineConcrete.customProgramCacheKey=()=> 'r3-marine-cement';
 m={...m,r2Concrete:marineConcrete,r3PortWall:p.mat('r3-port-sheeted-wall',0x959b92,.86,.08),r3PortRoof:p.mat('r3-zinc-standing-seam',0x656e6c,.71,.32),r3ContainerSlate:p.mat('r3-container-slate',0x556f76,.73,.21),r3ContainerOxide:p.mat('r3-container-oxide',0x82614e,.80,.15),r3ContainerSand:p.mat('r3-container-sand',0xa59b7b,.80,.16),r3CranePaint:p.mat('r3-crane-paint',0xb3ad91,.70,.26)};
 const concrete=m.r2Concrete||m.concrete;
 footprint(p,harbor,[[-370,-414],[-235,-414],[-235,-650],[-328,-650],[-370,-637]],-9,11.2,concrete,'filled quay with angular seaward retaining wall',[[[-303,-546],[-257,-546],[-257,-599],[-303,-599]]]);
 // Cast apron pours have broad slab panels and restrained repaired joints.
 // Their spacing follows service functions, with no noisy decorative texture.
 const joint=p.mat('r3-concrete-expansion-joint',0x696c62,.98);
 for(let z=428;z<635;z+=16){
  if(z>=545&&z<=600){solid(p,harbor,joint,[-336.6,11.22,z],[62,.025,.075],'quay saw-cut joint west of node yard');solid(p,harbor,joint,[-246.2,11.22,z],[19,.025,.075],'quay saw-cut joint east of node yard');}
  else solid(p,harbor,joint,[-301.7,11.22,z],[128,.025,.075],'apron transverse expansion joint');
 }
 for(const x of [-346,-321,-244])solid(p,harbor,joint,[x,11.22,528],[.075,.025,218],'apron longitudinal expansion joint');
 for(const z of [438,551]){
  for(const x of [-356,-337])solid(p,harbor,m.sand,[x,11.30,z],[.15,.035,13],'crane work bay side');
  solid(p,harbor,m.sand,[-346.5,11.30,z-6.5],[19,.035,.15],'crane work bay return');
 }
 // Quay top is divided by real expansion joints and a water-stained sea wall.
 for(let i=0;i<22;i++){
  const z=418+i*10;
  solid(p,harbor,m.r3PortRoof,[-369.85,4.0,z],[.4,4.2,9.65],'tidal waterline stain');
  solid(p,harbor,m.darkMetal,[-371.0,6.5,z],[1.5,6.0,1.8],'replaceable quay rubber fender');
  solid(p,harbor,m.r2Concrete,[-367.5,11.6,z],[4.6,.8,9.82],'quay edge coping and joint');
  if(i%2===0){solid(p,harbor,m.steel,[-361,12.35,z],[2.4,2.3,1.8],'mooring bollard base');solid(p,harbor,m.steel,[-361,13.50,z],[3.6,.70,1.5],'mooring bollard cross head');}
  solid(p,harbor,m.sand,[-357.8,11.31,z],[.18,.035,5.8],'safe working edge marking');
 }
 // The pre-existing landing node keeps its original CPU-ground elevation.
 // An actual void in the quay admits its service yard and supported ramp;
 // the raised service lane detours around it rather than burying the node.
 solid(p,harbor,m.road,[-331.5,11.28,590],[51,.10,28],'west service approach');
 solid(p,harbor,m.road,[-246,11.28,590],[20,.10,28],'east service approach');
 solid(p,harbor,m.road,[-290,11.28,605],[109,.10,10],'service lane around recessed node yard');
 for(const zz of [577,603])solid(p,harbor,m.stripe,[-331.5,11.36,zz],[51,.04,.15],'port service road edge');
 for(let x=-350;x<-305;x+=13)solid(p,harbor,m.sand,[x,11.36,590],[5.5,.035,.17],'service lane centre dash');
 const yardVertices=[],yardUV=[];
 const yardHeight=(x,z)=>terrainHeight(layout,x,z)+.04;
 for(let i=0;i<8;i++)for(let j=0;j<8;j++){
  const v=[];for(const [di,dj]of [[0,0],[1,0],[0,1],[1,1]]){const x=-303+(i+di)*46/8,z=546+(j+dj)*53/8;v.push([x,yardHeight(x,z),z]);}
  for(const k of [0,2,1,1,2,3]){yardVertices.push(...v[k]);yardUV.push(v[k][0]/2,v[k][2]/2);}
 }
 const yardGeo=new T.BufferGeometry();yardGeo.setAttribute('position',new T.Float32BufferAttribute(yardVertices,3));yardGeo.setAttribute('uv',new T.Float32BufferAttribute(yardUV,2));yardGeo.computeVertexNormals();addMesh(p,harbor,yardGeo,concrete,'node service yard follows original terrain elevation');
 for(const x of [-302.6,-257.4])for(let j=0;j<11;j++){const z=548+j*4.6,low=yardHeight(x,z);solid(p,harbor,concrete,[x,(low+11.2)/2,z],[.65,Math.max(.10,11.2-low),4.58],'yard side retaining wall');}
 for(let j=0;j<10;j++){const x=-300.5+j*4.5,low=yardHeight(x,546.3);solid(p,harbor,concrete,[x,(low+11.2)/2,546.3],[4.48,Math.max(.1,11.2-low),.65],'yard north retaining wall');}
 // Supported eight-metre-wide ramp leaves the equipment centre clear.
 for(let j=0;j<28;j++){const z=583+j*.66,ground=yardHeight(-286,z),t=j/27,top=T.MathUtils.lerp(ground,11.30,t*t*(3-2*t));solid(p,harbor,concrete,[-286,(ground+top)/2,z],[8.0,Math.max(.05,top-ground),.662],'ground supported recessed yard access ramp');}

 for(const x of [-354,-341])solid(p,harbor,m.steel,[x,11.38,519],[.22,.13,192],'dock crane embedded rail');
 warehouse(p,harbor,m,-275,475,32,77,19);warehouse(p,harbor,m,-273,628,29,35,15);
 dockCrane(p,harbor,m,-347,446);dockCrane(p,harbor,m,-347,551);
 // Container stacks leave a turning aisle and never occupy the loading doors.
 for(let row=0;row<3;row++)for(let col=0;col<4;col++){const x=-326+col*3.5,z=508+row*17;container(p,harbor,m,x,11.3,z,0,row+col);if((row+col)%3===0)container(p,harbor,m,x,13.9,z,0,row+col+1);}
 // Layered rubble-mound breakwater: submerged toe, sloping armor, service crest.
 const points=[[-424,442],[-430,747],[-417,789],[-304,797]];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[0]-a[0],b[1]-a[1]),segment=new T.Group();segment.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);segment.rotation.y=angle;harbor.add(segment);
  solid(p,segment,m.rock,[0,-3.6,0],[27,7,len+3],'submerged rubble toe');
  const profile=new T.Shape([new T.Vector2(-13,-1),new T.Vector2(-5,8),new T.Vector2(5,8),new T.Vector2(13,-1)]),geo=new T.ExtrudeGeometry(profile,{depth:len,bevelEnabled:false});geo.translate(0,0,-len/2);addMesh(p,segment,metricUV(geo),concrete,'sloped stone mound core');
  solid(p,segment,concrete,[0,8.35,0],[7.2,.7,len],'breakwater service crest');
  const armourGeo=p.geo('r3-battered-armour-rock',()=>{const geo=new T.DodecahedronGeometry(1,1),a=geo.attributes.position;for(let k=0;k<a.count;k++){const x=a.getX(k),y=a.getY(k),z=a.getZ(k),f=1+.14*Math.sin(x*9+z*13)*Math.cos(y*11);a.setXYZ(k,x*f,y*f,z*f);}geo.computeVertexNormals();return metricUV(geo);});
  for(let k=0;k<Math.ceil(len/3.1);k++)for(const side of [-1,1])for(let band=0;band<2;band++){
   const rock=new T.Mesh(armourGeo,band?m.rock:concrete),zz=-len/2+k*3.1+Math.sin(k*4.2)*.8,xx=side*(7.5+band*3.6+Math.sin(k*2.71)*.7);rock.position.set(xx,band?1.3:4.7,zz);rock.rotation.set(k*.53,side+k*.78,k*.22);rock.scale.set(2.1+(k%3)*.23,1.7+(k%4)*.15,2.0+(k%5)*.12);rock.castShadow=rock.receiveShadow=true;segment.add(rock);
  }
 }
 // Navigational marker at the entrance is a grounded small aid to orientation.
 solid(p,harbor,concrete,[-424,9.9,444],[6,3,6],'breakwater navigation footing');
 solid(p,harbor,m.white,[-424,14.2,444],[2.2,6.0,2.2],'unlit navigation daymark');solid(p,harbor,m.green,[-424,17.5,444],[3.7,.60,3.7],'harbor entrance daymark cap');
 // Port road ramps continuously onto the existing coast-road ground surface.
 const roadStart=[-247,590],roadEnd=[-162.5,590],positions=[],uv=[];
 for(let i=0;i<24;i++)for(const j of [0,1,2,1,3,2]){const t=[i/24,i/24,(i+1)/24,(i+1)/24][j],side=[-1,1,-1,1][j],x=T.MathUtils.lerp(roadStart[0],roadEnd[0],t),z=590+side*6,y=T.MathUtils.lerp(11.2,terrainHeight(layout,roadEnd[0],z)+1.15,t*t*(3-2*t));positions.push(x,y+.05,z);uv.push(x/2,z/2);}
 const roadGeo=new T.BufferGeometry();roadGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));roadGeo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));roadGeo.computeVertexNormals();addMesh(p,harbor,roadGeo,m.road,'port access ramp follows coast road grade');
 for(const z of [423,526,634]){p.beam(harbor,[-297,11.3,z],[-297,33,z],.24,m.steel);p.beam(harbor,[-297,33,z],[-305,34,z],.2,m.metal);solid(p,harbor,m.edge,[-305,34,z],[3.8,.8,1.8],'shielded yard light');}
 let triangles=0,parts=0;harbor.traverse(o=>{if(o.isMesh){parts++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 mergeArchitecturalGeometry(p,harbor);
 harbor.userData.r3={authoredParts:parts,triangles,draws:harbor.children.filter(o=>o.isMesh).length,warehouses:2,cranes:2,containers:16,metricUV:true,reservedLandingYard:{centerM:[-280,570],footprintM:[46,53],nodeElevation:'unchanged terrainHeight',deckVoid:true},authority:'fictional exhibition civil architecture'};return harbor;
}
