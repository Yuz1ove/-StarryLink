import * as T from 'three';
import {terrainHeight} from './coastal-contract.js';
import {createR2CloneCache} from './coastal-r2-assets.js';
import {riverBankSurfaceHeight} from './coastal-r2-banks.js';
import {planHeroTrees} from './coastal-r3-vegetation-plan.js';

const PILOT = Object.freeze([-100, 430, -260, 330]);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const hash = (a, b) => {const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123; return n - Math.floor(n);};

function roadDistance(layout, x, z) {
 let nearest = Infinity;
 for (const road of layout.roads) for (let i = 1; i < road.points.length; i++) {
  const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
  const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
  const t = length2 ? clamp(((x - ax) * dx + (z - az) * dz) / length2) : 0;
  nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, z - az - t * dz) - road.widthM / 2);
 }
 return nearest;
}

/** Replace two saplings with a reduced mature-tree source, keeping 14 plants. */
export function planR2Vegetation(layout) {
 const placements = [], [xmin, xmax, zmin, zmax] = PILOT;
 const safe = (x, z, kind) => {
  if (x < xmin + 7 || x > xmax - 7 || z < zmin + 7 || z > zmax - 7) return false;
  const height = terrainHeight(layout, x, z), river = layout.terrain.riverBaseZ + layout.terrain.riverAmplitude * Math.sin(x / 180);
  // The new bank skin ends at 110m from the river centre. Plants start above its
  // shoulder and do not sprout in the river, on piers or on the carriageway.
  if (height < 4 || Math.abs(z - river) < (kind === 'sapling' ? 120 : 114) || roadDistance(layout, x, z) < 12) return false;
  if (layout.buildings.some(b => Math.abs(b.x - x) < b.width / 2 + 10 && Math.abs(b.z - z) < b.depth / 2 + 10)) return false;
  const slope = Math.hypot(terrainHeight(layout, x + 3, z) - terrainHeight(layout, x - 3, z), terrainHeight(layout, x, z + 3) - terrainHeight(layout, x, z - 3)) / 6;
  return slope < .42 && placements.every(p => Math.hypot(p.x - x, p.z - z) > (kind === 'sapling' ? 26 : 8));
 };
 const preferredTrees = [[58,-126],[-50,-236],[89,285],[-53,224],[328,283],[399,-174]];
 const preferredShrubs = [[-61,195],[-29,285],[77,211],[111,-163],[235,-126],[341,-81],[345,310],[37,-123]];
 for (const [kind, desired, preferred] of [['sapling',6,preferredTrees],['shrub',8,preferredShrubs]]) {
  const candidates = preferred.concat(Array.from({length: 160}, (_, i) => [xmin + 18 + hash(i,kind === 'sapling' ? 44 : 74) * (xmax - xmin - 36), zmin + 18 + hash(i,92) * (zmax - zmin - 36)]));
  let count = 0;
  for (const [x,z] of candidates) {
   if (!safe(x,z,kind)) continue;
   placements.push({kind,x,z,heightM: kind === 'sapling' ? 2 + hash(count,811) : .4 + hash(count,127) * .5,
    rotation: hash(count,kind === 'sapling' ? 363 : 843) * Math.PI * 2, variant: count % 4});
   if (++count === desired) break;
  }
  if (count !== desired) throw new Error(`R2 vegetation placement failed: ${kind} ${count}/${desired}`);
 }
 const preferredMature = [[89,285],[399,-174]];
 const candidates = preferredMature.map(([x,z]) => placements.find(p => p.kind === 'sapling' && Math.hypot(p.x-x,p.z-z)<.01))
  .concat(placements.filter(p => p.kind === 'sapling')).filter(Boolean);
 let matureCount = 0;
 for (const plant of candidates) {
  if (plant.kind !== 'sapling') continue;
  // Mature source retains a 24m canopy before scaling down. A conservative
  // 13m crown radius protects neighbouring facades and the bridge roadway.
  const crownRadius = 13;
  if (roadDistance(layout,plant.x,plant.z) < crownRadius + 5) continue;
  if (layout.buildings.some(b => Math.hypot(Math.max(0,Math.abs(b.x-plant.x)-b.width/2),Math.max(0,Math.abs(b.z-plant.z)-b.depth/2)) < crownRadius + 3)) continue;
  // These are the existing fixture's nearby ground endpoints, not new RF or
  // coverage logic. Keep the larger canopy clear of their physical models.
  const localEndpoints = [[90,250],[-65,235],[-80,-215],[-135,135],[90,400],[420,-295]];
  if (localEndpoints.some(([x,z]) => Math.hypot(x-plant.x,z-plant.z) < crownRadius + 12)) continue;
  plant.kind = 'mature-tree'; plant.heightM = matureCount === 0 ? 13.2 : 13.9;
  plant.crownClearanceRadiusM = crownRadius;
  if (++matureCount === 2) break;
 }
 if (matureCount !== 2) throw new Error('R2 mature-tree crown clearance could not be satisfied');
 return placements;
}

function shadowMaterials(pool, material) {
 const settings = {map: material.map, alphaMap: material.alphaMap,
  alphaTest: material.alphaTest, alphaHash: material.alphaHash, side: T.DoubleSide};
 return {depth: pool.own(new T.MeshDepthMaterial({...settings, depthPacking: T.RGBADepthPacking})),
  distance: pool.own(new T.MeshDistanceMaterial(settings))};
}

// glTF quantized attributes must be decoded before baking a node's transform.
// BufferGeometry.applyMatrix4 writes back into the attribute's original array;
// leaving an int16 position here would quantize metre coordinates a second time.
function geometryForWorldBake(pool, source) {
 const geometry = pool.own(source.clone());
 for (const name of ['position', 'normal']) {
  const attribute = geometry.getAttribute(name);
  if (!attribute || (attribute.array instanceof Float32Array && !attribute.normalized)) continue;
  const values = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
   values[i * 3] = attribute.getX(i);
   values[i * 3 + 1] = attribute.getY(i);
   values[i * 3 + 2] = attribute.getZ(i);
  }
  geometry.setAttribute(name, new T.Float32BufferAttribute(values, 3));
 }
 return geometry;
}

export function buildR2Vegetation(pool, sources, layout, parent) {
 if (!sources?.stats?.assetsReady) throw new Error('R2 vegetation requires complete verified sources');
 const placements = planR2Vegetation(layout), copies = createR2CloneCache(pool);
 const group = new T.Group(); group.name = 'R2 bounded mature trees, saplings and riverbank vegetation'; parent.add(group);
 const [sx,sy,sz] = layout.renderScale, models = [], inverse = new T.Matrix4();
 sources.pineSapling.scene.updateMatrixWorld(true);
 inverse.copy(sources.pineSapling.scene.matrixWorld).invert();
 const treeBounds = new T.Box3().setFromObject(sources.pineSapling.scene);
 const treeHeight = treeBounds.max.y - treeBounds.min.y;
 if (!(treeHeight > 1 && treeHeight < 1.6)) throw new Error('R2 sapling source physical dimensions changed');
 sources.pineSapling.scene.traverse(object => {
  if (!object.isMesh) return;
  const geometry = geometryForWorldBake(pool, object.geometry);
  geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
  models.push({name:object.name, geometry, material:copies.material(object.material), kind:'sapling',
   minY:treeBounds.min.y, height:treeHeight, placements:placements.filter(p => p.kind === 'sapling')});
 });
 sources.matureTree.scene.updateMatrixWorld(true);
 inverse.copy(sources.matureTree.scene.matrixWorld).invert();
 const matureBounds = new T.Box3().setFromObject(sources.matureTree.scene);
 const matureHeight = matureBounds.max.y - matureBounds.min.y;
 if (!(matureHeight > 18 && matureHeight < 21)) throw new Error('R2 mature-tree source physical dimensions changed');
 sources.matureTree.scene.traverse(object => {
  if (!object.isMesh) return;
  const geometry = geometryForWorldBake(pool, object.geometry);
  geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,object.matrixWorld));
  const material = copies.material(object.material);
  if (object.name.endsWith('_leaves')) {
   // Fine leaflets average below a fixed MASK threshold in distant mip levels.
   // Hash alpha keeps their expected coverage without inflating the leaf cards.
   material.alphaTest = 0; material.alphaHash = true;
   material.transparent = false; material.side = T.DoubleSide;
  }
  models.push({name:object.name,geometry,material,kind:'mature-tree',
   minY:matureBounds.min.y,height:matureHeight,placements:placements.filter(p => p.kind === 'mature-tree')});
 });
 const shrubs = sources.shrub03.scene.children.filter(object => object.isMesh);
 if (shrubs.length !== 4) throw new Error('R2 shrub variants changed');
 shrubs.forEach((object, variant) => {
  const geometry = pool.own(object.geometry.clone()); geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  // Ignore source collection's x-axis sample arrangement; centre each plant.
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, 0, -(bounds.min.z + bounds.max.z) / 2);
  const material = copies.material(object.material);
  material.alphaTest = .45; material.transparent = false; material.side = T.DoubleSide;
  models.push({name:object.name, geometry, material, kind:'shrub', minY:bounds.min.y,
   height:bounds.max.y - bounds.min.y, placements:placements.filter(p => p.kind === 'shrub' && p.variant === variant)});
 });
 const dummy = new T.Object3D(); let triangles = 0;
 for (const model of models) {
  if (!model.placements.length || !(model.height > 0)) throw new Error(`R2 invalid vegetation model: ${model.name}`);
  const mesh = pool.own(new T.InstancedMesh(model.geometry, model.material, model.placements.length));
  mesh.name = 'R2 instanced ' + model.name;
  model.placements.forEach((p, i) => {
   const factor = p.heightM / model.height;
   const surfaceY = riverBankSurfaceHeight(layout,p.x,p.z,parent);
   dummy.position.set(p.x * sx, surfaceY - model.minY * factor * sy, p.z * sz);
   dummy.rotation.set(0,p.rotation,0); dummy.scale.set(factor * sx,factor * sy,factor * sz);
   dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
   p.groundRenderY = surfaceY;
   p.sourceHeightM = model.height; p.modelScaleFactor = factor;
  });
  mesh.castShadow = mesh.receiveShadow = true;
  if (model.material.alphaTest > 0 || model.material.alphaHash) {
   const shadow = shadowMaterials(pool,model.material);
   mesh.customDepthMaterial = shadow.depth; mesh.customDistanceMaterial = shadow.distance;
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  triangles += (model.geometry.index?.count ?? model.geometry.attributes.position.count) / 3 * model.placements.length;
  group.add(mesh);
 }
 // Two focal trees reuse the already decoded scan geometry and textures. Each
 // switches to a broad, horizontal-spray canopy beyond 17 world units; an
 // overview therefore does not multiply the 171,921-triangle mature source.
 const heroPlacements=planHeroTrees(layout),matureParts=models.filter(model=>model.kind==='mature-tree');
 for(const p of heroPlacements){
  const lod=new T.LOD(),near=new T.Group(),far=new T.Group();lod.name=p.id;
  lod.position.set(p.x*sx,riverBankSurfaceHeight(layout,p.x,p.z,parent),p.z*sz);lod.rotation.y=p.rotation;
  for(const model of matureParts){
   const factor=p.heightM/model.height,mesh=new T.Mesh(model.geometry,model.material);
   mesh.position.y=-model.minY*factor*sy;mesh.scale.set(factor*sx,factor*sy,factor*sz);mesh.castShadow=mesh.receiveShadow=true;
   if(model.material.alphaTest>0||model.material.alphaHash){const shadow=shadowMaterials(pool,model.material);mesh.customDepthMaterial=shadow.depth;mesh.customDistanceMaterial=shadow.distance;}
   near.add(mesh);
  }
  const h=p.heightM*sy,trunkMaterial=pool.materials.get('coastal-bark'),leafMaterial=pool.materials.get('coastal-foliage-deep');
  const trunk=new T.Mesh(pool.geometries.get('coastal-trunk'),trunkMaterial);trunk.scale.set(.006,h*.69,.006);trunk.position.y=h*.345;trunk.castShadow=trunk.receiveShadow=true;far.add(trunk);
  for(let i=0;i<2;i++){
   const canopy=new T.Mesh(pool.geometries.get('coastal-crown-wide'),leafMaterial);canopy.position.set(i?.06:-.03,h*(i?.64:.81),i?.04:0);canopy.scale.set(i?.135:.19,i?.10:.13,i?.14:.19);canopy.rotation.y=i*1.1;canopy.castShadow=canopy.receiveShadow=true;canopy.userData.fineDetail=i===1;far.add(canopy);
  }
  lod.addLevel(near,0);lod.addLevel(far,p.nearLODWorldDistance,.08);group.add(lod);
 }
 const range = kind => {const values = placements.filter(p => p.kind === kind).map(p => p.heightM); return [Math.min(...values),Math.max(...values)];};
 const stats = {assetsReady:true, treeInstances:6, saplingInstances:4, matureTreeInstances:2, shrubInstances:8, drawCalls:models.length,
  instancedTriangles:triangles, actualHeightRangeM:{saplings:range('sapling'),matureTrees:range('mature-tree'),shrubs:range('shrub')},
  physicalScale:'layout.renderScale; source models remain local-metre geometry',
  oldVegetationExclusionM:PILOT.slice(), placements, sourceModels:['pine_sapling_small_r2','jacaranda_tree_r2','shrub_03'],
  r3HeroTrees:{placements:heroPlacements,maximumAddedNearTriangles:heroPlacements.length*sources.stats.matureTree.triangles,addedOverviewTriangles:heroPlacements.length*((pool.geometries.get('coastal-trunk').index.count+2*pool.geometries.get('coastal-crown-wide').index.count)/3),sourceGeometryShared:true,distanceLOD:true,nearDistanceWorldUnits:17}};
 group.userData.r2Vegetation = stats; parent.userData.r2Vegetation = stats;
 return stats;
}
