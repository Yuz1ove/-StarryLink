import * as T from 'three';
import {GLTFLoader} from '../assets/vendor/loaders/GLTFLoader.js';

// Immutable source objects are CPU-side templates. Every rendered scene owns
// cloned geometry, materials and texture handles, so switching scenes is safe.
const ROOT = new URL('../assets/coastal/r2/', import.meta.url);
let pendingSources;
const assetURL = path => new URL(path, ROOT).href;
const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
 'alphaMap', 'emissiveMap', 'bumpMap', 'displacementMap', 'specularIntensityMap',
 'specularColorMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap'];

function requireTexture(texture, label) {
 if (!texture?.isTexture || !texture.image?.width || !texture.image?.height)
  throw new Error(`R2 asset texture missing or undecoded: ${label}`);
}

function inspectModel(model, label, expectedMeshes) {
 let meshes = 0, triangles = 0;
 model.scene.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  if (!object.geometry?.attributes.position?.count)
   throw new Error(`R2 model has no geometry: ${label}/${object.name}`);
  triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
   for (const key of ['map', 'normalMap', 'roughnessMap'])
    requireTexture(material?.[key], `${label}/${object.name}/${key}`);
  }
 });
 if (meshes !== expectedMeshes) throw new Error(`R2 unexpected mesh count: ${label} ${meshes}`);
 return {meshes, triangles};
}

/** Reject any missing model or map. A partial asset set is not a realism pass. */
export function loadR2Sources() {
 if (pendingSources) return pendingSources;
 pendingSources = (async () => {
  const errors = [], manager = new T.LoadingManager();
  manager.onError = url => errors.push(url);
  const models = new GLTFLoader(manager), images = new T.TextureLoader(manager);
  const loadedURLs = [];
  const load = (path, model = false) => {
   const url = assetURL(path); loadedURLs.push(url);
   return (model ? models : images).loadAsync(url).catch(error => {
    throw new Error(`R2 asset load failed: ${url}: ${error?.message || 'request failed'}`);
   });
  };
  const descriptors = [
   ['pineSapling', 'pine_sapling_small/pine_sapling_small_r2.glb', true],
   ['matureTree', 'jacaranda_tree/jacaranda_tree_r2.glb', true],
   ['shrub03', 'shrub_03/shrub_03_1k.gltf', true],
   ['shrubAlpha', 'shrub_03/textures/shrub_03_alpha_1k.png'],
   ['concreteDiffuse', 'concrete_wall_006/concrete_wall_006_diff_1k.jpg'],
   ['concreteNormal', 'concrete_wall_006/concrete_wall_006_nor_gl_1k.jpg'],
   ['concreteRoughness', 'concrete_wall_006/concrete_wall_006_rough_1k.jpg'],
   ['bankDiffuse', 'river_small_rocks/river_small_rocks_diff_1k.jpg'],
   ['bankNormal', 'river_small_rocks/river_small_rocks_nor_gl_1k.jpg'],
   ['bankRoughness', 'river_small_rocks/river_small_rocks_rough_1k.jpg'],
   ['plasterDiffuse', 'white_plaster_02/white_plaster_02_diff_1k.jpg'],
   ['plasterNormal', 'white_plaster_02/white_plaster_02_nor_gl_1k.jpg'],
   ['plasterRoughness', 'white_plaster_02/white_plaster_02_rough_1k.jpg'],
  ];
  const results = await Promise.allSettled(descriptors.map(([, path, model]) => load(path, model)));
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length || errors.length) {
   const detail = [...failed.map(result => result.reason.message), ...errors].join('; ');
   throw new Error(`R2 source set is incomplete: ${detail}`);
  }
  const source = Object.fromEntries(descriptors.map(([name], i) => [name, results[i].value]));
  source.shrubAlpha.flipY = false;
  source.shrubAlpha.colorSpace = T.NoColorSpace;
  source.shrubAlpha.needsUpdate = true;
  requireTexture(source.shrubAlpha, 'shrubAlpha');
  source.shrub03.scene.traverse(object => {
   if (!object.isMesh) return;
   object.material.alphaMap = source.shrubAlpha;
   object.material.alphaTest = .45;
   object.material.transparent = false;
   object.material.side = T.DoubleSide;
  });
  for (const name of ['concrete', 'bank', 'plaster']) {
   for (const suffix of ['Diffuse', 'Normal', 'Roughness']) {
    const texture = source[name + suffix];
    requireTexture(texture, name + suffix);
    texture.colorSpace = suffix === 'Diffuse' ? T.SRGBColorSpace : T.NoColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;
   }
  }
  source.stats = Object.freeze({assetsReady: true, sourcePolicy: 'local-CC0-verified',
   pineSapling: inspectModel(source.pineSapling, 'pineSapling', 2),
   matureTree: inspectModel(source.matureTree, 'matureTree', 3),
   shrub03: inspectModel(source.shrub03, 'shrub03', 4),
   pbrMaps: 9, alphaMasks: 1, topLevelAssetURLs: loadedURLs,
   declaredAssetBytes: 6275532 + 10694488 + 1707862 + 2219497 + 3037157 + 1475429});
  return Object.freeze(source);
 })().catch(error => {
  // A repaired local asset can be retried by the existing Reload 3D control.
  // Only a complete successful source set remains cached across scene switches.
  pendingSources = undefined;
  throw error;
 });
 return pendingSources;
}

/** One cache per scene; clones never dispose the module's CPU source templates. */
export function createR2CloneCache(pool) {
 const textureCache = new Map(), materialCache = new Map();
 const texture = source => {
  if (!source) return null;
  if (!textureCache.has(source)) {
   const copy = pool.own(source.clone());
   copy.needsUpdate = true;
   textureCache.set(source, copy);
  }
  return textureCache.get(source);
 };
 const material = source => {
  if (!materialCache.has(source)) {
   const copy = pool.own(source.clone());
   for (const key of textureSlots) if (source[key]?.isTexture) copy[key] = texture(source[key]);
   materialCache.set(source, copy);
  }
  return materialCache.get(source);
 };
 return {texture, material};
}

export function createR2Materials(pool, sources) {
 if (!sources?.stats?.assetsReady) throw new Error('R2 materials require verified sources');
 const clone = createR2CloneCache(pool);
 const make = (key, name, normalStrength, roughness) => {
  const material = pool.own(new T.MeshStandardMaterial({name, color: 0xffffff,
   map: clone.texture(sources[key + 'Diffuse']),
   normalMap: clone.texture(sources[key + 'Normal']),
   roughnessMap: clone.texture(sources[key + 'Roughness']),
   normalScale: new T.Vector2(normalStrength, normalStrength), roughness, metalness: 0}));
  material.userData = {source: 'Poly Haven CC0', tileMeters: key === 'concrete' ? 2 : key === 'plaster' ? 1 : 2.9};
  return material;
 };
 const facade=make('plaster', 'R2 fine mineral plaster · 1m tile', .18, .95);
 // Architecture uses metric UVs divided by 2; this scan covers one metre.
 for(const key of ['map','normalMap','roughnessMap'])facade[key].repeat.set(2,2);
 return {r2Facade:facade,r2Concrete: make('concrete', 'R2 weathered concrete · 2m tile', .46, .95),
  r2Bank: make('bank', 'R2 river gravel · 2.9m tile', .65, 1)};
}
