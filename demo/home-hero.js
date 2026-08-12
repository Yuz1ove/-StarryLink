(function initStarryLinkHomeHero(global) {
  "use strict";

  const root = document.querySelector("[data-home-hero]");
  if (!root) return;

  const heroData = global.STARRYLINK_HOME_HERO_DATA || {};
  const heroContent = heroData.content || {};
  const heroRoutes = heroData.routes || {};

  function valueAtPath(source, path) {
    return String(path || "")
      .split(".")
      .filter(Boolean)
      .reduce((value, key) => value?.[key], source);
  }

  function hydrateHeroContent() {
    root.querySelectorAll("[data-hero-content]").forEach((node) => {
      const value = valueAtPath(heroContent, node.dataset.heroContent);
      if (typeof value === "string") node.textContent = value;
    });

    let letterIndex = 0;
    root.querySelectorAll("[data-hero-letter-group]").forEach((group) => {
      const value = valueAtPath(heroContent, group.dataset.heroLetterGroup);
      if (typeof value !== "string") return;
      const letters = Array.from(value, (letter) => {
        const span = document.createElement("span");
        span.className = "home-hero-letter";
        span.textContent = letter;
        const direction = letterIndex % 2 === 0 ? -1 : 1;
        span.style.setProperty("--hero-letter-index", String(letterIndex));
        span.style.setProperty("--hero-letter-delay", `${820 + letterIndex * 72}ms`);
        span.style.setProperty("--hero-letter-y", `${direction * 0.2}em`);
        span.style.setProperty("--hero-letter-rotate-x", `${direction * 58}deg`);
        span.style.setProperty("--hero-letter-rotate-z", `${direction * 10}deg`);
        span.style.setProperty("--hero-letter-overshoot-y", `${direction * -0.025}em`);
        span.style.setProperty("--hero-letter-overshoot-x", `${direction * -5}deg`);
        span.style.setProperty("--hero-letter-overshoot-z", `${direction * -1}deg`);
        letterIndex += 1;
        return span;
      });
      group.replaceChildren(...letters);
    });
    root.dataset.wordmarkLetterCount = String(letterIndex);

    const wordmark = root.querySelector(".home-hero-wordmark");
    if (heroContent.wordmark?.label) {
      wordmark?.setAttribute("aria-label", heroContent.wordmark.label);
      if (wordmark) wordmark.dataset.wordmark = heroContent.wordmark.label;
    }
    const actions = root.querySelector(".home-hero-actions");
    if (heroContent.actions?.label) actions?.setAttribute("aria-label", heroContent.actions.label);
    if (heroContent.heroLabel) root.setAttribute("aria-label", heroContent.heroLabel);
    root.dataset.contentMounted = "true";
  }

  function hydrateRelayGeometry(sceneName = heroRoutes.sceneOrder?.[0]) {
    let mountedMaps = 0;
    root.querySelectorAll("[data-relay-map]").forEach((map) => {
      const mapName = map.dataset.relayMap;
      const route = heroRoutes.scenes?.[sceneName]?.[mapName] || heroRoutes.original?.[mapName] || heroRoutes[mapName];
      if (!route?.paths || !route?.nodes) return;

      map.querySelectorAll("[data-route-path]").forEach((path) => {
        const value = route.paths[path.dataset.routePath];
        if (value) path.setAttribute("d", value);
      });
      map.querySelectorAll("[data-segment]").forEach((path) => {
        const value = route.paths[path.dataset.segment];
        if (value) path.setAttribute("d", value);
      });
      map.querySelectorAll("[data-ack]").forEach((path) => {
        const value = route.paths[path.dataset.ack];
        if (value) path.setAttribute("d", value);
      });
      map.querySelectorAll("[data-node]").forEach((node) => {
        const point = route.nodes[node.dataset.node];
        if (point) node.setAttribute("transform", `translate(${point[0]} ${point[1]})`);
      });
      const breakPoint = route.breakPoint;
      if (breakPoint) map.querySelector("[data-relay-break]")?.setAttribute("transform", `translate(${breakPoint[0]} ${breakPoint[1]})`);
      mountedMaps += 1;
    });
    root.dataset.routeDataMounted = mountedMaps === 2 ? "true" : "false";
    if (mountedMaps === 2 && sceneName) root.dataset.routeScene = sceneName;
  }

  function applyStudyMode() {
    const mode = root.dataset.studyMode || heroData.study?.defaultMode || "content";
    const isRouteStudy = mode === "routes";
    const copy = root.querySelector("[data-hero-copy]");
    root.dataset.studyMode = mode;
    root.classList.toggle("is-route-study", isRouteStudy);
    if (copy) {
      copy.hidden = false;
      copy.removeAttribute("inert");
      copy.setAttribute("aria-hidden", "false");
    }
  }

  hydrateHeroContent();
  hydrateRelayGeometry();
  applyStudyMode();

  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const MOBILE_QUERY = "(max-width: 820px)";
  const PAGE_TRANSITION_FOCUS_WINDOW = 1400;
  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function smoothSvgPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[Math.max(0, index - 1)];
      const current = points[index];
      const next = points[index + 1];
      const following = points[Math.min(points.length - 1, index + 2)];
      const control1 = {
        x: current.x + (next.x - previous.x) / 6,
        y: current.y + (next.y - previous.y) / 6,
      };
      const control2 = {
        x: next.x - (following.x - current.x) / 6,
        y: next.y - (following.y - current.y) / 6,
      };
      path += ` C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)} ${control2.x.toFixed(2)} ${control2.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }
    return path;
  }

  class HeroStarfield {
    constructor(canvas, motionQuery, mobileQuery) {
      this.canvas = canvas;
      this.context = canvas?.getContext("2d", { alpha: true });
      this.motionQuery = motionQuery;
      this.mobileQuery = mobileQuery;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.layers = [];
      this.active = false;
      this.frameId = 0;
      this.lastFrameAt = 0;
      this.pointerTarget = { x: 0, y: 0 };
      this.pointerCurrent = { x: 0, y: 0 };
      this.drawFrame = this.drawFrame.bind(this);
      this.resize = this.resize.bind(this);

      if (global.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(root);
      } else {
        global.addEventListener("resize", this.resize, { passive: true });
      }
      this.resize();
    }

    createLayer(count, depth) {
      const radiusRange = [
        [0.45, 0.9],
        [0.75, 1.35],
        [1.15, 1.9],
      ][depth];
      const alphaRange = [
        [0.18, 0.48],
        [0.3, 0.66],
        [0.5, 0.84],
      ][depth];

      let seed = 0x51a7 + depth * 0x9e37 + (this.mobileQuery.matches ? 0x2244 : 0x7711);
      const random = () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
      const clusters = [
        { x: 0.28, y: 0.38, spreadX: 0.32, spreadY: 0.28 },
        { x: 0.7, y: 0.58, spreadX: 0.34, spreadY: 0.3 },
        { x: 0.5, y: 0.18, spreadX: 0.38, spreadY: 0.16 },
      ];
      const colors = ["202, 232, 255", "222, 241, 255", "239, 248, 255", "184, 218, 246"];

      return Array.from({ length: count }, (_, index) => {
        const cluster = clusters[index % clusters.length];
        const clustered = random() < 0.2;
        const x = clustered ? clamp(cluster.x + (random() + random() - 1) * cluster.spreadX, 0.01, 0.99) : random();
        const y = clustered ? clamp(cluster.y + (random() + random() - 1) * cluster.spreadY, 0.01, 0.99) : random();
        const inTitleQuietZone = x > 0.28 && x < 0.72 && y > 0.3 && y < 0.62;
        return {
          x,
          y,
          radius: radiusRange[0] + random() * (radiusRange[1] - radiusRange[0]),
          alpha: (alphaRange[0] + random() * (alphaRange[1] - alphaRange[0])) * (inTitleQuietZone ? 0.56 : 1),
          phase: random() * TAU,
          speed: 0.00016 + random() * 0.0005,
          color: colors[Math.floor(random() * colors.length)],
          cross: depth === 2 && index < (this.mobileQuery.matches ? 2 : 4),
          glow: depth > 0 && index < (this.mobileQuery.matches ? 3 : 7),
          driftX: (random() - 0.5) * (depth + 1) * 1.8,
          driftY: (random() - 0.5) * (depth + 1) * 1.4,
        };
      });
    }

    resize() {
      if (!this.context || !this.canvas) return;
      const bounds = root.getBoundingClientRect();
      this.width = Math.max(1, Math.round(bounds.width || global.innerWidth));
      this.height = Math.max(1, Math.round(bounds.height || global.innerHeight));
      this.dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const counts = this.mobileQuery.matches ? [54, 26, 8] : [110, 56, 16];
      this.layers = counts.map((count, depth) => this.createLayer(count, depth));
      root.dataset.starCount = String(counts.reduce((total, count) => total + count, 0));
      this.render(0);
    }

    setPointer(x, y) {
      this.pointerTarget.x = clamp(x, -1, 1);
      this.pointerTarget.y = clamp(y, -1, 1);
    }

    render(timestamp) {
      if (!this.context) return;
      const context = this.context;
      const reduced = this.motionQuery.matches;
      context.clearRect(0, 0, this.width, this.height);

      this.layers.forEach((stars, depth) => {
        const parallax = [3, 7, 13][depth];
        const offsetX = this.pointerCurrent.x * parallax;
        const offsetY = this.pointerCurrent.y * parallax;

        stars.forEach((star) => {
          const shimmer = reduced ? 0.88 : 0.8 + Math.sin(timestamp * star.speed + star.phase) * 0.2;
          const drift = reduced ? 0 : Math.sin(timestamp * star.speed * 0.36 + star.phase);
          const x = star.x * this.width + offsetX + drift * star.driftX;
          const y = star.y * this.height + offsetY + drift * star.driftY;
          const color = star.color;
          const alpha = star.alpha * shimmer;

          if (star.glow) {
            const glowRadius = star.radius * (star.cross ? 6.2 : 4.2);
            const gradient = context.createRadialGradient(x, y, 0, x, y, glowRadius);
            gradient.addColorStop(0, `rgba(${color}, ${alpha * 0.14})`);
            gradient.addColorStop(1, `rgba(${color}, 0)`);
            context.fillStyle = gradient;
            context.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);
          }

          context.beginPath();
          context.fillStyle = `rgba(${color}, ${alpha})`;
          context.arc(x, y, star.radius, 0, TAU);
          context.fill();

          if (star.cross && !this.mobileQuery.matches) {
            const ray = star.radius * 4.1;
            context.save();
            context.strokeStyle = `rgba(${color}, ${alpha * 0.28})`;
            context.lineWidth = 0.5;
            context.beginPath();
            context.moveTo(x - ray, y);
            context.lineTo(x + ray, y);
            context.moveTo(x, y - ray * 0.65);
            context.lineTo(x, y + ray * 0.65);
            context.stroke();
            context.restore();
          }
        });
      });
    }

    drawFrame(timestamp) {
      if (!this.active || this.motionQuery.matches || document.hidden) return;
      if (timestamp - this.lastFrameAt < 32) {
        this.frameId = global.requestAnimationFrame(this.drawFrame);
        return;
      }
      this.lastFrameAt = timestamp;
      this.pointerCurrent.x += (this.pointerTarget.x - this.pointerCurrent.x) * 0.055;
      this.pointerCurrent.y += (this.pointerTarget.y - this.pointerCurrent.y) * 0.055;
      this.render(timestamp);
      this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    start() {
      if (this.active) return;
      this.active = true;
      if (this.motionQuery.matches) {
        this.pointerCurrent.x = 0;
        this.pointerCurrent.y = 0;
        this.render(0);
        return;
      }
      this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    stop() {
      this.active = false;
      global.cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }

    destroy() {
      this.stop();
      this.resizeObserver?.disconnect();
      if (!this.resizeObserver) global.removeEventListener("resize", this.resize);
    }
  }

  class RelayStory {
    constructor(heroRoot, motionQuery, mobileQuery, onFailure, data) {
      this.root = heroRoot;
      this.motionQuery = motionQuery;
      this.mobileQuery = mobileQuery;
      this.onFailure = onFailure;
      this.data = data || {};
      this.content = this.data.content?.relay || {};
      this.routeStory = this.data.routes?.story || {};
      this.controller = null;
      this.failed = false;
      this.hasStartedOnce = false;
      this.loopCount = 0;
      this.wordmark = heroRoot.querySelector(".home-hero-wordmark");
      this.status = heroRoot.querySelector("[data-hero-status]");
      this.root.dataset.relayPhase = "idle";
      this.root.dataset.loopCount = "0";
    }

    currentMap() {
      const name = this.mobileQuery.matches ? "mobile" : "desktop";
      return this.root.querySelector(`[data-relay-map="${name}"]`);
    }

    setPhase(phase, description) {
      this.root.dataset.relayPhase = phase;
      if (description && this.status) this.status.textContent = description;
    }

    message(key, replacements = {}) {
      const template = this.content.status?.[key] || "";
      return Object.entries(replacements).reduce(
        (message, entry) => message.replaceAll(`{${entry[0]}}`, entry[1]),
        template
      );
    }

    nodeLabel(node) {
      return node?.querySelector("text:not(.relay-delivery-note)")?.textContent.trim() || node?.dataset.node || "";
    }

    delay(duration, signal) {
      return new Promise((resolve) => {
        if (signal.aborted) {
          resolve(false);
          return;
        }
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          global.clearTimeout(timerId);
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        };
        const onAbort = () => finish(false);
        const timerId = global.setTimeout(() => finish(true), duration);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    updateMeteorPose(path, head, distance, length, reverse = false) {
      const point = path.getPointAtLength(distance);
      const before = path.getPointAtLength(clamp(distance - 3, 0, length));
      const after = path.getPointAtLength(clamp(distance + 3, 0, length));
      const travelAngle = Math.atan2(after.y - before.y, after.x - before.x) + (reverse ? Math.PI : 0);
      const angleDegrees = (travelAngle * 180) / Math.PI;
      const body = head.querySelector("[data-meteor-body]");
      head.setAttribute("transform", `translate(${point.x} ${point.y})`);
      body?.setAttribute("transform", `rotate(${angleDegrees})`);
      head.dataset.pointX = String(point.x);
      head.dataset.pointY = String(point.y);
      head.dataset.angle = String(angleDegrees);

      const direction = reverse ? -1 : 1;
      const offsets = [82, 64, 46, 30, 17, 7, 0];
      const cosine = Math.cos(travelAngle);
      const sine = Math.sin(travelAngle);
      const trail = offsets.map((offset) => {
        const sampleDistance = clamp(distance - direction * offset, 0, length);
        const sample = path.getPointAtLength(sampleDistance);
        const deltaX = sample.x - point.x;
        const deltaY = sample.y - point.y;
        return {
          x: deltaX * cosine + deltaY * sine,
          y: -deltaX * sine + deltaY * cosine,
        };
      });
      const curvature = trail[0]?.y || trail[Math.floor(trail.length / 2)]?.y || 0;
      const inertiaDirection = Math.abs(curvature) > 0.75 ? Math.sign(curvature) : -1;
      const wisp = trail.map((sample, index) => {
        const progress = index / Math.max(1, trail.length - 1);
        const envelope = Math.sin(progress * Math.PI) * (1 - progress) * 7;
        return { x: sample.x, y: sample.y + inertiaDirection * envelope };
      });
      head.querySelector(".relay-meteor-tail-primary")?.setAttribute("d", smoothSvgPath(trail));
      head.querySelector(".relay-meteor-tail-wisp")?.setAttribute("d", smoothSvgPath(wisp));
    }

    snapMeteorToNode(map, name) {
      const head = map?.querySelector("[data-signal-head]");
      const node = map?.querySelector(`[data-node="${name}"]`);
      const matrix = node?.transform?.baseVal?.consolidate()?.matrix;
      if (!head || !matrix) return;
      head.setAttribute("transform", `translate(${matrix.e} ${matrix.f})`);
      head.dataset.pointX = String(matrix.e);
      head.dataset.pointY = String(matrix.f);
      head.classList.add("is-resting");
    }

    travel(path, head, duration, signal, options = {}) {
      return new Promise((resolve) => {
        if (!path || !head || signal.aborted) {
          resolve(false);
          return;
        }

        const length = path.getTotalLength();
        const reverse = Boolean(options.reverse);
        const ack = Boolean(options.ack);
        let frameId = 0;
        let startedAt = 0;
        let settled = false;

        if (ack) {
          path.style.strokeDasharray = `26 ${length + 26}`;
        } else {
          path.style.strokeDasharray = `${length} ${length}`;
          path.style.strokeDashoffset = String(length);
        }
        path.classList.add("is-active");
        head.classList.add("is-active");
        head.classList.remove("is-resting");

        const finish = (value) => {
          if (settled) return;
          settled = true;
          global.cancelAnimationFrame(frameId);
          signal.removeEventListener("abort", onAbort);
          path.classList.remove("is-active");
          if (!options.keepHead || !value) head.classList.remove("is-active");
          if (!ack && value) {
            path.classList.add("is-complete");
            path.style.strokeDasharray = "none";
            path.style.strokeDashoffset = "0";
          }
          if (ack) {
            path.style.strokeDasharray = "";
            path.style.strokeDashoffset = "";
          }
          resolve(value);
        };

        const onAbort = () => finish(false);
        const draw = (timestamp) => {
          if (!startedAt) startedAt = timestamp;
          const linear = clamp((timestamp - startedAt) / duration, 0, 1);
          const progress = easeOutCubic(linear);
          const distance = reverse ? length * (1 - progress) : length * progress;
          if (head.tagName.toLowerCase() === "g") {
            this.updateMeteorPose(path, head, distance, length, reverse);
          } else {
            const point = path.getPointAtLength(distance);
            head.setAttribute("cx", String(point.x));
            head.setAttribute("cy", String(point.y));
          }
          if (ack) path.style.strokeDashoffset = String(-distance);
          else path.style.strokeDashoffset = String(length * (1 - progress));

          if (linear >= 1) finish(true);
          else frameId = global.requestAnimationFrame(draw);
        };

        signal.addEventListener("abort", onAbort, { once: true });
        frameId = global.requestAnimationFrame(draw);
      });
    }

    resetMap(map) {
      if (!map) return;
      map.querySelectorAll(".relay-direct, .relay-segment, .relay-ack-path").forEach((path) => {
        path.classList.remove("is-active", "is-complete", "is-broken");
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
      });
      map.querySelectorAll(".relay-node").forEach((node) => {
        node.classList.remove("is-origin-active", "is-receiving", "is-holding", "is-handoff", "is-confirming", "is-delivered", "is-unavailable");
      });
      map.querySelectorAll("[data-relay-break]").forEach((node) => node.classList.remove("is-visible"));
      map.querySelectorAll(".relay-direct-future").forEach((path) => path.classList.remove("is-fading"));
      map.querySelectorAll("[data-signal-head], [data-ack-head]").forEach((head) => head.classList.remove("is-active", "is-resting"));
    }

    reset() {
      this.root.classList.remove("is-resetting");
      this.root.querySelectorAll("[data-relay-map]").forEach((map) => this.resetMap(map));
      this.wordmark?.classList.remove("is-linked");
      this.setPhase("idle", this.message("idle"));
    }

    async receiveAndHold(map, name, signal) {
      const node = map.querySelector(`[data-node="${name}"]`);
      if (!node) return false;
      this.snapMeteorToNode(map, name);

      this.setPhase(`${name}-receive`, this.message("receive", { node: this.nodeLabel(node) }));
      node.classList.add("is-receiving");
      if (!(await this.delay(340, signal))) return false;
      node.classList.remove("is-receiving");

      this.setPhase(`${name}-unavailable`, this.message("unavailable", { node: this.nodeLabel(node) }));
      node.classList.add("is-unavailable");
      if (!(await this.delay(820, signal))) return false;
      return true;
    }

    async confirmNode(map, name, signal) {
      const node = map.querySelector(`[data-node="${name}"]`);
      if (!node) return false;
      node.classList.remove("is-unavailable");
      node.classList.add("is-confirming");
      const completed = await this.delay(115, signal);
      node.classList.remove("is-confirming");
      return completed;
    }

    async runCycle(signal) {
      const map = this.currentMap();
      if (!map) return false;
      this.reset();
      const sceneOrder = this.data.routes?.sceneOrder || ["original"];
      const sceneName = sceneOrder[this.loopCount % sceneOrder.length];
      hydrateRelayGeometry(sceneName);
      this.setPhase("reframing");
      if (!(await this.delay(this.loopCount > 0 ? 420 : 120, signal))) return false;

      const signalHead = map.querySelector("[data-signal-head]");
      const ackHead = map.querySelector("[data-ack-head]");

      const fallbackRoute = [
        { segment: "origin-ground", source: "origin", node: "ground", duration: 760 },
        { segment: "ground-drone", source: "ground", node: "drone", duration: 820 },
        { segment: "drone-satellite", source: "drone", node: "satellite", duration: 760 },
        { segment: "satellite-center", source: "satellite", node: "center", duration: 800 },
      ];
      const route = this.routeStory.forward || fallbackRoute;
      const origin = map.querySelector('[data-node="origin"]');
      origin?.classList.add("is-origin-active", "is-unavailable");
      this.setPhase("origin-alert", this.message("originAlert", { node: this.nodeLabel(origin) || "基地台中繼" }));
      if (!(await this.delay(880, signal))) return false;

      for (const hop of route) {
        const source = map.querySelector(`[data-node="${hop.source}"]`);
        this.setPhase(`${hop.source}-handoff`, this.message("handoff", { node: this.nodeLabel(source) || hop.source }));
        source?.classList.add("is-handoff");
        const path = map.querySelector(`[data-segment="${hop.segment}"]`);
        const releaseHandoff = this.delay(460, signal).then(() => source?.classList.remove("is-handoff"));
        const traveled = await this.travel(path, signalHead, hop.duration, signal, { keepHead: true });
        await releaseHandoff;
        source?.classList.remove("is-handoff");
        if (!traveled) return false;
        if (hop.node === "center") break;
        if (!(await this.receiveAndHold(map, hop.node, signal))) return false;
      }

      const center = map.querySelector('[data-node="center"]');
      this.snapMeteorToNode(map, "center");
      this.setPhase("center-receive", this.message("centerReceive"));
      center?.classList.add("is-receiving");
      if (!(await this.delay(340, signal))) return false;
      center?.classList.remove("is-receiving");
      center?.classList.add("is-holding");
      this.setPhase("center-hold");
      if (!(await this.delay(920, signal))) return false;
      center?.classList.remove("is-holding");
      center?.classList.add("is-delivered");
      this.setPhase("delivered", this.message("delivered"));
      if (!(await this.delay(1500, signal))) return false;

      signalHead?.classList.remove("is-active");
      this.setPhase("ack-return", this.message("ackReturn"));
      const fallbackAckRoute = [
        { segment: "satellite-center", node: "satellite" },
        { segment: "drone-satellite", node: "drone" },
        { segment: "ground-drone", node: "ground" },
        { segment: "origin-ground", node: "origin" },
      ];
      const ackRoute = this.routeStory.ack || fallbackAckRoute;
      for (const hop of ackRoute) {
        const path = map.querySelector(`[data-ack="${hop.segment}"]`);
        if (!(await this.travel(path, ackHead, 220, signal, { reverse: true, ack: true }))) return false;
        if (!(await this.confirmNode(map, hop.node, signal))) return false;
      }

      if (this.wordmark) {
        this.wordmark.classList.remove("is-linked");
        void this.wordmark.offsetWidth;
        this.wordmark.classList.add("is-linked");
      }
      this.setPhase("ack-complete", this.message("ackComplete"));
      if (!(await this.delay(1200, signal))) return false;
      this.wordmark?.classList.remove("is-linked");
      if (!(await this.delay(3200, signal))) return false;

      this.root.classList.add("is-resetting");
      this.setPhase("resetting");
      if (!(await this.delay(650, signal))) return false;
      this.loopCount += 1;
      this.root.dataset.loopCount = String(this.loopCount);
      return true;
    }

    async run(signal, initialDelay) {
      if (!(await this.delay(initialDelay, signal))) return;
      while (!signal.aborted) {
        const completed = await this.runCycle(signal);
        if (!completed || signal.aborted) return;
        this.reset();
        if (!(await this.delay(800, signal))) return;
      }
    }

    start() {
      if (this.controller || this.motionQuery.matches || this.failed) return;
      const controller = new AbortController();
      this.controller = controller;
      const initialDelay = this.hasStartedOnce ? 650 : 3300;
      this.hasStartedOnce = true;
      this.run(controller.signal, initialDelay).catch(() => {
        if (controller.signal.aborted || this.controller !== controller) return;
        this.controller = null;
        this.failed = true;
        this.reset();
        this.root.removeAttribute("data-enhanced");
        this.root.dataset.animation = "static";
        this.setPhase("static-fallback");
        this.onFailure?.();
      });
    }

    stop() {
      this.controller?.abort();
      this.controller = null;
      this.reset();
    }

    showReducedState() {
      this.stop();
      this.root.dataset.motion = "reduced";
      this.setPhase("delivered", this.message("reduced"));
    }

    enableMotion() {
      this.root.dataset.motion = "full";
      this.reset();
    }

    destroy() {
      this.stop();
    }
  }

  const motionQuery = global.matchMedia(REDUCED_MOTION_QUERY);
  const mobileQuery = global.matchMedia(MOBILE_QUERY);
  const canvas = root.querySelector("[data-hero-starfield]");
  const lightfield = root.querySelector(".home-hero-lightfield");
  const wordmark = root.querySelector(".home-hero-wordmark");
  const introPanel = root.closest(".intro-panel");
  const appShell = root.closest(".app-shell");
  const pageStage = appShell?.querySelector(".page-stage");
  const demoDisclaimer = appShell?.querySelector(".demo-disclaimer");
  const pageControls = appShell?.querySelector(".page-controls");
  const homeNavTabs = Array.from(appShell?.querySelectorAll(".nav-tab") || []);
  const navLabels = new Map(homeNavTabs.map((tab) => [tab, tab.getAttribute("aria-label")]));
  const primaryCta = root.querySelector(".home-hero-cta");
  const starfield = new HeroStarfield(canvas, motionQuery, mobileQuery);
  const relay = new RelayStory(root, motionQuery, mobileQuery, syncAnimationState, heroData);
  let pageActive = Boolean(introPanel?.classList.contains("active"));
  let heroIntersecting = true;
  let transitionSuspended = document.documentElement.classList.contains("is-starry-transitioning");
  let destroyed = false;
  let pendingPageControlFocus = null;
  let movedPageControlFocus = null;
  let pendingHeroDestination = null;
  let pageControlFocusTimer = 0;
  let heroDestinationTimer = 0;
  let heroDestinationFocusFrame = 0;
  let temporaryFocusTarget = null;
  let temporaryFocusHadTabindex = false;
  let brandTimer = 0;

  root.dataset.enhanced = "true";
  root.dataset.motion = motionQuery.matches ? "reduced" : "full";
  root.dataset.brandState = "entering";

  function scheduleBrandReady() {
    global.clearTimeout(brandTimer);
    brandTimer = global.setTimeout(() => {
      if (!destroyed) root.dataset.brandState = "ready";
    }, 3700);
  }

  function replayBrandEntrance() {
    global.clearTimeout(brandTimer);
    wordmark?.classList.remove("is-linked");
    if (motionQuery.matches) {
      root.dataset.brandState = "ready";
      return;
    }
    root.dataset.brandState = "reset";
    void root.offsetWidth;
    root.dataset.brandState = "entering";
    relay.enableMotion();
    scheduleBrandReady();
  }

  scheduleBrandReady();

  function animationsShouldRun() {
    return pageActive && heroIntersecting && !document.hidden && !transitionSuspended;
  }

  function mountHomeUtilities() {
    if (!introPanel) return;
    if (
      demoDisclaimer?.parentElement === introPanel &&
      pageControls?.parentElement === introPanel &&
      demoDisclaimer.classList.contains("home-below-utility") &&
      pageControls.classList.contains("home-below-utility")
    ) {
      pendingPageControlFocus = null;
      global.clearTimeout(pageControlFocusTimer);
      return;
    }
    const focusedControl = pageControls?.contains(document.activeElement) ? document.activeElement : pendingPageControlFocus;
    [demoDisclaimer, pageControls].forEach((element) => {
      if (!element) return;
      element.classList.add("home-below-utility");
      introPanel.append(element);
    });
    movedPageControlFocus = focusedControl;
    pendingPageControlFocus = null;
    global.clearTimeout(pageControlFocusTimer);
  }

  function restoreHomeUtilities() {
    if (!appShell || !pageStage) return;
    if (
      demoDisclaimer?.parentElement === appShell &&
      pageControls?.parentElement === appShell &&
      !demoDisclaimer.classList.contains("home-below-utility") &&
      !pageControls.classList.contains("home-below-utility")
    ) {
      pendingPageControlFocus = null;
      global.clearTimeout(pageControlFocusTimer);
      return;
    }
    const focusedControl = pageControls?.contains(document.activeElement) ? document.activeElement : pendingPageControlFocus;
    if (demoDisclaimer) {
      demoDisclaimer.classList.remove("home-below-utility");
      appShell.insertBefore(demoDisclaimer, pageStage);
    }
    if (pageControls) {
      pageControls.classList.remove("home-below-utility");
      appShell.insertBefore(pageControls, pageStage.nextSibling);
    }
    movedPageControlFocus = focusedControl;
    pendingPageControlFocus = null;
    global.clearTimeout(pageControlFocusTimer);
  }

  function restoreMovedPageControlFocus() {
    const focusTarget = movedPageControlFocus?.disabled
      ? pageControls?.querySelector("button:not(:disabled)")
      : movedPageControlFocus;
    focusTarget?.focus({ preventScroll: true });
    movedPageControlFocus = null;
  }

  function focusPendingHeroDestination() {
    if (!pendingHeroDestination) return;
    const destination = document.querySelector(`[data-page="${pendingHeroDestination}"].active`);
    if (!destination) return;
    const focusTarget = destination.querySelector(".page-header h2, h1, h2") || destination;
    clearTemporaryFocusTarget();
    const hadTabindex = focusTarget.hasAttribute("tabindex");
    if (!hadTabindex) focusTarget.setAttribute("tabindex", "-1");
    temporaryFocusTarget = focusTarget;
    temporaryFocusHadTabindex = hadTabindex;
    focusTarget.addEventListener("blur", clearTemporaryFocusTarget, { once: true });
    focusTarget.focus({ preventScroll: true });
    pendingHeroDestination = null;
    global.clearTimeout(heroDestinationTimer);
  }

  function schedulePendingHeroDestinationFocus() {
    const expectedDestination = pendingHeroDestination;
    if (!expectedDestination) return;
    global.cancelAnimationFrame(heroDestinationFocusFrame);
    heroDestinationFocusFrame = global.requestAnimationFrame(() => {
      heroDestinationFocusFrame = 0;
      if (pendingHeroDestination === expectedDestination) focusPendingHeroDestination();
    });
  }

  function clearTemporaryFocusTarget() {
    if (!temporaryFocusTarget) return;
    temporaryFocusTarget.removeEventListener("blur", clearTemporaryFocusTarget);
    if (!temporaryFocusHadTabindex) temporaryFocusTarget.removeAttribute("tabindex");
    temporaryFocusTarget = null;
    temporaryFocusHadTabindex = false;
  }

  function scopeMobileNavLabels(active) {
    homeNavTabs.forEach((tab) => {
      if (active) {
        tab.setAttribute("aria-label", tab.textContent.trim());
        return;
      }
      const original = navLabels.get(tab);
      if (original === null) tab.removeAttribute("aria-label");
      else tab.setAttribute("aria-label", original);
    });
  }

  function syncAnimationState() {
    if (destroyed) return;
    if (pageActive) mountHomeUtilities();
    else restoreHomeUtilities();
    scopeMobileNavLabels(pageActive);
    document.body.classList.toggle("home-hero-active", pageActive);
    restoreMovedPageControlFocus();
    schedulePendingHeroDestinationFocus();

    if (transitionSuspended || pageActive) global.XY_STARFIELD?.stop?.();
    else global.XY_STARFIELD?.start?.();

    if (motionQuery.matches) {
      root.dataset.animation = "reduced";
      starfield.stop();
      starfield.render(0);
      relay.showReducedState();
      return;
    }

    if (relay.failed) {
      root.dataset.animation = "static";
      starfield.stop();
      starfield.render(0);
      return;
    }

    if (animationsShouldRun()) {
      root.dataset.animation = "running";
      starfield.start();
      relay.start();
    } else {
      root.dataset.animation = "paused";
      starfield.stop();
      relay.stop();
    }
  }

  function handlePointerMove(event) {
    if (motionQuery.matches || mobileQuery.matches) return;
    const bounds = root.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2;
    starfield.setPointer(x, y);
    lightfield?.style.setProperty("--hero-light-x", `${x * 7}px`);
    lightfield?.style.setProperty("--hero-light-y", `${y * 5}px`);
    wordmark?.style.setProperty("--hero-word-rotate-x", `${(-y * 2.1).toFixed(2)}deg`);
    wordmark?.style.setProperty("--hero-word-rotate-y", `${(x * 3.2).toFixed(2)}deg`);
    wordmark?.style.setProperty("--hero-word-shift-x", `${(x * 2.2).toFixed(2)}px`);
    wordmark?.style.setProperty("--hero-word-shift-y", `${(y * 1.4).toFixed(2)}px`);
  }

  function handlePointerLeave() {
    starfield.setPointer(0, 0);
    lightfield?.style.setProperty("--hero-light-x", "0px");
    lightfield?.style.setProperty("--hero-light-y", "0px");
    wordmark?.style.setProperty("--hero-word-rotate-x", "0deg");
    wordmark?.style.setProperty("--hero-word-rotate-y", "0deg");
    wordmark?.style.setProperty("--hero-word-shift-x", "0px");
    wordmark?.style.setProperty("--hero-word-shift-y", "0px");
    if (primaryCta) primaryCta.style.transform = "";
  }

  function handleCtaPointerMove(event) {
    if (motionQuery.matches || mobileQuery.matches || !primaryCta) return;
    const bounds = primaryCta.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 5.2;
    const y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 5.2;
    primaryCta.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  }

  function handleCtaPointerLeave() {
    if (primaryCta) primaryCta.style.transform = "";
  }

  function handleVisibility() {
    syncAnimationState();
  }

  function suspendForTransition() {
    if (transitionSuspended || destroyed) return;
    transitionSuspended = true;
    root.dataset.transitionSuspended = "true";
    root.dataset.animation = "paused-transition";
    starfield.stop();
    relay.stop();
    global.XY_STARFIELD?.stop?.();
  }

  function resumeAfterTransition() {
    if (!transitionSuspended || destroyed) return;
    transitionSuspended = false;
    root.removeAttribute("data-transition-suspended");
    syncAnimationState();
  }

  function handlePageControlActivation(event) {
    const control = event.target.closest?.("button");
    if (!control || !pageControls?.contains(control)) return;
    pendingPageControlFocus = control;
    global.clearTimeout(pageControlFocusTimer);
    pageControlFocusTimer = global.setTimeout(() => {
      if (pendingPageControlFocus === control) pendingPageControlFocus = null;
    }, PAGE_TRANSITION_FOCUS_WINDOW);
  }

  function handleHeroRouteActivation(event) {
    const control = event.target.closest?.("[data-page-target]");
    if (!control || !root.contains(control)) return;
    pendingHeroDestination = control.dataset.pageTarget || null;
    global.clearTimeout(heroDestinationTimer);
    heroDestinationTimer = global.setTimeout(() => {
      if (pendingHeroDestination === control.dataset.pageTarget) pendingHeroDestination = null;
    }, PAGE_TRANSITION_FOCUS_WINDOW);
  }

  function handleMotionChange() {
    root.dataset.motion = motionQuery.matches ? "reduced" : "full";
    if (!motionQuery.matches) relay.enableMotion();
    syncAnimationState();
  }

  function handleMobileChange() {
    starfield.resize();
    relay.stop();
    if (!motionQuery.matches) relay.enableMotion();
    syncAnimationState();
  }

  function syncPageState() {
    const wasActive = pageActive;
    pageActive = Boolean(introPanel?.classList.contains("active"));
    if (pageActive && !wasActive) replayBrandEntrance();
    syncAnimationState();
  }

  let pageObserver = null;
  let intersectionObserver = null;
  try {
    pageObserver = new MutationObserver(syncPageState);
    if (introPanel) pageObserver.observe(introPanel, { attributes: true, attributeFilter: ["class"] });

    intersectionObserver = global.IntersectionObserver
      ? new IntersectionObserver(
          (entries) => {
            heroIntersecting = Boolean(entries[0]?.isIntersecting && entries[0]?.intersectionRatio >= 0.08);
            syncAnimationState();
          },
          { threshold: [0, 0.08, 0.25] }
        )
      : null;
    intersectionObserver?.observe(root);
  } catch (_error) {
    global.clearTimeout(brandTimer);
    pageObserver?.disconnect();
    intersectionObserver?.disconnect();
    relay.destroy();
    starfield.destroy();
    root.removeAttribute("data-enhanced");
    root.removeAttribute("data-motion");
    root.removeAttribute("data-brand-state");
    root.dataset.animation = "static";
    global.XY_STARFIELD?.stop?.();
    let staticScopeTimer = 0;
    const syncStaticScope = () => {
      const staticHomeActive = Boolean(introPanel?.classList.contains("active"));
      if (staticHomeActive) mountHomeUtilities();
      else restoreHomeUtilities();
      scopeMobileNavLabels(staticHomeActive);
      document.body.classList.toggle("home-hero-active", staticHomeActive);
      restoreMovedPageControlFocus();
      schedulePendingHeroDestinationFocus();
      if (staticHomeActive) global.XY_STARFIELD?.stop?.();
      else global.XY_STARFIELD?.start?.();
    };
    const handleStaticNavigation = () => {
      global.clearTimeout(staticScopeTimer);
      global.clearTimeout(heroDestinationTimer);
      clearTemporaryFocusTarget();
      staticScopeTimer = global.setTimeout(syncStaticScope, 0);
    };
    const cleanupStaticScope = (event) => {
      if (event.persisted) return;
      global.clearTimeout(staticScopeTimer);
      global.cancelAnimationFrame(heroDestinationFocusFrame);
      staticPageObserver?.disconnect();
      root.removeEventListener("click", handleHeroRouteActivation, { capture: true });
      pageControls?.removeEventListener("click", handlePageControlActivation, { capture: true });
      document.removeEventListener("click", handleStaticNavigation);
      document.removeEventListener("DOMContentLoaded", handleStaticNavigation);
      global.removeEventListener("pagehide", cleanupStaticScope);
    };
    let staticPageObserver = null;
    try {
      staticPageObserver = new MutationObserver(syncStaticScope);
      if (introPanel) staticPageObserver.observe(introPanel, { attributes: true, attributeFilter: ["class"] });
    } catch (_fallbackError) {
      staticPageObserver = null;
    }
    root.addEventListener("click", handleHeroRouteActivation, { capture: true });
    pageControls?.addEventListener("click", handlePageControlActivation, { capture: true });
    document.addEventListener("click", handleStaticNavigation);
    document.addEventListener("DOMContentLoaded", handleStaticNavigation, { once: true });
    global.addEventListener("pagehide", cleanupStaticScope);
    handleStaticNavigation();
    return;
  }

  root.addEventListener("pointermove", handlePointerMove, { passive: true });
  root.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  primaryCta?.addEventListener("pointermove", handleCtaPointerMove, { passive: true });
  primaryCta?.addEventListener("pointerleave", handleCtaPointerLeave, { passive: true });
  root.addEventListener("click", handleHeroRouteActivation, { capture: true });
  pageControls?.addEventListener("click", handlePageControlActivation, { capture: true });
  document.addEventListener("visibilitychange", handleVisibility);
  motionQuery.addEventListener?.("change", handleMotionChange);
  mobileQuery.addEventListener?.("change", handleMobileChange);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    global.clearTimeout(brandTimer);
    global.clearTimeout(pageControlFocusTimer);
    global.clearTimeout(heroDestinationTimer);
    global.cancelAnimationFrame(heroDestinationFocusFrame);
    clearTemporaryFocusTarget();
    relay.destroy();
    starfield.destroy();
    pageObserver.disconnect();
    intersectionObserver?.disconnect();
    root.removeEventListener("pointermove", handlePointerMove);
    root.removeEventListener("pointerleave", handlePointerLeave);
    primaryCta?.removeEventListener("pointermove", handleCtaPointerMove);
    primaryCta?.removeEventListener("pointerleave", handleCtaPointerLeave);
    root.removeEventListener("click", handleHeroRouteActivation, { capture: true });
    pageControls?.removeEventListener("click", handlePageControlActivation, { capture: true });
    document.removeEventListener("visibilitychange", handleVisibility);
    document.removeEventListener("DOMContentLoaded", syncPageState);
    motionQuery.removeEventListener?.("change", handleMotionChange);
    mobileQuery.removeEventListener?.("change", handleMobileChange);
    global.removeEventListener("pagehide", handlePageHide);
    restoreHomeUtilities();
    scopeMobileNavLabels(false);
    document.body.classList.remove("home-hero-active");
    restoreMovedPageControlFocus();
    root.dataset.animation = "destroyed";
    global.XY_STARFIELD?.start?.();
    if (global.STARRYLINK_HOME_HERO?.destroy === destroy) delete global.STARRYLINK_HOME_HERO;
  }

  function handlePageHide(event) {
    if (!event.persisted) destroy();
  }

  global.addEventListener("pagehide", handlePageHide);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncPageState, { once: true });
  } else {
    syncPageState();
  }

  global.STARRYLINK_HOME_HERO = {
    replayBrandEntrance,
    suspendForTransition,
    resumeAfterTransition,
    getState() {
      return {
        animation: root.dataset.animation,
        brandState: root.dataset.brandState,
        loopCount: Number(root.dataset.loopCount || 0),
        phase: root.dataset.relayPhase,
        studyMode: root.dataset.studyMode,
        starCount: Number(root.dataset.starCount || 0),
        staticFallback: relay.failed,
        dataVersion: heroData.version || null,
        contentMounted: root.dataset.contentMounted === "true",
        routeDataMounted: root.dataset.routeDataMounted === "true",
        routeScene: root.dataset.routeScene || null,
        transitionSuspended,
      };
    },
    destroy,
  };
})(window);
