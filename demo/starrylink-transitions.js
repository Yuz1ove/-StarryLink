(function initStarryLinkSignalMatrixTransition(global) {
  "use strict";

  const gsap = global.gsap;
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewport = global.matchMedia("(max-width: 760px)");
  const SESSION_KEY = "starrylink:signal-matrix-routing:v1";
  const READINESS_TIMEOUT = 12000;
  const MODE = "signal-matrix-routing";
  const GRID_SPACING = 0.59;
  const QUARTER_TURN = Math.PI * 0.5;
  const SLICE_DURATION = 0.62;
  const SLICE_SEQUENCE = Object.freeze([
    Object.freeze({ key: "top", axis: "y", layer: 1, direction: 1 }),
    Object.freeze({ key: "right", axis: "x", layer: 1, direction: -1 }),
    Object.freeze({ key: "middleZ", axis: "z", layer: 0, direction: 1 }),
  ]);
  const TIMING = Object.freeze({
    desktop: Object.freeze({ route: 6.7, initial: 6.7, minimum: 6.2 }),
    compact: Object.freeze({ route: 6.7, initial: 6.7, minimum: 6.2 }),
    reduced: Object.freeze({ route: 0.65, initial: 0.65, minimum: 0.5 }),
  });
  const pages = ["intro", "architecture", "demo", "matrix", "runtime"];
  const pageLabels = {
    intro: "作品介紹",
    architecture: "星海地空通訊架構",
    demo: "Demo 展示",
    matrix: "決策矩陣",
    runtime: "程式運行",
  };
  const transitionStates = new Set([
    "idle",
    "dimming",
    "assembling",
    "routing",
    "relocking",
    "ready",
    "revealing",
    "complete",
  ]);

  document.documentElement.classList.add("has-starry-transition-director", "has-signal-matrix-transition");

  function clamp(value, minimum, maximum) {
    return Math.max(minimum == null ? 0 : minimum, Math.min(maximum == null ? 1 : maximum, value));
  }

  function smoothstep(edge0, edge1, value) {
    const amount = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
  }

  function prefersReducedMotion() {
    return reducedMotion.matches || new URLSearchParams(global.location.search).get("motion") === "reduce";
  }

  function timingFor(options) {
    const settings = options || {};
    if (settings.reduced || prefersReducedMotion()) return TIMING.reduced[settings.boot ? "initial" : "route"];
    const group = settings.compact || compactViewport.matches ? TIMING.compact : TIMING.desktop;
    return group[settings.boot ? "initial" : "route"];
  }

  const layer = document.createElement("div");
  layer.className = "starry-transition-layer slt-matrix-layer";
  layer.hidden = true;
  layer.dataset.sequence = "signal-matrix";
  layer.dataset.state = "idle";
  layer.dataset.phase = "idle";
  layer.dataset.reduced = "false";
  layer.setAttribute("role", "status");
  layer.setAttribute("aria-live", "polite");
  layer.setAttribute("aria-atomic", "true");
  layer.innerHTML = [
    '<div class="slt-matrix-veil" aria-hidden="true"></div>',
    '<div class="slt-matrix-stage">',
    '  <div class="slt-matrix-object" aria-hidden="true">',
    '    <canvas class="slt-matrix-canvas" role="presentation"></canvas>',
    "  </div>",
    '  <div class="slt-matrix-readout">',
    '    <div class="slt-matrix-meta">',
    '      <p class="slt-matrix-status">SIGNAL MATRIX / 訊號矩陣重組中</p>',
    '      <output class="slt-matrix-progress-value" aria-hidden="true"><strong>0</strong><span>%</span></output>',
    "    </div>",
    '    <div class="slt-matrix-progress-track" role="progressbar" aria-label="StarryLink 訊號矩陣載入進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">',
    '      <i class="slt-matrix-progress-fill"></i>',
    '      <b class="slt-matrix-progress-head" aria-hidden="true"></b>',
    "    </div>",
    "  </div>",
    "</div>",
    '<div class="slt-matrix-sweep" aria-hidden="true"></div>',
  ].join("");
  document.body.append(layer);

  const announcement = document.createElement("div");
  announcement.className = "sr-only starry-page-announcement";
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  document.body.append(announcement);

  const veil = layer.querySelector(".slt-matrix-veil");
  const stage = layer.querySelector(".slt-matrix-stage");
  const object = layer.querySelector(".slt-matrix-object");
  const canvas = layer.querySelector(".slt-matrix-canvas");
  const readout = layer.querySelector(".slt-matrix-readout");
  const status = layer.querySelector(".slt-matrix-status");
  const progressMeter = layer.querySelector(".slt-matrix-progress-track");
  const progressValue = layer.querySelector(".slt-matrix-progress-value strong");
  const progressTrack = layer.querySelector(".slt-matrix-progress-track");
  const sweep = layer.querySelector(".slt-matrix-sweep");

  const visual = {
    formation: 0,
    seamEnergy: 0,
    seamSweep: 0,
    stability: 0,
    collapse: 0,
    visibility: 1,
    progress: 0,
    progressTarget: 0,
    pulse: 0,
  };
  const sliceMotion = { angle: 0 };
  let renderedProgress = -1;
  let renderedRoundedProgress = -1;
  let renderedPulse = -1;
  let progressRenderElapsed = 0;

  const layerColorStyle = global.getComputedStyle(layer);
  const rootColorStyle = global.getComputedStyle(document.documentElement);

  function tokenColor(name, fallback, THREE) {
    const layerValue = layerColorStyle.getPropertyValue(name).trim();
    const rootValue = rootColorStyle.getPropertyValue(name).trim();
    const value = layerValue || rootValue;
    try {
      return new THREE.Color(value || fallback);
    } catch (_error) {
      return new THREE.Color(fallback);
    }
  }

  function createRoundedBoxGeometry(size, radius, THREE) {
    const segments = 5;
    const source = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
    const geometry = source.toNonIndexed();
    source.dispose();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const halfSegment = 0.5 / segments;
    const inset = size * 0.5 - radius;
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    for (let index = 0; index < positions.length; index += 3) {
      position.fromArray(positions, index);
      normal.copy(position);
      normal.x -= Math.sign(normal.x) * halfSegment;
      normal.y -= Math.sign(normal.y) * halfSegment;
      normal.z -= Math.sign(normal.z) * halfSegment;
      normal.normalize();
      positions[index] = inset * Math.sign(position.x) + normal.x * radius;
      positions[index + 1] = inset * Math.sign(position.y) + normal.y * radius;
      positions[index + 2] = inset * Math.sign(position.z) + normal.z * radius;
      normals[index] = normal.x;
      normals[index + 1] = normal.y;
      normals[index + 2] = normal.z;
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  class SignalMatrixRenderer {
    constructor(target, state, THREE) {
      this.THREE = THREE;
      this.canvas = target;
      this.state = state;
      this.frameId = 0;
      this.startedAt = 0;
      this.staticMode = false;
      this.disposables = [];
      this.cubelets = [];
      this.outerMaterials = [];
      this.innerMaterials = [];
      this.dpr = 1;
      this.width = 0;
      this.height = 0;
      this.lastFrameAt = 0;
      this.floatTime = 0;
      this.floatingYaw = 0;
      this.activeSlice = null;
      this.tempPosition = new THREE.Vector3();
      this.tempQuaternion = new THREE.Quaternion();
      this.tempRotation = new THREE.Quaternion();
      this.tempMatrix = new THREE.Matrix4();
      this.axisVectors = Object.freeze({
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1),
      });

      this.renderer = new THREE.WebGLRenderer({
        canvas: target,
        alpha: true,
        antialias: (global.devicePixelRatio || 1) <= 1.5,
        powerPreference: "high-performance",
        premultipliedAlpha: true,
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
      this.camera.position.set(0, 0.04, 5.05);
      this.floatingGroup = new THREE.Group();
      this.puzzleGroup = new THREE.Group();
      this.slicePivot = new THREE.Group();
      this.slicePivot.position.set(0, 0, 0);
      this.puzzleGroup.add(this.slicePivot);
      this.floatingGroup.add(this.puzzleGroup);
      this.scene.add(this.floatingGroup);

      this.createLights();
      this.createMatrix();
      this.createEnergyCore();
      this.renderer.compile(this.scene, this.camera);

      this.resize = this.resize.bind(this);
      this.drawFrame = this.drawFrame.bind(this);
      this.handleVisibility = this.handleVisibility.bind(this);
      this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(this.resize) : null;
      this.resizeObserver?.observe(this.canvas);
      global.addEventListener("resize", this.resize, { passive: true });
      document.addEventListener("visibilitychange", this.handleVisibility);
    }

    track(resource) {
      this.disposables.push(resource);
      return resource;
    }

    createLights() {
      const THREE = this.THREE;
      this.scene.add(new THREE.AmbientLight(0x151a49, 1.34));

      const key = new THREE.DirectionalLight(0x7c6ede, 2.05);
      key.position.set(-4.2, 5.4, 4.8);
      this.scene.add(key);

      const rim = new THREE.DirectionalLight(0xd3d8eb, 1.28);
      rim.position.set(4.6, 1.2, -3.6);
      this.scene.add(rim);

      const indigo = new THREE.PointLight(0x5f53c4, 1.12, 5.4, 2);
      indigo.position.set(0.15, -0.08, 0.35);
      this.puzzleGroup.add(indigo);
    }

    createMatrix() {
      const THREE = this.THREE;
      const shadowIndigo = tokenColor("--slt-matrix-shadow", "#242a74", THREE);
      const titleBlue = tokenColor("--slt-matrix-base", "#394a9e", THREE);
      const mistPeriwinkle = tokenColor("--slt-matrix-periwinkle", "#7897e8", THREE);
      const lavenderViolet = tokenColor("--slt-matrix-lavender", "#a98bea", THREE);
      const softRoseViolet = tokenColor("--slt-matrix-rose", "#dda4d9", THREE);
      const icePearl = tokenColor("--slt-matrix-pearl", "#e8eeff", THREE);
      const coldReflection = tokenColor("--slt-matrix-reflection", "#9fb5ef", THREE);
      const edgeIndigo = tokenColor("--slt-matrix-edge", "#7f88ca", THREE);
      const colors = [shadowIndigo, titleBlue, mistPeriwinkle, lavenderViolet, softRoseViolet, icePearl];
      const paletteFamilies = ["shadow", "base", "periwinkle", "lavender", "rose", "pearl"];
      // Stable home-coordinate mapping in construction order (y desc, then z, then x).
      // Counts are exactly 6 / 5 / 5 / 4 / 4 / 3 and every outer 3x3 face
      // starts with at least five families, so no highlight or rose family is
      // hidden on one rear/interior plane.
      const paletteByCubelet = [
        2, 4, 3, 4, 5, 1, 1, 2, 4,
        0, 1, 4, 3, 0, 2, 5, 3, 0,
        1, 2, 0, 5, 0, 1, 2, 0, 3,
      ];
      const outerGeometry = this.track(createRoundedBoxGeometry(0.565, 0.034, THREE));
      const innerGeometry = this.track(new THREE.BoxGeometry(0.325, 0.325, 0.325));
      const edgeSource = this.track(new THREE.BoxGeometry(0.565, 0.565, 0.565));
      const edgeGeometry = this.track(new THREE.EdgesGeometry(edgeSource, 26));

      colors.forEach((color, index) => {
        const material = this.track(new THREE.MeshPhongMaterial({
          color,
          emissive: color,
          emissiveIntensity: [0.105, 0.082, 0.058, 0.052, 0.046, 0.022][index],
          specular: icePearl.clone().lerp(color, index === 5 ? 0.18 : 0.42),
          shininess: index === 0 ? 62 : index === 5 ? 94 : 78,
          transparent: false,
          opacity: 1,
          depthWrite: true,
        }));
        material.userData.baseEmissiveIntensity = [0.105, 0.082, 0.058, 0.052, 0.046, 0.022][index];
        this.outerMaterials.push(material);

        const coreColor = index <= 1
          ? lavenderViolet.clone().lerp(shadowIndigo, 0.3)
          : softRoseViolet.clone().lerp(color, 0.24);
        const coreMaterial = this.track(new THREE.MeshBasicMaterial({
          color: coreColor,
          transparent: true,
          opacity: 0.075,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        this.innerMaterials.push(coreMaterial);
      });

      let index = 0;
      for (let y = 1; y >= -1; y -= 1) {
        for (let z = -1; z <= 1; z += 1) {
          for (let x = -1; x <= 1; x += 1) {
            const paletteIndex = paletteByCubelet[index];
            const group = new THREE.Group();
            const shell = new THREE.Mesh(outerGeometry, this.outerMaterials[paletteIndex]);
            const hasInnerBlock = Math.abs(x) + Math.abs(y) + Math.abs(z) <= 1;
            const inner = hasInnerBlock ? new THREE.Mesh(innerGeometry, this.innerMaterials[paletteIndex]) : null;
            const edgeMaterial = this.track(new THREE.LineBasicMaterial({
              color: index === 13
                ? mistPeriwinkle
                : paletteIndex === 5
                  ? icePearl
                  : paletteIndex >= 3
                    ? coldReflection
                    : edgeIndigo,
              transparent: true,
              opacity: 0,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }));
            const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
            group.add(shell, edges);
            if (inner) group.add(inner);
            group.position.set(x * GRID_SPACING, y * GRID_SPACING, z * GRID_SPACING);
            group.userData.coord = { x, y, z };
            group.userData.seamOrder = Math.sqrt(x * x + y * y + z * z) / Math.sqrt(3);
            group.userData.paletteIndex = paletteIndex;
            group.userData.paletteFamily = paletteFamilies[paletteIndex];
            group.userData.homeCoord = { x, y, z };
            group.userData.edgeMaterial = edgeMaterial;
            group.userData.shell = shell;
            group.userData.inner = inner;
            this.cubelets.push(group);
            this.puzzleGroup.add(group);
            index += 1;
          }
        }
      }
    }

    createEnergyCore() {
      const THREE = this.THREE;
      const coreGeometry = this.track(new THREE.BoxGeometry(0.64, 0.64, 0.64, 3, 3, 3));
      this.energyMaterial = this.track(new THREE.MeshBasicMaterial({
        color: tokenColor("--slt-matrix-lavender", "#a98bea", THREE),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.energyCore = new THREE.Mesh(coreGeometry, this.energyMaterial);
      this.puzzleGroup.add(this.energyCore);
    }

    beginSlice(move) {
      if (!move || this.activeSlice) return false;
      const selected = this.cubelets.filter((cubelet) => cubelet.userData.coord[move.axis] === move.layer);
      if (selected.length !== 9) return false;
      this.slicePivot.position.set(0, 0, 0);
      this.slicePivot.quaternion.identity();
      this.slicePivot.updateMatrixWorld(true);
      selected.forEach((cubelet) => this.slicePivot.attach(cubelet));
      this.activeSlice = { move, cubelets: selected };
      this.updateSlice(0);
      return true;
    }

    updateSlice(angle) {
      if (!this.activeSlice) return;
      const axis = this.axisVectors[this.activeSlice.move.axis];
      this.slicePivot.quaternion.setFromAxisAngle(axis, angle);
    }

    rotateLogicalCoordinate(coord, axis, direction) {
      const x = coord.x;
      const y = coord.y;
      const z = coord.z;
      if (axis === "x") {
        coord.y = direction > 0 ? -z : z;
        coord.z = direction > 0 ? y : -y;
      } else if (axis === "y") {
        coord.x = direction > 0 ? z : -z;
        coord.z = direction > 0 ? -x : x;
      } else {
        coord.x = direction > 0 ? -y : y;
        coord.y = direction > 0 ? x : -x;
      }
    }

    snapQuaternion(quaternion) {
      this.tempMatrix.makeRotationFromQuaternion(quaternion);
      const elements = this.tempMatrix.elements;
      [0, 1, 2, 4, 5, 6, 8, 9, 10].forEach((index) => {
        elements[index] = Math.round(elements[index]);
      });
      quaternion.setFromRotationMatrix(this.tempMatrix).normalize();
    }

    completeSlice() {
      if (!this.activeSlice) return false;
      const { move, cubelets } = this.activeSlice;
      const finalAngle = move.direction * QUARTER_TURN;
      this.updateSlice(finalAngle);
      this.slicePivot.updateMatrixWorld(true);
      cubelets.forEach((cubelet) => {
        this.puzzleGroup.attach(cubelet);
        this.rotateLogicalCoordinate(cubelet.userData.coord, move.axis, move.direction);
        const coord = cubelet.userData.coord;
        cubelet.position.set(coord.x * GRID_SPACING, coord.y * GRID_SPACING, coord.z * GRID_SPACING);
        this.snapQuaternion(cubelet.quaternion);
      });
      this.slicePivot.quaternion.identity();
      this.slicePivot.updateMatrixWorld(true);
      this.activeSlice = null;
      return true;
    }

    resetPuzzle() {
      if (this.activeSlice) {
        const attached = [...this.activeSlice.cubelets];
        attached.forEach((cubelet) => this.puzzleGroup.attach(cubelet));
        this.activeSlice = null;
      }
      this.slicePivot.quaternion.identity();
      this.cubelets.forEach((cubelet, index) => {
        const x = index % 3 - 1;
        const z = Math.floor(index / 3) % 3 - 1;
        const y = 1 - Math.floor(index / 9);
        cubelet.userData.coord.x = x;
        cubelet.userData.coord.y = y;
        cubelet.userData.coord.z = z;
        cubelet.position.set(x * GRID_SPACING, y * GRID_SPACING, z * GRID_SPACING);
        cubelet.quaternion.identity();
      });
      sliceMotion.angle = 0;
    }

    inspectPuzzle() {
      const logicalCoordinates = new Set();
      const paletteCounts = {};
      const paletteMapping = [];
      let gridAlignedCount = 0;
      let orientationAlignedCount = 0;
      this.cubelets.forEach((cubelet) => {
        const coord = cubelet.userData.coord;
        const home = cubelet.userData.homeCoord;
        logicalCoordinates.add(coord.x + "," + coord.y + "," + coord.z);
        paletteCounts[cubelet.userData.paletteFamily] = (paletteCounts[cubelet.userData.paletteFamily] || 0) + 1;
        paletteMapping.push({
          home: [home.x, home.y, home.z],
          current: [coord.x, coord.y, coord.z],
          family: cubelet.userData.paletteFamily,
        });
        const alignedPosition = cubelet.parent === this.puzzleGroup
          && Math.abs(cubelet.position.x - coord.x * GRID_SPACING) < 0.00001
          && Math.abs(cubelet.position.y - coord.y * GRID_SPACING) < 0.00001
          && Math.abs(cubelet.position.z - coord.z * GRID_SPACING) < 0.00001;
        if (alignedPosition) gridAlignedCount += 1;
        this.tempMatrix.makeRotationFromQuaternion(cubelet.quaternion);
        const elements = this.tempMatrix.elements;
        const alignedOrientation = [0, 1, 2, 4, 5, 6, 8, 9, 10]
          .every((index) => Math.abs(elements[index] - Math.round(elements[index])) < 0.00001);
        if (alignedOrientation) orientationAlignedCount += 1;
      });
      return {
        logicalCoordinateCount: logicalCoordinates.size,
        gridAlignedCount,
        orientationAlignedCount,
        pivotChildren: this.slicePivot.children.length,
        pivotPosition: [this.slicePivot.position.x, this.slicePivot.position.y, this.slicePivot.position.z],
        paletteCounts,
        paletteMapping,
      };
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const cap = compactViewport.matches ? 1.25 : 1.5;
      this.dpr = Math.min(cap, global.devicePixelRatio || 1);
      this.width = rect.width;
      this.height = rect.height;
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(rect.width, rect.height, false);
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
      if (!this.frameId) this.draw(0, 0);
    }

    start(options) {
      const settings = options || {};
      this.stop();
      this.staticMode = Boolean(settings.staticMode);
      this.lastFrameAt = 0;
      this.resize();
      this.draw(0, 0);
      if (!this.staticMode && !document.hidden) this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    stop() {
      if (this.frameId) global.cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }

    handleVisibility() {
      if (document.hidden) this.stop();
      else if (!layer.hidden && !this.staticMode && layer.dataset.reduced !== "true") this.start();
    }

    drawFrame(timestamp) {
      this.frameId = 0;
      const deltaTime = this.lastFrameAt ? Math.min(0.05, Math.max(0, (timestamp - this.lastFrameAt) * 0.001)) : 0;
      this.lastFrameAt = timestamp;
      this.draw(timestamp, deltaTime);
      if (!layer.hidden && !this.staticMode && !document.hidden) {
        this.frameId = global.requestAnimationFrame(this.drawFrame);
      }
    }

    draw(_timestamp, deltaTime) {
      advanceVisualProgress(deltaTime);
      this.floatTime += deltaTime;
      const formation = clamp(this.state.formation);
      const stability = clamp(this.state.stability);
      const collapse = clamp(this.state.collapse);
      const visibility = clamp(this.state.visibility);
      const progress = clamp(this.state.progress / 100);
      const floatEnergy = 1 - stability * 0.76;
      const lineScale = Math.max(0.012, 1 - collapse * 0.988);
      const floatingRate = 0.04 + (1 - stability) * 0.03;
      this.floatingYaw += floatingRate * deltaTime;

      this.floatingGroup.visible = visibility > 0.002;
      this.floatingGroup.scale.set(
        (0.72 + formation * 0.28) * (1 + collapse * 0.16),
        (0.72 + formation * 0.28) * lineScale,
        (0.72 + formation * 0.28) * (1 + collapse * 0.12),
      );
      this.floatingGroup.position.y = Math.sin(this.floatTime * 0.86) * 0.055 * floatEnergy;
      this.floatingGroup.rotation.x = -0.43 + Math.sin(this.floatTime * 0.27) * 0.035 * floatEnergy;
      this.floatingGroup.rotation.y = 0.61 + this.floatingYaw + Math.sin(this.floatTime * 0.22) * 0.045 * floatEnergy;
      this.floatingGroup.rotation.z = -0.065 + Math.sin(this.floatTime * 0.31) * 0.045 * floatEnergy;

      this.outerMaterials.forEach((material) => {
        material.emissiveIntensity = material.userData.baseEmissiveIntensity
          + this.state.pulse * 0.032
          + this.state.seamSweep * 0.018;
      });
      this.innerMaterials.forEach((material, index) => {
        material.opacity = formation * visibility * (0.032 + progress * 0.045 + (index === 3 ? 0.025 : 0) + this.state.pulse * 0.018);
      });

      this.cubelets.forEach((cubelet) => {
        const seamOrder = cubelet.userData.seamOrder;
        const connected = smoothstep(seamOrder * 0.58, seamOrder * 0.58 + 0.34, this.state.seamEnergy);
        const radialSweep = Math.exp(-Math.abs(seamOrder - this.state.seamSweep) * 7.5);
        cubelet.userData.edgeMaterial.opacity = formation * visibility * (
          0.035 + connected * 0.12 + radialSweep * this.state.seamSweep * 0.34 + this.state.pulse * 0.08
        ) * (1 - collapse * 0.42);
      });

      this.energyCore.rotation.x += deltaTime * 0.11;
      this.energyCore.rotation.y -= deltaTime * 0.15;
      this.energyCore.scale.setScalar(0.82 + Math.sin(this.floatTime * 1.16) * 0.055 * floatEnergy + progress * 0.08);
      this.energyMaterial.opacity = formation * visibility * (0.026 + progress * 0.052 + this.state.pulse * 0.022) * (1 - collapse * 0.7);
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      this.stop();
      this.resizeObserver?.disconnect();
      global.removeEventListener("resize", this.resize);
      document.removeEventListener("visibilitychange", this.handleVisibility);
      this.disposables.forEach((resource) => resource.dispose?.());
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.canvas.width = 1;
      this.canvas.height = 1;
    }
  }

  class SignalMatrixCanvasFallbackRenderer {
    constructor(target, state) {
      this.canvas = target;
      this.state = state;
      this.context = target.getContext("2d", { alpha: true });
      this.frameId = 0;
      this.startedAt = 0;
      this.staticMode = false;
      this.dpr = 1;
      this.lastFrameAt = 0;
      this.resize = this.resize.bind(this);
      this.drawFrame = this.drawFrame.bind(this);
      global.addEventListener("resize", this.resize, { passive: true });
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || !this.context) return;
      this.dpr = Math.min(compactViewport.matches ? 1.25 : 1.5, global.devicePixelRatio || 1);
      this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.width = rect.width;
      this.height = rect.height;
      this.cellGradient = this.context.createLinearGradient(0, 0, rect.width, rect.height);
      this.cellGradient.addColorStop(0, "rgba(21,23,77,0.86)");
      this.cellGradient.addColorStop(0.58, "rgba(58,56,172,0.7)");
      this.cellGradient.addColorStop(1, "rgba(211,216,235,0.5)");
    }

    start(options) {
      this.stop();
      this.staticMode = Boolean(options?.staticMode);
      this.lastFrameAt = 0;
      this.resize();
      this.draw(0, 0);
      if (!this.staticMode && !document.hidden) this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    stop() {
      if (this.frameId) global.cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }

    drawFrame(timestamp) {
      this.frameId = 0;
      const deltaTime = this.lastFrameAt ? Math.min(0.05, Math.max(0, (timestamp - this.lastFrameAt) * 0.001)) : 0;
      this.lastFrameAt = timestamp;
      this.draw(timestamp, deltaTime);
      if (!layer.hidden && !this.staticMode && !document.hidden) this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    draw(elapsedMs, deltaTime) {
      const ctx = this.context;
      if (!ctx || !this.width || !this.height) return;
      advanceVisualProgress(deltaTime);
      const formation = clamp(this.state.formation) * clamp(this.state.visibility);
      const time = elapsedMs * 0.001;
      const size = this.width * 0.16;
      const gap = size * 0.1;
      const matrixSize = size * 3 + gap * 2;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.globalAlpha = formation;
      ctx.translate(this.width * 0.5, this.height * 0.5 + Math.sin(time * 0.8) * 3);
      ctx.rotate(-0.08 + Math.sin(time * 0.2) * 0.025);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          const x = -matrixSize * 0.5 + column * (size + gap);
          const y = -matrixSize * 0.5 + row * (size + gap);
          ctx.fillStyle = this.cellGradient;
          ctx.strokeStyle = "rgba(153,160,215,0.42)";
          ctx.lineWidth = 1;
          ctx.fillRect(x, y, size, size);
          ctx.strokeRect(x, y, size, size);
        }
      }
      ctx.restore();
    }

    beginSlice() { return true; }
    updateSlice() {}
    completeSlice() { return true; }
    resetPuzzle() { sliceMotion.angle = 0; }

    destroy() {
      this.stop();
      global.removeEventListener("resize", this.resize);
      this.canvas.width = 1;
      this.canvas.height = 1;
    }
  }

  let renderer = null;
  let rendererError = null;
  let timeline = null;
  let activeJob = null;
  let queuedJob = null;
  let state = "idle";
  let bootActive = false;
  let destroyed = false;
  let syncedPage = "";
  let lastRun = null;
  const gateReport = {
    state: "idle",
    timedOut: false,
    durationMs: 0,
    taskCount: 0,
    fulfilled: 0,
    rejected: 0,
    ok: true,
  };

  const rendererReady = import("./assets/vendor/three.module.js")
    .then((THREE) => {
      if (destroyed) return null;
      renderer = new SignalMatrixRenderer(canvas, visual, THREE);
      layer.dataset.renderer = "three-webgl-signal-matrix";
      return renderer;
    })
    .catch((error) => {
      rendererError = error?.message || "Three.js renderer initialization failed";
      try {
        const fallbackCanvas = canvas.cloneNode(false);
        canvas.replaceWith(fallbackCanvas);
        renderer = new SignalMatrixCanvasFallbackRenderer(fallbackCanvas, visual);
        layer.dataset.renderer = "canvas-signal-matrix";
        layer.dataset.rendererError = rendererError;
        return renderer;
      } catch (fallbackError) {
        rendererError += "; fallback: " + (fallbackError?.message || "canvas unavailable");
        layer.dataset.renderer = "unavailable";
        return null;
      }
    });

  function setState(next, job) {
    if (!transitionStates.has(next)) return;
    state = next;
    global.performance?.mark?.("starrylink:signal:state:" + next);
    layer.dataset.state = next;
    layer.dataset.phase = next;
    global.dispatchEvent(new CustomEvent("starrylink:signal-transition-state", {
      detail: {
        state: next,
        from: job?.from || null,
        to: job?.to || null,
        mode: MODE,
      },
    }));
  }

  function setStatus(copy, phase) {
    status.textContent = copy;
    if (phase) layer.dataset.phase = phase;
  }

  function advanceVisualProgress(deltaTime) {
    const delta = Number.isFinite(deltaTime) ? deltaTime : 0;
    const alpha = 1 - Math.exp(-11 * delta);
    const difference = visual.progressTarget - visual.progress;
    visual.progress = Math.abs(difference) < 0.002 ? visual.progressTarget : visual.progress + difference * alpha;
    progressRenderElapsed += delta;
    if (progressRenderElapsed >= 1 / 30) {
      progressRenderElapsed %= 1 / 30;
      renderProgress();
    }
  }

  function lockVisualProgress(value) {
    visual.progressTarget = value;
    visual.progress = value;
    renderProgress();
  }

  function renderProgress() {
    const progress = clamp(visual.progress, 0, 100);
    const rounded = Math.round(progress);
    const pulse = clamp(visual.pulse);
    if (rounded !== renderedRoundedProgress) {
      progressValue.textContent = String(rounded);
      progressMeter.setAttribute("aria-valuenow", String(rounded));
      layer.dataset.progress = String(rounded);
      renderedRoundedProgress = rounded;
    }
    if (Math.abs(progress - renderedProgress) >= 0.002) {
      progressMeter.style.setProperty("--slt-progress", String(progress / 100));
      progressMeter.style.setProperty("--slt-progress-position", progress + "%");
      renderedProgress = progress;
    }
    if (Math.abs(pulse - renderedPulse) >= 0.002) {
      progressMeter.style.setProperty("--slt-pulse", String(pulse));
      renderedPulse = pulse;
    }
  }

  function syncPage(page) {
    if (!pageLabels[page] || syncedPage === page) return;
    syncedPage = page;
    document.title = pageLabels[page] + "｜星夜 StarryLink";
  }

  function focusPage(page) {
    const panel = document.querySelector('[data-page="' + page + '"]');
    const heading = panel?.querySelector("[data-page-title], h1, h2");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }

  function announce(page) {
    announcement.textContent = "";
    global.requestAnimationFrame(() => {
      announcement.textContent = "已進入" + (pageLabels[page] || page);
    });
  }

  function stageGeometry() {
    const objectRect = object.getBoundingClientRect();
    const trackRect = progressTrack.getBoundingClientRect();
    const objectY = objectRect.height ? objectRect.top + objectRect.height * 0.5 : global.innerHeight * 0.44;
    const trackY = trackRect.height ? trackRect.top + trackRect.height * 0.5 : global.innerHeight * 0.61;
    return {
      y: trackY,
      objectY,
      dy: trackY - objectY,
    };
  }

  function resetVisual() {
    Object.assign(visual, {
      formation: 0,
      seamEnergy: 0,
      seamSweep: 0,
      stability: 0,
      collapse: 0,
      visibility: 1,
      progress: 0,
      progressTarget: 0,
      pulse: 0,
    });
    renderer?.resetPuzzle?.();
    progressRenderElapsed = 0;
    renderProgress();
  }

  function resetOverlay(options) {
    const settings = options || {};
    timeline?.kill();
    resetVisual();
    setStatus("SIGNAL MATRIX / 訊號矩陣重組中", "dimming");
    layer.hidden = false;
    layer.dataset.mode = settings.boot ? "initial" : "route";
    layer.dataset.reduced = String(Boolean(settings.reduced));
    layer.style.setProperty("--slt-sweep-y", "61vh");
    layer.style.removeProperty("visibility");
    veil.style.transformOrigin = "50% 61vh";
    if (gsap) {
      gsap.set(layer, { autoAlpha: 1 });
      gsap.set(veil, { autoAlpha: 0, scaleY: 1 });
      gsap.set(stage, { autoAlpha: 0 });
      gsap.set(object, { x: 0, y: 0, scale: 0.92 });
      gsap.set(readout, { autoAlpha: 0, y: 6 });
      gsap.set(sweep, { autoAlpha: 0, xPercent: -50, yPercent: -50, scaleX: 0.02 });
    }
    if (!settings.reduced) renderer?.start({ staticMode: false });
  }

  function suspendPageVisuals() {
    global.XY_STARFIELD?.stop?.();
    global.STARRYLINK_HOME_HERO?.suspendForTransition?.();
    global.STARRYLINK_HOLOGRAM?.suspendForTransition?.();
    global.dispatchEvent(new CustomEvent("starrylink:visuals-suspended"));
  }

  function resumePageVisuals() {
    global.STARRYLINK_HOME_HERO?.resumeAfterTransition?.();
    global.STARRYLINK_HOLOGRAM?.resumeAfterTransition?.();
    const activePage = document.querySelector(".page-panel.active")?.dataset.page;
    if (activePage === "intro") global.XY_STARFIELD?.stop?.();
    else global.XY_STARFIELD?.start?.();
    global.dispatchEvent(new CustomEvent("starrylink:visuals-resumed"));
  }

  function activateOverlay(boot) {
    document.documentElement.classList.add("is-starry-transitioning");
    document.documentElement.classList.toggle("is-starry-booting", Boolean(boot));
    document.querySelector(".page-stage")?.setAttribute("aria-busy", "true");
    suspendPageVisuals();
  }

  function deactivateOverlay() {
    layer.hidden = true;
    document.documentElement.classList.remove("is-starry-transitioning", "is-starry-booting");
    const pageStage = document.querySelector(".page-stage");
    pageStage?.removeAttribute("aria-busy");
    pageStage?.removeAttribute("data-transition-from");
    pageStage?.removeAttribute("data-transition-to");
    renderer?.stop();
    if (gsap) gsap.set([layer, veil, stage, object, readout, sweep], { clearProps: "all" });
    progressMeter.style.removeProperty("--slt-progress");
    progressMeter.style.removeProperty("--slt-progress-position");
    progressMeter.style.removeProperty("--slt-pulse");
    renderedProgress = -1;
    renderedRoundedProgress = -1;
    renderedPulse = -1;
    resumePageVisuals();
  }

  function criticalImageTasks(root) {
    const scoped = Array.from((root || document).querySelectorAll?.("img") || []);
    const brand = Array.from(document.querySelectorAll(".brand img"));
    return [...brand, ...scoped]
      .filter((image, index, collection) => collection.indexOf(image) === index)
      .filter((image) => brand.includes(image) || image.loading !== "lazy")
      .slice(0, 12)
      .map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve("cached-image");
        if (image.complete && image.naturalWidth === 0) return Promise.reject(new Error("critical image unavailable"));
        const source = image.currentSrc || image.getAttribute("src");
        if (!source) return Promise.resolve("image-without-source");
        const probe = new Image();
        probe.decoding = "async";
        if (image.sizes) probe.sizes = image.sizes;
        if (image.srcset) probe.srcset = image.srcset;
        probe.src = source;
        const task = typeof probe.decode === "function"
          ? probe.decode().then(() => "preloaded-image")
          : new Promise((resolve, reject) => {
            probe.addEventListener("load", () => resolve("preloaded-image"), { once: true });
            probe.addEventListener("error", () => reject(new Error("critical image failed")), { once: true });
          });
        return withTimeout(task, 2400).then((result) => result?.timeout ? "image-decode-deferred" : result);
      });
  }

  function withTimeout(promise, ms) {
    let timerId = 0;
    const timeout = new Promise((resolve) => {
      timerId = global.setTimeout(() => resolve({ timeout: true }), ms);
    });
    return Promise.race([promise, timeout]).finally(() => global.clearTimeout(timerId));
  }

  async function readinessFor(root, job) {
    const startedAt = global.performance.now();
    const tasks = [
      document.fonts?.ready || Promise.resolve("fonts-unsupported"),
      ...criticalImageTasks(root),
      new Promise((resolve) => global.requestAnimationFrame(() => global.requestAnimationFrame(resolve))),
    ];
    const query = new URLSearchParams(global.location.search);
    if (query.get("gate") === "slow") tasks.push(new Promise((resolve) => global.setTimeout(resolve, 7000)));
    if (query.get("gate") === "fail") tasks.push(Promise.reject(new Error("deterministic readiness failure")));
    if (query.get("gate") === "timeout") tasks.push(new Promise(() => {}));
    gateReport.state = "loading";
    gateReport.taskCount = tasks.length;
    const result = await withTimeout(Promise.allSettled(tasks), READINESS_TIMEOUT);
    if (!Array.isArray(result)) {
      gateReport.timedOut = true;
      gateReport.fulfilled = 0;
      gateReport.rejected = 0;
      gateReport.ok = true;
    } else {
      gateReport.timedOut = false;
      gateReport.fulfilled = result.filter((item) => item.status === "fulfilled").length;
      gateReport.rejected = result.filter((item) => item.status === "rejected").length;
      gateReport.ok = gateReport.rejected === 0;
    }
    gateReport.state = gateReport.ok ? "ready" : "settled-with-error";
    gateReport.durationMs = Math.round(global.performance.now() - startedAt);
    job.ready = true;
    job.gate = { ...gateReport };
    return job.gate;
  }

  function beginReadiness(job) {
    if (job.readinessPromise) return job.readinessPromise;
    job.readinessPromise = readinessFor(job.incoming || document, job);
    return job.readinessPromise;
  }

  function gateTimelineForReady(job, next) {
    global.performance?.mark?.("starrylink:signal:readiness-gate");
    if (Number.isFinite(job.qaFrame) || job.ready) return;
    next.pause();
    beginReadiness(job).then(() => {
      if (destroyed || timeline !== next || activeJob !== job) return;
      next.play();
    });
  }

  function prepareJob(job, boot) {
    job.boot = Boolean(boot);
    job.compact = compactViewport.matches;
    job.reduced = prefersReducedMotion();
    job.total = timingFor({ boot: job.boot, compact: job.compact, reduced: job.reduced });
    job.outgoing = document.querySelector('[data-page="' + job.from + '"]');
    job.incoming = document.querySelector('[data-page="' + job.to + '"]');
    job.ready = false;
    job.gate = null;
    job.readinessPromise = null;
    job.collapseGeometry = null;
    const qaFrameParam = new URLSearchParams(global.location.search).get("qaFrame");
    const qaFrame = qaFrameParam == null || qaFrameParam === "" ? Number.NaN : Number(qaFrameParam);
    job.qaFrame = Number.isFinite(qaFrame) ? clamp(qaFrame, 0, job.total - 0.01) : null;
    resetOverlay({ boot: job.boot, reduced: job.reduced });
    activateOverlay(job.boot);
    const pageStage = document.querySelector(".page-stage");
    pageStage?.setAttribute("data-transition-from", job.from);
    pageStage?.setAttribute("data-transition-to", job.to);
    beginReadiness(job);
  }

  function commitRoute(job) {
    if (job.committed) return;
    job.committed = true;
    job.commit();
    syncPage(job.to);
    job.incoming = document.querySelector('[data-page="' + job.to + '"]');
  }

  function addPulse(next, at) {
    next.to(visual, {
      pulse: 1,
      duration: 0.08,
      ease: "power2.out",
    }, at);
    next.to(visual, {
      pulse: 0,
      duration: 0.18,
      ease: "sine.out",
    }, at + 0.08);
  }

  function inverseSlice(move) {
    return {
      key: move.key + "Inverse",
      axis: move.axis,
      layer: move.layer,
      direction: -move.direction,
    };
  }

  function addSliceTurn(next, move, at) {
    next.call(() => {
      sliceMotion.angle = 0;
      global.performance?.mark?.("starrylink:signal:slice-start:" + move.key);
      renderer?.beginSlice?.(move);
    }, null, at);
    next.fromTo(sliceMotion, { angle: 0 }, {
      angle: move.direction * QUARTER_TURN,
      duration: SLICE_DURATION,
      ease: "power2.inOut",
      immediateRender: false,
      onUpdate: () => renderer?.updateSlice?.(sliceMotion.angle),
      onComplete: () => {
        renderer?.completeSlice?.();
        global.performance?.mark?.("starrylink:signal:slice-end:" + move.key);
      },
    }, at);
  }

  function addSignalMatrixTimeline(next, job) {
    next.addLabel("dim", 0);
    next.call(() => {
      setState("dimming", job);
      setStatus("SIGNAL MATRIX / 訊號矩陣重組中", "dimming");
    }, null, "dim");
    next.to(veil, { autoAlpha: 1, duration: 0.55, ease: "sine.inOut" }, "dim");
    next.to(stage, { autoAlpha: 1, duration: 0.42, ease: "power2.out" }, "dim+=0.08");
    next.to(object, { scale: 1, duration: 0.55, ease: "sine.inOut" }, "dim");
    next.to(readout, { autoAlpha: 1, y: 0, duration: 0.36, ease: "power2.out" }, "dim+=0.16");
    next.to(visual, {
      formation: 1,
      progressTarget: 4,
      duration: 0.55,
      ease: "sine.inOut",
    }, "dim");

    next.addLabel("first-slice", 0.55);
    next.call(() => setState("assembling", job), null, "first-slice");
    addSliceTurn(next, SLICE_SEQUENCE[0], 0.55);
    next.to(visual, { progressTarget: 22, duration: 0.62, ease: "sine.inOut" }, "first-slice");
    addPulse(next, 1.09);

    next.addLabel("multi-axis-routing", 1.17);
    next.call(() => setState("routing", job), null, "multi-axis-routing");
    next.to(visual, { progressTarget: 72, duration: 1.8, ease: "sine.inOut" }, "multi-axis-routing");
    addSliceTurn(next, SLICE_SEQUENCE[1], 1.45);
    addSliceTurn(next, SLICE_SEQUENCE[2], 2.35);
    addPulse(next, 1.97);
    addPulse(next, 2.87);

    next.addLabel("progressive-relock", 3.15);
    next.call(() => setState("relocking", job), null, "progressive-relock");
    next.to(visual, {
      progressTarget: 92,
      seamEnergy: 1,
      stability: 0.74,
      duration: 2.6,
      ease: "sine.inOut",
    }, "progressive-relock");
    addSliceTurn(next, inverseSlice(SLICE_SEQUENCE[2]), 3.15);
    addSliceTurn(next, inverseSlice(SLICE_SEQUENCE[1]), 4.05);
    addSliceTurn(next, inverseSlice(SLICE_SEQUENCE[0]), 4.95);
    addPulse(next, 3.69);
    addPulse(next, 4.59);
    addPulse(next, 5.49);

    next.addLabel("readiness-gate", 5.75);
    next.call(() => gateTimelineForReady(job, next), null, "readiness-gate");

    next.addLabel("final-lock", 5.75);
    next.to(visual, {
      seamSweep: 1,
      progressTarget: 100,
      stability: 1,
      duration: 0.45,
      ease: "power2.inOut",
    }, "final-lock");
    addPulse(next, 5.86);

    next.addLabel("link-established", 6.2);
    next.call(() => {
      lockVisualProgress(100);
      setState("ready", job);
      setStatus("LINK ESTABLISHED / 備援鏈路已建立", "link-established");
      if (!job.boot) commitRoute(job);
    }, null, "link-established");

    next.addLabel("line-reveal", 6.5);
    next.call(() => {
      job.collapseGeometry = stageGeometry();
      layer.style.setProperty("--slt-sweep-y", job.collapseGeometry.y + "px");
      veil.style.transformOrigin = "50% " + job.collapseGeometry.y + "px";
      setState("revealing", job);
      layer.dataset.phase = "line-reveal";
    }, null, "line-reveal");
    next.to(object, {
      y: () => job.collapseGeometry?.dy || 0,
      duration: 0.2,
      ease: "power3.inOut",
    }, "line-reveal");
    next.to(visual, {
      collapse: 1,
      visibility: 0.18,
      duration: 0.2,
      ease: "power3.inOut",
    }, "line-reveal");
    next.to(readout, { autoAlpha: 0, duration: 0.1, ease: "power2.in" }, "line-reveal");
    next.to(sweep, { autoAlpha: 1, scaleX: 1, duration: 0.18, ease: "power3.inOut" }, "line-reveal");
    next.to(veil, { scaleY: 0.002, duration: 0.16, ease: "power3.inOut" }, 6.54);
    next.to(visual, { visibility: 0, duration: 0.14, ease: "power2.out" }, 6.56);

    next.addLabel("settled", 6.7);
    next.call(() => setState("complete", job), null, "settled");
  }

  function addReducedTimeline(next, job) {
    next.addLabel("dim", 0);
    next.call(() => {
      setState("dimming", job);
      setStatus("SIGNAL MATRIX / 訊號矩陣重組中", "reduced");
    }, null, "dim");
    next.to(veil, { autoAlpha: 1, duration: 0.15, ease: "none" }, "dim");
    next.to(stage, { autoAlpha: 1, duration: 0.12, ease: "none" }, "dim");
    next.to(readout, { autoAlpha: 1, y: 0, duration: 0.12, ease: "none" }, "dim");
    next.to(visual, { progressTarget: 92, progress: 92, duration: 0.35, ease: "none", onUpdate: renderProgress }, "dim");
    next.addLabel("readiness-gate", 0.35);
    next.call(() => gateTimelineForReady(job, next), null, "readiness-gate");
    next.to(visual, { progressTarget: 100, progress: 100, duration: 0.15, ease: "none", onUpdate: renderProgress }, 0.35);
    next.call(() => {
      lockVisualProgress(100);
      setState("ready", job);
      setStatus("LINK ESTABLISHED / 備援鏈路已建立", "reduced-complete");
      if (!job.boot) commitRoute(job);
    }, null, 0.5);
    next.to([veil, stage], { autoAlpha: 0, duration: 0.15, ease: "none" }, 0.5);
    next.addLabel("settled", 0.65);
    next.call(() => setState("complete", job), null, "settled");
  }

  function dispatchComplete(job, interrupted) {
    global.dispatchEvent(new CustomEvent("starrylink:page-transition-complete", {
      detail: {
        from: job.from,
        to: job.to,
        direction: job.direction,
        mode: MODE,
        interrupted: Boolean(interrupted),
        handoff: "signal-line-reveal",
      },
    }));
  }

  function finish(job, interrupted) {
    if (!job || activeJob !== job) return;
    const completedAt = global.performance.now();
    lastRun = {
      from: job.from,
      to: job.to,
      boot: Boolean(job.boot),
      interrupted: Boolean(interrupted),
      startedAt: job.startedAt || completedAt,
      completedAt,
      durationMs: Math.round(completedAt - (job.startedAt || completedAt)),
      gate: { ...gateReport },
    };
    layer.dataset.lastDuration = String(lastRun.durationMs);
    layer.dataset.lastGateTimedOut = String(Boolean(lastRun.gate.timedOut));
    layer.dataset.lastGateDuration = String(lastRun.gate.durationMs || 0);
    if (!job.boot) commitRoute(job);
    const nextJob = queuedJob;
    queuedJob = null;
    deactivateOverlay();
    timeline = null;
    activeJob = null;
    if (job.boot) {
      bootActive = false;
      rememberInitialLoading();
    } else {
      dispatchComplete(job, interrupted);
    }
    if (nextJob && nextJob.to !== job.to) {
      nextJob.from = job.to;
      nextJob.direction = pages.indexOf(nextJob.to) >= pages.indexOf(nextJob.from) ? "forward" : "backward";
      global.requestAnimationFrame(() => startJob(nextJob, false));
      return;
    }
    focusPage(job.to);
    announce(job.to);
    setState("idle", job);
  }

  function startJob(job, boot) {
    if (!gsap || !renderer) {
      if (!boot) job.commit();
      syncPage(job.to);
      focusPage(job.to);
      announce(job.to);
      return false;
    }
    activeJob = job;
    prepareJob(job, boot);
    job.startedAt = global.performance.now();
    timeline = gsap.timeline({
      paused: true,
      defaults: { overwrite: "auto" },
      onComplete: () => finish(job, false),
    });
    if (job.reduced) addReducedTimeline(timeline, job);
    else addSignalMatrixTimeline(timeline, job);
    if (Number.isFinite(job.qaFrame)) timeline.pause(0).seek(job.qaFrame, false).pause();
    else timeline.play(0);
    return true;
  }

  function run(options) {
    const settings = options || {};
    if (!pageLabels[settings.from] || !pageLabels[settings.to] || settings.from === settings.to || typeof settings.commit !== "function") return false;
    const job = {
      from: settings.from,
      to: settings.to,
      direction: settings.direction || (pages.indexOf(settings.to) >= pages.indexOf(settings.from) ? "forward" : "backward"),
      commit: settings.commit,
      trigger: settings.trigger || null,
      committed: false,
    };
    if (!renderer) {
      queuedJob = job;
      rendererReady.then(() => {
        if (destroyed || bootActive || activeJob || !queuedJob) return;
        const pending = queuedJob;
        queuedJob = null;
        startJob(pending, false);
      });
      return true;
    }
    if (bootActive) {
      queuedJob = job;
      return true;
    }
    if (activeJob) {
      if (activeJob.to === job.to || queuedJob?.to === job.to) return true;
      queuedJob = job;
      return true;
    }
    return startJob(job, false);
  }

  function settle() {
    if (!activeJob || !timeline) return false;
    const job = activeJob;
    timeline.kill();
    finish(job, true);
    return true;
  }

  function shouldRunInitialLoading() {
    const query = new URLSearchParams(global.location.search);
    const bootMode = query.get("boot");
    if (bootMode === "skip") return false;
    if (["matrix", "signal", "relay", "cinematic"].includes(bootMode)) return true;
    if (bootMode !== "auto") return false;
    try {
      return global.sessionStorage.getItem(SESSION_KEY) !== "complete";
    } catch (_error) {
      return true;
    }
  }

  function rememberInitialLoading() {
    try {
      global.sessionStorage.setItem(SESSION_KEY, "complete");
    } catch (_error) {
      // Session persistence is optional and must never block page entry.
    }
  }

  async function startInitialLoading() {
    if (!gsap || !shouldRunInitialLoading()) return;
    bootActive = true;
    const readyRenderer = await rendererReady;
    if (destroyed || !readyRenderer) {
      bootActive = false;
      layer.hidden = true;
      return;
    }
    const query = new URLSearchParams(global.location.search);
    if (query.get("qaCapture") === "1") {
      if (document.readyState !== "complete") {
        await new Promise((resolve) => global.addEventListener("load", resolve, { once: true }));
      }
      await new Promise((resolve) => global.setTimeout(resolve, 1200));
    }
    if (destroyed) {
      bootActive = false;
      return;
    }
    const activePage = document.querySelector(".page-panel.active");
    const page = activePage?.dataset.page || "intro";
    const job = {
      from: page,
      to: page,
      direction: "forward",
      commit: () => {},
      committed: true,
    };
    startJob(job, true);
  }

  function inspect() {
    return {
      state,
      mode: MODE,
      sequence: "single-signal-matrix-all-routes",
      timing: {
        desktop: { ...TIMING.desktop },
        compact: { ...TIMING.compact },
        reduced: { ...TIMING.reduced },
        activeTotal: timeline?.duration?.() || 0,
        activeTime: timeline?.time?.() || 0,
        labels: timeline?.labels ? { ...timeline.labels } : {},
      },
      progress: Math.round(visual.progress),
      progressTarget: Math.round(visual.progressTarget),
      phase: layer.dataset.phase || null,
      slices: {
        active: renderer?.activeSlice?.move?.key || null,
        angle: Number(sliceMotion.angle.toFixed(3)),
        attachedCubelets: renderer?.activeSlice?.cubelets?.length || 0,
      },
      boot: {
        active: bootActive,
        sessionKey: SESSION_KEY,
        gate: { ...gateReport },
      },
      renderer: {
        type: layer.dataset.renderer || "unavailable",
        error: rendererError,
        running: Boolean(renderer?.frameId),
        dpr: renderer?.dpr || 0,
        programCount: renderer?.renderer?.info?.programs?.length || 0,
        materialCount: renderer?.disposables?.filter?.((resource) => resource?.isMaterial)?.length || 0,
        cubeletCount: renderer?.cubelets?.length || 0,
        sliceCount: SLICE_SEQUENCE.length,
        plannedTurnCount: SLICE_SEQUENCE.length * 2,
        transmission: false,
        floatingYaw: Number((renderer?.floatingYaw || 0).toFixed(4)),
        waitingAngularVelocity: Number((0.04 + (1 - clamp(visual.stability)) * 0.03).toFixed(4)),
        puzzle: renderer?.inspectPuzzle?.() || null,
      },
      active: activeJob ? {
        from: activeJob.from,
        to: activeJob.to,
        committed: activeJob.committed,
        ready: activeJob.ready,
        qaFrame: activeJob.qaFrame,
        elapsedMs: Math.round(global.performance.now() - (activeJob.startedAt || global.performance.now())),
      } : null,
      queued: queuedJob ? { from: queuedJob.from, to: queuedJob.to } : null,
      timelineCount: timeline ? 1 : 0,
      lastRun: lastRun ? { ...lastRun } : null,
    };
  }

  global.addEventListener("pagehide", () => {
    destroyed = true;
    queuedJob = null;
    timeline?.kill();
    renderer?.destroy();
    if (activeJob) deactivateOverlay();
    timeline = null;
    activeJob = null;
  }, { once: true });

  global.STARRYLINK_TRANSITIONS = {
    run,
    settle,
    syncPage,
    inspect,
    config: TIMING,
    get state() {
      return state;
    },
  };

  startInitialLoading().catch(() => {
    if (activeJob) finish(activeJob, true);
    bootActive = false;
  });
})(window);
