(function initStarryLinkHologram(global) {
  "use strict";

  const panel = document.querySelector(".hologram-demo-panel[data-page='demo']");
  const root = panel?.querySelector("[data-hologram-demo]");
  const viewport = panel?.querySelector("[data-hologram-viewport]");
  const model = panel?.querySelector("[data-hologram-model]");
  const canvas = panel?.querySelector("[data-hologram-canvas]");
  const particleCanvas = panel?.querySelector("[data-hologram-particles]");
  const terrain = panel?.querySelector(".hologram-terrain-primary");
  const drone = panel?.querySelector("[data-hologram-drone]");
  const satellite = panel?.querySelector("[data-hologram-satellite]");
  const emitter = panel?.querySelector("[data-hologram-emitter]");
  const playButton = panel?.querySelector("[data-hologram-play]");
  const restartButton = panel?.querySelector("[data-hologram-restart]");
  const message = panel?.querySelector("[data-hologram-message]");
  const phaseButtons = Array.from(panel?.querySelectorAll("[data-hologram-phase]") || []);
  const recoveryTitle = panel?.querySelector("[data-hologram-recovery-title]");
  const recoveryCopy = panel?.querySelector("[data-hologram-recovery-copy]");
  const context = canvas?.getContext("2d");
  const particleContext = particleCanvas?.getContext("2d");
  if (!panel || !root || !viewport || !model || !canvas || !context || !particleCanvas || !particleContext) return;

  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewport = global.matchMedia("(max-width: 760px)");
  const frameInterval = 1000 / 30;
  const phases = [
    {
      duration: 6200,
      message: "",
      title: "SYSTEM / HOLOGRAM ASSEMBLY",
      caption: "光束點火 · 粒子匯聚 · 架構成形",
    },
    {
      duration: 6400,
      message: "求救源經陸地基地台與完整海纜骨幹，送達右岸目標地",
      title: "PRIMARY / SUBSEA BACKBONE",
      caption: "基地台轉送 · 海纜骨幹穩定",
    },
    {
      duration: 5000,
      message: "陸地基地台損壞，海纜保持完整；封包停在地面交接點",
      title: "FAULT / LAND BASE STATION",
      caption: "基地台離線 · 海纜正常",
    },
    {
      duration: 6200,
      message: "系統先採用成本較低的無人機，在低空接手求救封包並建立臨時中繼",
      title: "FALLBACK 01 / DRONE RELAY",
      caption: "低成本優先 · 無人機接手",
    },
    {
      duration: 5200,
      message: "無人機因風雨與機體異常故障，封包停在低空節點，準備升級備援層級",
      title: "FAULT / DRONE OFFLINE",
      caption: "無人機故障 · 封包暫停",
    },
    {
      duration: 9400,
      message: "低成本空中方案失效後，系統才啟用成本較高的衛星鏈路並送達目標地",
      title: "FALLBACK 02 / SATELLITE",
      caption: "高成本升級 · 衛星送達 · ACK 回傳",
    },
  ];

  const nodes = {
    source: { x: 0.205, y: 0.61, depth: 0.84, label: "求救源" },
    base: { x: 0.175, y: 0.39, depth: 0.78, label: "陸地基地台" },
    landingWest: { x: 0.36, y: 0.63, depth: 0.62, label: "左岸海纜站" },
    landingEast: { x: 0.675, y: 0.63, depth: 0.38, label: "完整海纜" },
    drone: { x: 0.53, y: 0.37, depth: 0.34, label: "無人機中繼" },
    satellite: { x: 0.69, y: 0.17, depth: 0.14, label: "衛星備援" },
    center: { x: 0.79, y: 0.46, depth: 0.2, label: "目標地" },
  };

  const projectionParticles = Array.from({ length: compactViewport.matches ? 120 : 260 }, (_, index) => {
    const pseudo = (Math.sin((index + 1) * 91.771) + 1) / 2;
    const pseudoB = (Math.sin((index + 1) * 47.113 + 0.8) + 1) / 2;
    return {
      offset: pseudo * 2 - 1,
      seed: pseudoB,
      speed: 0.026 + (index % 23) * 0.0021,
      length: 2 + (index % 17) * 0.82,
      violet: index % 7 === 0,
      bright: index % 11 === 0,
    };
  });

  let phase = reducedMotion.matches ? 5 : 0;
  let phaseStartedAt = performance.now();
  let running = !reducedMotion.matches;
  let frozenProgress = reducedMotion.matches ? 0.92 : 0;
  let lastFrameAt = performance.now();
  let frameId = 0;
  let exiting = false;
  let exitStartedAt = 0;
  let exitCallback = null;
  let exitDuration = 760;
  let lastRenderedAt = 0;
  let projectionOriginCache = null;
  let transitionSuspended = document.documentElement.classList.contains("is-starry-transitioning");
  let resumeRunning = running;
  let activeWhenSuspended = panel.classList.contains("active");

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smooth(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function setPhase(nextPhase, options = {}) {
    phase = ((nextPhase % phases.length) + phases.length) % phases.length;
    frozenProgress = clamp(options.progress || 0, 0, 0.999);
    phaseStartedAt = performance.now() - frozenProgress * phases[phase].duration;
    root.dataset.phase = String(phase);
    if (message) message.textContent = phases[phase].message;
    if (recoveryTitle) recoveryTitle.textContent = phases[phase].title;
    if (recoveryCopy) recoveryCopy.textContent = phases[phase].caption;
    phaseButtons.forEach((button, index) => {
      const active = index === phase;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
    });
  }

  function setRunning(nextRunning) {
    const next = Boolean(nextRunning) && !reducedMotion.matches;
    if (!next && running) {
      frozenProgress = clamp((performance.now() - phaseStartedAt) / phases[phase].duration, 0, 0.999);
    }
    if (next && !running) {
      phaseStartedAt = performance.now() - frozenProgress * phases[phase].duration;
    }
    running = next;
    root.dataset.running = String(running);
    if (playButton) playButton.textContent = running ? "暫停演示" : "繼續演示";
  }

  function project(node, width, height) {
    return { x: node.x * width, y: node.y * height };
  }

  function resizeCanvas(target, targetContext) {
    const rect = target.getBoundingClientRect();
    const density = Math.min(1.25, global.devicePixelRatio || 1);
    const nextWidth = Math.max(1, Math.round(rect.width * density));
    const nextHeight = Math.max(1, Math.round(rect.height * density));
    if (target.width !== nextWidth || target.height !== nextHeight) {
      target.width = nextWidth;
      target.height = nextHeight;
    }
    targetContext.setTransform(density, 0, 0, density, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function resolveProjectionOrigin(width, height) {
    if (projectionOriginCache) return projectionOriginCache;
    const canvasRect = particleCanvas.getBoundingClientRect();
    const emitterRect = emitter?.getBoundingClientRect();
    const fallback = { x: width * 0.5, y: height * 0.78 };
    if (!emitterRect || !canvasRect.width || !canvasRect.height || !emitterRect.width || !emitterRect.height) return fallback;
    const origin = {
      x: emitterRect.left - canvasRect.left + emitterRect.width * 0.5,
      y: emitterRect.top - canvasRect.top + emitterRect.height * 0.435,
    };
    root.style.setProperty("--holo-origin-x", `${origin.x}px`);
    root.style.setProperty("--holo-origin-y", `${origin.y}px`);
    projectionOriginCache = origin;
    return origin;
  }

  function drawProjectionParticles(now, progress, exitProgress = 0) {
    const { width, height } = resizeCanvas(particleCanvas, particleContext);
    particleContext.clearRect(0, 0, width, height);
    const time = reducedMotion.matches ? 22 : now * 0.001;
    const ignition = phase === 0 ? smooth(progress / 0.16) : 1;
    const assembly = phase === 0 ? smooth((progress - 0.1) / 0.78) : 1;
    const origin = resolveProjectionOrigin(width, height);
    const originX = origin.x;
    const bottom = origin.y;
    const top = height * 0.08;
    const rise = Math.max(height * 0.5, bottom - top);
    const settledField = phase === 0 ? 0.58 + assembly * 0.42 : 0.66;
    const exitFade = 1 - smooth((exitProgress - 0.78) / 0.22);
    const beamStrength = ignition * settledField * exitFade;

    particleContext.save();
    particleContext.globalCompositeOperation = "lighter";

    const volumeGradient = particleContext.createLinearGradient(originX, bottom, originX, height * 0.2);
    volumeGradient.addColorStop(0, "rgba(212, 250, 255, 0.22)");
    volumeGradient.addColorStop(0.32, "rgba(89, 221, 255, 0.11)");
    volumeGradient.addColorStop(0.72, "rgba(145, 116, 255, 0.055)");
    volumeGradient.addColorStop(1, "rgba(104, 219, 255, 0)");
    particleContext.globalAlpha = beamStrength * (phase === 0 ? 0.78 : 0.62);
    particleContext.fillStyle = volumeGradient;
    particleContext.beginPath();
    particleContext.moveTo(originX - 7, bottom);
    particleContext.lineTo(width * 0.22, height * 0.26);
    particleContext.lineTo(width * 0.78, height * 0.26);
    particleContext.lineTo(originX + 7, bottom);
    particleContext.closePath();
    particleContext.fill();

    const beamTargets = [
      [0.18, 0.48], [0.23, 0.39], [0.29, 0.32], [0.36, 0.29], [0.43, 0.36], [0.5, 0.25],
      [0.57, 0.36], [0.64, 0.29], [0.71, 0.32], [0.77, 0.39], [0.82, 0.48],
    ];
    beamTargets.forEach(([targetX, targetY], index) => {
      const buildReach = phase === 0 ? smooth((progress - index * 0.013) / 0.34) : 1;
      const reach = buildReach * (1 - smooth(exitProgress));
      const shimmer = 0.72 + Math.sin(time * 2.35 + index * 1.17) * 0.28;
      const endX = originX + (width * targetX - originX) * reach;
      const endY = bottom + (height * targetY - bottom) * reach;
      const baseAlpha = beamStrength * shimmer;

      particleContext.globalAlpha = baseAlpha * (phase === 0 ? 0.15 : 0.075);
      particleContext.strokeStyle = index % 3 === 0 ? "#a78cff" : "#67dcff";
      particleContext.lineWidth = phase === 0 ? 6.5 : 4.2;
      particleContext.beginPath();
      particleContext.moveTo(originX + (index - 5) * 1.35, bottom);
      particleContext.lineTo(endX, endY);
      particleContext.stroke();

      particleContext.globalAlpha = baseAlpha * (phase === 0 ? 0.72 : 0.3);
      particleContext.strokeStyle = index % 3 === 0 ? "#c3b2ff" : "#d4f8ff";
      particleContext.lineWidth = index % 2 === 0 ? 1.05 : 0.72;
      particleContext.beginPath();
      particleContext.moveTo(originX + (index - 5) * 1.35, bottom);
      particleContext.lineTo(endX, endY);
      particleContext.stroke();
    });

    projectionParticles.forEach((particle, index) => {
      const travel = (particle.seed + time * particle.speed) % 1;
      const recoveredTravel = travel * (1 - smooth(exitProgress));
      const cone = 0.012 + Math.pow(recoveredTravel, 0.82) * 0.39;
      const drift = Math.sin(time * 1.2 + index * 0.61) * width * 0.0032;
      const x = originX + particle.offset * width * cone + drift;
      const y = bottom - rise * recoveredTravel;
      const edgeFade = Math.sin(Math.max(0.01, recoveredTravel) * Math.PI);
      const phaseIntensity = phase === 0 ? 0.48 + ignition * 0.64 + assembly * 0.3 : 0.94;
      const recoverySpark = exitProgress > 0 ? Math.sin(exitProgress * Math.PI) * 0.46 : 0;
      const alpha = Math.max(edgeFade * phaseIntensity, recoverySpark) * exitFade;
      const color = particle.violet ? "164, 125, 255" : "92, 224, 255";

      particleContext.globalAlpha = 0.018 + alpha * (phase === 0 ? 0.46 : 0.34);
      particleContext.strokeStyle = `rgb(${color})`;
      particleContext.lineWidth = particle.bright ? 0.95 : particle.violet ? 0.72 : 0.52;
      particleContext.beginPath();
      particleContext.moveTo(x, y + particle.length * (0.5 + travel));
      particleContext.lineTo(x, y - particle.length);
      particleContext.stroke();

      if (particle.bright || index % 4 === 0) {
        particleContext.globalAlpha = 0.035 + alpha * (phase === 0 ? 0.62 : 0.46);
        particleContext.fillStyle = `rgb(${color})`;
        particleContext.beginPath();
        particleContext.arc(x, y, particle.bright ? 1.15 : particle.violet ? 0.92 : 0.64, 0, Math.PI * 2);
        particleContext.fill();
      }
    });

    const ringCycle = (time * 0.72) % 1;
    particleContext.globalAlpha = ignition * (1 - ringCycle) * (phase === 0 ? 0.66 : 0.34);
    particleContext.strokeStyle = "#8fefff";
    particleContext.lineWidth = 1.1;
    particleContext.beginPath();
    particleContext.ellipse(originX, bottom, 22 + ringCycle * width * 0.09, 7 + ringCycle * height * 0.026, 0, 0, Math.PI * 2);
    particleContext.stroke();
    particleContext.restore();
  }

  function pathMetrics(points) {
    const lengths = [];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const dx = points[index].x - points[index - 1].x;
      const dy = points[index].y - points[index - 1].y;
      const length = Math.hypot(dx, dy);
      lengths.push(length);
      total += length;
    }
    return { lengths, total };
  }

  function pointAlong(points, progress) {
    const metrics = pathMetrics(points);
    let remaining = metrics.total * clamp(progress, 0, 1);
    for (let index = 1; index < points.length; index += 1) {
      const length = metrics.lengths[index - 1];
      if (remaining <= length) {
        const ratio = length ? remaining / length : 0;
        return {
          x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
          y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio,
        };
      }
      remaining -= length;
    }
    return points[points.length - 1];
  }

  function drawPath(points, color, lineWidth, alpha = 1, dash = [], progress = 1) {
    if (points.length < 2 || progress <= 0) return;
    const metrics = pathMetrics(points);
    let remaining = metrics.total * clamp(progress, 0, 1);
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(dash);
    context.shadowColor = color;
    context.shadowBlur = lineWidth * 4;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const length = metrics.lengths[index - 1];
      if (remaining >= length) {
        context.lineTo(end.x, end.y);
        remaining -= length;
      } else {
        if (remaining > 0) {
          const ratio = remaining / length;
          context.lineTo(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio);
        }
        break;
      }
    }
    context.stroke();
    context.restore();
  }

  function drawPulse(point, color, progress, strength = 1) {
    const cycle = (progress * 2.2) % 1;
    context.save();
    context.globalAlpha = (1 - cycle) * 0.55 * strength;
    context.strokeStyle = color;
    context.lineWidth = 1.2;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.beginPath();
    context.ellipse(point.x, point.y, 7 + cycle * 24, 4 + cycle * 12, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawPacket(point, color, alpha = 1, radius = 4.2) {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 22;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = alpha * 0.2;
    context.beginPath();
    context.arc(point.x, point.y, radius * 3.3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawLabel(point, label, offsetX, offsetY, alpha = 0.72, color = "rgba(218, 240, 255, 0.9)") {
    context.save();
    context.globalAlpha = alpha;
    context.font = "500 10px 'Chiron GoRound TC', 'PingFang TC', sans-serif";
    context.textAlign = offsetX < 0 ? "right" : "left";
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 8;
    context.fillText(label, point.x + offsetX, point.y + offsetY);
    context.restore();
  }

  function drawEndpoint(point, label, direction, color) {
    const sign = direction === "left" ? -1 : 1;
    const textX = point.x + sign * 28;
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 18;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(point.x, point.y, 8, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.34;
    context.beginPath();
    context.arc(point.x, point.y, 14, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.78;
    context.beginPath();
    context.moveTo(point.x + sign * 10, point.y);
    context.lineTo(point.x + sign * 21, point.y);
    context.stroke();
    context.textAlign = direction === "left" ? "right" : "left";
    context.globalAlpha = 0.98;
    context.font = "600 13px 'Chiron GoRound TC', 'PingFang TC', sans-serif";
    context.fillText(label, textX, point.y + 5);
    context.restore();
  }

  function drawFault(point, progress, now, label) {
    const strength = smooth(progress);
    const pulse = 0.68 + Math.sin(now * 0.006) * 0.22;
    context.save();
    context.translate(point.x, point.y);
    context.globalCompositeOperation = "lighter";
    context.strokeStyle = `rgba(182, 132, 255, ${pulse * strength})`;
    context.lineWidth = 1.5;
    context.shadowColor = "#a779ff";
    context.shadowBlur = 17;
    context.beginPath();
    context.arc(0, 0, 12 + strength * 7, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-7, -7);
    context.lineTo(7, 7);
    context.moveTo(7, -7);
    context.lineTo(-7, 7);
    context.stroke();
    for (let index = 0; index < 14; index += 1) {
      const angle = index * 2.17 + now * 0.0012;
      const distance = 12 + strength * (8 + index * 0.9);
      context.globalAlpha = strength * (0.52 - index * 0.02);
      context.fillStyle = index % 3 === 0 ? "#c08fff" : "#83dfff";
      context.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.56, 1.4, 1.4);
    }
    context.restore();
    if (label) drawLabel(point, label, 14, -14, 0.98, "#c9a7ff");
  }

  function resolveAirNodes(now, progress) {
    const motion = reducedMotion.matches ? 0 : 1;
    const droneMotion = phase === 3 ? 1 : 0;
    return {
      drone: {
        ...nodes.drone,
        x: nodes.drone.x + Math.sin(now * 0.0011) * 0.004 * motion * droneMotion,
        y: nodes.drone.y + Math.cos(now * 0.00135) * 0.003 * motion * droneMotion,
      },
      satellite: {
        ...nodes.satellite,
        x: nodes.satellite.x + Math.sin(now * 0.00038) * 0.012 * motion,
        y: nodes.satellite.y + Math.cos(now * 0.00031) * 0.004 * motion,
      },
    };
  }

  function drawScene(now, progress, airNodes) {
    const { width, height } = resizeCanvas(canvas, context);
    context.clearRect(0, 0, width, height);
    const liveNodes = { ...nodes, ...airNodes };
    const projected = Object.fromEntries(Object.entries(liveNodes).map(([key, node]) => [key, project(node, width, height)]));
    const backbone = [nodes.source, nodes.base, nodes.landingWest, nodes.landingEast, nodes.center].map((node) => project(node, width, height));
    const sourceToBase = [nodes.source, nodes.base].map((node) => project(node, width, height));
    const droneRelay = [nodes.source, airNodes.drone, nodes.center].map((node) => project(node, width, height));
    const satelliteRelay = [nodes.source, airNodes.satellite, nodes.center].map((node) => project(node, width, height));
    const time = now * 0.001;

    if (phase === 0) {
      const assembly = smooth((progress - 0.12) / 0.76);
      drawPath(backbone, "#72e4ff", 1.5, 0.34 * assembly, [5, 8], assembly);
      [projected.source, projected.base, projected.landingWest, projected.landingEast, projected.center].forEach((point, index) => {
        if (assembly > 0.16 + index * 0.1) drawPulse(point, index === 0 ? "#b78cff" : "#70e8ff", time + index * 0.12, 0.42);
      });
    }

    if (phase === 1) {
      drawPath(backbone, "#70e2ff", 2.1, 0.84);
      const packetProgress = smooth(Math.min(0.84, progress) / 0.84);
      drawPacket(pointAlong(backbone, packetProgress), "#e2f9ff", 1);
      drawPulse(projected.source, "#b58cff", time, 0.95);
      if (packetProgress > 0.14) drawPulse(projected.base, "#83d8ff", time + 0.16, 0.82);
      if (packetProgress > 0.36) drawPulse(projected.landingWest, "#829dff", time + 0.31, 0.74);
      if (packetProgress > 0.88) drawPulse(projected.center, "#77efd6", time + 0.2, 0.94);
    }

    if (phase === 2) {
      drawPath(backbone, "#64d9ff", 1.8, 0.5);
      drawPath(sourceToBase, "#a783ff", 2, 0.86, [], smooth(progress / 0.48));
      const stalledProgress = smooth(Math.min(progress, 0.46) / 0.46);
      drawPacket(pointAlong(sourceToBase, stalledProgress), "#c9a5ff", 0.96, 4.5);
      drawFault(projected.base, progress, now, "基地台損壞");
      drawPulse(projected.landingWest, "#6edcff", time + 0.2, 0.34);
      drawPulse(projected.landingEast, "#6edcff", time + 0.4, 0.34);
    }

    if (phase === 3) {
      drawPath(backbone, "#65d8ff", 1.35, 0.28);
      drawPath(droneRelay, "#83d9ff", 2.25, 0.9, [], smooth((progress - 0.06) / 0.72));
      const packetProgress = smooth(Math.min(progress, 0.82) / 0.82);
      drawPacket(pointAlong(droneRelay, packetProgress), "#e5f8ff", 1, 4.4);
      drawPulse(projected.source, "#b58cff", time + 0.12, 0.86);
      if (packetProgress > 0.36) drawPulse(projected.drone, "#8edfff", time + 0.28, 0.96);
      if (packetProgress > 0.9) drawPulse(projected.center, "#77efd6", time + 0.24, 0.9);
    }

    if (phase === 4) {
      const droneExit = 1 - smooth(progress / 0.34);
      const faultFlash = Math.sin(Math.min(1, progress / 0.58) * Math.PI);
      drawPath(backbone, "#65d8ff", 1.3, 0.27);
      drawPath(droneRelay, "#a277d8", 1.6, 0.72 * droneExit, [5, 8]);
      const stalledPoint = pointAlong(droneRelay, 0.5);
      drawPacket(stalledPoint, "#c394ff", 0.9 * droneExit, 4.5);
      drawFault(projected.drone, faultFlash, now, progress < 0.36 ? "無人機故障" : "");
      drawPulse(projected.source, "#b58cff", time, 0.54);
    }

    if (phase === 5) {
      drawPath(backbone, "#65d8ff", 1.3, 0.27);
      drawPath(satelliteRelay, "#d1efff", 2.35, 0.94);
      const outboundProgress = smooth(Math.min(progress, 0.58) / 0.58);
      drawPacket(pointAlong(satelliteRelay, outboundProgress), "#f4fcff", 1, 4.7);
      if (outboundProgress > 0.36) drawPulse(projected.satellite, "#b7a4ff", time + 0.24, 0.96);
      if (outboundProgress > 0.9) drawPulse(projected.center, "#77efd6", time + 0.12, 1);

      const ackProgress = smooth(Math.max(0, progress - 0.56) / 0.36);
      if (ackProgress > 0) {
        const reverse = [...satelliteRelay].reverse();
        drawPath(reverse, "#a6b3ff", 1.3, 0.82, [], ackProgress);
        drawPacket(pointAlong(reverse, ackProgress), "#d8ddff", 1, 3.3);
      }
      if (ackProgress > 0.9) drawPulse(projected.source, "#c7a7ff", time, 1);
      if (message) {
        message.textContent = ackProgress > 0.68
          ? "目標地已接收，衛星 ACK 精準返回求救源"
          : ackProgress > 0.05
            ? "目標地已接收，ACK 正沿高成本衛星鏈路返回"
            : phases[phase].message;
      }
    }

    const endpointsVisible = phase !== 0 || progress > 0.4;
    if (endpointsVisible) {
      drawEndpoint(projected.source, nodes.source.label, "right", "#b88cff");
      drawEndpoint(projected.center, nodes.center.label, "left", "#70efd3");
    }
    drawLabel(projected.base, nodes.base.label, -12, -15, phase === 2 ? 1 : 0.78);
    drawLabel(projected.landingWest, "海纜登陸站", 11, 19, 0.72);
    drawLabel(projected.landingEast, nodes.landingEast.label, 11, 18, 0.84);
    if (phase === 3) drawLabel(projected.drone, nodes.drone.label, -12, -12, 0.94, "#d9f5ff");
    if (phase === 4 && progress < 0.36) drawLabel(projected.drone, "無人機故障", -12, -12, 0.94, "#c9a7ff");
    if (phase === 5) drawLabel(projected.satellite, "高成本衛星備援", 12, -10, 0.98, "#e7e3ff");

    return { width, height };
  }

  function updateAssets(now, progress, scene, airNodes, exitProgress = 0) {
    const build = phase === 0 ? smooth((progress - 0.1) / 0.78) : 1;
    const ignition = phase === 0 ? smooth(progress / 0.16) : 1;
    const visibility = 1 - smooth((exitProgress - 0.04) / 0.7);
    if (terrain) {
      terrain.style.opacity = String((0.01 + build * 0.64) * visibility);
      const buildClip = (1 - build) * 84;
      const recoveryClip = smooth(exitProgress) * 88;
      terrain.style.clipPath = `inset(${Math.max(buildClip, recoveryClip)}% 0 0 0)`;
    }

    if (emitter) {
      const pulse = reducedMotion.matches ? 0.86 : 0.82 + Math.sin(now * 0.0024) * 0.07;
      const recoveryGlow = exitProgress > 0 ? 1 + Math.sin(exitProgress * Math.PI) * 0.16 : 1;
      const finalFade = 1 - smooth((exitProgress - 0.84) / 0.16);
      emitter.style.opacity = String((phase === 0 ? 0.46 + ignition * 0.46 : pulse) * recoveryGlow * finalFade);
    }

    const dronePoint = project(airNodes.drone, scene.width, scene.height);
    if (drone) {
      drone.style.left = `${dronePoint.x}px`;
      drone.style.top = `${dronePoint.y}px`;
      const droneOpacity = phase === 3
        ? 0.92 * smooth(progress / 0.24)
        : phase === 4
          ? 0.9 * (1 - smooth(progress / 0.34))
          : 0;
      drone.style.opacity = String(droneOpacity * visibility);
      const exitTilt = phase === 4 ? 10 * smooth(progress / 0.34) : Math.sin(now * 0.0015) * 2.2;
      drone.style.transform = `translate(-50%, -50%) rotate(${exitTilt}deg) scale(${phase === 4 ? 1 - smooth(progress / 0.34) * 0.18 : 1})`;
    }

    const satellitePoint = project(airNodes.satellite, scene.width, scene.height);
    if (satellite) {
      satellite.style.left = `${satellitePoint.x}px`;
      satellite.style.top = `${satellitePoint.y}px`;
      satellite.style.opacity = String((phase === 5 ? 0.95 * smooth(progress / 0.24) : 0) * visibility);
      satellite.style.transform = "translate(-50%, -50%) rotate(-4deg)";
    }
  }

  function finishExit() {
    if (!exiting) return;
    exiting = false;
    root.dataset.exiting = "false";
    root.style.removeProperty("--holo-exit-progress");
    if (model) model.style.opacity = "";
    const callback = exitCallback;
    exitCallback = null;
    callback?.();
  }

  function requestExit(callback) {
    if (!panel.classList.contains("active")) return false;
    exitCallback = typeof callback === "function" ? callback : exitCallback;
    if (exiting) return true;
    exiting = true;
    exitDuration = reducedMotion.matches ? 100 : 260;
    exitStartedAt = performance.now();
    frozenProgress = clamp((exitStartedAt - phaseStartedAt) / phases[phase].duration, 0, 0.999);
    running = false;
    root.dataset.running = "false";
    root.dataset.exiting = "true";
    if (playButton) playButton.textContent = "回收投影中";
    startFrameLoop();
    return true;
  }

  function frame(now) {
    frameId = 0;
    const active = panel.classList.contains("active");
    if (!active || document.hidden || transitionSuspended) return;
    if (now - lastRenderedAt < frameInterval) {
      frameId = global.requestAnimationFrame(frame);
      return;
    }
    lastRenderedAt = now;
    lastFrameAt = now;

    if (exiting) {
      const exitProgress = clamp((now - exitStartedAt) / exitDuration, 0, 1);
      root.style.setProperty("--holo-exit-progress", String(exitProgress));
      const airNodes = resolveAirNodes(now, frozenProgress);
      drawProjectionParticles(now, frozenProgress, exitProgress);
      const scene = drawScene(now, frozenProgress, airNodes);
      updateAssets(now, frozenProgress, scene, airNodes, exitProgress);
      if (model) model.style.opacity = String(1 - smooth((exitProgress - 0.08) / 0.68));
      if (exitProgress >= 1) finishExit();
      frameId = global.requestAnimationFrame(frame);
      return;
    }
    const elapsed = Math.max(0, now - phaseStartedAt);
    let progress = running ? elapsed / phases[phase].duration : frozenProgress;
    if (running && progress >= 1) {
      if (phase === phases.length - 1) {
        progress = 0.999;
        global.STARRYLINK_NAVIGATION?.go?.("matrix", { source: "demo-complete" });
      } else {
        setPhase(phase + 1);
        progress = 0;
      }
    }
    progress = clamp(progress, 0, 1);
    const airNodes = resolveAirNodes(now, progress);
    drawProjectionParticles(now, progress, 0);
    const scene = drawScene(now, progress, airNodes);
    updateAssets(now, progress, scene, airNodes, 0);

    if (!reducedMotion.matches && !transitionSuspended) frameId = global.requestAnimationFrame(frame);
  }

  function startFrameLoop() {
    if (frameId || document.hidden || transitionSuspended || !panel.classList.contains("active")) return;
    lastRenderedAt = 0;
    frameId = global.requestAnimationFrame(frame);
  }

  function stopFrameLoop() {
    global.cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function suspendForTransition() {
    if (transitionSuspended) return;
    transitionSuspended = true;
    activeWhenSuspended = panel.classList.contains("active");
    resumeRunning = running;
    setRunning(false);
    stopFrameLoop();
    root.dataset.transitionSuspended = "true";
  }

  function resumeAfterTransition() {
    if (!transitionSuspended) return;
    transitionSuspended = false;
    root.removeAttribute("data-transition-suspended");
    if (!panel.classList.contains("active")) return;
    setRunning(activeWhenSuspended ? resumeRunning : true);
    startFrameLoop();
  }

  playButton?.addEventListener("click", () => setRunning(!running));
  restartButton?.addEventListener("click", () => {
    exiting = false;
    exitCallback = null;
    root.dataset.exiting = "false";
    if (model) model.style.opacity = "";
    setPhase(0);
    setRunning(true);
  });

  phaseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (exiting) return;
      setPhase(Number(button.dataset.hologramPhase || 0));
      setRunning(true);
    });
  });

  reducedMotion.addEventListener?.("change", () => {
    if (reducedMotion.matches) {
      setPhase(5, { progress: 0.92 });
      setRunning(false);
    } else {
      setPhase(0);
      setRunning(true);
    }
    startFrameLoop();
  });

  const observer = new MutationObserver(() => {
    if (panel.classList.contains("active")) {
      exiting = false;
      exitCallback = null;
      root.dataset.exiting = "false";
      if (model) model.style.opacity = "";
      if (reducedMotion.matches) {
        setPhase(5, { progress: 0.92 });
        setRunning(false);
        startFrameLoop();
        return;
      }
      const fromArchitecture = global.__STARRYLINK_ARCH_HANDOFF === true;
      if (fromArchitecture) delete global.__STARRYLINK_ARCH_HANDOFF;
      root.dataset.entry = fromArchitecture ? "handoff" : "direct";
      setPhase(0, { progress: fromArchitecture ? 0.06 : 0 });
      setRunning(true);
      startFrameLoop();
    } else if (!panel.classList.contains("active")) {
      stopFrameLoop();
    }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ["class"] });

  global.addEventListener("resize", () => {
    projectionOriginCache = null;
    canvas.width = 1;
    canvas.height = 1;
    particleCanvas.width = 1;
    particleCanvas.height = 1;
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopFrameLoop();
    else startFrameLoop();
  });

  setPhase(phase, { progress: reducedMotion.matches ? 0.92 : 0 });
  setRunning(running);
  root.dataset.exiting = "false";
  startFrameLoop();
  global.STARRYLINK_HOLOGRAM = {
    requestExit,
    suspendForTransition,
    resumeAfterTransition,
    getState() {
      return {
        phase,
        running,
        exiting,
        phaseStartedAt,
        lastFrameAt,
        duration: phases[phase].duration,
        progress: clamp((lastFrameAt - phaseStartedAt) / phases[phase].duration, 0, 1),
        transitionSuspended,
      };
    },
    restart() {
      exiting = false;
      exitCallback = null;
      root.dataset.exiting = "false";
      if (model) model.style.opacity = "";
      setPhase(0);
      setRunning(true);
    },
  };
  global.addEventListener("pagehide", () => global.cancelAnimationFrame(frameId), { once: true });
})(window);
