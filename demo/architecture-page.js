(function initStarryLinkArchitecture(global) {
  "use strict";

  const panel = document.querySelector(".architecture-panel[data-page='architecture']");
  const experience = panel?.querySelector("[data-architecture-experience]");
  const stage = panel?.querySelector("[data-architecture-carousel]");
  const orbit = panel?.querySelector("[data-architecture-orbit]");
  const cards = Array.from(panel?.querySelectorAll("[data-architecture-card]") || []);
  const dots = Array.from(panel?.querySelectorAll("[data-architecture-jump]") || []);
  const previousButton = panel?.querySelector("[data-architecture-prev]");
  const nextButton = panel?.querySelector("[data-architecture-next]");
  const handoffButton = panel?.querySelector("[data-architecture-handoff-trigger]");
  const progress = panel?.querySelector("[data-architecture-progress]");
  const stageTitle = panel?.querySelector("[data-architecture-stage-title]");
  const handoffCanvas = panel?.querySelector("[data-architecture-handoff-field]");
  const handoffContext = handoffCanvas?.getContext("2d");
  if (!panel || !experience || !stage || !orbit || !cards.length) return;

  const motionQuery = global.matchMedia("(prefers-reduced-motion: reduce)");
  const chapterTitles = [
    "多路徑協作總述",
    "衛星高風險備援",
    "海纜骨幹監測",
    "地面基地台優先",
    "無人機訊號中繼",
  ];

  let currentIndex = 0;
  let pointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragDistance = 0;
  let verticalDistance = 0;
  let suppressClick = false;
  let wheelLockedUntil = 0;
  let handoffScroll = 0;
  let handoffScrollTimer = 0;
  let handoffFrame = 0;
  let handoffActive = false;
  let autoplayTimer = 0;

  const handoffParticles = Array.from({ length: 120 }, (_, index) => ({
    x: (Math.sin((index + 1) * 73.17) + 1) / 2,
    y: (Math.sin((index + 1) * 41.73 + 0.8) + 1) / 2,
    drift: (Math.sin((index + 1) * 19.31 + 1.7) + 1) / 2,
    violet: index % 6 === 0,
    bright: index % 13 === 0,
  }));

  function wrap(index) {
    return (index % cards.length + cards.length) % cards.length;
  }

  function smooth(value) {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  }

  function resizeHandoffCanvas() {
    if (!handoffCanvas || !handoffContext) return { width: 0, height: 0 };
    const rect = handoffCanvas.getBoundingClientRect();
    const density = Math.min(1.25, global.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * density));
    const height = Math.max(1, Math.round(rect.height * density));
    if (handoffCanvas.width !== width || handoffCanvas.height !== height) {
      handoffCanvas.width = width;
      handoffCanvas.height = height;
    }
    handoffContext.setTransform(density, 0, 0, density, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function quadraticPoint(start, control, end, value) {
    const inverse = 1 - value;
    return {
      x: inverse * inverse * start.x + 2 * inverse * value * control.x + value * value * end.x,
      y: inverse * inverse * start.y + 2 * inverse * value * control.y + value * value * end.y,
    };
  }

  function drawHandoffFrame(rawProgress) {
    if (!handoffContext) return;
    const { width, height } = resizeHandoffCanvas();
    handoffContext.clearRect(0, 0, width, height);
    const progressValue = smooth(rawProgress);
    const target = { x: width * 0.5, y: height * 0.82 };
    const fade = 1 - smooth((rawProgress - 0.76) / 0.24);
    handoffContext.save();
    handoffContext.globalCompositeOperation = "lighter";

    for (let index = 0; index < 11; index += 1) {
      const source = { x: width * (0.2 + index * 0.06), y: height * (0.31 + Math.abs(index - 5) * 0.012) };
      const control = { x: width * (0.5 + (index - 5) * 0.012), y: height * 0.58 };
      const current = quadraticPoint(source, control, target, progressValue);
      handoffContext.globalAlpha = (0.12 + (index % 3) * 0.035) * fade;
      handoffContext.strokeStyle = index % 3 === 0 ? "#b095ff" : "#79e5ff";
      handoffContext.lineWidth = index % 2 === 0 ? 1.2 : 0.72;
      handoffContext.shadowColor = handoffContext.strokeStyle;
      handoffContext.shadowBlur = 12;
      handoffContext.beginPath();
      handoffContext.moveTo(source.x, source.y);
      handoffContext.quadraticCurveTo(control.x, control.y, current.x, current.y);
      handoffContext.stroke();
    }

    handoffParticles.forEach((particle, index) => {
      const stagger = Math.max(0, Math.min(1, (rawProgress - (index % 17) * 0.008) / 0.82));
      const particleProgress = smooth(stagger);
      const start = {
        x: width * (0.16 + particle.x * 0.68),
        y: height * (0.22 + particle.y * 0.46),
      };
      const control = {
        x: width * (0.5 + (particle.drift - 0.5) * 0.22),
        y: height * (0.48 + particle.y * 0.16),
      };
      const point = quadraticPoint(start, control, target, particleProgress);
      const alpha = Math.sin(particleProgress * Math.PI) * fade;
      const color = particle.violet ? "170, 128, 255" : "99, 226, 255";
      handoffContext.globalAlpha = alpha * (particle.bright ? 0.92 : 0.48);
      handoffContext.fillStyle = `rgb(${color})`;
      handoffContext.shadowColor = `rgb(${color})`;
      handoffContext.shadowBlur = particle.bright ? 12 : 5;
      handoffContext.beginPath();
      handoffContext.arc(point.x, point.y, particle.bright ? 1.6 : 0.82, 0, Math.PI * 2);
      handoffContext.fill();
    });

    const ring = smooth((rawProgress - 0.54) / 0.32);
    handoffContext.globalAlpha = (1 - ring) * 0.78;
    handoffContext.strokeStyle = "#b8efff";
    handoffContext.lineWidth = 1.2;
    handoffContext.beginPath();
    handoffContext.ellipse(target.x, target.y, 18 + ring * width * 0.12, 6 + ring * height * 0.028, 0, 0, Math.PI * 2);
    handoffContext.stroke();
    handoffContext.restore();
  }

  function completeHandoff() {
    global.cancelAnimationFrame(handoffFrame);
    global.__STARRYLINK_ARCH_HANDOFF = true;
    global.STARRYLINK_NAVIGATION?.go?.("demo", { transition: "architecture-handoff" });
    global.setTimeout(() => {
      handoffActive = false;
      experience.dataset.handoff = "idle";
      if (handoffContext && handoffCanvas) {
        const rect = handoffCanvas.getBoundingClientRect();
        handoffContext.clearRect(0, 0, rect.width, rect.height);
      }
    }, 1050);
  }

  function beginHandoff() {
    if (handoffActive || !panel.classList.contains("active")) return;
    handoffActive = true;
    handoffScroll = 0;
    global.clearTimeout(handoffScrollTimer);
    global.clearTimeout(autoplayTimer);
    experience.dataset.handoff = "active";
    if (motionQuery.matches || !handoffContext) {
      global.setTimeout(completeHandoff, 180);
      return;
    }
    const startedAt = performance.now();
    const duration = 820;
    const animate = (now) => {
      const progressValue = Math.min(1, (now - startedAt) / duration);
      drawHandoffFrame(progressValue);
      if (progressValue >= 1) {
        completeHandoff();
        return;
      }
      handoffFrame = global.requestAnimationFrame(animate);
    };
    handoffFrame = global.requestAnimationFrame(animate);
  }

  function chargeHandoff(delta) {
    handoffScroll += Math.min(130, Math.abs(delta));
    global.clearTimeout(handoffScrollTimer);
    handoffScrollTimer = global.setTimeout(() => { handoffScroll = 0; }, 900);
    if (handoffScroll >= 220) beginHandoff();
  }

  function relativeOffset(index) {
    let offset = index - currentIndex;
    const midpoint = Math.floor(cards.length / 2);
    if (offset > midpoint) offset -= cards.length;
    if (offset < -midpoint) offset += cards.length;
    return offset;
  }

  function placement(offset) {
    const width = Math.max(stage.clientWidth, 320);
    const mobile = width <= 720;
    const spread = mobile ? Math.min(248, width * 0.62) : Math.min(390, Math.max(255, width * 0.27));
    const distance = Math.abs(offset);
    if (distance === 0) {
      return { x: 0, y: 0, z: 185, rotate: 0, scale: 1, opacity: 1 };
    }
    if (distance === 1) {
      return {
        x: spread * Math.sign(offset),
        y: mobile ? 10 : 12,
        z: -30,
        rotate: -27 * Math.sign(offset),
        scale: mobile ? 0.72 : 0.76,
        opacity: mobile ? 0.56 : 0.68,
      };
    }
    return {
      x: spread * 1.72 * Math.sign(offset),
      y: mobile ? 22 : 30,
      z: -220,
      rotate: -43 * Math.sign(offset),
      scale: mobile ? 0.5 : 0.56,
      opacity: mobile ? 0.17 : 0.28,
    };
  }

  function applyCardPositions() {
    cards.forEach((card, index) => {
      const offset = relativeOffset(index);
      const position = placement(offset);
      const current = offset === 0;
      card.style.setProperty("--card-x", `${position.x}px`);
      card.style.setProperty("--card-y", `${position.y}px`);
      card.style.setProperty("--card-z", `${position.z}px`);
      card.style.setProperty("--card-rotate", `${position.rotate}deg`);
      card.style.setProperty("--card-scale", String(position.scale));
      card.style.setProperty("--card-opacity", String(position.opacity));
      card.style.zIndex = String(12 - Math.abs(offset));
      card.classList.toggle("is-current", current);
      card.setAttribute("aria-hidden", current ? "false" : "true");
      const surface = card.querySelector(".architecture-card-surface");
      if (surface) surface.tabIndex = current ? 0 : -1;
    });
  }

  function updateInterface() {
    const activeCard = cards[currentIndex];
    const chapter = activeCard?.dataset.architectureCard || "overview";
    experience.dataset.cardIndex = String(currentIndex);
    experience.dataset.cardChapter = chapter;
    stage.dataset.activeChapter = chapter;
    experience.dataset.scrollReady = currentIndex === cards.length - 1 ? "true" : "false";
    if (progress) progress.textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
    if (stageTitle) stageTitle.textContent = chapterTitles[currentIndex] || chapterTitles[0];
    dots.forEach((dot, index) => {
      const active = index === currentIndex;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
      dot.tabIndex = active ? 0 : -1;
    });
  }

  function scheduleAutoplay() {
    global.clearTimeout(autoplayTimer);
    if (motionQuery.matches || !panel.classList.contains("active") || currentIndex === cards.length - 1 || handoffActive) return;
    autoplayTimer = global.setTimeout(() => {
      setIndex(currentIndex + 1, { user: false });
    }, 8200);
  }

  function setIndex(index, options = {}) {
    currentIndex = wrap(index);
    handoffScroll = 0;
    global.clearTimeout(handoffScrollTimer);
    orbit.style.setProperty("--drag-x", "0px");
    applyCardPositions();
    updateInterface();
    if (options.user !== false) experience.dataset.lastInteraction = "manual";
    scheduleAutoplay();
  }

  function rotateBy(direction, user = true) {
    setIndex(currentIndex + direction, { user });
  }

  cards.forEach((card, index) => {
    const surface = card.querySelector(".architecture-card-surface");
    surface?.addEventListener("click", () => {
      if (suppressClick) return;
      if (index !== currentIndex) setIndex(index);
    });
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => setIndex(Number(dot.dataset.architectureJump || 0)));
  });

  [previousButton, nextButton].forEach((button) => {
    button?.addEventListener("pointerdown", (event) => event.stopPropagation());
  });
  previousButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    rotateBy(-1);
  });
  nextButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    rotateBy(1);
  });
  handoffButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    beginHandoff();
  });

  stage.addEventListener("wheel", (event) => {
    if (!panel.classList.contains("active")) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 12) return;
    event.preventDefault();
    if (delta > 0 && currentIndex === cards.length - 1) {
      chargeHandoff(delta);
      return;
    }
    const now = Date.now();
    if (now < wheelLockedUntil) return;
    wheelLockedUntil = now + 520;
    rotateBy(delta > 0 ? 1 : -1);
  }, { passive: false });

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragDistance = 0;
    verticalDistance = 0;
    suppressClick = false;
    stage.classList.add("is-dragging");
    stage.setPointerCapture?.(pointerId);
    global.clearTimeout(autoplayTimer);
  });

  stage.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    dragDistance = event.clientX - dragStartX;
    verticalDistance = event.clientY - dragStartY;
    if (Math.abs(dragDistance) > 5 || Math.abs(verticalDistance) > 5) suppressClick = true;
    if (Math.abs(verticalDistance) > Math.abs(dragDistance)) {
      orbit.style.setProperty("--drag-x", "0px");
      return;
    }
    const restrained = Math.max(-150, Math.min(150, dragDistance * 0.7));
    orbit.style.setProperty("--drag-x", `${restrained}px`);
  });

  function finishDrag(event) {
    if (pointerId !== event.pointerId) return;
    stage.releasePointerCapture?.(pointerId);
    stage.classList.remove("is-dragging");
    orbit.style.setProperty("--drag-x", "0px");
    if (currentIndex === cards.length - 1 && verticalDistance < -72 && Math.abs(verticalDistance) > Math.abs(dragDistance)) beginHandoff();
    else if (Math.abs(dragDistance) > 54) rotateBy(dragDistance < 0 ? 1 : -1);
    else scheduleAutoplay();
    pointerId = null;
    global.setTimeout(() => { suppressClick = false; }, 0);
  }

  stage.addEventListener("pointerup", finishDrag);
  stage.addEventListener("pointercancel", finishDrag);

  document.addEventListener("keydown", (event) => {
    if (!panel.classList.contains("active")) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rotateBy(event.key === "ArrowRight" ? 1 : -1);
  }, true);

  global.addEventListener("resize", () => {
    applyCardPositions();
    if (handoffCanvas) {
      handoffCanvas.width = 1;
      handoffCanvas.height = 1;
    }
  }, { passive: true });
  motionQuery.addEventListener?.("change", scheduleAutoplay);

  const panelObserver = new MutationObserver(() => {
    if (panel.classList.contains("active")) {
      applyCardPositions();
      scheduleAutoplay();
    } else {
      global.clearTimeout(autoplayTimer);
      global.clearTimeout(handoffScrollTimer);
      handoffScroll = 0;
    }
  });
  panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });

  experience.dataset.architectureMounted = "true";
  setIndex(0, { user: false });
  global.STARRYLINK_ARCHITECTURE = {
    beginHandoff,
    setIndex,
    getState() {
      return { currentIndex, handoffActive, scrollReady: currentIndex === cards.length - 1 };
    },
  };
})(window);
