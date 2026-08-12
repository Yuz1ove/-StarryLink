import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (file) => readFile(new URL(file, import.meta.url), "utf8");

const [transitions, homeHero, hologram, architecture, matrix, matrixContract, starfield, store, app, server, packageJson, styles] = await Promise.all([
  source("./starrylink-transitions.js"),
  source("./home-hero.js"),
  source("./demo-hologram.js"),
  source("./architecture-page.js"),
  source("./matrix-compute-console.js"),
  source("./matrix-score-contract.js"),
  source("./starfield.js"),
  source("./demoStore.js"),
  source("./app.js"),
  source("./api_server.py"),
  source("./package.json"),
  source("./styles.css"),
]);

// Historical cinematic-loader assertions are kept as migration evidence only.
if (false) {
assert.match(transitions, /function addUnifiedTimeline\(/, "the shared cinematic route timeline is missing");
for (const builder of ["addRecollection", "addHexRoutes", "addCircuitAssembly", "addPolygonLock", "addFacetCalibration"]) {
  assert.doesNotMatch(transitions, new RegExp(`function ${builder}\\(`), `destination-specific transition returned: ${builder}`);
}
for (const state of ["idle", "entering", "core-forming", "routing", "calibrating", "ready", "revealing", "settled"]) {
  assert.match(transitions, new RegExp(`"${state}"`), `route transition state is missing: ${state}`);
}
for (const stage of ["enter", "core-form", "routing", "calibration", "ready", "reveal", "settled"]) {
  assert.match(transitions, new RegExp(`addLabel\\("${stage}"`), `shared route transition stage is missing: ${stage}`);
}
assert.match(transitions, /const UNIFIED_MODE = "cinematic-link-sync"/, "unified cinematic link-sync mode is missing");
assert.match(transitions, /sequence:\s*"identical-for-all-routes"/, "identical route-sequence inspection contract is missing");
for (const mode of ["recollection", "hex-route", "circuit-assembly", "polygon-lock", "facet-calibration"]) {
  assert.doesNotMatch(transitions, new RegExp(`mode:\\s*"${mode}"`), `destination-specific mode returned: ${mode}`);
}
for (const state of ["booting", "assets-loading", "scene-ready", "ready", "revealing", "complete"]) {
  assert.match(transitions, new RegExp(`"${state}"`), `initial loading state is missing: ${state}`);
}
assert.match(transitions, /desktop:\s*Object\.freeze\(\{ route: 4\.8, initial: 5\.2 \}\)/, "desktop cinematic durations are missing");
assert.match(transitions, /compact:\s*Object\.freeze\(\{ route: 4\.2, initial: 4\.4 \}\)/, "mobile cinematic durations are missing");
assert.match(transitions, /reduced:\s*Object\.freeze\(\{ route: 0\.65, initial: 0\.65 \}\)/, "reduced-motion duration is missing");
assert.match(transitions, /const READINESS_TIMEOUT = 12000/, "asset-readiness timeout is missing");
assert.match(transitions, /motion"\)\s*===\s*"reduce"/, "route transitions need a deterministic reduced-motion browser hook");
assert.match(transitions, /prefersReducedMotion\(\)/, "route transition reduced-motion predicate is missing");
assert.match(transitions, /gateTimelineForReady\(job, next\)/, "the 88 percent calibration hold must wait for page readiness");
assert.match(transitions, /progress:\s*100/, "the cinematic timeline must explicitly complete progress");
assert.match(transitions, /queuedJob = job/, "latest-choice queue handling is missing");
assert.match(transitions, /timelineCount:\s*timeline \? 1 : 0/, "single-timeline inspection contract is missing");
assert.match(transitions, /clearProps: "opacity,transform,filter,clip-path,visibility,will-change"/, "page inline-style cleanup is missing");
assert.match(transitions, /class CommunicationCoreRenderer/, "bounded communication-core renderer is missing");
assert.match(transitions, /new THREE\.WebGLRenderer\(/, "Three.js WebGL renderer is missing");
assert.match(transitions, /new THREE\.ShaderMaterial\(/, "volumetric shader material is missing");
assert.match(transitions, /import\("\.\/assets\/vendor\/three\.module\.js"\)/, "local Three.js module integration is missing");
assert.match(transitions, /const dprCap = 1\.5/, "bounded WebGL DPR cap is missing");
assert.match(transitions, /orbitCount:/, "magnetic orbit inspection contract is missing");
assert.match(transitions, /beamCount:/, "routing beam inspection contract is missing");
assert.match(transitions, /nodeCount:/, "calibration node inspection contract is missing");
assert.match(transitions, /document\.fonts\?\.ready/, "real font readiness gate is missing");
assert.match(transitions, /typeof (?:image|probe)\.decode === "function"/, "critical image decode gate is missing");
assert.match(transitions, /Promise\.allSettled\(tasks\)/, "fault-tolerant initial asset gate is missing");
assert.match(transitions, /sessionStorage\.getItem\(SESSION_KEY\)/, "session cache guard is missing");
assert.doesNotMatch(transitions, /document\.startViewTransition/, "native snapshot transition must not bypass the GSAP director");
assert.doesNotMatch(transitions, /setInterval\(/, "route transitions must not introduce a permanent timer");
assert.doesNotMatch(transitions, /\.mp4|tech-loading-reference|transition-honeycomb-field/, "production transitions must not embed reference media or the retired honeycomb wall");
assert.match(styles, /\.starry-transition-layer\.slt-cinematic-layer\[data-sequence="unified"\]/, "cinematic route layer styling is missing");
assert.match(styles, /\.slt-cinematic-object[\s\S]*width:\s*clamp\(292px, 31vw, 452px\)/, "desktop communication-core sizing is missing");
assert.match(styles, /\.slt-cinematic-veil[\s\S]*mask-image:\s*radial-gradient/, "core-led radial reveal mask is missing");
assert.match(styles, /max-width:\s*760px[\s\S]*width:\s*clamp\(238px, 72vw, 306px\)/, "compact communication-core sizing is missing");
assert.doesNotMatch(styles, /\.slt-honeycomb-/, "the retired full-screen honeycomb wall returned");
assert.doesNotMatch(styles, /\.slt-unified-core/, "the removed convergence core styling returned");
assert.doesNotMatch(styles, /\.slt-unified-echo/, "the removed duplicate echo styling returned");
assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.slt-cinematic-canvas/, "reduced-motion visual simplification is missing");
assert.match(styles, /has-starry-transition-director[\s\S]*\.architecture-entry/, "legacy Architecture route aperture must be disabled by the shared director");
}

// Four-layer relay assertions are retained only as migration evidence.
if (false) {
for (const relayState of ["idle", "wake", "capture", "rebuild", "synchronize", "locked", "reveal", "complete", "error"]) {
  assert.match(transitions, new RegExp('"' + relayState + '"'), "four-layer relay state is missing: " + relayState);
}
for (const relayStage of ["wake", "capture", "rebuild", "sync-star", "sync-air", "sync-ground", "sync-sea", "locked", "readiness-gate", "complete-lock", "reveal", "complete"]) {
  assert.match(transitions, new RegExp('addLabel\\("' + relayStage + '"'), "long relay stage is missing: " + relayStage);
}
for (const shortStage of ["capture", "synchronize", "commit", "locked", "complete-lock", "reveal", "complete"]) {
  assert.match(transitions, new RegExp('addLabel\\("' + shortStage + '"'), "short relay stage is missing: " + shortStage);
}
assert.match(transitions, /const MODE = "four-layer-relay-initiation"/, "four-layer relay mode is missing");
assert.match(transitions, /sequence:\s*"long-initial-short-destination-aware"/, "destination-aware inspection contract is missing");
assert.match(transitions, /desktop:\s*Object\.freeze\(\{ route: 1\.55, initial: 6\.2 \}\)/, "desktop relay durations are missing");
assert.match(transitions, /compact:\s*Object\.freeze\(\{ route: 1\.55, initial: 6\.2 \}\)/, "mobile relay durations are missing");
assert.match(transitions, /reduced:\s*Object\.freeze\(\{ route: 0\.38, initial: 0\.46 \}\)/, "reduced-motion duration is missing");
for (const relayLayer of ["star", "air", "ground", "sea"]) {
  assert.match(transitions, new RegExp(relayLayer + ':\\s*0'), "relay visual state is missing: " + relayLayer);
  assert.match(transitions, new RegExp('setLayerState\\("' + relayLayer + '",\\s*"locked"'), "relay lock beat is missing: " + relayLayer);
}
for (const arrival of ["orbit", "map", "platform", "matrix", "runtime"]) {
  assert.match(transitions, new RegExp('"' + arrival + '"'), "destination arrival mode is missing: " + arrival);
}
assert.match(transitions, /const READINESS_TIMEOUT = 12000/, "asset-readiness timeout is missing");
assert.match(transitions, /motion"\)\s*===\s*"reduce"/, "route transitions need a deterministic reduced-motion browser hook");
assert.match(transitions, /gateTimelineForReady\(job, next\)/, "the 94 percent lock must wait for page readiness");
assert.match(transitions, /progress:\s*100/, "the relay timeline must explicitly complete progress");
assert.match(transitions, /showReadinessError\(job, next\)/, "readiness failure UI is missing");
assert.match(transitions, /retryButton\.addEventListener\("click", retryReadiness\)/, "readiness retry action is missing");
assert.match(transitions, /queuedJob = job/, "latest-choice queue handling is missing");
assert.match(transitions, /timelineCount:\s*timeline \? 1 : 0/, "single-timeline inspection contract is missing");
assert.match(transitions, /clearProps: "opacity,transform,filter,visibility,will-change"/, "page inline-style cleanup is missing");
assert.match(transitions, /class RelayLifeCoreRenderer/, "living relay-core renderer is missing");
assert.match(transitions, /new THREE\.WebGLRenderer\(/, "Three.js WebGL renderer is missing");
assert.match(transitions, /new THREE\.ShaderMaterial\(/, "opalescent shader material is missing");
assert.match(transitions, /updateFibers\(time\)/, "continuously regenerating fiber field is missing");
assert.match(transitions, /createLayerPaths\(\)/, "four differentiated relay paths are missing");
assert.match(transitions, /import\("\.\/assets\/vendor\/three\.module\.js"\)/, "local Three.js module integration is missing");
assert.match(transitions, /compactViewport\.matches \? 1\.35 : 1\.75/, "bounded responsive WebGL DPR cap is missing");
assert.match(transitions, /document\.addEventListener\("visibilitychange", this\.handleVisibility\)/, "background-tab renderer pause is missing");
assert.match(transitions, /document\.fonts\?\.ready/, "real font readiness gate is missing");
assert.match(transitions, /typeof (?:image|probe)\.decode === "function"/, "critical image decode gate is missing");
assert.match(transitions, /Promise\.allSettled\(tasks\)/, "fault-tolerant asset gate is missing");
assert.match(transitions, /sessionStorage\.getItem\(SESSION_KEY\)/, "session cache guard is missing");
assert.doesNotMatch(transitions, /SYSTEM READY|INITIALIZING|LOADING SYSTEM|ACCESS GRANTED/, "generic HUD copy returned");
assert.doesNotMatch(transitions, /document\.startViewTransition/, "native snapshot transition must not bypass the GSAP director");
assert.doesNotMatch(transitions, /setInterval\(/, "route transitions must not introduce a permanent timer");
assert.doesNotMatch(transitions, /\.mp4|tech-loading-reference|transition-honeycomb-field/, "production transitions must not embed reference media or the retired honeycomb wall");
assert.match(styles, /\.starry-transition-layer\.slt-relay-layer\[data-sequence="four-layer-relay"\]/, "four-layer relay styling is missing");
assert.match(styles, /\.slt-relay-veil[\s\S]*mask-image:\s*radial-gradient/, "energy-wave radial reveal mask is missing");
assert.match(styles, /\.slt-relay-layer-label\[data-relay-layer="star"\]/, "desktop star-layer composition is missing");
assert.match(styles, /max-width:\s*760px[\s\S]*\.slt-relay-layer-label\[data-relay-layer="sea"\]/, "mobile relay recomposition is missing");
assert.match(styles, /\.slt-relay-error button:focus-visible/, "retry focus treatment is missing");
assert.doesNotMatch(styles, /\.slt-honeycomb-/, "the retired full-screen honeycomb wall returned");
assert.doesNotMatch(styles, /\.slt-unified-core/, "the removed convergence core styling returned");
assert.doesNotMatch(styles, /\.slt-unified-echo/, "the removed duplicate echo styling returned");
assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.slt-relay-canvas/, "reduced-motion visual simplification is missing");
assert.match(styles, /has-starry-transition-director[\s\S]*\.architecture-entry/, "legacy Architecture route aperture must be disabled by the relay director");
}

for (const signalState of ["idle", "dimming", "assembling", "routing", "relocking", "ready", "revealing", "complete"]) {
  assert.match(transitions, new RegExp('"' + signalState + '"'), "signal-matrix state is missing: " + signalState);
}
for (const signalStage of ["dim", "first-slice", "multi-axis-routing", "progressive-relock", "readiness-gate", "final-lock", "link-established", "line-reveal", "settled"]) {
  assert.match(transitions, new RegExp('addLabel\\("' + signalStage + '"'), "signal-matrix stage is missing: " + signalStage);
}
assert.match(transitions, /const MODE = "signal-matrix-routing"/, "signal-matrix routing mode is missing");
assert.match(transitions, /sequence:\s*"single-signal-matrix-all-routes"/, "shared signal-matrix sequence contract is missing");
assert.match(transitions, /desktop:\s*Object\.freeze\(\{ route: 6\.7, initial: 6\.7, minimum: 6\.2 \}\)/, "desktop signal-matrix timing is missing");
assert.match(transitions, /compact:\s*Object\.freeze\(\{ route: 6\.7, initial: 6\.7, minimum: 6\.2 \}\)/, "mobile signal-matrix timing is missing");
assert.match(transitions, /reduced:\s*Object\.freeze\(\{ route: 0\.65, initial: 0\.65, minimum: 0\.5 \}\)/, "reduced-motion timing is missing");
for (const checkpoint of [22, 72, 92, 100]) {
  assert.match(transitions, new RegExp('progressTarget:\\s*' + checkpoint), "loading progress checkpoint is missing: " + checkpoint);
}
assert.match(transitions, /const READINESS_TIMEOUT = 12000/, "asset-readiness timeout is missing");
assert.match(transitions, /motion"\)\s*===\s*"reduce"/, "route transitions need a deterministic reduced-motion browser hook");
assert.match(transitions, /gateTimelineForReady\(job, next\)/, "the 92 percent hold must wait for page readiness");
assert.match(transitions, /queuedJob = job/, "latest-choice queue handling is missing");
assert.match(transitions, /timelineCount:\s*timeline \? 1 : 0/, "single-timeline inspection contract is missing");
assert.match(transitions, /class SignalMatrixRenderer/, "bounded signal-matrix renderer is missing");
assert.match(transitions, /new THREE\.WebGLRenderer\(/, "Three.js WebGL renderer is missing");
assert.match(transitions, /new THREE\.MeshPhongMaterial\(/, "bounded reflective shell material is missing");
assert.doesNotMatch(transitions, /transmission:\s*0\.[1-9]/, "signal-matrix shells must not trigger the costly transmission render pass");
assert.match(transitions, /for \(let y = 1; y >= -1; y -= 1\)/, "3x3x3 cubelet construction is missing");
assert.match(transitions, /this\.slicePivot = new THREE\.Group\(\)/, "shared slice pivot is missing");
assert.match(transitions, /this\.slicePivot\.attach\(cubelet\)/, "cubelets must attach to the shared pivot");
assert.match(transitions, /this\.puzzleGroup\.attach\(cubelet\)/, "cubelets must reparent to the puzzle group after a turn");
assert.match(transitions, /move\.direction \* QUARTER_TURN/, "slice turns must use exact quarter turns");
assert.match(transitions, /rotateLogicalCoordinate\(/, "logical cubelet coordinates must update after a turn");
assert.match(transitions, /cubeletCount:/, "cubelet inspection contract is missing");
assert.match(transitions, /sliceCount:/, "slice-operation inspection contract is missing");
assert.match(transitions, /SIGNAL MATRIX \/ 訊號矩陣重組中/, "signal-matrix loading copy is missing");
assert.match(transitions, /LINK ESTABLISHED \/ 備援鏈路已建立/, "link-established completion copy is missing");
assert.doesNotMatch(transitions, /IcosahedronGeometry|SphereGeometry|createOrbit|createSurfaceParticles/, "retired sphere, particle or orbital renderer returned");
assert.match(transitions, /import\("\.\/assets\/vendor\/three\.module\.js"\)/, "local Three.js module integration is missing");
assert.match(transitions, /compactViewport\.matches \? 1\.25 : 1\.5/, "bounded responsive WebGL DPR cap is missing");
assert.match(transitions, /document\.addEventListener\("visibilitychange", this\.handleVisibility\)/, "background-tab renderer pause is missing");
assert.match(transitions, /document\.fonts\?\.ready/, "real font readiness gate is missing");
assert.match(transitions, /typeof (?:image|probe)\.decode === "function"/, "critical image decode gate is missing");
assert.match(transitions, /Promise\.allSettled\(tasks\)/, "fault-tolerant asset gate is missing");
assert.match(transitions, /sessionStorage\.getItem\(SESSION_KEY\)/, "session cache guard is missing");
assert.match(transitions, /if \(bootMode !== "auto"\) return false;/, "normal entry must show the home wordmark instead of the loading transition");
assert.doesNotMatch(transitions, /FOUR-LAYER|slt-relay|layer-label|scanline|SYSTEM READY|INITIALIZING|ACCESS GRANTED/, "retired HUD or four-layer relay UI returned");
assert.doesNotMatch(transitions, /document\.startViewTransition/, "native snapshot transition must not bypass the GSAP director");
assert.doesNotMatch(transitions, /setInterval\(/, "route transitions must not introduce a permanent timer");
assert.doesNotMatch(transitions, /\.mp4|reference-videos|transition-honeycomb-field/, "production transitions must not embed reference media or the retired honeycomb wall");
assert.match(styles, /\.starry-transition-layer\.slt-matrix-layer\[data-sequence="signal-matrix"\]/, "signal-matrix layer styling is missing");
assert.match(styles, /\.slt-matrix-object[\s\S]*width:\s*clamp\(220px, 18vw, 260px\)/, "desktop signal-matrix sizing is missing");
assert.match(styles, /\.slt-matrix-readout[\s\S]*width:\s*clamp\(360px, 30vw, 420px\)/, "desktop loading-rail sizing is missing");
assert.match(styles, /max-width:\s*760px[\s\S]*width:\s*clamp\(150px, 43vw, 180px\)/, "mobile signal-matrix sizing is missing");
assert.match(styles, /max-width:\s*760px[\s\S]*width:\s*min\(74vw, 280px\)/, "mobile loading-rail sizing is missing");
assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.slt-matrix-object[\s\S]*display:\s*none/, "reduced-motion must remove complex 3D motion");
assert.match(styles, /\.slt-matrix-sweep[\s\S]*linear-gradient/, "cyan line-reveal styling is missing");
assert.match(styles, /has-starry-transition-director[\s\S]*\.architecture-entry/, "legacy Architecture route aperture must be disabled by the signal-matrix director");
assert.match(homeHero, /function resumeAfterTransition\(\)[\s\S]*if \(pageActive\) replayBrandEntrance\(\);[\s\S]*syncAnimationState\(\);/, "home wordmark entrance must replay after the transition overlay is removed");

assert.match(hologram, /1000\s*\/\s*30/, "hologram frame rate should remain capped at 30fps");
assert.match(hologram, /Math\.min\(1\.25,\s*global\.devicePixelRatio/, "hologram DPR cap regressed");
assert.match(hologram, /compactViewport\.matches\s*\?\s*120\s*:\s*260/, "hologram particle budget regressed");
assert.match(architecture, /Array\.from\(\{\s*length:\s*120\s*\}/, "architecture particle budget regressed");
assert.match(architecture, /Math\.min\(1\.25,\s*global\.devicePixelRatio/, "architecture DPR cap regressed");
assert.match(matrix, /prefers-reduced-motion:\s*reduce/, "Matrix reduced-motion branch is missing");
assert.match(matrix, /motion"\)\s*===\s*"reduce"/, "Matrix deterministic reduced-motion browser hook is missing");
assert.match(matrix, /prefersReducedMotion\(\)/, "Matrix reduced-motion predicate is missing");
assert.match(matrix, /timeline\?\.kill\(\)/, "Matrix timeline cleanup is missing");
assert.doesNotMatch(matrix, /setInterval\(/, "Matrix must not introduce a continuous timer");
assert.match(matrix, /IDLE:\s*"idle"/, "Matrix idle state is missing");
assert.match(matrix, /ARMING:\s*"arming"/, "Matrix arming state is missing");
assert.match(matrix, /CALCULATING:\s*"calculating"/, "Matrix calculating state is missing");
assert.match(matrix, /THRESHOLDING:\s*"thresholding"/, "Matrix thresholding state is missing");
assert.match(matrix, /RESULT:\s*"result"/, "Matrix result state is missing");
assert.match(matrix, /RESETTING:\s*"resetting"/, "Matrix resetting state is missing");
assert.doesNotMatch(matrix, /CAPPING|capping|displayFromRaw|rawFromEvidence/, "legacy raw-score capping stage returned");
assert.match(matrix, /items\.reduce\(\(sum,\s*item\)\s*=>\s*sum\s*\+\s*item\.earnedPoints,\s*0\)/, "Matrix total must directly reduce six earned scores");
assert.match(matrix, /0\.65\s*\+\s*index\s*\*\s*0\.54/, "Matrix evidence sequence timing changed");
assert.match(matrix, /addLabel\("thresholding",\s*4\.3\)/, "Matrix threshold stage timing changed");
assert.match(matrix, /addLabel\("result",\s*4\.85\)/, "Matrix result stage timing changed");
assert.match(matrix, /data-contract-signature/, "Matrix must reset when the score contract data changes");
assert.match(matrixContract, /maxTotal\s*!==\s*100/, "Matrix contract must fail when maxima do not total 100");
assert.match(matrixContract, /indicators\.reduce\(\(sum,\s*indicator\)\s*=>\s*sum\s*\+\s*indicator\.earnedPoints,\s*0\)/, "Matrix contract total must be a direct earned-point sum");
assert.doesNotMatch(matrixContract, /rawRiskScore|displayRiskScore|clamp\(raw/i, "Matrix contract must not inherit the legacy raw/cap model");
assert.match(starfield, /attributeFilter:\s*\["data-active-page"\]/, "starfield observer must track only page state");
assert.doesNotMatch(starfield, /observer\.observe\([^;]+subtree:\s*true/s, "broad starfield DOM observer returned");
assert.match(store, /setInterval\([\s\S]*?8000\)/, "fallback polling interval regressed");
assert.match(store, /eventSource\?\.close\(\)/, "SSE fallback must close failed streams");
assert.match(app, /if\s*\(state\.event\.script\.running\s*\|\|\s*hasInFlightPacket\)/, "idle risk loop guard regressed");
assert.match(app, /evidenceList\.dataset\.evidenceSignature\s*!==\s*evidenceSignature/, "Matrix evidence DOM must update only when the six-indicator signature changes");
assert.doesNotMatch(app, /actionType:\s*"healthcheck"[\s\S]{0,180}state:\s*current/, "healthcheck must not upload the full state");
assert.doesNotMatch(app, /setInterval\(\(\)\s*=>\s*\{[\s\S]{0,120}runDeploymentHealthCheck/, "deployment healthcheck must not run on a timer");
assert.match(server, /def sanitize_packet_log\(/, "server-side packet log compaction is missing");
assert.match(server, /if is_healthcheck:[\s\S]{0,160}else:\s*bump_version\(\)/, "healthchecks must not persist or broadcast a new state version");
assert.match(JSON.parse(packageJson).scripts.preview, /python3 api_server\.py/, "preview must use streaming Python server");

console.log("StarryLink transition and performance contracts passed.");
