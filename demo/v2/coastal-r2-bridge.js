import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

// R2 bridge pilot: engineered geometry follows the *existing* road alignment.
// This is a visual civil structure only. The CPU/RF terrain contract is untouched.
const planCache=new WeakMap();
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const XY=.02,Y=.025;
function alignment(road){
 const segments=[];let length=0;
 for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  segments.push({a,b,len,start:length,dx:(b[0]-a[0])/len,dz:(b[1]-a[1])/len});length+=len;
 }
 const at=station=>{const s=segments.find(s=>station<=s.start+s.len)||segments.at(-1),t=T.MathUtils.clamp((station-s.start)/s.len,0,1);return {x:s.a[0]+(s.b[0]-s.a[0])*t,z:s.a[1]+(s.b[1]-s.a[1])*t,dx:s.dx,dz:s.dz};};
 const project=(x,z)=>{let best;for(const s of segments){const d=T.MathUtils.clamp((x-s.a[0])*s.dx+(z-s.a[1])*s.dz,0,s.len),px=s.a[0]+s.dx*d,pz=s.a[1]+s.dz*d,dist=Math.hypot(x-px,z-pz);if(!best||dist<best.distance)best={station:s.start+d,distance:dist,x:px,z:pz};}return best;};
 return {at,project,length};
}
function plans(layout){
 if(planCache.has(layout))return planCache.get(layout);
 const list=[];
 for(const id of ['bridge-road','coast-road']){
  const road=layout.roads.find(r=>r.id===id);if(!road)continue;
  const path=alignment(road);let near=path.project(id==='bridge-road'?layout.bridge.x:-196,layout.terrain.riverBaseZ).station;
  // Solve the intersection of the actual polyline and the existing river axis.
  for(let i=0;i<5;i++){const a=path.at(near),river=layout.terrain.riverBaseZ+layout.terrain.riverAmplitude*Math.sin(a.x/180);near+=(river-a.z)/a.dz;}
  const half=id==='bridge-road'?layout.bridge.lengthM/2:67.5,width=id==='bridge-road'?layout.bridge.widthM:road.widthM+6;
  const banks=[-half,half].flatMap(s=>[-width/2,width/2].map(c=>{const a=path.at(near+s);return terrainHeight(layout,a.x-a.dz*c,a.z+a.dx*c)*Y;}));
  list.push({id,road,path,center:near,half,width,ramp:76,base:Math.max(.22,...banks.map(y=>y+.110))});
 }
 planCache.set(layout,list);return list;
}
function elevation(layout,plan,station,x,z){
 const ground=terrainHeight(layout,x,z)*Y,away=Math.abs(station-plan.center)-plan.half;
 return away<=0?plan.base:T.MathUtils.lerp(plan.base,ground,smooth(away/plan.ramp));
}
// Return the road's pre-offset render height. Existing curb/asphalt offsets stay
// with the caller. Both the span and the approach fill use this very function.
export function bridgeRoadHeight(layout,x,z){
 for(const plan of plans(layout)){
  const hit=plan.path.project(x,z);
  if(hit.distance<=plan.width/2+4&&Math.abs(hit.station-plan.center)<=plan.half+plan.ramp)return elevation(layout,plan,hit.station,x,z);
 }
 return terrainHeight(layout,x,z)*Y;
}
function vertex(plan,station,cross,y){const a=plan.path.at(station);return [(a.x-a.dz*cross)*XY,y,(a.z+a.dx*cross)*XY];}
function addMesh(pool,parent,positions,indices,uvs,material,name){
 const geo=pool.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
 const mesh=new T.Mesh(geo,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
// Closed manufactured cross-section swept along a road polyline. The separate
// face vertices retain crisp structural folds instead of smoothing into tubes.
function sweep(pool,parent,plan,from,to,profile,mat,name,crossOffset=0,step=8){
 const area=profile.reduce((sum,a,i)=>{const b=profile[(i+1)%profile.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
 if(area>0)profile=profile.slice().reverse();
 const n=Math.ceil((to-from)/step),positions=[],uv=[],indices=[],tile=mat.userData?.tileMeters||2;let perimeter=0;
 for(let edge=0;edge<profile.length;edge++){
  const a=profile[edge],b=profile[(edge+1)%profile.length],start=positions.length/3;
  for(let j=0;j<=n;j++)for(const q of [a,b]){const st=from+(to-from)*j/n;positions.push(...vertex(plan,st,q[0]+crossOffset,q[1]));uv.push((st-from)/tile,(perimeter+Math.hypot(q[0]-a[0],(q[1]-a[1])/Y))/tile);}
  for(let j=0;j<n;j++){const k=start+j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  perimeter+=Math.hypot(b[0]-a[0],(b[1]-a[1])/Y);
 }
 const cap=T.ShapeUtils.triangulateShape(profile.map(q=>new T.Vector2(q[0],q[1])),[]);
 for(const [side,st]of [[0,from],[1,to]]){const start=positions.length/3;for(const q of profile){positions.push(...vertex(plan,st,q[0]+crossOffset,q[1]));uv.push(q[0]/tile,q[1]/Y/tile);}for(const f of cap)indices.push(...(side?f:f.slice().reverse()).map(i=>start+i));}
 return addMesh(pool,parent,positions,indices,uv,mat,name);
}
function apron(pool,parent,layout,plan,sign,mat){
 const positions=[],uv=[],indices=[],n=18,tile=mat.userData?.tileMeters||2.9;
 for(let j=0;j<=n;j++){
  const t=j/n,st=plan.center+sign*(plan.half+t*plan.ramp),a=plan.path.at(st),half=T.MathUtils.lerp(plan.width/2,plan.road.widthM/2+2,smooth(t));
  for(const c of [-half-7,-half,half,half+7]){const px=a.x-a.dz*c,pz=a.z+a.dx*c,edge=Math.abs(c)>half+.1,ground=terrainHeight(layout,px,pz)*Y;positions.push(px*XY,edge?ground-.008:elevation(layout,plan,st,px,pz)+.007,pz*XY);uv.push(st/tile,c/tile);}
 }
 for(let j=0;j<n;j++)for(let k=0;k<3;k++){const a=j*4+k,b=a+4;if(sign===1)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);}
 addMesh(pool,parent,positions,indices,uv,mat,'graded approach embankment');
}
function pier(pool,parent,layout,plan,station,mat){
 const a=plan.path.at(station),bed=terrainHeight(layout,a.x,a.z)*Y-.055,cap=plan.base-.114,shaftTop=cap-.015;
 // Streamlined cutwater shaft, longitudinal nose and chamfered horizontal cap.
 const footprint=[[-2.45,-1.6],[-2.45,1.6],[-1.55,2.7],[1.55,2.7],[2.45,1.6],[2.45,-1.6],[1.55,-2.7],[-1.55,-2.7]];
 const positions=[],uv=[],indices=[],tile=mat.userData?.tileMeters||2;
 for(let i=0;i<footprint.length;i++){
  const q=footprint[i],r=footprint[(i+1)%footprint.length],k=positions.length/3,edgeLength=Math.hypot(r[0]-q[0],r[1]-q[1]);
  for(const [c,s,y]of [[q[0],q[1],bed],[r[0],r[1],bed],[q[0]*.82,q[1]*.82,shaftTop],[r[0]*.82,r[1]*.82,shaftTop]]){positions.push(...vertex(plan,station+s,c,y));uv.push(((c-q[0])*(r[0]-q[0])+(s-q[1])*(r[1]-q[1]))/edgeLength/tile,y/Y/tile);}
  indices.push(k,k+2,k+1,k+1,k+2,k+3);
 }
 addMesh(pool,parent,positions,indices,uv,mat,'riverbed anchored cutwater pier');
 sweep(pool,parent,plan,station-1.35,station+1.35,[[-plan.width*.39,cap-.011],[-plan.width*.39,cap+.013],[-plan.width*.35,cap+.024],[plan.width*.35,cap+.024],[plan.width*.39,cap+.013],[plan.width*.39,cap-.011]],mat,'chamfered pier head');
 return {station,bed,shaftTop,capTop:cap+.024};
}
// One GPU draw per material for the static civil structure. This keeps the
// manufactured profiles without turning rail/bearing detail into draw overhead.
function consolidate(pool,group){
 group.updateMatrixWorld(true);const sets=new Map(),inverse=group.matrixWorld.clone().invert(),local=new T.Matrix4();
 group.traverse(o=>{if(!o.isMesh)return;if(!sets.has(o.material))sets.set(o.material,[]);sets.get(o.material).push(o);});
 const components={};
 for(const [material,meshes]of sets){
  const positions=[],normals=[],uv=[],indices=[];
  for(const mesh of meshes){components[mesh.name||'shared structural detail']=(components[mesh.name||'shared structural detail']||0)+1;
   const geo=mesh.geometry.clone().applyMatrix4(local.multiplyMatrices(inverse,mesh.matrixWorld)),base=positions.length/3;
   positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);uv.push(...geo.attributes.uv.array);
   if(geo.index)for(const id of geo.index.array)indices.push(id+base);else for(let i=0;i<geo.attributes.position.count;i++)indices.push(i+base);
   geo.dispose();mesh.removeFromParent();
  }
  const geo=pool.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeBoundingSphere();
  const mesh=new T.Mesh(geo,material);mesh.name='R2 bridge / '+material.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
 }
 group.userData.components=components;group.userData.materialDraws=sets.size;
}
function buildOne(pool,m,layout,plan,parent){
 const g=new T.Group();g.name='R2 '+plan.id+' engineered bridge';parent.add(g);
 const concrete=m.r2Concrete||m.concrete,edge=m.r2Concrete||m.edge,metal=m.metal,steel=m.steel,soil=m.r2Bank||m.soil;
 const from=plan.center-plan.half,to=plan.center+plan.half,w=plan.width/2,b=plan.base;
 // Chamfered cantilever deck, four distinct longitudinal precast I girders.
 sweep(pool,g,plan,from,to,[[-w+.35,b-.015],[-w,b-.007],[-w,b+.009],[-w+.20,b+.015],[w-.20,b+.015],[w,b+.009],[w,b-.007],[w-.35,b-.015]],concrete,'continuous chamfered bridge deck');
 const girderProfile=[[-.95,b-.018],[.95,b-.018],[.95,b-.031],[.30,b-.035],[.30,b-.070],[.82,b-.075],[.82,b-.085],[-.82,b-.085],[-.82,b-.075],[-.30,b-.070],[-.30,b-.035],[-.95,b-.031]];
 const supports=[from,plan.center-plan.half/3,plan.center+plan.half/3,to];
 for(const cross of [-w*.68,-w*.23,w*.23,w*.68])for(let j=1;j<supports.length;j++){
  sweep(pool,g,plan,supports[j-1]+.25,supports[j]-.25,girderProfile,concrete,'precast I girder',cross,20);
  for(const st of [supports[j-1]+.6,supports[j]-.6])sweep(pool,g,plan,st-.40,st+.40,[[cross-.77,b-.089],[cross+.77,b-.089],[cross+.77,b-.086],[cross-.77,b-.086]],m.rubber,'elastomer bridge bearing');
 }
 // Raised pedestrian edge strips and metal traffic rails leave the roadway open.
 for(const side of [-1,1]){
  const center=side*(w-1.05);
  sweep(pool,g,plan,from,to,[[center-.72,b+.016],[center+.72,b+.016],[center+.72,b+.039],[center+.55,b+.044],[center-.55,b+.044],[center-.72,b+.039]],edge,'raised maintenance curb');
  for(const y of [b+.061,b+.081])sweep(pool,g,plan,from,to,[[side*(w-.70)-.055,y-.0025],[side*(w-.70)+.055,y-.0025],[side*(w-.70)+.055,y+.0025],[side*(w-.70)-.055,y+.0025]],metal,'continuous bridge safety rail');
  for(let st=from+.75;st<to;st+=6){const pos=vertex(plan,st,side*(w-.70),b+.044);pool.beam(g,pos,[pos[0],b+.086,pos[2]],.0034,steel);}
 }
 const piers=[pier(pool,g,layout,plan,supports[1],concrete),pier(pool,g,layout,plan,supports[2],concrete)];
 for(const sign of [-1,1]){
  const st=plan.center+sign*plan.half,a=plan.path.at(st),ground=Math.min(...[-w,w].map(c=>terrainHeight(layout,a.x-a.dz*c,a.z+a.dx*c)*Y))-.045;
  // Abutment wall and bearing seat physically descend into the sampled bank.
  sweep(pool,g,plan,st-1.9,st+1.9,[[-w,ground],[-w,b-.101],[-w+.45,b-.090],[w-.45,b-.090],[w,b-.101],[w,ground]],concrete,'bank anchored abutment');
  // Expansion joint crosses the surface once, not a luminous/status decoration.
  sweep(pool,g,plan,st-.13,st+.13,[[-w,b+.019],[-w,b+.025],[w,b+.025],[w,b+.019]],steel,'road expansion joint');
  // Splayed wingwalls return into the road approach; bottom follows each bank.
  for(const side of [-1,1]){
   const positions=[],uv=[],indices=[],n=8,tile=concrete.userData?.tileMeters||2;
   for(let face=0;face<3;face++){
    const start=positions.length/3;
    for(let i=0;i<=n;i++){const t=i/n,s=st+sign*t*23,c=side*(w+t*5),p=plan.path.at(s),x=p.x-p.dz*c,z=p.z+p.dx*c,lo=terrainHeight(layout,x,z)*Y-.025,hi=elevation(layout,plan,s,x,z)+.024;
     const ring=[[c-.22,lo],[c-.22,hi],[c+.22,hi],[c+.22,lo]];
     for(const q of [ring[face],ring[face+1]]){positions.push(...vertex(plan,s,q[0],q[1]));uv.push(t*Math.hypot(23,5)/tile,face===1?(q[0]-c)/tile:q[1]/Y/tile);}
    }
    for(let i=0;i<n;i++){const k=start+i*2;if(sign>0)indices.push(k,k+1,k+2,k+1,k+3,k+2);else indices.push(k,k+2,k+1,k+1,k+2,k+3);}
   }
   addMesh(pool,g,positions,indices,uv,concrete,'solid splayed riverbank wingwall');
  }
  apron(pool,g,layout,plan,sign,soil);
 }
 const center=plan.path.at(plan.center);
 g.userData={assetId:plan.id==='bridge-road'?layout.bridge.id:'coast-river-bridge',r2Pilot:true,structuralForm:'three span precast I girder / bank anchored abutments / cutwater piers',groundContract:'terrainHeight (unchanged)',centerM:[center.x,center.z],roadBaseRenderY:b,riverbedRenderY:terrainHeight(layout,center.x,center.z)*Y,clearanceRenderY:b-.085-terrainHeight(layout,center.x,center.z)*Y,piers};
 consolidate(pool,g);return g;
}
export function buildBridgePilot(pool,materials,layout,parent){
 const result={bridge:null,coastBridge:null,diagnostics:[]};
 for(const plan of plans(layout)){const group=buildOne(pool,materials,layout,plan,parent);result[plan.id==='bridge-road'?'bridge':'coastBridge']=group;result.diagnostics.push(group.userData);}
 return result;
}
