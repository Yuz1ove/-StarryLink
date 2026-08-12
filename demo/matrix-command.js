(function initPriorityAdjudicationConsole(global) {
  "use strict";

  const root = document.querySelector("[data-priority-matrix]");
  if (!root) return;

  const panel = root.closest("[data-page='matrix']");
  const replayButton = root.querySelector("[data-matrix-replay]");
  const rulesButton = root.querySelector("[data-matrix-rules]");
  const channelButton = root.querySelector("[data-channel-details]");
  const rulesDialog = document.querySelector("[data-matrix-rules-dialog]");
  const channelDialog = document.querySelector("[data-channel-dialog]");
  const scoreElement = document.getElementById("riskScore");
  const rawElement = document.getElementById("riskRawScore");
  const displayMap = document.getElementById("matrixDisplayScoreMap");
  const scoreMarker = document.getElementById("matrixScoreMarker");
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const gsap = global.gsap;

  let timeline = null;
  let panelObserver = null;
  let dataObserver = null;
  let active = false;
  let disposed = false;
  let waitingForTransition = false;

  const selectAll = (selector) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const targetScore = () => clamp(Number(root.dataset.targetScore || scoreElement?.textContent || 0), 0, 100);
  const targetRaw = () => Math.max(0, Number(root.dataset.targetRaw || rawElement?.textContent || 0));
  const targetAngle = () => 210 - targetScore() * 2.2;

  function setProcessStep(index) {
    selectAll("[data-matrix-step]").forEach((step, stepIndex) => {
      step.classList.toggle("is-active", stepIndex === index);
      step.classList.toggle("is-complete", stepIndex < index);
    });
  }

  function syncNumbers(score = targetScore(), raw = targetRaw()) {
    if (scoreElement) scoreElement.textContent = String(Math.round(score));
    if (rawElement) rawElement.textContent = String(Math.round(raw));
    if (displayMap) displayMap.textContent = `DISPLAY ${Math.round(score)}`;
    const markerText = scoreMarker?.querySelector("b");
    if (markerText) markerText.textContent = String(Math.round(score));
  }

  function visibleElements() {
    return [
      root.querySelector(".priority-matrix-header"),
      root.querySelector(".matrix-section-label"),
      ...selectAll(".evidence-rail"),
      root.querySelector(".verdict-core"),
      root.querySelector(".gate-orbit"),
      root.querySelector(".verdict-readout"),
      root.querySelector(".verdict-summary"),
      root.querySelector(".matrix-emitter"),
      root.querySelector(".projection-volume"),
      root.querySelector(".post-verdict-command"),
      root.querySelector(".matrix-process-rail"),
    ].filter(Boolean);
  }

  function setFinalState() {
    timeline?.kill();
    timeline = null;
    root.dataset.matrixState = "complete";
    syncNumbers();
    setProcessStep(4);
    scoreMarker?.classList.add("is-locked");
    replayButton?.removeAttribute("disabled");
    if (!gsap) return;
    gsap.set(visibleElements(), {
      autoAlpha: 1,
      x: 0,
      y: 0,
      scale: 1,
      filter: "none",
      clearProps: "clipPath",
    });
    gsap.set(selectAll(".evidence-line"), {
      scaleX: 1,
      transformOrigin: "var(--rail-origin, left) center",
    });
    gsap.set(selectAll(".evidence-particle"), { autoAlpha: 0, x: 0 });
    gsap.set(scoreMarker, { rotation: targetAngle(), autoAlpha: 1, scale: 1 });
    gsap.set(root.querySelector(".matrix-emitter"), { xPercent: -50, x: 0, y: 0, scale: 1 });
  }

  function prepareTimeline() {
    const rails = selectAll(".evidence-rail");
    const lines = selectAll(".evidence-line");
    const particles = selectAll(".evidence-particle");
    root.dataset.matrixState = "running";
    scoreMarker?.classList.remove("is-locked");
    replayButton?.setAttribute("disabled", "");
    setProcessStep(0);
    syncNumbers(0, 0);

    gsap.set(root.querySelector(".priority-matrix-header"), {
      autoAlpha: 0,
      y: -16,
      clipPath: "inset(0 0 100% 0)",
    });
    gsap.set(root.querySelector(".matrix-section-label"), { autoAlpha: 0, x: -18 });
    gsap.set(rails, { autoAlpha: 0.12, scale: 0.94, filter: "brightness(0.42)" });
    gsap.set(lines, {
      scaleX: 0,
      transformOrigin: "var(--rail-origin, left) center",
    });
    gsap.set(particles, { autoAlpha: 0, x: 0 });
    gsap.set(root.querySelector(".matrix-emitter"), { autoAlpha: 0.08, xPercent: -50, y: 46, scale: 0.84 });
    gsap.set(root.querySelector(".projection-volume"), { autoAlpha: 0, scaleY: 0.1, transformOrigin: "50% 100%" });
    gsap.set(root.querySelector(".verdict-core"), { autoAlpha: 0, y: -36, scale: 0.72, filter: "blur(8px)" });
    gsap.set(root.querySelector(".gate-orbit"), { autoAlpha: 0, scale: 0.76, rotation: -8 });
    gsap.set(root.querySelector(".verdict-readout"), { autoAlpha: 0, scale: 0.88 });
    gsap.set(scoreMarker, { autoAlpha: 0, rotation: 210, scale: 0.72 });
    gsap.set(root.querySelector(".verdict-summary"), { autoAlpha: 0, y: 12 });
    gsap.set(root.querySelector(".post-verdict-command"), { autoAlpha: 0, y: 18 });
    gsap.set(root.querySelector(".matrix-process-rail"), { autoAlpha: 0.22 });

    return { rails, lines, particles };
  }

  function buildTimeline() {
    if (!gsap) return null;
    const { rails, lines, particles } = prepareTimeline();
    const rawCounter = { value: 0 };
    const displayCounter = { value: 0 };
    const next = gsap.timeline({
      paused: true,
      defaults: { ease: "power2.out" },
      onComplete: setFinalState,
    });

    next.addLabel("bridge", 0);
    next.to(root.querySelector(".priority-matrix-header"), {
      autoAlpha: 1,
      y: 0,
      clipPath: "inset(0 0 0% 0)",
      duration: 0.4,
      ease: "power3.out",
    }, "bridge");
    next.to(root.querySelector(".matrix-section-label"), { autoAlpha: 1, x: 0, duration: 0.32 }, "bridge+=0.15");

    next.addLabel("core", 0.24);
    next.to(root.querySelector(".matrix-emitter"), {
      autoAlpha: 0.9,
      y: 0,
      scale: 1,
      duration: 0.5,
      ease: "power3.out",
    }, "core");
    next.to(root.querySelector(".projection-volume"), {
      autoAlpha: 0.62,
      scaleY: 1,
      duration: 0.48,
      ease: "power2.inOut",
    }, "core+=0.12");
    next.to(root.querySelector(".verdict-core"), {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.54,
      ease: "back.out(1.3)",
    }, "core+=0.2");

    next.addLabel("evidence", 0.72);
    rails.forEach((rail, index) => {
      const at = 0.72 + index * 0.105;
      const line = rail.querySelector(".evidence-line");
      const particle = rail.querySelector(".evidence-particle");
      next.to(rail, {
        autoAlpha: 1,
        scale: 1,
        filter: "brightness(1)",
        duration: 0.23,
      }, at);
      next.to(line, { scaleX: 1, duration: 0.32, ease: "power1.inOut" }, at);
      next.fromTo(particle, {
        autoAlpha: 0,
        x: index % 2 ? 52 : -52,
      }, {
        autoAlpha: 0.9,
        x: 0,
        duration: 0.34,
        ease: "power1.inOut",
      }, at + 0.03);
      next.to(particle, { autoAlpha: 0, duration: 0.12 }, at + 0.31);
    });
    next.call(() => setProcessStep(1), null, "evidence+=0.36");

    next.addLabel("gate", 1.38);
    next.to(root.querySelector(".gate-orbit"), {
      autoAlpha: 1,
      scale: 1,
      rotation: 0,
      duration: 0.44,
      ease: "power3.out",
    }, "gate");
    next.to(root.querySelector(".verdict-readout"), {
      autoAlpha: 1,
      scale: 1,
      duration: 0.32,
    }, "gate+=0.12");
    next.call(() => setProcessStep(2), null, "gate+=0.22");

    next.addLabel("score", 1.56);
    next.to(rawCounter, {
      value: targetRaw,
      duration: 0.46,
      ease: "power2.inOut",
      onUpdate: () => syncNumbers(0, rawCounter.value),
    }, "score");
    next.to(displayCounter, {
      value: targetScore,
      duration: 0.38,
      ease: "power2.inOut",
      onUpdate: () => syncNumbers(displayCounter.value, targetRaw()),
    }, "score+=0.32");

    next.addLabel("lock", 1.88);
    next.to(scoreMarker, {
      autoAlpha: 1,
      rotation: targetAngle,
      scale: 1,
      duration: 0.48,
      ease: "power3.inOut",
    }, "lock");
    next.call(() => scoreMarker?.classList.add("is-locked"), null, "lock+=0.4");
    next.to(root.querySelector(".verdict-summary"), { autoAlpha: 1, y: 0, duration: 0.34 }, "lock+=0.28");

    next.addLabel("route", 2.24);
    next.call(() => setProcessStep(3), null, "route");
    next.to(root.querySelector(".post-verdict-command"), {
      autoAlpha: 1,
      y: 0,
      duration: 0.38,
      ease: "power3.out",
    }, "route");
    next.to(root.querySelector(".matrix-process-rail"), { autoAlpha: 1, duration: 0.24 }, "route+=0.08");
    return next;
  }

  function play() {
    if (!active || disposed) return;
    timeline?.kill();
    if (!gsap || reducedMotion.matches) {
      setFinalState();
      return;
    }
    timeline = buildTimeline();
    timeline?.play(0);
  }

  function openDialog(dialog, trigger) {
    if (!dialog) return;
    dialog.dataset.returnFocus = trigger === channelButton ? "channel" : "rules";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeOnBackdrop(event) {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }

  function restoreDialogFocus(event) {
    const target = event.currentTarget.dataset.returnFocus === "channel" ? channelButton : rulesButton;
    target?.focus({ preventScroll: true });
  }

  function onPanelChange() {
    const wasActive = active;
    active = Boolean(panel?.classList.contains("active"));
    if (active && !wasActive) {
      waitingForTransition = document.documentElement.classList.contains("is-starry-transitioning");
      if (!waitingForTransition) global.requestAnimationFrame(play);
    }
    if (!active) {
      waitingForTransition = false;
      timeline?.kill();
      timeline = null;
    }
  }

  function onTransitionComplete(event) {
    if (event.detail?.to !== "matrix" || !active) return;
    waitingForTransition = false;
    /* The shared Demo → Matrix transition already performs the full fold,
       scoring, gate, and lock narrative. Land on the completed console so
       there is no blank second boot between the two master timelines. */
    global.requestAnimationFrame(setFinalState);
  }

  function onDataChange() {
    if (root.dataset.matrixState === "complete" || reducedMotion.matches) setFinalState();
  }

  function onVisibilityChange() {
    if (!timeline) return;
    if (document.hidden) timeline.pause();
    else if (active && root.dataset.matrixState === "running") timeline.resume();
  }

  function onMotionChange() {
    if (reducedMotion.matches) setFinalState();
    else if (active) play();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    timeline?.kill();
    timeline = null;
    panelObserver?.disconnect();
    dataObserver?.disconnect();
    replayButton?.removeEventListener("click", play);
    rulesButton?.removeEventListener("click", onRulesClick);
    channelButton?.removeEventListener("click", onChannelClick);
    rulesDialog?.removeEventListener("click", closeOnBackdrop);
    channelDialog?.removeEventListener("click", closeOnBackdrop);
    rulesDialog?.removeEventListener("close", restoreDialogFocus);
    channelDialog?.removeEventListener("close", restoreDialogFocus);
    global.removeEventListener("starrylink:page-transition-complete", onTransitionComplete);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener?.("change", onMotionChange);
  }

  const onRulesClick = () => openDialog(rulesDialog, rulesButton);
  const onChannelClick = () => openDialog(channelDialog, channelButton);

  replayButton?.addEventListener("click", play);
  rulesButton?.addEventListener("click", onRulesClick);
  channelButton?.addEventListener("click", onChannelClick);
  rulesDialog?.addEventListener("click", closeOnBackdrop);
  channelDialog?.addEventListener("click", closeOnBackdrop);
  rulesDialog?.addEventListener("close", restoreDialogFocus);
  channelDialog?.addEventListener("close", restoreDialogFocus);
  global.addEventListener("starrylink:page-transition-complete", onTransitionComplete);
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotion.addEventListener?.("change", onMotionChange);

  panelObserver = new MutationObserver(onPanelChange);
  panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
  dataObserver = new MutationObserver(onDataChange);
  dataObserver.observe(root, { attributes: true, attributeFilter: ["data-target-score", "data-target-raw", "data-target-level"] });

  onPanelChange();
  global.addEventListener("pagehide", dispose, { once: true });
  global.STARRYLINK_PRIORITY_MATRIX = { play, showFinal: setFinalState, dispose };
})(window);
