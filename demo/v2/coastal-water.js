import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';

// Procedural exhibition water. Depth comes from the same fictional height field
// used by the scene, rather than painted foam unrelated to the shoreline.
export function buildWater(pool,layout,parent,quality,onCompile,r2=false){
 const resolution=quality==='low'?256:384,data=new Uint8Array(resolution*resolution);
 const bounds=new T.Vector4(-34,-46,100,92);
 for(let z=0;z<resolution;z++)for(let x=0;x<resolution;x++){
  const h=terrainHeight(layout,(bounds.x+x/(resolution-1)*bounds.z)/.02,(bounds.y+z/(resolution-1)*bounds.w)/.02);
  data[z*resolution+x]=Math.round(T.MathUtils.clamp((h+24)/40,0,1)*255);
 }
 const depth=pool.own(new T.DataTexture(data,resolution,resolution,T.RedFormat));depth.minFilter=T.LinearFilter;depth.magFilter=T.LinearFilter;depth.needsUpdate=true;
 const uniforms={time:{value:0},depth:{value:depth},bounds:{value:bounds},ship:{value:new T.Vector3()},shipHeading:{value:0},shipEnabled:{value:0},harbor:{value:new T.Vector4((layout.port.x-110)*.02,layout.port.z*.02,3.5,5.0)}};
 // The ocean chart and river survey use different extents. A separate littoral
 // strip gives the shore a 2.34 m x 4.30 m survey instead of a blurred edge.
 const shoreBounds=new T.Vector4(-600*.02,-1100*.02,600*.02,2200*.02),shoreWidth=quality==='low'?128:256,shoreHeight=quality==='low'?256:512,shoreData=new Uint8Array(shoreWidth*shoreHeight*2);
 for(let z=0;z<shoreHeight;z++)for(let x=0;x<shoreWidth;x++){
  const h=terrainHeight(layout,(shoreBounds.x+x/(shoreWidth-1)*shoreBounds.z)/.02,(shoreBounds.y+z/(shoreHeight-1)*shoreBounds.w)/.02),v=Math.round(T.MathUtils.clamp((h+24)/40,0,1)*65535),i=(z*shoreWidth+x)*2;
  shoreData[i]=v>>8;shoreData[i+1]=v&255;
 }
 const shoreDepth=pool.own(new T.DataTexture(shoreData,shoreWidth,shoreHeight,T.RGFormat));shoreDepth.minFilter=shoreDepth.magFilter=T.LinearFilter;shoreDepth.needsUpdate=true;
 uniforms.shoreDepth={value:shoreDepth};uniforms.shoreBounds={value:shoreBounds};
 // The existing full-coast map resolves ~20 m per texel: too coarse for the
 // 38 m river. A bounded two-channel local map resolves 1.72 x 1.33 m in R2.
 // Height uses 16-bit packed RG to keep the wet edge smooth without requiring
 // float-texture filtering support. Existing ocean sampling remains unchanged.
 const riverBounds=new T.Vector4(-450*.02,-110*.02,1060*.02,380*.02);
 if(r2){
  const width=quality==='low'?256:512,height=quality==='low'?128:256,data=new Uint8Array(width*height*2);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
   const h=terrainHeight(layout,(riverBounds.x+x/(width-1)*riverBounds.z)/.02,(riverBounds.y+z/(height-1)*riverBounds.w)/.02),encoded=Math.round(T.MathUtils.clamp((h+4)/64,0,1)*65535),offset=(z*width+x)*2;
   data[offset]=encoded>>8;data[offset+1]=encoded&255;
  }
  const localDepth=pool.own(new T.DataTexture(data,width,height,T.RGFormat));localDepth.minFilter=localDepth.magFilter=T.LinearFilter;localDepth.needsUpdate=true;
  uniforms.riverDepth={value:localDepth};uniforms.riverBounds={value:riverBounds};uniforms.riverShape={value:new T.Vector3(layout.terrain.riverBaseZ*.02,layout.terrain.riverAmplitude*.02,180*.02)};
 }
 const riverFunctions=r2?`uniform vec4 riverDepthBounds; uniform vec3 riverShape;
  float riverPilotMask(vec2 p){
   float along=smoothstep(-8.3,-6.1,p.x)*(1.-smoothstep(10.1,11.6,p.x));
   float side=abs(p.y-riverShape.x-riverShape.y*sin(p.x/riverShape.z));
   return along*(1.-smoothstep(1.40,2.20,side));
  }
 `:'';
 const material=pool.mat(r2?'coastal-water-r2':'coastal-water',0x163d47,.28,.14);
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{seaTime:uniforms.time,coastDepth:uniforms.depth,depthBounds:uniforms.bounds,vesselPosition:uniforms.ship,vesselHeading:uniforms.shipHeading,vesselEnabled:uniforms.shipEnabled,harborChart:uniforms.harbor,shoreDepth:uniforms.shoreDepth,shoreBounds:uniforms.shoreBounds});
  if(r2)Object.assign(shader.uniforms,{riverDepth:uniforms.riverDepth,riverDepthBounds:uniforms.riverBounds,riverShape:uniforms.riverShape});
  onCompile?.(shader);
  shader.vertexShader=`${riverFunctions}uniform float seaTime; varying vec3 seaPosition;
   ${shader.vertexShader}`.replace('#include <begin_vertex>',`#include <begin_vertex>
   seaPosition=position;
   transformed.y+=(.009*sin(position.x*1.9+position.z*.73+seaTime*.64)+.005*sin(position.x*.67-position.z*2.71-seaTime*.83))${r2?'*(1.-riverPilotMask(position.xz)*.75)':''};`);
  shader.fragmentShader=`${riverFunctions}${r2?'uniform sampler2D riverDepth;':''}uniform float seaTime; uniform sampler2D coastDepth; uniform vec4 depthBounds; uniform vec4 harborChart; uniform sampler2D shoreDepth; uniform vec4 shoreBounds;
   uniform vec3 vesselPosition; uniform float vesselHeading; uniform float vesselEnabled; varying vec3 seaPosition;
   float seaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float seaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(seaHash(i),seaHash(i+vec2(1,0)),f.x),mix(seaHash(i+vec2(0,1)),seaHash(i+vec2(1,1)),f.x),f.y);}
   vec2 seaSlope(vec2 p){
    vec2 flow=vec2(seaTime*.045,-seaTime*.033);
    float warp=seaNoise(p*.47+flow);
    vec2 q=mat2(.82,.57,-.57,.82)*p+vec2(warp,warp*.7);
    vec2 broad=vec2(seaNoise(q*vec2(1.2,2.8)+flow),seaNoise(q*vec2(2.7,1.4)-flow+19.));
    vec2 ripples=vec2(seaNoise(q*vec2(8.3,17.1)+flow*2.),seaNoise(q*vec2(15.7,9.2)-flow*1.3+7.));
    return (broad-.5)*.18+(ripples-.5)*.105;
   }

   ${shader.fragmentShader}`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 coastUV=(seaPosition.xz-depthBounds.xy)/depthBounds.zw;
   float groundHeight=texture2D(coastDepth,clamp(coastUV,0.,1.)).r*40.-24.;
   vec2 shoreUV=(seaPosition.xz-shoreBounds.xy)/shoreBounds.zw;
   vec2 shoreRG=texture2D(shoreDepth,clamp(shoreUV,0.,1.)).rg;
   float shoreHeight=(shoreRG.r*65280.+shoreRG.g*255.)/65535.*40.-24.;
   float shoreSurvey=smoothstep(.0,.045,shoreUV.x)*(1.-smoothstep(.955,1.,shoreUV.x))*smoothstep(.0,.045,shoreUV.y)*(1.-smoothstep(.955,1.,shoreUV.y));
   groundHeight=mix(groundHeight,shoreHeight,shoreSurvey);
   ${r2?`float riverRegion=riverPilotMask(seaPosition.xz);
   vec2 riverUV=(seaPosition.xz-riverDepthBounds.xy)/riverDepthBounds.zw;
   vec2 riverRG=texture2D(riverDepth,clamp(riverUV,0.,1.)).rg;
   float riverHeight=(riverRG.r*65280.+riverRG.g*255.)/65535.*64.-4.;
   groundHeight=mix(groundHeight,riverHeight,riverRegion);`:''}
   float actualDepth=max(0.,-groundHeight);
   float harborRegion=1.-smoothstep(.48,1.18,length((seaPosition.xz-harborChart.xy)/harborChart.zw));
   float shelf=1.-smoothstep(.35,12.,actualDepth);
   vec3 oceanBody=mix(vec3(.018,.060,.080),vec3(.091,.168,.146),shelf*.80);
   oceanBody=mix(oceanBody,vec3(.035,.087,.078),harborRegion*.69);
   diffuseColor.rgb=oceanBody;
   ${r2?`// Water has low diffuse reflectance: the existing PMREM sky and PBR
   // Fresnel provide the visible return, not a cyan Lambertian surface.
   vec3 riverBody=mix(vec3(.026,.046,.037),vec3(.011,.029,.027),smoothstep(.05,1.6,actualDepth));
   diffuseColor.rgb=mix(diffuseColor.rgb,riverBody,riverRegion);`:''}
   float grain=seaNoise(seaPosition.xz*8.6+vec2(seaTime*.1,-seaTime*.05));
   float wash=sin(actualDepth*1.4-seaTime*.65+seaNoise(seaPosition.xz*1.5)*4.);
   float foam=(1.-smoothstep(.2,2.8,actualDepth))*smoothstep(.43,.87,grain)*smoothstep(-.5,.7,wash);
   foam*=mix(1.,.28,harborRegion);
   ${r2?'foam*=mix(1.,.09*smoothstep(.06,.50,actualDepth),riverRegion);':''}
   vec2 delta=seaPosition.xz-vesselPosition.xz;
   vec2 boat=vec2(cos(vesselHeading)*delta.x-sin(vesselHeading)*delta.y,sin(vesselHeading)*delta.x+cos(vesselHeading)*delta.y);
   float stern=smoothstep(.75,1.6,boat.x)*(1.-smoothstep(1.6,5.0,boat.x));
   float wakeBand=exp(-pow((abs(boat.y)-(.24+max(0.,boat.x-1.)*.21))/.065,2.))*stern;
   float hullWash=exp(-pow((abs(boat.y)-.28)/.07,2.))*(1.-smoothstep(.6,1.4,abs(boat.x)));
   foam+=vesselEnabled*(wakeBand*.26+hullWash*.25)*smoothstep(.22,.7,grain);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.60,.69,.63),clamp(foam*.65,0.,.5));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
   vec2 slopes=seaSlope(seaPosition.xz)*mix(1.,.34,harborRegion)${r2?'*mix(1.,.65,riverRegion)':''};
   ${r2?`vec2 flowAxis=normalize(vec2(1.,riverShape.y/riverShape.z*cos(seaPosition.x/riverShape.z)));
   // Positive time in the spatial phase travels toward decreasing local X,
   // following the river from its mountain valley into the western estuary.
   float ripplePhase=seaPosition.x*35.+seaNoise(seaPosition.xz*2.4)*2.8+seaTime*.75;
   float rippleFilter=1.-smoothstep(1.0,2.8,fwidth(ripplePhase));
   float riverRipple=(sin(ripplePhase+seaNoise(seaPosition.xz*7.)*1.2)*.034+sin(ripplePhase*.63+seaPosition.z*8.-seaTime*.3)*.017)*rippleFilter;
   slopes+=flowAxis*riverRipple*riverRegion;`:''}
   normal=normalize(mat3(viewMatrix)*normalize(vec3(-slopes.x,1.,-slopes.y)));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor=clamp(.24+seaNoise(seaPosition.xz*.6)*.10+foam*.2-harborRegion*.055,.18,.50);
   ${r2?'roughnessFactor=mix(roughnessFactor,.23+seaNoise(seaPosition.xz*1.3)*.10,riverRegion);':''}`);
  if(r2){
   shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=mix(metalnessFactor,0.,riverRegion);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\n material.specularColor=mix(material.specularColor,vec3(.020),riverRegion); material.specularColorBlended=mix(material.specularColorBlended,vec3(.020),riverRegion);');
  }
 };
 material.customProgramCacheKey=()=>r2?'coastal-water-r3-meander-estuary-shoal':'coastal-water-r3-littoral-harbor';
 const geometry=pool.own(new T.PlaneGeometry(170,160,quality==='low'?80:140,quality==='low'?72:120));geometry.rotateX(-Math.PI/2);geometry.translate(-20,0,0);
 const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;parent.add(mesh);
 mesh.userData.r2River=r2?{localDepthSize:[uniforms.riverDepth.value.image.width,uniforms.riverDepth.value.image.height],heightPrecisionM:64/65535,pilotXM:[-415,580],riverOnly:true,meanderAmplitudeM:layout.terrain.riverAmplitude,bankGeometry:'variable channel widths; inner shoals; estuary widening'}:null;
 mesh.userData.r3Water={revision:3,oceanDepthSize:[resolution,resolution],shoreDepthSize:[shoreWidth,shoreHeight],shoreHeightPrecisionM:40/65535,zones:['deep sea','shoal and surf edge','sheltered port basin','downstream river'],wake:'vessel-local stern and hull disturbance'};
 return {mesh,uniforms};
}
