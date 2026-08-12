(function initDecisionMatrixStructure(global) {
  "use strict";

  const root = document.querySelector("[data-priority-matrix][data-matrix-version='decision-structure']");
  if (!root) return;

  const panel = root.closest("[data-page='matrix']");
  const startButton = root.querySelector("[data-matrix-start]");
  const startLabel = root.querySelector("[data-matrix-start-label]");
  const detailsButton = root.querySelector("[data-matrix-details]");
  const detailsCloseButton = root.querySelector("[data-matrix-details-close]");
  const rationaleDrawer = root.querySelector("[data-matrix-rationale]");
  const scoreElement = document.getElementById("riskScore");
  const levelElement = document.getElementById("riskLevel");
  const actionElement = document.getElementById("riskAction");
  const verdictTitle = document.getElementById("matrixVerdictTitle");
  const verdictReason = document.getElementById("matrixVerdictReason");
  const liveRegion = root.querySelector("[data-matrix-live]");
  const scenarioControls = Array.from(root.querySelectorAll("[data-matrix-scenario]"));
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotionTestMode = new URLSearchParams(global.location.search).get("motion") === "reduce";
  const gsap = global.gsap;
  const scoreContract = global.STARRYLINK_MATRIX_SCORE;

  let active = false;
  let disposed = false;
  let timeline = null;
  let panelObserver = null;
  let dataObserver = null;
  let lastSignature = "";
  let returnFocus = null;

  const prefersReducedMotion = () => reducedMotion.matches || reducedMotionTestMode;
  const selectAll = (selector) => Array.from(root.querySelectorAll(selector));

  function evidenceItems() {
    return selectAll("[data-evidence-track]").map((row) => ({
      row,
      value: row.querySelector("[data-evidence-value]"),
      fill: row.querySelector(".matrix-contribution-fill"),
      earnedPoints: Number(row.dataset.earnedPoints || 0),
      maxPoints: Number(row.dataset.maxPoints || 0),
    }));
  }

  function resultData(items = evidenceItems()) {
    const score = items.reduce((sum, item) => sum + item.earnedPoints, 0);
    const threshold = scoreContract?.levelFor?.(score) || { level: root.dataset.targetLevel || "GREEN", action: "監測" };
    return { score, level: threshold.level, action: threshold.action };
  }

  function dataSignature() {
    return [
      root.dataset.targetScore,
      root.dataset.targetLevel,
      root.dataset.targetName,
      root.dataset.contractSignature,
    ].join("|");
  }

  function announce(message) {
    if (!liveRegion) return;
    liveRegion.textContent = "";
    global.requestAnimationFrame(() => {
      if (!disposed) liveRegion.textContent = message;
    });
  }

  function setState(state) {
    root.dataset.matrixState = state;
    const busy = state === "calculating";
    root.setAttribute("aria-busy", String(busy));
    startButton?.toggleAttribute("disabled", busy);
    scenarioControls.forEach((control) => control.toggleAttribute("disabled", busy));
  }

  function setVerdictCopy(result, visible = true) {
    if (scoreElement) scoreElement.textContent = String(result.score);
    if (levelElement) {
      levelElement.textContent = result.level;
      levelElement.className = `level-${result.level.toLowerCase()}`;
    }
    if (actionElement) actionElement.textContent = result.action;
    if (verdictTitle) {
      verdictTitle.textContent = result.level === "RED" ? "最高處理優先級" : `${result.action}處理優先級`;
    }
    if (verdictReason) verdictReason.textContent = `六項得分直接加總；${result.score} 分落入 ${result.level} ${result.action}門檻。`;
    if (startLabel) startLabel.textContent = "重新裁決";
    startButton?.setAttribute("aria-label", "重新裁決目前六項救援訊號");
    detailsButton?.removeAttribute("disabled");
    if (visible) root.dataset.currentLevel = result.level;
  }

  function setFinalState(options = {}) {
    timeline?.kill();
    timeline = null;
    const items = evidenceItems();
    const result = resultData(items);
    items.forEach((item) => {
      if (item.value) item.value.textContent = String(item.earnedPoints);
      if (item.fill) item.fill.style.transform = "scaleX(1)";
      item.row.style.opacity = "1";
      item.row.style.visibility = "visible";
      item.row.style.transform = "none";
    });
    setVerdictCopy(result);
    setState("result");
    root.dataset.entryComplete = "true";
    root.classList.remove("is-critical-pulse");
    if (!options.silent) announce(`裁決完成，總分 ${result.score}，${result.level} ${result.action}`);
  }

  function prepareAnimation(items) {
    setState("calculating");
    root.dataset.entryComplete = "false";
    root.classList.remove("is-critical-pulse");
    if (scoreElement) scoreElement.textContent = "0";
    if (levelElement) {
      levelElement.textContent = "計算中";
      levelElement.className = "level-pending";
    }
    if (actionElement) actionElement.textContent = "換算六項訊號";
    if (verdictTitle) verdictTitle.textContent = "正在形成裁決";
    if (startLabel) startLabel.textContent = "裁決中";
    detailsButton?.setAttribute("disabled", "");
    items.forEach((item) => {
      if (item.value) item.value.textContent = "0";
    });
  }

  function buildTimeline(items, result) {
    prepareAnimation(items);
    const totalCounter = { value: 0 };
    const verdictDetails = [
      verdictTitle,
      root.querySelector(".matrix-action-copy"),
      root.querySelector(".matrix-key-factors"),
      root.querySelector(".matrix-recommendation"),
      verdictReason,
    ].filter(Boolean);
    const next = gsap.timeline({
      paused: true,
      defaults: { ease: "power2.out" },
      onComplete: () => {
        timeline = null;
        setState("result");
        root.dataset.entryComplete = "true";
        root.classList.remove("is-critical-pulse");
        announce(`裁決完成，總分 ${result.score}，${result.level} ${result.action}`);
      },
    });

    gsap.set(items.map((item) => item.row), { autoAlpha: 0, y: 8 });
    gsap.set(items.map((item) => item.fill).filter(Boolean), { scaleX: 0, transformOrigin: "left center" });
    gsap.set(verdictDetails, { autoAlpha: 0, y: 7 });

    items.forEach((item, index) => {
      const rowAt = index * 0.045;
      const barAt = 0.12 + index * 0.05;
      const valueCounter = { value: 0 };
      next.to(item.row, { autoAlpha: 1, y: 0, duration: 0.2 }, rowAt);
      if (item.fill) next.to(item.fill, { scaleX: 1, duration: 0.32, ease: "power2.inOut" }, barAt);
      next.to(valueCounter, {
        value: item.earnedPoints,
        duration: 0.27,
        ease: "power1.out",
        onUpdate: () => {
          if (item.value) item.value.textContent = String(Math.round(valueCounter.value));
        },
      }, barAt);
    });

    next.to(totalCounter, {
      value: result.score,
      duration: 0.38,
      ease: "power2.inOut",
      onUpdate: () => {
        if (scoreElement) scoreElement.textContent = String(Math.round(totalCounter.value));
      },
    }, 0.38);
    next.call(() => setVerdictCopy(result), null, 0.74);
    next.to(verdictDetails, { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.02 }, 0.76);
    if (result.level === "RED") {
      next.call(() => root.classList.add("is-critical-pulse"), null, 0.82);
    }
    return next;
  }

  function play() {
    if (!active || disposed) return;
    timeline?.kill();
    timeline = null;
    const items = evidenceItems();
    if (items.length !== 6 || items.reduce((sum, item) => sum + item.maxPoints, 0) !== 100) return;
    const result = resultData(items);
    if (!gsap || prefersReducedMotion()) {
      setFinalState();
      return;
    }
    timeline = buildTimeline(items, result);
    timeline.play(0);
  }

  function openRationale() {
    if (!rationaleDrawer || root.dataset.matrixState !== "result") return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : detailsButton;
    root.classList.add("is-rationale-open");
    rationaleDrawer.setAttribute("aria-hidden", "false");
    [root.querySelector(".matrix-structure-header"), root.querySelector(".matrix-main-grid"), root.querySelector(".matrix-control-layer")]
      .filter(Boolean)
      .forEach((element) => { element.inert = true; });
    detailsButton?.setAttribute("aria-expanded", "true");
    detailsCloseButton?.focus({ preventScroll: true });
  }

  function closeRationale() {
    if (!rationaleDrawer || !root.classList.contains("is-rationale-open")) return;
    root.classList.remove("is-rationale-open");
    rationaleDrawer.setAttribute("aria-hidden", "true");
    [root.querySelector(".matrix-structure-header"), root.querySelector(".matrix-main-grid"), root.querySelector(".matrix-control-layer")]
      .filter(Boolean)
      .forEach((element) => { element.inert = false; });
    detailsButton?.setAttribute("aria-expanded", "false");
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }

  function onScenarioChange(event) {
    const control = event.currentTarget;
    const action = global.XY_DEMO_STORE?.actions?.updateMatrixScenario;
    if (typeof action !== "function") return;
    action(control.dataset.matrixScenario, control.value);
    announce(`${control.getAttribute("aria-label")}已更新，正在重新裁決`);
  }

  function onEvidenceFocus(event) {
    const row = event.target.closest?.("[data-evidence-track]");
    selectAll("[data-evidence-track]").forEach((item) => item.classList.toggle("is-linked", item === row));
  }

  function clearEvidenceFocus(event) {
    if (event.type === "focusout" && root.contains(event.relatedTarget)) return;
    selectAll("[data-evidence-track]").forEach((item) => item.classList.remove("is-linked"));
  }

  function onKeydown(event) {
    if (event.key === "Escape" && root.classList.contains("is-rationale-open")) {
      event.preventDefault();
      closeRationale();
    }
  }

  function onPanelChange() {
    const wasActive = active;
    active = Boolean(panel?.classList.contains("active"));
    if (active && !wasActive) global.requestAnimationFrame(play);
    if (!active && wasActive) {
      timeline?.kill();
      timeline = null;
      closeRationale();
    }
  }

  function onDataChange() {
    const nextSignature = dataSignature();
    if (nextSignature === lastSignature) return;
    lastSignature = nextSignature;
    if (active) global.requestAnimationFrame(play);
  }

  function onMotionChange() {
    if (active) global.requestAnimationFrame(play);
  }

  function onVisibilityChange() {
    if (!timeline) return;
    if (document.hidden) timeline.pause();
    else if (active) timeline.resume();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    timeline?.kill();
    timeline = null;
    panelObserver?.disconnect();
    dataObserver?.disconnect();
    startButton?.removeEventListener("click", play);
    detailsButton?.removeEventListener("click", openRationale);
    detailsCloseButton?.removeEventListener("click", closeRationale);
    scenarioControls.forEach((control) => control.removeEventListener("change", onScenarioChange));
    root.removeEventListener("focusin", onEvidenceFocus);
    root.removeEventListener("focusout", clearEvidenceFocus);
    root.removeEventListener("pointerover", onEvidenceFocus);
    root.removeEventListener("pointerleave", clearEvidenceFocus);
    global.removeEventListener("keydown", onKeydown);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener?.("change", onMotionChange);
  }

  startButton?.addEventListener("click", play);
  detailsButton?.addEventListener("click", openRationale);
  detailsCloseButton?.addEventListener("click", closeRationale);
  scenarioControls.forEach((control) => control.addEventListener("change", onScenarioChange));
  root.addEventListener("focusin", onEvidenceFocus);
  root.addEventListener("focusout", clearEvidenceFocus);
  root.addEventListener("pointerover", onEvidenceFocus);
  root.addEventListener("pointerleave", clearEvidenceFocus);
  global.addEventListener("keydown", onKeydown);
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotion.addEventListener?.("change", onMotionChange);

  panelObserver = new MutationObserver(onPanelChange);
  panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
  dataObserver = new MutationObserver(onDataChange);
  dataObserver.observe(root, {
    attributes: true,
    attributeFilter: ["data-target-score", "data-target-level", "data-target-name", "data-contract-signature"],
  });

  lastSignature = dataSignature();
  onPanelChange();
  global.addEventListener("pagehide", dispose, { once: true });
  global.STARRYLINK_PRIORITY_MATRIX = {
    play,
    showFinal: setFinalState,
    openRationale,
    closeRationale,
    dispose,
    snapshot: () => {
      const items = evidenceItems();
      const result = resultData(items);
      return {
        state: root.dataset.matrixState,
        scoreFromEvidence: result.score,
        contractScore: Number(root.dataset.targetScore || 0),
        maxTotal: items.reduce((sum, item) => sum + item.maxPoints, 0),
        level: result.level,
        earnedPoints: items.map((item) => item.earnedPoints),
        entryComplete: root.dataset.entryComplete === "true",
        rationaleOpen: root.classList.contains("is-rationale-open"),
        timelineActive: Boolean(timeline),
      };
    },
  };
})(window);
