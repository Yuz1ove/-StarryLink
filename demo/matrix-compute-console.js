(function initPriorityAdjudicationConsole(global) {
  "use strict";

  const root = document.querySelector("[data-priority-matrix]");
  if (!root) return;

  const panel = root.closest("[data-page='matrix']");
  const startButton = root.querySelector("[data-matrix-start]");
  const startLabel = root.querySelector("[data-matrix-start-label]");
  const phaseElement = document.getElementById("matrixPhaseLabel");
  const scoreElement = document.getElementById("riskScore");
  const levelElement = document.getElementById("riskLevel");
  const actionElement = document.getElementById("riskAction");
  const hintElement = document.getElementById("matrixCoreHint");
  const summaryElement = document.getElementById("matrixCauseSummary");
  const summaryDetail = document.getElementById("matrixVerdictReason");
  const caseElement = document.getElementById("selectedMatrixTarget");
  const alertElement = root.querySelector("[data-compute-alert]");
  const alertLabel = root.querySelector("[data-compute-alert-label]");
  const scanline = root.querySelector("[data-compute-scanline]");
  const crtScan = root.querySelector("[data-crt-scan]");
  const glassSweep = root.querySelector("[data-glass-sweep]");
  const thresholdPointer = root.querySelector("[data-threshold-pointer]");
  const liveRegion = root.querySelector("[data-matrix-live]");
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotionTestMode = new URLSearchParams(global.location.search).get("motion") === "reduce";
  const gsap = global.gsap;
  const scoreContract = global.STARRYLINK_MATRIX_SCORE;
  const prefersReducedMotion = () => reducedMotion.matches || reducedMotionTestMode;

  root.dataset.motion = prefersReducedMotion() ? "reduced" : "full";

  const STATE = Object.freeze({
    IDLE: "idle",
    ARMING: "arming",
    CALCULATING: "calculating",
    THRESHOLDING: "thresholding",
    RESULT: "result",
    RESETTING: "resetting",
  });

  const TIMELINE_ID = Object.freeze({
    ENTRY: "matrix-dual-deck-entry",
    COMPUTE: "matrix-dual-deck-compute",
    REDUCED: "matrix-dual-deck-reduced",
  });

  const ACTION_COPY = Object.freeze({
    GREEN: "監測",
    YELLOW: "注意",
    ORANGE: "優先",
    RED: "緊急",
  });

  const SEGMENT_COLORS = Object.freeze([
    "#8af7ee",
    "#56d7ed",
    "#6aa9ff",
    "#7f8dff",
    "#a17cff",
    "#c36eff",
  ]);

  let state = STATE.IDLE;
  let timeline = null;
  let entryTimeline = null;
  let resetFrame = 0;
  let panelObserver = null;
  let dataObserver = null;
  let active = false;
  let disposed = false;
  let lastDataSignature = "";

  const selectAll = (selector) => Array.from(root.querySelectorAll(selector));

  function evidenceData() {
    const arcs = selectAll("[data-score-arc]");
    const segments = selectAll("[data-ring-segment]");
    const beams = selectAll("[data-beam-path]");
    return selectAll("[data-evidence-track]").map((bay, index) => ({
      index,
      bay,
      earnedPoints: Number(bay.dataset.earnedPoints || 0),
      maxPoints: Number(bay.dataset.maxPoints || 0),
      value: bay.querySelector("[data-evidence-value]"),
      status: bay.querySelector("[data-evidence-status]"),
      segment: segments[index] || null,
      arc: arcs[index] || null,
      beam: beams[index] || null,
    }));
  }

  function scoreFromEvidence(items = evidenceData()) {
    return items.reduce((sum, item) => sum + item.earnedPoints, 0);
  }

  function levelFromScore(score) {
    return scoreContract?.levelFor?.(score)?.level
      || (score >= 80 ? "RED" : score >= 55 ? "ORANGE" : score >= 25 ? "YELLOW" : "GREEN");
  }

  function resultData(items = evidenceData()) {
    const score = scoreFromEvidence(items);
    const level = levelFromScore(score);
    return {
      score,
      level,
      action: ACTION_COPY[level],
      targetName: root.dataset.targetName || "目前案例",
      earnedPoints: items.map((item) => item.earnedPoints),
      maxPoints: items.map((item) => item.maxPoints),
    };
  }

  function setState(nextState) {
    state = nextState;
    root.dataset.matrixState = nextState;
    const busy = [STATE.ARMING, STATE.CALCULATING, STATE.THRESHOLDING, STATE.RESETTING].includes(nextState);
    root.setAttribute("aria-busy", String(busy));
    startButton?.setAttribute("aria-busy", String(busy));
  }

  function setPhase(label, hint) {
    if (phaseElement) phaseElement.textContent = label;
    if (hintElement) hintElement.textContent = hint;
  }

  function setCoreValue(value) {
    if (scoreElement) scoreElement.textContent = value === "—" ? "—" : String(Math.round(Number(value) || 0));
  }

  function setFormula(summary, detail) {
    if (summaryElement) summaryElement.textContent = summary;
    if (summaryDetail) summaryDetail.textContent = detail;
  }

  function setCase(result) {
    if (!caseElement) return;
    caseElement.textContent = result
      ? `${result.targetName} / ${result.level} ${result.score} / 100`
      : `${root.dataset.targetName || "目前案例"} / 6 SIGNALS READY`;
  }

  function announce(message) {
    if (!liveRegion) return;
    liveRegion.textContent = "";
    global.requestAnimationFrame(() => {
      if (!disposed) liveRegion.textContent = message;
    });
  }

  function setButton(mode) {
    if (!startButton || !startLabel) return;
    if (mode === "busy") {
      startLabel.textContent = "運算中";
      startButton.setAttribute("aria-label", "優先級運算中");
      startButton.setAttribute("disabled", "");
      return;
    }
    startButton.removeAttribute("disabled");
    if (mode === "result") {
      startLabel.textContent = "重啟";
      startButton.setAttribute("aria-label", "重啟優先級運算");
    } else {
      startLabel.textContent = "啟動";
      startButton.setAttribute("aria-label", "開始優先級運算");
    }
  }

  function setThreshold(level) {
    root.dataset.currentLevel = level || "";
    selectAll("[data-gate-level]").forEach((gate) => {
      gate.classList.toggle("is-active", Boolean(level) && gate.dataset.gateLevel === level);
    });
  }

  function setThresholdPointer(score, visible = false) {
    if (!thresholdPointer) return;
    thresholdPointer.style.setProperty("--threshold-position", `${Math.max(0, Math.min(100, Number(score) || 0))}%`);
    thresholdPointer.style.opacity = visible ? "1" : "0";
  }

  function pointOnCircle(cx, cy, radius, angle) {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(radians),
      y: cy + radius * Math.sin(radians),
    };
  }

  function describeArc(startAngle, endAngle) {
    if (endAngle <= startAngle + 0.001) return "";
    const start = pointOnCircle(160, 160, 94, startAngle);
    const end = pointOnCircle(160, 160, 94, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A 94 94 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
  }

  function scoreArcStart(items, index) {
    return items.slice(0, index).reduce((sum, item) => sum + item.maxPoints, 0) * 3.6;
  }

  function setArcValue(items, item, value) {
    if (!item.arc) return;
    const startAngle = scoreArcStart(items, item.index);
    const bounded = Math.max(0, Math.min(item.maxPoints, Number(value) || 0));
    item.arc.setAttribute("d", describeArc(startAngle, startAngle + bounded * 3.6));
  }

  function setEvidenceValue(item, value) {
    if (item.value) item.value.textContent = String(Math.round(Number(value) || 0));
  }

  function setEvidenceIdle(items, item) {
    item.bay.classList.remove("is-active", "is-complete", "is-zero");
    item.segment?.classList.remove("is-active", "is-complete");
    setEvidenceValue(item, 0);
    setArcValue(items, item, 0);
    if (item.status) item.status.textContent = "STANDBY";
    if (item.beam) {
      item.beam.style.opacity = "0";
      item.beam.style.strokeDashoffset = "1";
    }
    const label = item.bay.querySelector(".evidence-copy strong")?.textContent || `證據 ${item.index + 1}`;
    const observation = item.bay.querySelector(".evidence-copy b")?.textContent || "";
    item.bay.setAttribute("aria-label", `${label}：原始狀態 ${observation}；本項得分待計算，上限 ${item.maxPoints}`);
  }

  function beginEvidence(item) {
    evidenceData().forEach((candidate) => candidate.bay.classList.toggle("is-active", candidate.index === item.index));
    item.segment?.classList.add("is-active");
    if (item.status) item.status.textContent = "SCANNING";
    setPhase(`ANALYZING 0${item.index + 1} / 06`, `正在換算第 ${item.index + 1} 項證據`);
  }

  function completeEvidence(items, item) {
    item.bay.classList.remove("is-active");
    item.bay.classList.add("is-complete");
    item.bay.classList.toggle("is-zero", item.earnedPoints === 0);
    item.segment?.classList.remove("is-active");
    item.segment?.classList.add("is-complete");
    setEvidenceValue(item, item.earnedPoints);
    setArcValue(items, item, item.earnedPoints);
    if (item.status) item.status.textContent = "LOCKED";
    const label = item.bay.querySelector(".evidence-copy strong")?.textContent || `證據 ${item.index + 1}`;
    const observation = item.bay.querySelector(".evidence-copy b")?.textContent || "";
    const zeroCopy = item.earnedPoints === 0 ? "，未增加風險" : "";
    item.bay.setAttribute(
      "aria-label",
      `${label}：原始狀態 ${observation}；本項得分 ${item.earnedPoints}/${item.maxPoints}${zeroCopy}；已鎖定`
    );
  }

  function hideAlert() {
    alertElement?.classList.remove("is-critical", "is-stable");
    alertElement?.setAttribute("aria-hidden", "true");
    if (alertLabel) alertLabel.textContent = "PRIORITY COMPUTE";
  }

  function showAlert(label, critical = false) {
    if (alertLabel) alertLabel.textContent = label;
    alertElement?.classList.toggle("is-critical", critical);
    alertElement?.classList.remove("is-stable");
    alertElement?.setAttribute("aria-hidden", "false");
  }

  function clearGsapState(items) {
    if (!gsap) return;
    const targets = [
      ...items.map((item) => item.bay),
      ...items.map((item) => item.beam).filter(Boolean),
      ...items.map((item) => item.segment).filter(Boolean),
      ...selectAll("[data-entry-door]"),
      startButton,
      root.querySelector(".adjudication-core"),
      root.querySelector(".score-dial"),
      root.querySelector(".score-dial-readout"),
      root.querySelector(".holo-ring-calibration"),
      root.querySelector(".holo-ring-evidence"),
      root.querySelector(".holo-ring-score"),
      root.querySelector(".adjudication-display"),
      root.querySelector(".adjudication-room-shade"),
      root.querySelector(".adjudication-control-deck"),
      root.querySelector(".threshold-console"),
      root.querySelector(".compute-lock-ring"),
      root.querySelector(".compute-pressure-core"),
      alertElement,
      scanline,
      crtScan,
      glassSweep,
      thresholdPointer,
    ].filter(Boolean);
    gsap.killTweensOf(targets);
    gsap.set(targets, { clearProps: "transform,filter,opacity,visibility" });
  }

  function setIdleState(options = {}) {
    timeline?.kill();
    timeline = null;
    if (resetFrame) global.cancelAnimationFrame(resetFrame);
    resetFrame = 0;
    const items = evidenceData();
    clearGsapState(items);
    setState(STATE.IDLE);
    items.forEach((item) => setEvidenceIdle(items, item));
    setThreshold("");
    setThresholdPointer(0, false);
    setPhase("STANDBY", "六項證據待命");
    setCoreValue("—");
    if (levelElement) {
      levelElement.textContent = "—";
      levelElement.className = "level-pending";
    }
    if (actionElement) actionElement.textContent = "等待門檻判定";
    setFormula("六項證據已就緒", "依 01–06 順序換算後判定處置門檻。");
    setCase();
    hideAlert();
    setButton("idle");
    if (!options.silent) announce("優先級裁決已重設，等待啟動");
  }

  function prepareForCompute(items) {
    setIdleState({ silent: true });
    setState(STATE.ARMING);
    setButton("busy");
    setPhase("ARMING", "鎖定六項證據輸入");
    setFormula("PRIORITY COMPUTE", "固定依 01–06 順序換算六項證據。");
    announce("開始優先級運算");
    if (gsap) {
      gsap.set(items.map((item) => item.bay), { autoAlpha: 0.42, filter: "brightness(.72)" });
      gsap.set(items.map((item) => item.beam).filter(Boolean), { autoAlpha: 0, strokeDashoffset: 1 });
      gsap.set([alertElement, scanline].filter(Boolean), { autoAlpha: 0 });
    }
  }

  function applyTotalState(result) {
    setState(STATE.CALCULATING);
    setPhase("TOTAL PRIORITY SCORE", "六項實得分直接相加");
    setCoreValue(result.score);
    setFormula(
      `六項證據完成 → 總分 ${result.score} / 100`,
      `${result.earnedPoints.join(" + ")} = ${result.score}；六項上限 ${result.maxPoints.join(" + ")} = 100`
    );
    announce("已完成六項證據");
  }

  function applyThresholdState(result) {
    setState(STATE.THRESHOLDING);
    setPhase("THRESHOLD CHECK", `${result.score} 分正在比對連續門檻`);
    setFormula(`總分 ${result.score} / 100`, "比對 GREEN、YELLOW、ORANGE、RED 四級處置門檻。");
    showAlert("THRESHOLD CHECK");
  }

  function applyResultState(result, options = {}) {
    const items = evidenceData();
    items.forEach((item) => completeEvidence(items, item));
    setState(STATE.RESULT);
    setCoreValue(result.score);
    setPhase("PRIORITY LOCKED", "門檻與處置已鎖定");
    if (levelElement) {
      levelElement.textContent = result.level;
      levelElement.className = `level-${result.level.toLowerCase()}`;
    }
    if (actionElement) actionElement.textContent = result.action;
    setThreshold(result.level);
    setThresholdPointer(result.score, true);
    setFormula(
      `六項證據完成 → 總分 ${result.score} / 100 → ${result.level} ${result.action}`,
      `${result.score} 分落入 ${result.level} 處置門檻。`
    );
    setCase(result);
    setButton("result");
    showAlert(result.level === "RED" ? "CRITICAL PRIORITY" : "PRIORITY LOCKED", result.level === "RED");
    if (options.stable) alertElement?.classList.add("is-stable");
    root.setAttribute("aria-busy", "false");
    startButton?.setAttribute("aria-busy", "false");
    announce(`最終優先級為${result.level}，分數${result.score}`);
  }

  function setFinalState() {
    timeline?.kill();
    timeline = null;
    const items = evidenceData();
    const result = resultData(items);
    items.forEach((item) => completeEvidence(items, item));
    applyResultState(result, { stable: true });
    if (!gsap) return;
    gsap.set(items.map((item) => item.bay), { autoAlpha: 0.86, filter: "brightness(.96)" });
    gsap.set(items.map((item) => item.beam).filter(Boolean), { autoAlpha: 0, strokeDashoffset: 0 });
    gsap.set(alertElement, { autoAlpha: 1 });
    gsap.set(thresholdPointer, { autoAlpha: 1 });
  }

  function buildReducedTimeline(items, result) {
    prepareForCompute(items);
    const next = gsap.timeline({
      id: TIMELINE_ID.REDUCED,
      paused: true,
      defaults: { ease: "none" },
      onComplete: () => {
        timeline = null;
        alertElement?.classList.add("is-stable");
      },
    });
    next.addLabel("arming", 0);
    next.call(() => showAlert("PRIORITY COMPUTE"), null, 0.05);
    next.addLabel("calculating", 0.18);
    next.call(() => setState(STATE.CALCULATING), null, "calculating");
    items.forEach((item, index) => {
      next.call(() => {
        beginEvidence(item);
        completeEvidence(items, item);
        setCoreValue(items.slice(0, index + 1).reduce((sum, entry) => sum + entry.earnedPoints, 0));
      }, null, 0.2 + index * 0.14);
    });
    next.call(() => applyTotalState(result), null, 1.04);
    next.addLabel("thresholding", 1.14);
    next.call(() => applyThresholdState(result), null, "thresholding");
    next.to(thresholdPointer, {
      "--threshold-position": `${result.score}%`,
      autoAlpha: 1,
      duration: 0.18,
    }, "thresholding");
    next.addLabel("result", 1.42);
    next.call(() => applyResultState(result), null, "result");
    next.to(alertElement, { autoAlpha: 1, duration: 0.16 }, "result");
    return next;
  }

  function buildTimeline(items, result) {
    prepareForCompute(items);
    const cumulative = { value: 0 };
    const next = gsap.timeline({
      id: TIMELINE_ID.COMPUTE,
      paused: true,
      defaults: { ease: "power2.out" },
      onComplete: () => {
        timeline = null;
        alertElement?.classList.add("is-stable");
      },
    });

    next.addLabel("arming", 0);
    next.to(root.querySelector(".compute-pressure-core"), {
      y: 8,
      scale: 0.9,
      duration: 0.14,
      ease: "power2.in",
    }, "arming");
    next.to(root.querySelector(".compute-lock-ring"), {
      rotation: 72,
      scale: 0.76,
      duration: 0.28,
      ease: "power3.inOut",
    }, "arming");
    next.to(root.querySelector(".compute-pressure-core"), {
      y: 0,
      scale: 1,
      duration: 0.16,
      ease: "back.out(2)",
    }, "arming+=0.15");
    next.to(root.querySelector(".adjudication-display"), {
      filter: "brightness(1.18) saturate(1.16)",
      duration: 0.16,
      yoyo: true,
      repeat: 1,
    }, "arming+=0.1");
    next.call(() => showAlert("PRIORITY COMPUTE"), null, 0.25);
    next.fromTo(
      root.querySelector(".holo-ring-calibration"),
      { autoAlpha: 0, scale: 0.7, rotation: -18 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.44, ease: "back.out(1.8)" },
      0.22
    );
    next.fromTo(
      root.querySelector(".holo-ring-evidence"),
      { autoAlpha: 0, scale: 0.56, rotation: 14 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.4, ease: "back.out(1.9)" },
      0.27
    );
    next.fromTo(
      root.querySelector(".holo-ring-score"),
      { autoAlpha: 0, scale: 0.42 },
      { autoAlpha: 1, scale: 1, duration: 0.36, ease: "back.out(2.2)" },
      0.32
    );
    next.fromTo(alertElement, { autoAlpha: 0, scaleX: 0.7 }, { autoAlpha: 1, scaleX: 1.06, duration: 0.2, ease: "back.out(2)" }, 0.28);
    next.fromTo(scanline, { autoAlpha: 0, yPercent: -140 }, { autoAlpha: 0.065, yPercent: 140, duration: 0.4, ease: "none" }, 0.26);
    next.to(alertElement, { autoAlpha: 0, duration: 0.1 }, 0.56);

    next.addLabel("calculating", 0.65);
    next.call(() => setState(STATE.CALCULATING), null, "calculating");

    let accumulated = 0;
    items.forEach((item, index) => {
      const at = 0.65 + index * 0.54;
      const before = accumulated;
      const counter = { value: 0 };
      const bayDirection = index < 3 ? 1 : -1;
      accumulated += item.earnedPoints;

      next.call(() => beginEvidence(item), null, at);
      next.to(item.bay, {
        autoAlpha: 1,
        x: bayDirection * 9,
        scale: 1.045,
        filter: "brightness(1.38) saturate(1.18)",
        duration: 0.14,
        ease: "power3.out",
      }, at);
      next.fromTo(item.bay, { "--scan-position": "-30%" }, { "--scan-position": "130%", duration: 0.22, ease: "none" }, at + 0.02);
      if (item.beam) {
        next.fromTo(item.beam, {
          autoAlpha: 0,
          strokeDashoffset: 1,
        }, {
          autoAlpha: 1,
          strokeDashoffset: 0,
          duration: 0.36,
          ease: "power2.inOut",
        }, at + 0.08);
      }
      next.to(root.querySelector(".score-dial"), {
        scale: 1.03,
        duration: 0.12,
        yoyo: true,
        repeat: 1,
        ease: "power2.out",
      }, at + 0.16);
      next.to(counter, {
        value: item.earnedPoints,
        duration: 0.31,
        ease: "power1.out",
        onUpdate: () => {
          setEvidenceValue(item, counter.value);
          setArcValue(items, item, counter.value);
          cumulative.value = before + counter.value;
          setCoreValue(cumulative.value);
        },
      }, at + 0.1);
      if (item.earnedPoints === 0) {
        next.to(item.bay, {
          filter: "brightness(1.22)",
          duration: 0.08,
          yoyo: true,
          repeat: 1,
        }, at + 0.28);
      }
      if (item.beam) next.to(item.beam, { autoAlpha: 0.18, duration: 0.1 }, at + 0.4);
      next.call(() => completeEvidence(items, item), null, at + 0.45);
      next.to(item.bay, {
        autoAlpha: 0.86,
        x: 0,
        scale: 1,
        filter: "brightness(.96)",
        duration: 0.12,
        ease: "power2.inOut",
      }, at + 0.45);
    });

    next.addLabel("total", 3.95);
    next.call(() => applyTotalState(result), null, "total");
    next.to(root.querySelector(".score-dial-readout"), {
      scale: 1.1,
      duration: 0.18,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    }, "total");

    next.addLabel("thresholding", 4.3);
    next.call(() => applyThresholdState(result), null, "thresholding");
    next.fromTo(root.querySelector(".threshold-console"), {
      y: 5,
      scale: 0.985,
      filter: "brightness(.8)",
    }, {
      y: -5,
      scale: 1.02,
      filter: "brightness(1.22)",
      duration: 0.3,
      ease: "power3.out",
    }, "thresholding");
    next.fromTo(thresholdPointer, {
      autoAlpha: 0,
      "--threshold-position": "0%",
    }, {
      autoAlpha: 1,
      "--threshold-position": `${result.score}%`,
      duration: 0.48,
      ease: "power3.inOut",
    }, "thresholding");
    selectAll("[data-gate-level]").forEach((gate, index) => {
      next.to(gate, {
        filter: "brightness(1.22)",
        duration: 0.08,
        yoyo: true,
        repeat: 1,
      }, 4.32 + index * 0.08);
    });

    next.addLabel("result", 4.85);
    next.call(() => applyResultState(result), null, "result");
    next.to(root.querySelector(".threshold-console"), {
      y: 0,
      scale: 1,
      filter: "brightness(1)",
      duration: 0.22,
      ease: "power2.out",
    }, "result");
    next.to(root.querySelector(".score-dial"), {
      scale: 1.085,
      duration: 0.18,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    }, "result");
    next.fromTo(alertElement, {
      autoAlpha: 0,
      x: result.level === "RED" ? -5 : 0,
    }, {
      autoAlpha: 1,
      x: 0,
      duration: 0.18,
      ease: result.level === "RED" ? "steps(2)" : "power2.out",
    }, "result");
    next.to(root.querySelector(`[data-gate-level="${result.level}"]`), {
      scale: 1.03,
      duration: 0.16,
      ease: "power2.out",
    }, "result");
    if (result.level === "RED") {
      next.to(root.querySelector(".score-dial"), {
        filter: "drop-shadow(4px 0 rgba(255,78,72,.46)) drop-shadow(-4px 0 rgba(94,226,255,.26))",
        duration: 0.1,
        yoyo: true,
        repeat: 1,
        ease: "none",
      }, "result+=0.04");
      next.fromTo(root.querySelector(".adjudication-room-shade"), {
        autoAlpha: 0.72,
      }, {
        autoAlpha: 1,
        duration: 0.22,
        ease: "power2.out",
      }, "result");
    }
    next.to(root.querySelector(".compute-lock-ring"), {
      rotation: 0,
      scale: 1,
      duration: 0.24,
      ease: "power2.out",
    }, "result+=0.12");
    return next;
  }

  function playEntry() {
    entryTimeline?.kill();
    entryTimeline = null;
    root.dataset.entryComplete = "false";
    const doors = selectAll("[data-entry-door]");
    const bays = evidenceData().map((item) => item.bay);
    const deck = root.querySelector(".adjudication-control-deck");
    const core = root.querySelector(".adjudication-core");
    if (!gsap || prefersReducedMotion()) {
      root.dataset.entryComplete = "true";
      return;
    }
    entryTimeline = gsap.timeline({
      id: TIMELINE_ID.ENTRY,
      defaults: { ease: "power3.out" },
      onComplete: () => {
        root.dataset.entryComplete = "true";
        entryTimeline = null;
      },
    });
    entryTimeline.addLabel("doors", 0);
    entryTimeline.fromTo(doors[0], { xPercent: 0, rotation: 0 }, { xPercent: -108, rotation: -1.4, duration: 0.7 }, "doors");
    entryTimeline.fromTo(doors[1], { xPercent: 0, rotation: 0 }, { xPercent: 108, rotation: 1.4, duration: 0.7 }, "doors");
    entryTimeline.addLabel("power", 0.12);
    entryTimeline.fromTo(root.querySelector(".adjudication-room"), {
      filter: "brightness(.12) saturate(.5)",
      scale: 1.025,
    }, {
      filter: "brightness(.74) saturate(.86)",
      scale: 1,
      duration: 0.78,
    }, "power");
    entryTimeline.fromTo(core, {
      autoAlpha: 0,
      scale: 0.68,
      filter: "blur(10px) brightness(.5)",
    }, {
      autoAlpha: 1,
      scale: 1,
      filter: "blur(0px) brightness(1)",
      duration: 0.62,
      ease: "back.out(1.6)",
    }, 0.26);
    entryTimeline.fromTo(glassSweep, {
      autoAlpha: 0,
      xPercent: 0,
    }, {
      autoAlpha: 0.92,
      xPercent: 780,
      duration: 0.52,
      ease: "power1.inOut",
    }, 0.34);
    entryTimeline.fromTo(crtScan, {
      autoAlpha: 0,
      yPercent: -120,
    }, {
      autoAlpha: 0.065,
      yPercent: 120,
      duration: 0.46,
      ease: "none",
    }, 0.38);
    entryTimeline.addLabel("deck", 0.48);
    entryTimeline.fromTo(deck, {
      y: 48,
      scale: 0.965,
      autoAlpha: 0.12,
    }, {
      y: 0,
      scale: 1,
      autoAlpha: 1,
      duration: 0.54,
      ease: "back.out(1.45)",
    }, "deck");
    entryTimeline.addLabel("evidence", 0.68);
    entryTimeline.fromTo(bays, {
      autoAlpha: 0,
      y: 14,
      scale: 0.94,
    }, {
      autoAlpha: 0.62,
      y: 0,
      scale: 1,
      duration: 0.22,
      stagger: 0.055,
      ease: "back.out(1.5)",
    }, "evidence");
    entryTimeline.addLabel("control", 1.02);
    entryTimeline.fromTo(startButton, {
      autoAlpha: 0,
      y: 10,
      rotation: -10,
      scale: 0.68,
    }, {
      autoAlpha: 1,
      y: 0,
      rotation: 0,
      scale: 1,
      duration: 0.32,
      ease: "back.out(2)",
    }, "control");
    entryTimeline.to([crtScan, glassSweep], { autoAlpha: 0, duration: 0.1 }, 1.22);
  }

  function startCompute() {
    if (!active || disposed || state !== STATE.IDLE) return;
    timeline?.kill();
    timeline = null;
    const items = evidenceData();
    if (items.length !== 6 || items.reduce((sum, item) => sum + item.maxPoints, 0) !== 100) return;
    const result = resultData(items);
    if (!gsap) {
      prepareForCompute(items);
      setFinalState();
      return;
    }
    timeline = prefersReducedMotion() ? buildReducedTimeline(items, result) : buildTimeline(items, result);
    timeline.play(0);
  }

  function restartCompute() {
    if (disposed || !active || state !== STATE.RESULT) return;
    setState(STATE.RESETTING);
    timeline?.kill();
    timeline = null;
    if (resetFrame) global.cancelAnimationFrame(resetFrame);
    resetFrame = global.requestAnimationFrame(() => {
      resetFrame = 0;
      if (!active || disposed) return;
      setIdleState({ silent: true });
      startCompute();
    });
  }

  function activateButton() {
    if (state === STATE.RESULT) restartCompute();
    else startCompute();
  }

  function onStartKeydown(event) {
    if (!["Enter", " ", "Spacebar"].includes(event.key)) return;
    event.preventDefault();
    activateButton();
  }

  function dataSignature() {
    return [
      root.dataset.targetScore,
      root.dataset.targetLevel,
      root.dataset.targetName,
      root.dataset.contractSignature,
    ].join("|");
  }

  function stopActiveTimelines() {
    timeline?.kill();
    entryTimeline?.kill();
    timeline = null;
    entryTimeline = null;
    if (resetFrame) global.cancelAnimationFrame(resetFrame);
    resetFrame = 0;
  }

  function onPanelChange() {
    const wasActive = active;
    active = Boolean(panel?.classList.contains("active"));
    if (active && !wasActive) {
      setIdleState({ silent: true });
      playEntry();
    } else if (!active && wasActive) {
      stopActiveTimelines();
      setIdleState({ silent: true });
    }
  }

  function onTransitionComplete(event) {
    if (event.detail?.to !== "matrix" || !active) return;
    setIdleState({ silent: true });
    playEntry();
  }

  function onDataChange() {
    const nextSignature = dataSignature();
    if (nextSignature === lastDataSignature) return;
    lastDataSignature = nextSignature;
    if (active) setIdleState({ silent: true });
  }

  function onVisibilityChange() {
    if (document.hidden) {
      timeline?.pause();
      entryTimeline?.pause();
    } else if (active) {
      timeline?.resume();
      entryTimeline?.resume();
    }
  }

  function onMotionChange() {
    root.dataset.motion = prefersReducedMotion() ? "reduced" : "full";
    if (![STATE.ARMING, STATE.CALCULATING, STATE.THRESHOLDING].includes(state)) return;
    timeline?.kill();
    timeline = null;
    setIdleState({ silent: true });
    startCompute();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopActiveTimelines();
    panelObserver?.disconnect();
    dataObserver?.disconnect();
    startButton?.removeEventListener("click", activateButton);
    startButton?.removeEventListener("keydown", onStartKeydown);
    global.removeEventListener("starrylink:page-transition-complete", onTransitionComplete);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener?.("change", onMotionChange);
  }

  startButton?.addEventListener("click", activateButton);
  startButton?.addEventListener("keydown", onStartKeydown);
  global.addEventListener("starrylink:page-transition-complete", onTransitionComplete);
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotion.addEventListener?.("change", onMotionChange);

  panelObserver = new MutationObserver(onPanelChange);
  panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
  dataObserver = new MutationObserver(onDataChange);
  dataObserver.observe(root, {
    attributes: true,
    attributeFilter: ["data-target-score", "data-target-level", "data-target-name", "data-contract-signature"],
  });

  lastDataSignature = dataSignature();
  onPanelChange();
  global.addEventListener("pagehide", dispose, { once: true });
  global.STARRYLINK_PRIORITY_MATRIX = {
    play: startCompute,
    restart: restartCompute,
    reset: () => setIdleState(),
    showFinal: setFinalState,
    dispose,
    getState: () => state,
    snapshot: () => {
      const items = evidenceData();
      const result = resultData(items);
      return {
        state,
        scoreFromEvidence: result.score,
        contractScore: Number(root.dataset.targetScore || 0),
        maxTotal: items.reduce((sum, item) => sum + item.maxPoints, 0),
        level: result.level,
        earnedPoints: result.earnedPoints,
        maxPoints: result.maxPoints,
        completedSegments: items.filter((item) => item.segment?.classList.contains("is-complete")).length,
        beamCount: items.filter((item) => item.beam).length,
        timelineActive: Boolean(timeline),
        entryTimelineActive: Boolean(entryTimeline),
      };
    },
  };
})(window);
