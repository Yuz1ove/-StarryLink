import * as T from 'three';

const TILE_SIZE=512;
const canopyAtlasCache=new WeakMap();
function pixelHash(pixels){let hash=2166136261;for(const value of pixels)hash=Math.imul(hash^value,16777619);return (hash>>>0).toString(16).padStart(8,'0');}
const VIEW_DIRECTIONS=[
 {name:'oblique-crown',direction:[1.0,.64,1.25]},
 {name:'opposite-oblique-crown',direction:[-1.15,.48,.85]},
 {name:'near-top-crown',direction:[.24,1.0,.31]},
];

function cloneCrown(source){
 // Object3D.clone initially borrows geometry/maps. Only selected leaf meshes
 // receive temporary resource handles: they can release their bake GPU buffers
 // without disposing or changing the module's shared source templates/images.
 const root=source.clone(true),materials=new Set(),geometries=new Set(),textures=new Map(),bounds=new T.Box3(),point=new T.Vector3();
 const textureSlots=['map','alphaMap','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','bumpMap','displacementMap'];
 const cloneTexture=source=>{
  if(!textures.has(source)){
   // Texture.clone shares THREE.Source and increments that shared upload
   // version. A fresh handle/source keeps even those source counters intact.
   const copy=new T.Texture(source.image);
   for(const key of ['name','mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','normalized','rotation','matrixAutoUpdate','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace'])copy[key]=source[key];
   copy.offset.copy(source.offset);copy.repeat.copy(source.repeat);copy.center.copy(source.center);copy.matrix.copy(source.matrix);copy.mipmaps=source.mipmaps.slice();copy.needsUpdate=true;textures.set(source,copy);
  }
  return textures.get(source);
 };
 let meshes=0,triangles=0;
 root.updateMatrixWorld(true);
 root.traverse(object=>{
  if(!object.isMesh)return;
  const isCrown=/leav/i.test(object.name);
  object.visible=isCrown;
  if(!isCrown)return;
  const cloneMaterial=material=>{
   const copy=material.clone();materials.add(copy);
   for(const slot of textureSlots)if(material[slot]?.isTexture)copy[slot]=cloneTexture(material[slot]);
   copy.alphaTest=.16;copy.alphaHash=false;copy.alphaToCoverage=true;
   copy.transparent=false;copy.side=T.DoubleSide;copy.depthWrite=true;
   copy.fog=false;return copy;
  };
  object.material=Array.isArray(object.material)?object.material.map(cloneMaterial):cloneMaterial(object.material);
  object.geometry=object.geometry.clone();geometries.add(object.geometry);
  object.castShadow=object.receiveShadow=false;object.frustumCulled=false;
  const positions=object.geometry.getAttribute('position');
  if(!positions)throw new Error('R3 scanned crown has no source positions');
  for(let i=0;i<positions.count;i++)bounds.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld));
  triangles+=(object.geometry.index?.count??positions.count)/3;meshes++;
 });
 if(!meshes||bounds.isEmpty()){
  for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();for(const texture of textures.values())texture.dispose();
  throw new Error('R3 scanned crown requires identified jacaranda leaf meshes');
 }
 return {root,materials,geometries,textures,bounds,meshes,triangles};
}

function captureState(renderer){
 return {
  target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mipmap:renderer.getActiveMipmapLevel(),
  viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest(),
  clearColor:renderer.getClearColor(new T.Color()),clearAlpha:renderer.getClearAlpha(),
  autoClear:renderer.autoClear,autoClearColor:renderer.autoClearColor,autoClearDepth:renderer.autoClearDepth,autoClearStencil:renderer.autoClearStencil,
  toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,outputColorSpace:renderer.outputColorSpace,
  shadowEnabled:renderer.shadowMap.enabled,shadowAutoUpdate:renderer.shadowMap.autoUpdate,shadowNeedsUpdate:renderer.shadowMap.needsUpdate,
  xrEnabled:renderer.xr.enabled,
 };
}
function restoreState(renderer,state){
 renderer.toneMapping=state.toneMapping;renderer.toneMappingExposure=state.exposure;renderer.outputColorSpace=state.outputColorSpace;
 renderer.shadowMap.enabled=state.shadowEnabled;renderer.shadowMap.autoUpdate=state.shadowAutoUpdate;renderer.shadowMap.needsUpdate=state.shadowNeedsUpdate;
 renderer.xr.enabled=state.xrEnabled;
 renderer.autoClear=state.autoClear;renderer.autoClearColor=state.autoClearColor;renderer.autoClearDepth=state.autoClearDepth;renderer.autoClearStencil=state.autoClearStencil;
 renderer.setRenderTarget(state.target,state.face,state.mipmap);
 renderer.setViewport(state.viewport);renderer.setScissor(state.scissor);renderer.setScissorTest(state.scissorTest);
 renderer.setClearColor(state.clearColor,state.clearAlpha);
}

function frameCamera(camera,bounds,direction){
 const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),span=size.length(),eye=new T.Vector3(...direction).normalize();
 camera.position.copy(center).addScaledVector(eye,span*2.2);camera.lookAt(center);camera.updateMatrixWorld(true);
 const projected=new T.Box3(),point=new T.Vector3();
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(point.set(x,y,z).applyMatrix4(camera.matrixWorldInverse));
 const half=Math.max(projected.max.x-projected.min.x,projected.max.y-projected.min.y)*.535;
 const cx=(projected.min.x+projected.max.x)/2,cy=(projected.min.y+projected.max.y)/2;
 camera.left=cx-half;camera.right=cx+half;camera.bottom=cy-half;camera.top=cy+half;
 camera.near=.1;camera.far=span*5;camera.updateProjectionMatrix();
}

function writeSRGBTile(context,pixels,size,tile){
 const image=context.createImageData(size,size),out=image.data;
 const linearToSRGB=value=>value<=.0031308?value*12.92:1.055*Math.pow(value,1/2.4)-.055;
 let coveredPixels=0,minX=size,minY=size,maxX=-1,maxY=-1;
 // Render targets store linear radiance. Readback starts at bottom left;
 // CanvasTexture expects top-left sRGB pixels with straight coverage alpha.
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const source=(y*size+x)*4,dest=((size-1-y)*size+x)*4,alpha=pixels[source+3];
  out[dest+3]=alpha;if(alpha>127)coveredPixels++;
  if(alpha>8){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,size-1-y);maxY=Math.max(maxY,size-1-y);}
  if(!alpha)continue;
  for(let channel=0;channel<3;channel++)out[dest+channel]=Math.round(linearToSRGB(Math.min(1,pixels[source+channel]/alpha))*255);
 }
 // RGB-only dilation avoids black fringes in mip levels. Coverage stays
 // untouched, so the actual scanned leaf outline and branch gaps remain.
 for(let pass=0;pass<2;pass++){
  const prior=new Uint8ClampedArray(out);
  for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
   const offset=(y*size+x)*4;if(prior[offset+3]||prior[offset]||prior[offset+1]||prior[offset+2])continue;
   let found=-1;
   for(const delta of [-size,-1,1,size]){const next=offset+delta*4;if(prior[next]||prior[next+1]||prior[next+2]){found=next;break;}}
   if(found>=0){out[offset]=prior[found];out[offset+1]=prior[found+1];out[offset+2]=prior[found+2];}
  }
 }
 if(coveredPixels<1000)return {sourceCoveredPixels:coveredPixels,coveredPixels};
 // The model's 3D bounding box leaves about half the photographed card area
 // empty. Trim only that transparent exterior, keeping the full leaf outline
 // and a 3.25% margin. The output stays 512 px; no resolution is sacrificed.
 const width=maxX-minX+1,height=maxY-minY+1,cropSize=Math.min(size,Math.ceil(Math.max(width,height)*1.065));
 const cropX=T.MathUtils.clamp(Math.floor((minX+maxX+1-cropSize)/2),0,size-cropSize),cropY=T.MathUtils.clamp(Math.floor((minY+maxY+1-cropSize)/2),0,size-cropSize);
 const tileCanvas=document.createElement('canvas');tileCanvas.width=tileCanvas.height=size;
 const tileContext=tileCanvas.getContext('2d',{alpha:true});if(!tileContext)throw new Error('R3 canopy trim cannot obtain its local canvas');
 tileContext.putImageData(image,0,0);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 context.drawImage(tileCanvas,cropX,cropY,cropSize,cropSize,tile*size,0,size,size);
 const cropped=context.getImageData(tile*size,0,size,size).data;let outputCoverage=0;
 for(let i=3;i<cropped.length;i+=4)if(cropped[i]>127)outputCoverage++;
 return {sourceCoveredPixels:coveredPixels,coveredPixels:outputCoverage,cropBoundsPixels:[cropX,cropY,cropSize,cropSize],transparentExteriorAreaRemoved:1-cropSize*cropSize/(size*size),outputRGBAHash:pixelHash(cropped)};
}

function textureFromAtlas(renderer,pool,entry,cacheHit){
 const texture=new T.CanvasTexture(entry.canvas);texture.name='R3 jacaranda photographed crown atlas';texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;
 texture.repeat.set(1/VIEW_DIRECTIONS.length,1);texture.offset.set(0,0);texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
 // Copy metadata so per-scene consumers cannot alter the CPU cache's receipt.
 texture.userData={...structuredClone(entry.metadata),cacheHit,cpuAtlasCache:'successful distinct views only',originalBakeMs:entry.metadata.bakeMs,bakeMs:cacheHit?0:entry.metadata.bakeMs};
 return pool.own(texture);
}

/**
 * Bake the already decoded CC0 jacaranda into three crown impostors once per
 * owning scene. No source geometry/texture is changed or copied to disk.
 *
 * The returned atlas selects its first full-crown tile by texture transform,
 * so existing 0..1 card UVs work unchanged. Other directions are available by
 * cloning the texture and setting offset.x to the metadata view's offsetU.
 * Call before the scene's first visible render. This bounded GPU readback is
 * initialization work, not part of the animation loop or a near-tree model.
 */
export function createForestCanopyTexture(renderer,pool,sources){
 if(!renderer?.isWebGLRenderer||!sources?.stats?.assetsReady||!sources.matureTree?.scene)
  throw new Error('R3 canopy bake requires the renderer and complete local jacaranda sources');
 const cached=canopyAtlasCache.get(sources);if(cached)return textureFromAtlas(renderer,pool,cached,true);
 const started=performance.now(),canvas=document.createElement('canvas');canvas.width=TILE_SIZE*VIEW_DIRECTIONS.length;canvas.height=TILE_SIZE;
 const context=canvas.getContext('2d',{alpha:true});if(!context)throw new Error('R3 canopy bake cannot obtain its local canvas');
 const state=captureState(renderer),crown=cloneCrown(sources.matureTree.scene),scene=new T.Scene(),camera=new T.OrthographicCamera(),coverage=[],pixelHashes=[];
 const target=new T.WebGLRenderTarget(TILE_SIZE,TILE_SIZE,{format:T.RGBAFormat,type:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false,samples:Math.min(4,renderer.capabilities.maxSamples||0)});
 target.texture.name='temporary R3 crown radiance';target.texture.generateMipmaps=false;target.texture.colorSpace=T.LinearSRGBColorSpace;
 // Render-target dimensions are physical pixels. Renderer.setViewport would
 // multiply these by the main scene DPR and crop a 1.5x/2x display bake.
 target.viewport.set(0,0,TILE_SIZE,TILE_SIZE);target.scissor.set(0,0,TILE_SIZE,TILE_SIZE);target.scissorTest=false;
 const pixels=new Uint8Array(TILE_SIZE*TILE_SIZE*4);
 scene.add(crown.root);
 const ambient=new T.HemisphereLight(0xf2fff3,0x697565,1.7),sun=new T.DirectionalLight(0xfff9ee,2.1);
 const center=crown.bounds.getCenter(new T.Vector3()),span=crown.bounds.getSize(new T.Vector3()).length();
 sun.position.copy(center).add(new T.Vector3(-span,span*1.6,span));sun.target.position.copy(center);scene.add(ambient,sun,sun.target);
 try{
  renderer.xr.enabled=false;renderer.shadowMap.enabled=false;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=T.NoToneMapping;renderer.toneMappingExposure=1;
  renderer.autoClear=true;renderer.autoClearColor=true;renderer.autoClearDepth=true;renderer.autoClearStencil=true;
  renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0x000000,0);
  for(const [index,view]of VIEW_DIRECTIONS.entries()){
   // readRenderTargetPixels binds the resolved framebuffer. Rebind on EVERY
   // view so MSAA rendering cannot reuse/resolve the preceding view's buffer.
   renderer.setRenderTarget(target);
   frameCamera(camera,crown.bounds,view.direction);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,TILE_SIZE,TILE_SIZE,pixels);
   pixelHashes.push(pixelHash(pixels));
   const coverageResult=writeSRGBTile(context,pixels,TILE_SIZE,index);if(coverageResult.coveredPixels<1000)throw new Error(`R3 scanned canopy bake produced insufficient coverage: ${view.name} (${coverageResult.coveredPixels})`);coverage.push(coverageResult);
  }
  if(new Set(pixelHashes).size!==VIEW_DIRECTIONS.length)throw new Error(`R3 scanned canopy views are not distinct: ${pixelHashes.join(', ')}`);
  const entry={canvas,metadata:{source:'existing local CC0 jacaranda_tree_r2 scan',kind:'three view crown-only photographic impostor with empty exterior trimmed',primaryView:0,sourceLeafMeshes:crown.meshes,sourceLeafTriangles:crown.triangles,sourceBoundsM:{min:crown.bounds.min.toArray(),max:crown.bounds.max.toArray()},atlasPixels:[canvas.width,canvas.height],tilePixels:[TILE_SIZE,TILE_SIZE],views:VIEW_DIRECTIONS.map((view,index)=>({name:view.name,direction:view.direction,offsetU:index/VIEW_DIRECTIONS.length,repeatU:1/VIEW_DIRECTIONS.length,...coverage[index],rawRGBAHash:pixelHashes[index]})),pixelHashAlgorithm:'FNV-1a32 over raw RGBA readback',distinctViewsVerified:true,sourceTemplatesUnchanged:true,trunkMeshesExcluded:true,transientGPUResourcesDisposed:true,bakeMs:performance.now()-started,usage:'Use neutral/light foliage tint; texture already contains scanned leaf colour. Curved clusters remain a distant approximation.'}};
  canopyAtlasCache.set(sources,entry);
  return textureFromAtlas(renderer,pool,entry,false);
 }finally{
  restoreState(renderer,state);target.dispose();
  for(const material of crown.materials)material.dispose();
  for(const geometry of crown.geometries)geometry.dispose();
  for(const texture of crown.textures.values())texture.dispose();
  // Source images/geometry remain untouched; only the final atlas stays owned.
  scene.clear();
 }
}
