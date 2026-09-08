import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

// A bounded architectural replacement. Metre-based openings are cut through
// the walls; glazing sits inside the reveals rather than on an opaque cube.
export const R2_BUILDING_IDS=new Set(['building-3-1','building-3-2','building-4-1','building-4-2']);
function mesh(pool,parent,geo,mat,name){pool.own(geo);const o=new T.Mesh(geo,mat);o.name=name;o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
function physicalUV(geo){const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));uv.setXY(i,(nx>nz?p.getZ(i):p.getX(i))/2,(ny>Math.max(nx,nz)?p.getZ(i):p.getY(i))/2);}return geo;}
function solid(pool,g,mat,x,y,z,w,h,d,name='architectural solid'){
 const geo=pool.geo(`r2-metric-box-${w}-${h}-${d}`,()=>physicalUV(new T.BoxGeometry(w,h,d)));const o=mesh(pool,g,geo,mat,name);o.position.set(x,y,z);return o;
}
// The opaque reveals already supply window depth. Planar glazing and narrow
// side frames remove concealed faces while keeping the central mullion/sill
// three-dimensional. All planes face outward through the actual wall opening.
function openingPlane(pool,g,mat,x,y,z,w,h,name){
 const geo=pool.geo(`r3-opening-plane-${w}-${h}`,()=>new T.PlaneGeometry(w,h));
 const o=mesh(pool,g,geo,mat,name);o.position.set(x,y,z);o.castShadow=false;return o;
}
function slab(pool,g,mat,w,d,y,h,cut=.24){
 const a=w/2,b=d/2,c=Math.min(cut,a*.1,b*.1),outline=[[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c]];
 const geo=new T.ExtrudeGeometry(new T.Shape(outline.map(v=>new T.Vector2(...v))),{depth:h,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);geo.translate(0,y,0);
 return mesh(pool,g,physicalUV(geo),mat,'chamfered slab / coping');
}
function wall(pool,parent,m,width,height,rows,phase=0){
 const shape=new T.Shape([new T.Vector2(-width/2,0),new T.Vector2(width/2,0),new T.Vector2(width/2,height),new T.Vector2(-width/2,height)]),openings=[];
 for(const row of rows){const bays=Math.max(2,Math.floor((width-2)/4.2)),pitch=(width-1.8)/bays;
  for(let i=0;i<bays;i++){const x=-width/2+.9+pitch*(i+.5),w=Math.min(row.shop?3.05:2.25,pitch-.65),y=row.y,h=row.h;
   const hole=new T.Path();hole.moveTo(x-w/2,y);hole.lineTo(x-w/2,y+h);hole.lineTo(x+w/2,y+h);hole.lineTo(x+w/2,y);hole.closePath();shape.holes.push(hole);openings.push({x,y,w,h,i});
  }
 }
 const geo=new T.ExtrudeGeometry(shape,{depth:.30,bevelEnabled:false,steps:1});geo.translate(0,0,-.30);mesh(pool,parent,physicalUV(geo),m.facade,'wall with through openings and 300 mm reveals');
 for(const a of openings){
  const glass=(a.i+phase)%5===0?m.glassShade:m.glass;
  // Glazing is set back 22 cm and stays behind the reveal at oblique angles.
  openingPlane(pool,parent,glass,a.x,a.y+a.h/2,-.24,a.w-.06,a.h-.06,'recessed glazing');
  for(const x of [a.x-a.w/2+.05,a.x+a.w/2-.05])openingPlane(pool,parent,m.frame,x,a.y+a.h/2,-.12,.07,a.h,'aluminium vertical reveal trim');
  solid(pool,parent,m.frame,a.x,a.y+a.h/2,-.12,.07,a.h,.12,'central aluminium mullion');
  for(const y of [a.y+.04,a.y+a.h-.04])openingPlane(pool,parent,m.frame,a.x,y,-.12,a.w,.075,'aluminium horizontal reveal trim');
  solid(pool,parent,m.coping,a.x,a.y-.06,.055,a.w+.18,.12,.40,'projecting drained sill');
 }
 return openings.length;
}
function pitchedRoof(pool,g,m,w,d,h,rise=2.2){
 const half=w/2+.45,angle=Math.atan2(rise,half),length=Math.hypot(half,rise);
 for(const side of [-1,1]){
  const plane=solid(pool,g,m.roof,side*half/2,h+rise/2+.13,0,length,.18,d+1.0,'standing seam pitched roof');plane.rotation.z=-side*angle;
  for(let z=-d/2;z<d/2;z+=2.6)pool.beam(g,[0,h+rise+.24,z],[side*half,h+.22,z],.04,m.frame);
 }
 for(const z of [-d/2,d/2]){
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-w/2,h,z,w/2,h,z,0,h+rise,z],3));geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,w/2,0,w/4,rise/2],2));geo.computeVertexNormals();if(z<0){geo.scale(-1,1,1);geo.computeVertexNormals();}mesh(pool,g,geo,m.facade,'masonry gable');
 }
}
function storeys(height,ground=4.2){const count=Math.max(1,Math.round((height-ground)/3.4)),step=(height-ground)/count,rows=[{y:.36,h:2.95,shop:true}];for(let i=0;i<count;i++)rows.push({y:ground+i*step+.70,h:Math.min(1.92,step-1.1)});return rows;}
function shell(pool,g,m,w,d,h,rows){let windows=0;for(const [x,z,width,angle]of [[0,d/2,w,0],[0,-d/2,w,Math.PI],[-w/2,0,d,-Math.PI/2],[w/2,0,d,Math.PI/2]]){const face=new T.Group();face.position.set(x,0,z);face.rotation.y=angle;g.add(face);windows+=wall(pool,face,m,width,h,rows,Math.round(x+z));}return windows;}
function loggiaShell(pool,g,m,w,d,h,rows){
 const bay=Math.min(8.4,w*.25),recess=3.1,wing=(w-bay)/2;let windows=0;
 const faces=[[0,-d/2,w,Math.PI],[-w/2,0,d,-Math.PI/2],[w/2,0,d,Math.PI/2],[-(bay+wing)/2,d/2,wing,0],[(bay+wing)/2,d/2,wing,0],[0,d/2-recess,bay,0]];
 for(const [x,z,width,angle]of faces){const face=new T.Group();face.position.set(x,0,z);face.rotation.y=angle;g.add(face);windows+=wall(pool,face,m,width,h,rows,Math.round(x+z));}
 // Solid side returns enclose a genuine three-metre recess. Slabs and open
 // railings let daylight and shadows articulate the inhabited floor levels.
 for(const x of [-bay/2,bay/2])solid(pool,g,m.facade,x,h/2,d/2-recess/2,.30,h,recess,'loggia return wall');
 for(const row of rows){const floor=Math.max(.03,row.y-.70),sl=slab(pool,g,m.coping,bay,recess,floor,.15);sl.position.z=d/2-recess/2;
  for(const x of [-bay/2+.18,0,bay/2-.18])solid(pool,g,m.frame,x,floor+.63,d/2-.15,.07,1.1,.07,'open loggia balustrade post');
  solid(pool,g,m.frame,0,floor+1.16,d/2-.15,bay-.25,.07,.08,'loggia handrail');
  solid(pool,g,m.coping,0,floor+.27,d/2-.15,bay-.28,.23,.22,'low balcony curb');
 }
 return windows;
}
function coastFacingShell(pool,g,m,w,d,h,rows){
 // The sea is west (-X). Put the inhabited recess on that elevation, rather
 // than hiding it on the narrow far-facing side of the fixed pilot view.
 const west=new T.Group();west.rotation.y=-Math.PI/2;g.add(west);
 return loggiaShell(pool,west,m,d,w,h,rows);
}
function roof(pool,g,m,w,d,h,equipment=true){
 slab(pool,g,m.roof,w-.32,d-.32,h-.12,.18);
 for(const z of [-d/2+.16,d/2-.16]){solid(pool,g,m.facade,0,h+.42,z,w,.82,.32,'roof parapet');solid(pool,g,m.coping,0,h+.855,z,w+.08,.09,.43,'parapet coping');}
 for(const x of [-w/2+.16,w/2-.16]){solid(pool,g,m.facade,x,h+.42,0,.32,.82,d-.32,'roof parapet');solid(pool,g,m.coping,x,h+.855,0,.43,.09,d-.26,'parapet coping');}
 if(!equipment)return;
 // Service core, equipment feet and real-size ductwork replace the oversized
 // cylinder / solid rooftop block used by the original illustrative model.
 solid(pool,g,m.facade,-w*.23,h+1.35,-d*.23,4.8,2.7,5.3,'roof stair enclosure');slab(pool,g,m.coping,5.1,5.6,h+2.7,.16).position.set(-w*.23,0,-d*.23);
 solid(pool,g,m.frame,-w*.23,h+1.05,-d*.23+2.68,1.1,2.1,.06,'roof service door');
 for(let i=0;i<2;i++){const x=w*.20+i*2.5,z=-d*.19;for(const dx of [-.66,.66])solid(pool,g,m.frame,x+dx,h+.19,z,.12,.32,1.18,'equipment isolator');solid(pool,g,m.equipment,x,h+.86,z,1.85,1.24,1.25,'ventilation unit');for(let k=0;k<6;k++)solid(pool,g,m.frame,x,h+.42+k*.16,z+.637,1.63,.055,.035,'vent louvre');const fan=mesh(pool,g,pool.geo('r2-fan-disc',()=>new T.CylinderGeometry(.48,.48,.045,16)),m.frame,'vent fan');fan.position.set(x,h+1.50,z);}
}
// Consolidate the actual unique opening geometry and small manufactured parts
// by material once. No per-window draw calls or per-frame geometry work.
export function mergeArchitecturalGeometry(pool,root){
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),transform=new T.Matrix4(),sets=new Map(),originals=new Set(),cached=new Set(pool.geometries.values());
 root.traverse(o=>{if(o.isMesh){if(!sets.has(o.material))sets.set(o.material,[]);sets.get(o.material).push(o);}});
 for(const [material,objects]of sets){
  const chunks={position:[],normal:[],uv:[]},sizes={position:0,normal:0,uv:0};
  for(const object of objects){
   originals.add(object.geometry);
   let geometry=object.geometry.clone().applyMatrix4(transform.multiplyMatrices(inverse,object.matrixWorld));
   if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
   for(const key of Object.keys(chunks)){const values=geometry.attributes[key].array;chunks[key].push(values);sizes[key]+=values.length;}
   geometry.dispose();object.removeFromParent();
  }
  const geometry=new T.BufferGeometry();
  for(const key of Object.keys(chunks)){
   const values=new Float32Array(sizes[key]);let offset=0;
   for(const part of chunks[key]){values.set(part,offset);offset+=part.length;}
   geometry.setAttribute(key,new T.BufferAttribute(values,key==='uv'?2:3));
  }
  geometry.computeBoundingSphere();mesh(pool,root,geometry,material,'consolidated architecture / '+material.name);
 }
 for(const geometry of originals)if(!cached.has(geometry)){pool.resources.delete(geometry);geometry.dispose();}
}
export function buildBuildingPilot(pool,materials,layout,b,parent){
 const g=new T.Group();g.name='R2 '+b.id;g.userData.assetId=b.id;parent.add(g);
 const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>terrainHeight(layout,b.x+x*b.width/2,b.z+z*b.depth/2)),top=Math.max(...corners),low=Math.min(...corners);
 g.position.set(b.x*.02,top*.025,b.z*.02);g.scale.set(.02,.025,.02);g.rotation.y=b.r3Rotation||0;
 const style=b.r3Style??0,facadeKey='r3-mineral-facade-'+style;
 let facade=pool.materials.get(facadeKey);
 if(!facade){facade=pool.own(materials.r2Facade.clone());facade.name='R3 mineral facade '+style;facade.color.setHex(0xffffff);pool.materials.set(facadeKey,facade);
 // The scan is an unpainted grey substrate. A mineral paint layer raises its
 // diffuse reflectance, while keeping 20% of the scanned albedo variation and
 // the original surface normal / roughness maps. Lighting and exposure stay
 // untouched; the resulting linear albedo remains inside physical 0..1.
 const coatings=[[.57,.58,.53],[.35,.40,.40],[.57,.46,.34],[.30,.34,.32]];
 const coating=coatings[style%coatings.length];
 facade.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
  `#include <map_fragment>\n diffuseColor.rgb = mix(vec3(${coating.join(',')}), diffuseColor.rgb, 0.25);`);};
 facade.customProgramCacheKey=()=> 'r3-mineral-paint-'+style;
 facade.userData.coating={kind:'mineral paint over scanned plaster',linearReflectance:coating,scanAlbedoContribution:.25};}
 const m={facade,coping:facade,roof:pool.mat('r2-roof-membrane',0x727575,.92),frame:pool.mat('r2-anodised-frame',0x586468,.4,.58),glass:pool.mat('r2-recessed-glass',0x69838d,.23,.24),glassShade:pool.mat('r2-interior-blind',0x8e9895,.63,.04),equipment:pool.mat('r2-roof-equipment',0xa4aaa7,.53,.32)};
 const w=b.width,d=b.depth,h=b.height,tall=h>35;
 const gradeDifference=top-low;
 if(gradeDifference>1.2){
  const basement=new T.Group();basement.position.y=-gradeDifference;g.add(basement);
  const tiers=Math.max(1,Math.round(gradeDifference/3.1)),step=gradeDifference/tiers,rows=Array.from({length:tiers},(_,i)=>({y:i*step+.55,h:Math.max(.45,Math.min(1.5,step-.85))}));
  shell(pool,basement,m,w,d,gradeDifference,rows);
  for(let i=1;i<tiers;i++)slab(pool,basement,materials.r2Concrete,w+.18,d+.18,i*step,.18);
  solid(pool,g,materials.r2Concrete,0,-gradeDifference-.12,0,w+.7,.30,d+.7,'basement footing below sampled low corner');
 }else solid(pool,g,materials.r2Concrete,0,-gradeDifference/2-.05,0,w+.7,gradeDifference+.30,d+.7,'foundation follows four sampled ground corners');
 slab(pool,g,materials.r2Concrete,w+2.1,d+2.1,.08,.18);
 let windows=0;
 if(tall||b.r3Stepped){
  const podium=b.r3Stepped?Math.min(8.0,h*.45):7.7;windows+=shell(pool,g,m,w,d,podium,storeys(podium));roof(pool,g,m,w,d,podium,false);
  const upper=new T.Group();upper.position.set(-w*.035,podium+.18,-d*.055);g.add(upper);
  const tw=w*(b.r3Stepped?.66:.80),td=d*(b.r3Stepped?.67:.77),th=h-podium-.18;const count=Math.max(1,Math.round(th/3.4)),step=th/count,rows=Array.from({length:count},(_,i)=>({y:i*step+.73,h:Math.min(1.96,step-1.1)}));
  windows+=coastFacingShell(pool,upper,m,tw,td,th,rows);roof(pool,upper,m,tw,td,th);
  // A single recessed stair bay and the setback terrace give the tower its
  // massing; there are no huge balcony blocks repeated on every floor.
  for(let i=0;i<count;i++)solid(pool,upper,m.coping,tw/2+.16,i*step+.12,0,.32,.15,td*.82,'returning floor edge at service elevation');
 }else if(b.r3Industrial){
  windows+=shell(pool,g,m,w,d,h,[{y:.4,h:3.4,shop:true},{y:h-2.1,h:1.1}]);
  pitchedRoof(pool,g,m,w,d,h,3.6);
  for(let z=-d/2+3;z<d/2;z+=7)solid(pool,g,m.frame,-w/2-.35,3.7,z,.6,.16,4.1,'workshop loading canopy');
 }else if(b.r3Terrace){
  // A narrower shop-house: real openings, a sheltered shopfront, and a simple
  // inhabited upper volume. This forms street frontage between civic blocks.
  windows+=shell(pool,g,m,w,d,h,storeys(h,3.8));pitchedRoof(pool,g,m,w,d,h,Math.min(2.8,w*.1));
 }else{windows+=coastFacingShell(pool,g,m,w,d,h,storeys(h));roof(pool,g,m,w,d,h);}
 if(b.r3Style!==undefined&&!b.r3Industrial&&!b.r3Terrace){
  // Thin external sun screens and a recessed side service bay produce
  // meaningful facade shadows without any ambient-occlusion overlay.
  for(let y=4.4;y<h-.3;y+=3.4){
   solid(pool,g,m.coping,-w/2-.43,y,0,.82,.14,d*.69,'sea facing horizontal brise soleil');
   for(const z of [-d*.35,d*.35])solid(pool,g,m.frame,-w/2-.28,y+.39,z,.52,.72,.08,'screen end bracket');
  }
  solid(pool,g,m.frame,w/2+.09,h*.44,-d*.29,.14,h*.86,.14,'external service downpipe');
  for(const z of [-d*.23,d*.23])solid(pool,g,m.equipment,w/2+.28,3.2,z,.52,.62,1.2,'side wall condenser');
 }

 // Thin entrance canopy, columns and continuous threshold have human scale.
 solid(pool,g,materials.r2Concrete,0,.24,d/2+1.08,8,.32,2.1,'entry threshold');
 // Follow the front ground grade with a physically supported stair; the
 // downhill basement is habitable structure rather than a nine-metre plinth.
 const footAt=run=>terrainHeight(layout,b.x,b.z+d/2+2.1+run)-top;
 let count=Math.max(1,Math.ceil((.40-footAt(1))/.17));
 for(let pass=0;pass<3;pass++)count=Math.max(1,Math.ceil((.40-footAt(count*.30))/.17));
 const run=count*.30,foot=footAt(run),rise=(.40-foot)/count;
 for(let i=0;i<count;i++){const z=d/2+2.1+(i+.5)*.30,ground=terrainHeight(layout,b.x,b.z+z)-top-.10,tread=.40-i*rise;solid(pool,g,materials.r2Concrete,0,(ground+tread)/2,z,4.8,Math.max(.10,tread-ground),.304,'ground supported 300 mm stair tread');}
 for(const x of [-2.28,2.28]){pool.beam(g,[x,1.30,d/2+2.1],[x,foot+1.30,d/2+2.1+run],.038,m.frame);for(let i=0;i<=count;i+=Math.max(1,Math.round(1.4/.30)))pool.beam(g,[x,.40-i*rise,d/2+2.1+i*.30],[x,1.30-i*rise,d/2+2.1+i*.30],.035,m.frame);}
 slab(pool,g,m.frame,8.4,2.8,3.52,.12).position.z=d/2+.98;
 for(const x of [-3.9,3.9])solid(pool,g,m.frame,x,1.87,d/2+2.0,.16,3.50,.16,'canopy post');
 mergeArchitecturalGeometry(pool,g);
 g.userData.r2={replacement:true,windows,physicalFootprintM:[w,d],heightM:h,wallThicknessM:.30,glazingRecessM:.22,groundCornerHeightsM:corners,entranceStair:{treads:count,riseM:rise,runM:run},materialDraws:g.children.filter(o=>o.isMesh).length};return g;
}
