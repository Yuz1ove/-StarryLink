(function initStarfieldModule(global) {
  "use strict";

  const TAU = Math.PI * 2;
  const MOBILE_QUERY = "(max-width: 760px)";
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const SCENE_CONFIG = {
    intro: { density: 1, alpha: 1, nebula: 1 },
    architecture: { density: 0.78, alpha: 0.82, nebula: 0.72 },
    demo: { density: 0.58, alpha: 0.62, nebula: 0.48 },
    matrix: { density: 0.46, alpha: 0.5, nebula: 0.36 },
    runtime: { density: 0.52, alpha: 0.56, nebula: 0.42 },
  };

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function chooseStarColor() {
    const chance = Math.random();
    if (chance < 0.035) return "255, 224, 170";
    if (chance < 0.42) return "150, 211, 255";
    return "225, 241, 255";
  }

  class StarfieldBackground {
    constructor(root = document.body) {
      this.root = root;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "starfield-background";
      this.canvas.setAttribute("aria-hidden", "true");
      this.canvas.setAttribute("role", "presentation");
      this.root.prepend(this.canvas);

      this.context = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
      this.motionQuery = global.matchMedia(REDUCED_MOTION_QUERY);
      this.mobileQuery = global.matchMedia(MOBILE_QUERY);
      this.reducedMotion = this.motionQuery.matches;
      this.isMobile = this.mobileQuery.matches;
      this.scene = "intro";
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.layers = { distant: [], mid: [], bright: [] };
      this.pointerTarget = { x: 0, y: 0 };
      this.pointerCurrent = { x: 0, y: 0 };
      this.frameId = 0;
      this.resizeFrame = 0;
      this.lastFrameAt = 0;
      this.running = false;
      this.destroyed = false;
      this.shootingStar = null;
      this.nextShootingAt = 0;

      this.handleResize = this.handleResize.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handleVisibility = this.handleVisibility.bind(this);
      this.handleMotionChange = this.handleMotionChange.bind(this);
      this.handleMobileChange = this.handleMobileChange.bind(this);
      this.drawFrame = this.drawFrame.bind(this);
      this.syncPresentationState = this.syncPresentationState.bind(this);

      global.addEventListener("resize", this.handleResize, { passive: true });
      global.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      document.addEventListener("visibilitychange", this.handleVisibility);
      this.motionQuery.addEventListener?.("change", this.handleMotionChange);
      this.mobileQuery.addEventListener?.("change", this.handleMobileChange);

      const stage = document.querySelector(".page-stage");
      this.observer = new MutationObserver(this.syncPresentationState);
      if (stage) {
        this.observer.observe(stage, {
          attributes: true,
          attributeFilter: ["class"],
          childList: true,
          characterData: true,
          subtree: true,
        });
      }

      this.resize();
      this.syncPresentationState();
      this.scheduleShootingStar();
      this.start();
    }

    createStars(count, layer) {
      const sizeRange = {
        distant: [0.45, 1.05],
        mid: [1.1, 2.35],
        bright: [2, 3.2],
      }[layer];
      const alphaRange = {
        distant: [0.15, 0.55],
        mid: [0.28, 0.72],
        bright: [0.52, 0.9],
      }[layer];

      return Array.from({ length: count }, (_, index) => {
        const durationSeconds = randomBetween(3, 8);
        return {
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: randomBetween(sizeRange[0], sizeRange[1]),
          alpha: randomBetween(alphaRange[0], alphaRange[1]),
          phase: Math.random() * TAU,
          speed: TAU / (durationSeconds * 1000),
          color: chooseStarColor(),
          cross: layer === "bright" && index < 6 && Math.random() > 0.28,
        };
      });
    }

    resize() {
      if (!this.context || this.destroyed) return;
      this.isMobile = this.mobileQuery.matches;
      this.width = Math.max(1, global.innerWidth);
      this.height = Math.max(1, global.innerHeight);
      this.dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const counts = this.isMobile
        ? { distant: 58, mid: 22, bright: 4 }
        : { distant: 126, mid: 44, bright: 8 };
      this.layers.distant = this.createStars(counts.distant, "distant");
      this.layers.mid = this.createStars(counts.mid, "mid");
      this.layers.bright = this.createStars(counts.bright, "bright");
      this.canvas.dataset.starCount = String(counts.distant + counts.mid + counts.bright);

      if (this.reducedMotion || document.hidden) this.renderStatic();
    }

    handleResize() {
      global.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = global.requestAnimationFrame(() => this.resize());
    }

    handlePointerMove(event) {
      if (this.isMobile || this.reducedMotion || document.hidden) return;
      this.pointerTarget.x = (event.clientX / Math.max(this.width, 1) - 0.5) * 2;
      this.pointerTarget.y = (event.clientY / Math.max(this.height, 1) - 0.5) * 2;
    }

    handleVisibility() {
      if (document.hidden) {
        this.stop();
        this.shootingStar = null;
        this.canvas.dataset.animation = "paused";
        return;
      }
      this.scheduleShootingStar();
      this.start();
    }

    handleMotionChange(event) {
      this.reducedMotion = event.matches;
      this.pointerTarget.x = 0;
      this.pointerTarget.y = 0;
      this.pointerCurrent.x = 0;
      this.pointerCurrent.y = 0;
      this.shootingStar = null;
      this.stop();
      this.start();
    }

    handleMobileChange(event) {
      this.isMobile = event.matches;
      this.pointerTarget.x = 0;
      this.pointerTarget.y = 0;
      this.resize();
      this.scheduleShootingStar();
    }

    syncPresentationState() {
      const activePanel = document.querySelector(".page-panel.active");
      const nextScene = activePanel?.dataset.page || "intro";
      if (SCENE_CONFIG[nextScene]) this.scene = nextScene;
      this.canvas.dataset.scene = this.scene;

      const architectureMap = document.querySelector(".architecture-map");
      const gpsNode = document.querySelector('.arch-node[data-arch-route="gps_packet"]');
      const gpsText = document.getElementById("archGpsLive")?.textContent || "";
      const gpsDisconnected = /DENIED|UNAVAILABLE|待確認/i.test(gpsText);
      architectureMap?.classList.toggle("gps-disconnected", gpsDisconnected);
      gpsNode?.classList.toggle("gps-node-disconnected", gpsDisconnected);

      if (this.reducedMotion && !document.hidden) this.renderStatic();
    }

    scheduleShootingStar(now = performance.now()) {
      this.nextShootingAt = now + randomBetween(10000, 18000);
    }

    createShootingStar(now) {
      this.shootingStar = {
        startedAt: now,
        duration: randomBetween(700, 1200),
        x: randomBetween(this.width * 0.72, this.width * 1.04),
        y: randomBetween(this.height * 0.06, this.height * 0.28),
        distance: Math.max(460, this.width * randomBetween(0.42, 0.62)),
        slope: randomBetween(0.42, 0.62),
      };
    }

    drawNebula(config) {
      const ctx = this.context;
      const strength = config.nebula * (this.isMobile ? 0.68 : 1);
      const glows = [
        { x: this.width * 0.78, y: this.height * 0.22, radius: this.width * 0.34, color: [78, 91, 197], alpha: 0.075 },
        { x: this.width * 0.18, y: this.height * 0.7, radius: this.width * 0.3, color: [28, 134, 173], alpha: 0.055 },
      ];

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      glows.forEach((glow) => {
        const gradient = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.radius);
        gradient.addColorStop(0, `rgba(${glow.color.join(",")}, ${glow.alpha * strength})`);
        gradient.addColorStop(0.45, `rgba(${glow.color.join(",")}, ${glow.alpha * strength * 0.36})`);
        gradient.addColorStop(1, `rgba(${glow.color.join(",")}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(glow.x - glow.radius, glow.y - glow.radius, glow.radius * 2, glow.radius * 2);
      });
      ctx.restore();
    }

    drawStarLayer(stars, layer, timestamp, config) {
      const ctx = this.context;
      const parallax = { distant: 2, mid: 5, bright: 8 }[layer];
      const count = Math.ceil(stars.length * config.density);
      const offsetX = this.pointerCurrent.x * parallax;
      const offsetY = this.pointerCurrent.y * parallax;

      for (let index = 0; index < count; index += 1) {
        const star = stars[index];
        const shimmer = this.reducedMotion ? 0.86 : 0.76 + Math.sin(timestamp * star.speed + star.phase) * 0.24;
        const pulse = layer === "distant" ? 1 : this.reducedMotion ? 1 : 0.96 + Math.sin(timestamp * star.speed + star.phase) * 0.08;
        const x = star.x + offsetX;
        const y = star.y + offsetY;
        const radius = star.radius * pulse;
        const alpha = Math.max(0.08, star.alpha * shimmer * config.alpha);

        ctx.beginPath();
        ctx.fillStyle = `rgba(${star.color}, ${alpha})`;
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();

        if (star.cross && !this.isMobile) {
          const ray = radius * 3.6;
          const rayGradient = ctx.createRadialGradient(x, y, 0, x, y, ray);
          rayGradient.addColorStop(0, `rgba(${star.color}, ${alpha * 0.72})`);
          rayGradient.addColorStop(1, `rgba(${star.color}, 0)`);
          ctx.strokeStyle = rayGradient;
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(x - ray, y);
          ctx.lineTo(x + ray, y);
          ctx.moveTo(x, y - ray * 0.72);
          ctx.lineTo(x, y + ray * 0.72);
          ctx.stroke();
        }
      }
    }

    drawShootingStar(timestamp) {
      if (!this.shootingStar) return;
      const star = this.shootingStar;
      const progress = Math.min(1, (timestamp - star.startedAt) / star.duration);
      const eased = 1 - Math.pow(1 - progress, 2);
      const currentX = star.x - star.distance * eased;
      const currentY = star.y + star.distance * star.slope * eased;
      const tailLength = randomBetween(105, 145);
      const tailX = currentX + tailLength;
      const tailY = currentY - tailLength * star.slope;
      const opacity = Math.sin(progress * Math.PI) * 0.7;
      const ctx = this.context;
      const gradient = ctx.createLinearGradient(tailX, tailY, currentX, currentY);
      gradient.addColorStop(0, "rgba(157, 217, 255, 0)");
      gradient.addColorStop(0.72, `rgba(157, 217, 255, ${opacity * 0.38})`);
      gradient.addColorStop(1, `rgba(235, 247, 255, ${opacity})`);

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      ctx.fillStyle = `rgba(244, 250, 255, ${opacity})`;
      ctx.beginPath();
      ctx.arc(currentX, currentY, 1.45, 0, TAU);
      ctx.fill();
      ctx.restore();

      if (progress >= 1) {
        this.shootingStar = null;
        this.scheduleShootingStar(timestamp);
      }
    }

    render(timestamp) {
      if (!this.context) return;
      const config = SCENE_CONFIG[this.scene] || SCENE_CONFIG.intro;
      this.context.clearRect(0, 0, this.width, this.height);
      this.drawNebula(config);
      this.drawStarLayer(this.layers.distant, "distant", timestamp, config);
      this.drawStarLayer(this.layers.mid, "mid", timestamp, config);
      this.drawStarLayer(this.layers.bright, "bright", timestamp, config);
      this.drawShootingStar(timestamp);
    }

    renderStatic() {
      this.pointerCurrent.x = 0;
      this.pointerCurrent.y = 0;
      this.render(0);
      this.canvas.dataset.animation = "reduced";
    }

    drawFrame(timestamp) {
      if (!this.running || this.destroyed || document.hidden) return;
      if (timestamp - this.lastFrameAt < 32) {
        this.frameId = global.requestAnimationFrame(this.drawFrame);
        return;
      }
      this.lastFrameAt = timestamp;
      this.pointerCurrent.x += (this.pointerTarget.x - this.pointerCurrent.x) * 0.045;
      this.pointerCurrent.y += (this.pointerTarget.y - this.pointerCurrent.y) * 0.045;

      const allowsShootingStar = !this.isMobile && (this.scene === "intro" || this.scene === "architecture");
      if (allowsShootingStar && !this.shootingStar && timestamp >= this.nextShootingAt) {
        this.createShootingStar(timestamp);
      }

      this.render(timestamp);
      this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    start() {
      if (this.destroyed || document.hidden) return;
      if (this.reducedMotion) {
        this.running = false;
        this.renderStatic();
        return;
      }
      if (this.running) return;
      this.running = true;
      this.canvas.dataset.animation = "running";
      this.frameId = global.requestAnimationFrame(this.drawFrame);
    }

    stop() {
      this.running = false;
      global.cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.stop();
      global.cancelAnimationFrame(this.resizeFrame);
      global.removeEventListener("resize", this.handleResize);
      global.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("visibilitychange", this.handleVisibility);
      this.motionQuery.removeEventListener?.("change", this.handleMotionChange);
      this.mobileQuery.removeEventListener?.("change", this.handleMobileChange);
      this.observer?.disconnect();
      this.canvas.remove();
    }
  }

  global.StarfieldBackground = StarfieldBackground;

  function mountStarfield() {
    if (global.XY_STARFIELD) return;
    global.XY_STARFIELD = new StarfieldBackground(document.body);
    global.addEventListener(
      "pagehide",
      () => {
        global.XY_STARFIELD?.destroy();
        global.XY_STARFIELD = null;
      },
      { once: true }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountStarfield, { once: true });
  } else {
    mountStarfield();
  }
})(window);
