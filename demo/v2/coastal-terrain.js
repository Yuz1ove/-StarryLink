import * as T from 'three';
import {terrainHeight,coastPosition} from './coastal-contract.js';
import {riverBankSurfaceHeight} from './coastal-r2-banks.js';
import {planHeroTrees} from './coastal-r3-vegetation-plan.js';

// Locally authored procedural assets; no remote textures or hidden geometry.
// Mesh vertices and vegetation placements use the same CPU height as LOS.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=(a,b,v)=>{const q=clamp((v-a)/(b-a));return q*q*(3-2*q);};
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453123;return n-Math.floor(n);};
function field(x,z){const ix=Math.floor(x),iz=Math.floor(z),u=ease(0,1,x-ix),v=ease(0,1,z-iz);return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),T.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);}
function roadDistance(layout,x,z){
 if(x<-250||x>835||z<-830||z>775)return Infinity;
 let nearest=Infinity;
 for(const road of layout.roads)for(let j=1;j<road.points.length;j++){
  const a=road.points[j-1],b=road.points[j],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
  nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)-road.widthM/2);
 }
 return nearest;
}
function slopeAt(layout,x,z){return Math.hypot(terrainHeight(layout,x+5,z)-terrainHeight(layout,x-5,z),terrainHeight(layout,x,z+5)-terrainHeight(layout,x,z-5))/10;}

export function buildTerrain(pool,materials,layout,parent,quality='standard'){
 const [xmin,xmax,zmin,zmax]=layout.boundsM,[sx,sy,sz]=layout.renderScale;
 const low=quality==='low',nx=low?190:340,nz=low?160:276;
 const geo=pool.own(new T.PlaneGeometry(1,1,nx,nz));geo.rotateX(-Math.PI/2);
 const position=geo.attributes.position,colors=[],zones=[];
 // Spend tessellation on the inhabited coast/ridges; the distant apron is cheap.
 const spread=(u,lo,hi,a,b)=>u<.075?T.MathUtils.lerp(lo,a,u/.075):u>.925?T.MathUtils.lerp(b,hi,(u-.925)/.075):T.MathUtils.lerp(a,b,(u-.075)/.85);
 const meadow=new T.Color(0x495d42),forest=new T.Color(0x2b4130),dryGrass=new T.Color(0x72765f),rock=new T.Color(0x747e78),soil=new T.Color(0x797966),sand=new T.Color(0xb1ab95),wet=new T.Color(0x656858),c=new T.Color();
 for(let i=0;i<position.count;i++){
  const x=spread(position.getX(i)+.5,xmin,xmax,-470,1830),z=spread(position.getZ(i)+.5,zmin,zmax,-1250,1250);
  position.setXYZ(i,x*sx,terrainHeight(layout,x,z)*sy,z*sz);
 }
 for(let i=0;i<position.count;i++){
  const row=Math.floor(i/(nx+1)),col=i%(nx+1),left=col?i-1:i,right=col<nx?i+1:i,top=row?i-nx-1:i,bottom=row<nz?i+nx+1:i;
  const dx=(position.getY(right)-position.getY(left))/sy/((position.getX(right)-position.getX(left))/sx),dz=(position.getY(bottom)-position.getY(top))/sy/((position.getZ(bottom)-position.getZ(top))/sz);
  const x=position.getX(i)/sx,z=position.getZ(i)/sz,h=position.getY(i)/sy,slope=Math.hypot(dx,dz);
  const macro=field(x/165,z/165),detail=field(x/27,z/27),coast=coastPosition(layout,z);
  const river=Math.abs(z-layout.terrain.riverBaseZ-layout.terrain.riverAmplitude*Math.sin(x/180));
  // Convex scarps retain exposed bedrock. Concave lower slopes collect the
  // fragments instead: material zones follow the real shared mesh curvature,
  // not a uniform elevation tint or a regular projected grid.
  const curvature=(position.getY(left)+position.getY(right)+position.getY(top)+position.getY(bottom)-4*position.getY(i))/sy;
  const rockyAspect=.72+.28*ease(-.35,.45,-dx*.82+dz*.28);
  const scarp=ease(.61,1.16,slope)*(1-ease(-1.8,1.6,curvature))*rockyAspect;
  const exposed=ease(.66,1.28,slope)*(.58+.42*detail),summit=ease(200,325,h)*ease(.4,.8,slope)*.06;
  const talus=ease(30,110,h)*(1-ease(160,230,h))*ease(.13,.43,slope)*(1-ease(.7,1.05,slope))*ease(-.15,2.0,curvature);
  const rockWeight=clamp(exposed*.92+scarp*.34+summit),cut=ease(.20,.7,slope)*(1-ease(3,24,roadDistance(layout,x,z))),soilWeight=clamp(cut*.64+talus*.34+ease(.65,.88,macro)*.08)*(1-rockWeight*.76);
  c.copy(forest).lerp(meadow,(1-ease(.24,.75,macro))*.76+.08).lerp(dryGrass,ease(120,340,h)*.16);
  c.lerp(rock,rockWeight).lerp(soil,soilWeight);
  const beach=1-ease(10,68,x-coast);c.lerp(sand,beach);
  c.lerp(wet,(1-ease(24,56,river))*.69);c.lerp(wet,(1-ease(1,16,x-coast))*.50);c.multiplyScalar(.92+detail*.14);
  colors.push(c.r,c.g,c.b);zones.push(rockWeight,soilWeight,beach);
 }
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('terrainZone',new T.Float32BufferAttribute(zones,3));geo.computeVertexNormals();
 const material=pool.mat('coastal-stratified-ground',0xffffff,.94,0,{vertexColors:true});
 material.onBeforeCompile=shader=>{
  const scanned=!!materials.r2Bank?.map;
  if(scanned){shader.uniforms.terrainMineralScan={value:materials.r2Bank.map};shader.uniforms.terrainMineralNormal={value:materials.r2Bank.normalMap};}
  shader.vertexShader='attribute vec3 terrainZone; varying vec3 vTerrainZone; varying vec3 vTerrainPoint; varying vec3 vTerrainSurfaceNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vTerrainPoint=position; vTerrainZone=terrainZone; vTerrainSurfaceNormal=normal;');
  shader.fragmentShader=`varying vec3 vTerrainZone; varying vec3 vTerrainPoint; varying vec3 vTerrainSurfaceNormal;
   ${scanned?'uniform sampler2D terrainMineralScan; uniform sampler2D terrainMineralNormal;':''}
   float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+vec2(1.)),f.x),f.y);}
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 metricPoint=vTerrainPoint/vec3(.02,.025,.02);
   // Broad anisotropic, non-periodic mineral lenses replace the former thin
   // sinusoidal edges. Only the local scan contributes sharp surface detail.
   float grain=terrainNoise(vec2((metricPoint.x+metricPoint.z*.31)/32.,(metricPoint.y+metricPoint.x*.12+metricPoint.z*.09)/12.));
   float fracture=terrainNoise(metricPoint.xz*.17+vec2(metricPoint.y*.033,metricPoint.y*.014));
   float bedLayer=(grain-.5)*(.32+fracture*.68);
   // Three STANDARD stores vViewPosition=-mvPosition.xyz: forward depth is +Z.
   float nearDetail=1.-smoothstep(24.,57.,vViewPosition.z);
   float stoneWeight=clamp(vTerrainZone.x+vTerrainZone.y*.32,0.,1.);
   diffuseColor.rgb*=.96+grain*.08;
   vec3 bedTint=vec3(1.)+vec3(.10,.08,.045)*bedLayer;
   diffuseColor.rgb*=mix(vec3(1.),bedTint,stoneWeight);
   ${scanned?`vec3 surfaceAxis=normalize(vTerrainSurfaceNormal);
   float onTop=smoothstep(.30,.80,abs(surfaceAxis.y));
   bool xFace=abs(surfaceAxis.x)>abs(surfaceAxis.z);
   vec2 sideUV=(xFace?metricPoint.zy:metricPoint.xy)/2.9;
   vec2 topUV=metricPoint.xz/2.9;
   vec3 sideScan=texture2D(terrainMineralScan,sideUV).rgb;
   vec3 topScan=texture2D(terrainMineralScan,topUV).rgb;
   float mineralLuma=dot(mix(sideScan,topScan,onTop),vec3(.299,.587,.114));
   diffuseColor.rgb*=mix(1.,clamp(.68+mineralLuma*.89,.74,1.16),stoneWeight*.82);
   vec2 normalUV=abs(surfaceAxis.y)>.62?topUV:sideUV;
   vec3 mineralNormal=texture2D(terrainMineralNormal,normalUV).xyz*2.-1.;
   vec3 scanU=abs(surfaceAxis.y)>.62?vec3(1.,0.,0.):(xFace?vec3(0.,0.,1.):vec3(1.,0.,0.));
   vec3 scanV=abs(surfaceAxis.y)>.62?vec3(0.,0.,1.):vec3(0.,1.,0.);
   scanU=normalize(scanU-surfaceAxis*dot(surfaceAxis,scanU));
   scanV=normalize(scanV-surfaceAxis*dot(surfaceAxis,scanV)-scanU*dot(scanU,scanV));`:''}
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(.98-vTerrainZone.x*.16-vTerrainZone.z*.05+bedLayer*.025+(fracture-.5)*.025,.79,.99);');
  // Derivative bump in view space: changes PBR light response, not LOS geometry.
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float soilRelief=(fracture-.5)*.0007+grain*.0006;
   float stoneRelief=bedLayer*.003+(fracture-.5)*.002;
   float terrainBump=mix(soilRelief,stoneRelief,stoneWeight)*(1.-vTerrainZone.z*.7)*mix(.28,1.,nearDetail);
   vec3 tx=dFdx(-vViewPosition),ty=dFdy(-vViewPosition),rx=cross(ty,normal),ry=cross(normal,tx);
   float determinant=dot(tx,rx);
   normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(terrainBump)*rx+dFdy(terrainBump)*ry));
   ${scanned?'normal=normalize(normal+mat3(viewMatrix)*(scanU*mineralNormal.x+scanV*mineralNormal.y)*stoneWeight*.34*nearDetail);':''}
  `);
 };
 material.customProgramCacheKey=()=> 'coastal-r3-broad-mineral-lenses-v4-'+!!materials.r2Bank?.map;
 const mesh=new T.Mesh(geo,material);mesh.name='shared-contract-stratified-terrain';mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
 mesh.userData={revision:3,triangles:nx*nz*2,geometryContract:'coastal-contract.js / coastal_scene.py',landforms:['broad overlapping massif','asymmetric ravines','colluvial foothills','incised fluvial valley','irregular tidal shelves'],materials:['muted olive scrub','steep convex scarp bedrock','non-periodic broad mineral lenses / scanned surface normals','grass and concave colluvial apron','wet bank','coastal sand'],scanSource:materials.r2Bank?'local Poly Haven river_small_rocks CC0':null,materialBudget:{textureReads:materials.r2Bank?.map?3:0,proceduralNoiseCalls:2,geometryDisplacement:false,detailFadeWorldUnits:[24,57]}};
 return mesh;
}

// A cutout leaf atlas and intersecting, offset branch sprays form an open
// canopy. No closed sphere/cone shell remains in the middle-distance forest.
// Near-field scan models are retained by the R2 pilot for individual leaves.
function leafAtlas(pool){
 const n=128,data=new Uint8Array(n*n*4),leaves=[];
 for(let i=0;i<113;i++){
  const angle=hash(i,818)*Math.PI*2,rad=Math.sqrt(hash(i,317));
  leaves.push([64+Math.cos(angle)*rad*51,63+Math.sin(angle)*rad*51,5.4+hash(i,93)*6.2,3.3+hash(i,201)*3.8,angle]);
 }
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let coverage=0,shade=.8;
  for(let i=0;i<leaves.length;i++){
   const [cx,cy,rx,ry,a]=leaves[i],dx=x-cx,dy=y-cy,u=(dx*Math.cos(a)+dy*Math.sin(a))/rx,v=(-dx*Math.sin(a)+dy*Math.cos(a))/ry,q=u*u+v*v;
   if(q<1.08){const alpha=clamp((1.08-q)*8);if(alpha>coverage){coverage=alpha;shade=.65+hash(i,714)*.32+.10*(1-q);}}
  }
  const offset=(y*n+x)*4;data[offset]=Math.round(240*shade);data[offset+1]=Math.round(250*shade);data[offset+2]=Math.round(216*shade);data[offset+3]=Math.round(coverage*255);
 }
 const map=pool.own(new T.DataTexture(data,n,n,T.RGBAFormat));map.colorSpace=T.SRGBColorSpace;map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
}
function crownGeometry(variant){
 // Four unequal, open branch crowns replace ten intersecting rectangles. The
 // upper cluster is small, eccentric and tilted; there is no complete top lid.
 // Actual scan alpha retains leaf gaps inside the irregular branch outlines.
 const positions=[],normals=[],uv=[],indices=[],segments=10,phase=variant*.71;
 const vertex=(position,u,v,branchNormal)=>{
  positions.push(position.x,position.y,position.z);uv.push(u,v);
  // A smooth crown-scale normal field removes the horizontal black shelves
  // caused by plane normals while retaining directional daylight/shadows.
  const normal=new T.Vector3(position.x*.63,.64+(position.y+.3)*.38,position.z*.63).normalize().lerp(branchNormal,.26).normalize();normals.push(normal.x,normal.y,normal.z);
 };
 for(let lobe=0;lobe<4;lobe++){
  const top=lobe===3,a=phase+[.14,2.17,4.62,.85][lobe],rise=[.48,.36,.78,.84][lobe];
  const normal=new T.Vector3(Math.cos(a)*(top?.48:.84),rise,Math.sin(a)*(top?.48:.84)).normalize();
  const right=new T.Vector3(-Math.sin(a),0,Math.cos(a));
  const up=new T.Vector3().crossVectors(normal,right).normalize();
  up.negate();
  const reach=[.57,.69,.48,.32][lobe],center=new T.Vector3(Math.cos(a)*reach,[.055,-.40,-.12,.255][lobe],Math.sin(a)*reach);
  const rx=[.86,.59,.72,.53][lobe],ry=[.57,.43,.49,.44][lobe],bulge=[.22,.16,.25,.16][lobe],start=positions.length/3;
  vertex(center.clone().addScaledVector(normal,bulge),.5,.5,normal);
  for(let j=0;j<segments;j++){
   const theta=j/segments*Math.PI*2,u=Math.cos(theta),v=Math.sin(theta);
   const edge=1+.16*Math.sin(theta*3+phase+lobe*.8)+.10*Math.cos(theta*5-lobe*.6)-(j===(lobe*3+2)%segments?.18:0);
   vertex(center.clone().addScaledVector(right,u*rx*edge).addScaledVector(up,v*ry*edge),.5+u*.5,.5+v*.5,normal);
  }
  for(let j=0;j<segments;j++){
   const b=start+1+j,c=start+1+(j+1)%segments;
   indices.push(start,c,b);
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);
 // Keep the previous nominal crown volume and every instance transform. The
 // atlas now trims its empty margins, so no external 1.42x enlargement is needed.
 g.computeBoundingBox();const size=g.boundingBox.getSize(new T.Vector3()),target=variant===0?[2.32138157,1.36860001,2.56211400]:variant===1?[2.42587149,1.36860001,2.42268276]:[2.34541726,1.46235001,2.36185217];
 g.scale(target[0]/size.x,target[1]/size.y,target[2]/size.z);g.computeBoundingBox();const center=g.boundingBox.getCenter(new T.Vector3());g.translate(-center.x,-.165-center.y,-center.z);g.computeBoundingBox();g.computeBoundingSphere();
 g.userData.foliageGeometry={clusters:4,curved:true,smoothCrownNormals:true,triangles:indices.length/3};return g;
}

export function buildVegetation(pool,materials,layout,parent,quality='standard',r2=false){
 const low=quality==='low',count=low?1150:2300,[sx,sy,sz]=layout.renderScale;
 const heroes=r2?planHeroTrees(layout):[];
 pool.geo('coastal-crown-wide',()=>crownGeometry(0));pool.geo('coastal-crown-upright',()=>crownGeometry(1));pool.geo('coastal-conifer',()=>crownGeometry(2));
 pool.geo('coastal-trunk',()=>new T.CylinderGeometry(.60,1,1,5));pool.geo('coastal-boulder',()=>new T.DodecahedronGeometry(1,0));
 const leaves=leafAtlas(pool),leafOptions={map:leaves,alphaTest:.20,alphaToCoverage:true,side:T.DoubleSide};
 const foliage=[pool.mat('coastal-foliage-deep',0x45523a,.94,0,leafOptions),pool.mat('coastal-foliage-olive',0x596347,.96,0,leafOptions),pool.mat('coastal-foliage-sage',0x717a57,.92,0,leafOptions)];
 for(const material of foliage){
  // Low-angle leaf transmission is a small wrapped response to the actual
  // scene lights, never self-emission or a change to the scene exposure.
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',T.ShaderChunk.lights_physical_pars_fragment.replace('float dotNL = saturate( dot( geometryNormal, directLight.direction ) );','float dotNL = saturate( (dot( geometryNormal, directLight.direction ) + 0.18) / 1.18 );'));};
  material.customProgramCacheKey=()=> 'r3-curved-leaf-light-wrap-018';material.userData.foliageLightWrap=.18;
 }
 const trunks=pool.mat('coastal-bark',0x655744,.98),stone=pool.mat('coastal-talus',0x85897b,.94);
 let trees=0,shrubs=0,rocks=0;const silhouettes=[0,0,0];
 for(let i=0;i<count;i++){
  const x=-155+hash(i,51)*1940,z=-1200+hash(i,92)*2420,h=terrainHeight(layout,x,z),slope=slopeAt(layout,x,z);
  // R2 removes the old closed crown meshes inside the near-field pilot.
  if(r2&&x>=-100&&x<=430&&z>=-260&&z<=330)continue;
  if(heroes.some(tree=>Math.hypot(tree.x-x,tree.z-z)<22))continue;
  const river=Math.abs(z-layout.terrain.riverBaseZ-layout.terrain.riverAmplitude*Math.sin(x/180)),road=roadDistance(layout,x,z);
  if(h<6||river<48||road<11||x<65&&z>190||layout.buildings.some(b=>Math.abs(b.x-x)<b.width/2+17&&Math.abs(b.z-z)<b.depth/2+17))continue;
  // Forest patches follow moisture/contours; exposed summits/scarps stay open.
  const patch=field(x/155,z/155),moisture=1-ease(80,280,river),density=(.15+.74*ease(.2,.7,patch)+moisture*.13)*(1-ease(.40,1.13,slope))*(1-ease(185,320,h));
  const r=hash(i,123),angle=hash(i,271)*Math.PI*2,pos=[x*sx,h*sy,z*sz],size=(.14+hash(i,721)*.16)*(h>270?.70:1);
  if(slope>.72&&h>90&&r<.10){pool.batch('coastal-boulder',stone,[pos[0],pos[1]+.025,pos[2]],[size*.66,size*.26,size*.47],angle);rocks++;continue;}
  if(r>density){
   if(r<density+.16&&slope<.9&&h<310){pool.batch('coastal-crown-wide',foliage[1],[pos[0],pos[1]+size*.20,pos[2]],[size*.7,size*.36,size*.55],angle);shrubs++;}
   continue;
  }
  const variant=Math.floor(hash(i,35)*2),leaf=foliage[Math.floor(hash(i,337)*foliage.length)];silhouettes[variant]++;trees++;
  const height=size*(variant===2?2.8:2.1),trunkHeight=height*.68;
  pool.batch('coastal-trunk',trunks,[pos[0],pos[1]+trunkHeight/2,pos[2]],[size*.085,trunkHeight,size*.085],angle);
  if(variant===2){pool.batch('coastal-conifer',leaf,[pos[0],pos[1]+height*.66,pos[2]],[size*.88,height*.94,size*.88],angle);}
  else {
   const kind=variant===0?'coastal-crown-wide':'coastal-crown-upright';
   pool.batch(kind,leaf,[pos[0],pos[1]+height*.76,pos[2]],[size, size*(variant===0?1.05:1.16),size*.91],angle);
   pool.batch('coastal-crown-wide',foliage[(i+1)%3],[pos[0]+Math.cos(angle)*size*.50,pos[1]+height*.55,pos[2]+Math.sin(angle)*size*.50],[size*.68,size*.65,size*.70],angle+1.4);
  }
 }
 // Deposited angular fragments at dry gully mouths and valley shoulders. They
 // touch the rendered shared terrain triangles, with <=0.96 m total height.
 const talus=pool.mat('coastal-r3-angular-talus',0x8a9188,.97,0,materials.r2Bank?{map:materials.r2Bank.map,normalMap:materials.r2Bank.normalMap,normalScale:new T.Vector2(.35,.35)}:{});
 const talusSites=[[575,-250],[635,-610],[745,-680],[655,235],[875,320],[1000,970]];
 let talusFragments=0;
 for(const [j,[cx,cz]]of talusSites.entries())for(let i=0;i<(low?12:24);i++){
  const angle=hash(i,j+127)*Math.PI*2,rad=Math.sqrt(hash(i,j+336))*28,x=cx+Math.cos(angle)*rad,z=cz+Math.sin(angle)*rad,h=terrainHeight(layout,x,z);
  if(h<25||roadDistance(layout,x,z)<9)continue;
  const half=.006+.006*hash(i,j+825),ground=riverBankSurfaceHeight(layout,x,z,parent),width=.033+.046*hash(i,j+893);
  pool.batch('coastal-boulder',talus,[x*sx,ground+half*.57,z*sz],[width,half,width*(.55+hash(i,j+983)*.5)],angle);talusFragments++;
 }
 // Instanced geometry is flushed with the other town assets by the renderer.
 const result={trees,shrubs,rocks,silhouettes,seed:'starry-coastal-1',quality,canopy:'R3 four curved scanned leaf clusters per crown, smooth volume normals and directional light wrap; two near hero scans retain distance LOD',atlasPixels:128*128,trianglesPerCanopy:[40,40,40],clustersPerCanopy:4,foliageLightWrap:.18,placementCandidates:count,talusSites:talusSites.length,talusFragments,talusMaximumTotalHeightM:.96,heroExclusionM:heroes.map(p=>[p.x,p.z,22])};parent.userData.vegetation=result;return result;
}
