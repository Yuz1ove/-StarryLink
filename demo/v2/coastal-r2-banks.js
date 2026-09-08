import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const gridCache=new WeakMap();
function terrainGrid(parent){
 const mesh=parent?.getObjectByName('shared-contract-stratified-terrain');if(!mesh)return null;
 if(gridCache.has(mesh))return gridCache.get(mesh);
 const g=mesh.geometry,p=g.attributes.position,rows=[];let columns=1;
 while(columns<p.count&&Math.abs(p.getZ(columns)-p.getZ(0))<1e-6)columns++;
 if(columns<2||!g.index)return null;
 const xs=Array.from({length:columns},(_,i)=>p.getX(i));for(let i=0;i<p.count;i+=columns)rows.push(p.getZ(i));
 const data={p,index:g.index,xs,zs:rows,nx:columns-1};gridCache.set(mesh,data);return data;
}
function cell(array,value){let lo=0,hi=array.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(array[mid]<=value)lo=mid;else hi=mid;}return lo;}
// The authority height stays terrainHeight. At display time, match its existing
// triangulated terrain mesh so a normal-mapped surface layer neither floats nor
// flickers through the coarse land tessellation. No RF geometry is changed.
export function riverBankSurfaceHeight(layout,x,z,parent){
 const cpu=terrainHeight(layout,x,z)*layout.renderScale[1],grid=terrainGrid(parent);if(!grid)return cpu;
 const px=x*layout.renderScale[0],pz=z*layout.renderScale[2];if(px<grid.xs[0]||px>grid.xs.at(-1)||pz<grid.zs[0]||pz>grid.zs.at(-1))return cpu;
 const col=cell(grid.xs,px),row=cell(grid.zs,pz),offset=(row*grid.nx+col)*6,p=grid.p;
 for(let tri=0;tri<2;tri++){
  const ids=[0,1,2].map(i=>grid.index.getX(offset+tri*3+i)),[a,b,c]=ids.map(i=>[p.getX(i),p.getY(i),p.getZ(i)]),den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  const u=((b[2]-c[2])*(px-c[0])+(c[0]-b[0])*(pz-c[2]))/den,v=((c[2]-a[2])*(px-c[0])+(a[0]-c[0])*(pz-c[2]))/den,w=1-u-v;
  if(u>=-1e-5&&v>=-1e-5&&w>=-1e-5)return u*a[1]+v*b[1]+w*c[1];
 }
 return cpu;
}
export function buildRiverBankPilot(pool,m,layout,parent){
 const source=m.r2Bank||m.soil,mat=pool.own(source.clone());mat.name='R2 scanned river-margin gravel';
 mat.color.set(0xe0ddcf);mat.transparent=true;mat.depthWrite=false;mat.polygonOffset=true;mat.polygonOffsetFactor=-1;mat.polygonOffsetUnits=-1;
 // Physical scan size: Poly Haven River Small Rocks, 2.9 m x 2.9 m. All maps
 // stay unwarped; texture repeats are (1,1), with metric mesh UVs below.
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float bankBlend; varying float vBankBlend; varying float vBankHeight;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vBankBlend=bankBlend; vBankHeight=position.y;');
  shader.fragmentShader='varying float vBankBlend; varying float vBankHeight;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float wetMargin=1.-smoothstep(.0,.070,vBankHeight);
   diffuseColor.rgb*=mix(1.,.62,wetMargin);
   diffuseColor.a*=vBankBlend;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor*(1.-wetMargin*.20),.58,.98);');
 };
 mat.customProgramCacheKey=()=> 'r3-meandering-shoal-riverbank-2';
 const positions=[],uv=[],blend=[],indices=[],nx=176,nz=28,xmin=-370,xmax=510,tile=2.9;
 let maximumRenderContactCorrectionM=0;
 for(const sign of [-1,1]){
  const start=positions.length/3;
  for(let i=0;i<=nx;i++){
   const x=xmin+(xmax-xmin)*i/nx,center=layout.terrain.riverBaseZ+layout.terrain.riverAmplitude*Math.sin(x/180);
   // Lateral limits follow the existing river; broad shoulders fade into the
   // unchanged ground instead of drawing a rectangular material patch.
   for(let j=0;j<=nz;j++){
    const lateral=10+(135-10)*j/nz,z=center+sign*lateral,cpu=terrainHeight(layout,x,z)*layout.renderScale[1],height=riverBankSurfaceHeight(layout,x,z,parent);
    positions.push(x*layout.renderScale[0],height,z*layout.renderScale[2]);uv.push(x/tile,z/tile);
    // Coverage follows the actual wet/dry height contour. The old fixed
    // lateral cutoff painted a ruler-like band through varying bank widths.
    const longitudinal=smooth(xmin,xmin+45,x)*(1-smooth(xmax-55,xmax,x)),wetEdge=smooth(-.035,.010,height),outer=(1-smooth(.030,.135,height))*(.85+.15*Math.sin(x/71+sign*.5));
    blend.push(longitudinal*wetEdge*outer*.96);maximumRenderContactCorrectionM=Math.max(maximumRenderContactCorrectionM,Math.abs(height-cpu)/layout.renderScale[1]);
   }
  }
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
   const a=start+i*(nz+1)+j,b=a+nz+1;
   if(sign>0)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
  }
 }
 const geo=pool.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('bankBlend',new T.Float32BufferAttribute(blend,1));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
 const mesh=new T.Mesh(geo,mat);mesh.name='R2 scanned riverbank pilot';mesh.receiveShadow=true;mesh.renderOrder=1;parent.add(mesh);
 mesh.userData={r2Pilot:true,revision:3,sourceAsset:'river_small_rocks',tileSizeM:[tile,tile],pilotXM:[xmin,xmax],riverLateralM:[10,135],shorelineMask:'shared terrain wet/dry elevation contour; variable bank widths',geometryContract:'terrainHeight plus contact with its existing rendered triangles; no authority changes',maximumRenderContactCorrectionM,triangles:indices.length/3,materials:1};
 mesh.userData.mesoGeometry=buildBankMesoGeometry(pool,m,layout,parent);
 return mesh;
}

// Small deposited ledges and fractured stones are explicit geometry. Heights
// above the existing rendered surface are bounded to 0.6 m and never enter the
// CPU terrain/RF contract. Five deposits lie on the inside of existing bends.
function buildBankMesoGeometry(pool,m,layout,parent){
 const mat=pool.own((m.r2Bank||m.rock).clone());mat.name='R2 wet fractured river stone';mat.color.set(0xd6d4c8);mat.roughness=.76;mat.vertexColors=true;
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='varying float vStoneHeight;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vStoneHeight=position.y;');
  shader.fragmentShader='varying float vStoneHeight;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=mix(.60,1.,smoothstep(.0,.040,vStoneHeight));');
 };
 mat.customProgramCacheKey=()=> 'r2-explicit-bank-deposition-3';
 const positions=[],uv=[],colors=[],indices=[],tile=2.9;let maximumReliefM=0;
 const terrain=(x,z)=>riverBankSurfaceHeight(layout,x,z,parent);
 const center=x=>layout.terrain.riverBaseZ+layout.terrain.riverAmplitude*Math.sin(x/180);
 const shore=(x,sign)=>{let lo=18,hi=100;for(let i=0;i<15;i++){const mid=(lo+hi)/2;if(terrain(x,center(x)+sign*mid)<.003)lo=mid;else hi=mid;}return (lo+hi)/2;};
 const vert=(x,z,rise,color=.98)=>{positions.push(x*.02,terrain(x,z)+rise*.025,z*.02);uv.push(x/tile,z/tile);colors.push(color,color,color);maximumReliefM=Math.max(maximumReliefM,rise);return positions.length/3-1;};
 const deposits=[{x:-205,length:44,sign:1},{x:-108,length:38,sign:1},{x:28,length:42,sign:-1},{x:279,length:49,sign:-1},{x:408,length:33,sign:-1}];
 for(const [di,d]of deposits.entries()){
  const start=positions.length/3,n=16;
  for(let i=0;i<=n;i++){
   const t=i/n,x=d.x+(t-.5)*d.length,fade=smooth(0,.19,t)*(1-smooth(.72,1,t)),waterEdge=shore(x,d.sign),width=fade*(3.8+di%2);
   const profile=[[-3.2*fade,0],[-.9*fade,.19],[.45*fade,.55],[width,.29],[width+3.7*fade,0]];
   for(const [cross,rise]of profile)vert(x,center(x)+d.sign*(waterEdge+cross),rise*fade,.91+di*.017);
  }
  for(let i=0;i<n;i++)for(let j=0;j<4;j++){const a=start+i*5+j,b=a+5;if(d.sign>0)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);}
 }
 const profiles=[
  [[-.9,-.22],[-.56,-.75],[.57,-.62],[.91,.06],[.37,.61],[-.68,.49]],
  [[-.82,-.44],[-.25,-.79],[.76,-.42],[.68,.54],[-.19,.81],[-.76,.19]],
  [[-.79,-.08],[-.50,-.63],[.32,-.70],[.94,.29],[.12,.54],[-.62,.47]]
 ];
 let stones=0;
 for(let i=0;i<36;i++){
  const d=deposits[i%deposits.length],phase=Math.floor(i/deposits.length),x=d.x+(phase-3.0)*4.0+(i%3)*.7,z=center(x)+d.sign*(shore(x,d.sign)+1.2+(i%4)*1.5),long=.85+(i%4)*.20,wide=.56+(i%3)*.16,rise=.28+(i%4)*.095,angle=.38+(i%5)*.43;
  const polygon=profiles[i%3].map(([a,b])=>[x+Math.cos(angle)*a*long-Math.sin(angle)*b*wide,z+Math.sin(angle)*a*long+Math.cos(angle)*b*wide]);
  if(polygon.reduce((sum,a,j)=>{const b=polygon[(j+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0)>0)polygon.reverse();
  const top=vert(x,z,rise,1.01);
  for(let j=0;j<polygon.length;j++){
   const a=polygon[j],b=polygon[(j+1)%polygon.length],aTop=vert(a[0],a[1],rise*(.69+(j%2)*.16),1.01),bTop=vert(b[0],b[1],rise*(.69+((j+1)%2)*.16),1.01),aBottom=vert(a[0],a[1],-.085,.90),bBottom=vert(b[0],b[1],-.085,.90);
   indices.push(top,aTop,bTop,aBottom,bBottom,aTop,bBottom,bTop,aTop);
  }
  stones++;
 }
 const indexed=pool.own(new T.BufferGeometry());indexed.setAttribute('position',new T.Float32BufferAttribute(positions,3));indexed.setAttribute('uv',new T.Float32BufferAttribute(uv,2));indexed.setAttribute('color',new T.Float32BufferAttribute(colors,3));indexed.setIndex(indices);
 // Actual fractured faces and depositional lips, with finite bevel-sized
 // changes; flat face normals do not turn stones into rounded green/grey balls.
 const geo=pool.own(indexed.toNonIndexed());geo.computeVertexNormals();geo.computeBoundingSphere();const mesh=new T.Mesh(geo,mat);mesh.name='R2 bounded wet bank ledges and fractured stones';mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
 const result={deposits:deposits.length,stones,triangles:indices.length/3,draws:1,maximumReliefM,authority:'visual-only deposited surface <=0.6m; CPU terrain unchanged'};mesh.userData=result;return result;
}
