(function initPhysicalHolographicMatrix(global) {
  "use strict";

  const root = document.querySelector("[data-priority-matrix][data-matrix-version='physical-hologram']");
  if (!root) return;

  const panel = root.closest("[data-page='matrix']");
  const startButton = root.querySelector("[data-matrix-start]");
  const startLabel = root.querySelector("[data-matrix-start-label]");
  const detailsButton = root.querySelector("[data-matrix-details]");
  const detailsCloseButton = root.querySelector("[data-matrix-details-close]");
  const rationaleDrawer = root.querySelector("[data-matrix-rationale]");
  const holographicPanel = root.querySelector("[data-holographic-panel], .adjudication-display");
  const controlDeck = root.querySelector(".adjudication-control-deck");
  const projectionColumn = root.querySelector(".projection-column");
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
  const postVerdict = root.querySelector(".post-verdict-command");
  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotionTestMode = new URLSearchParams(global.location.search).get("motion") === "reduce";
  const gsap = global.gsap;
  const scoreContract = global.STARRYLINK_MATRIX_SCORE;
  const prefersReducedMotion = () => reducedMotion.matches || reducedMotionTestMode;

  const STATE = Object.freeze({
    IDLE: "idle",
    ARMING: "arming",
    CALCULATING: "calculating",
    THRESHOLDING: "thresholding",
    RESULT: "result",
    RESETTING: "resetting",
  });

  const ACTION_COPY = Object.freeze({
    GREEN: "監測",
    YELLOW: "注意",
    ORANGE: "優先",
    RED: "緊急",
  });

  let state = STATE.IDLE;
  let timeline = null;
  let entryTimeline = null;
  let resetTimeline = null;
  let panelObserver = null;
  let dataObserver = null;
  let active = false;
  let disposed = false;
  let waitingForTransition = false;
  let lastDataSignature = "";
  let returnFocusAfterRationale = false;
  let panelRotationX = null;
  let panelRotationY = null;

  root.dataset.motion = prefersReducedMotion() ? "reduced" : "full";

  const selectAll = (selector) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function evidenceData() {
    const arcs = selectAll("[data-score-arc]");
    const segments = selectAll("[data-ring-segment]");
    const beams = selectAll("[data-beam-path]");
    const sectors = selectAll("[data-console-sector]");
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
      sector: sectors[index] || null,
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
    if (!scoreElement) return;
    scoreElement.textContent = value === "—" ? "—" : String(Math.round(Number(value) || 0));
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

  function setButtons(mode) {
    if (startButton && startLabel) {
      if (mode === "busy") {
        startLabel.textContent = "裁決中";
        startButton.setAttribute("aria-label", "優先級裁決中");
        startButton.setAttribute("disabled", "");
      } else {
        startButton.removeAttribute("disabled");
        if (mode === "result") {
          startLabel.textContent = "重新啟動";
          startButton.setAttribute("aria-label", "重新啟動優先級裁決");
        } else {
          startLabel.textContent = "啟動裁決";
          startButton.setAttribute("aria-label", "開始優先級裁決");
        }
      }
    }
    if (detailsButton) {
      if (mode === "result") detailsButton.removeAttribute("disabled");
      else detailsButton.setAttribute("disabled", "");
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
    thresholdPointer.style.setProperty("--threshold-position", `${clamp(Number(score) || 0, 0, 100)}%`);
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
    const bounded = clamp(Number(value) || 0, 0, item.maxPoints);
    item.arc.setAttribute("d", describeArc(startAngle, startAngle + bounded * 3.6));
  }

  function setEvidenceValue(item, value) {
    if (item.value) item.value.textContent = String(Math.round(Number(value) || 0));
  }

  function evidenceText(item) {
    return {
      label: item.bay.querySelector(".evidence-copy strong")?.textContent || `證據 ${item.index + 1}`,
      observation: item.bay.querySelector(".evidence-copy b")?.textContent || "",
    };
  }

  function setEvidenceIdle(items, item) {
    item.bay.classList.remove("is-active", "is-complete", "is-zero", "is-linked");
    item.segment?.classList.remove("is-active", "is-complete", "is-linked");
    item.sector?.classList.remove("is-active", "is-complete", "is-linked");
    setEvidenceValue(item, 0);
    setArcValue(items, item, 0);
    if (item.status) item.status.textContent = "STANDBY";
    if (item.beam) {
      item.beam.style.opacity = "0";
      item.beam.style.strokeDashoffset = "1";
    }
    const copy = evidenceText(item);
    item.bay.setAttribute("aria-label", `${copy.label}：原始狀態 ${copy.observation}；本項得分待計算，上限 ${item.maxPoints}`);
  }

  function beginEvidence(items, item) {
    items.forEach((candidate) => {
      const selected = candidate.index === item.index;
      candidate.bay.classList.toggle("is-active", selected);
      candidate.sector?.classList.toggle("is-active", selected);
    });
    item.segment?.classList.add("is-active");
    if (item.status) item.status.textContent = "SCANNING";
    setPhase(`ANALYZING ${String(item.index + 1).padStart(2, "0")} / 06`, `正在換算第 ${item.index + 1} 項證據`);
  }

  function completeEvidence(items, item) {
    item.bay.classList.remove("is-active");
    item.bay.classList.add("is-complete");
    item.bay.classList.toggle("is-zero", item.earnedPoints === 0);
    item.segment?.classList.remove("is-active");
    item.segment?.classList.add("is-complete");
    item.sector?.classList.remove("is-active");
    item.sector?.classList.add("is-complete");
    setEvidenceValue(item, item.earnedPoints);
    setArcValue(items, item, item.earnedPoints);
    if (item.status) item.status.textContent = "LOCKED";
    const copy = evidenceText(item);
    const zeroCopy = item.earnedPoints === 0 ? "，未增加風險" : "";
    item.bay.setAttribute(
      "aria-label",
      `${copy.label}：原始狀態 ${copy.observation}；本項得分 ${item.earnedPoints}/${item.maxPoints}${zeroCopy}；已鎖定`
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

  function closeRationale(options = {}) {
    if (!rationaleDrawer || !root.classList.contains("is-rationale-open")) return;
    root.classList.remove("is-rationale-open");
    rationaleDrawer.setAttribute("aria-hidden", "true");
    detailsButton?.setAttribute("aria-expanded", "false");
    const content = [
      ...evidenceData().map((item) => item.bay),
      root.querySelector(".adjudication-core"),
      root.querySelector(".threshold-console"),
      root.querySelector(".verdict-summary"),
      postVerdict,
    ].filter(Boolean);
    if (gsap && !prefersReducedMotion()) {
      gsap.to(rationaleDrawer, {
        autoAlpha: 0,
        y: 18,
        scale: 0.96,
        duration: 0.26,
        ease: "power2.in",
        onComplete: () => {
          rationaleDrawer.style.pointerEvents = "none";
        },
      });
      gsap.to(content, { autoAlpha: 1, scale: 1, duration: 0.28, ease: "power2.out" });
    } else {
      rationaleDrawer.style.opacity = "0";
      rationaleDrawer.style.visibility = "hidden";
      rationaleDrawer.style.pointerEvents = "none";
      content.forEach((element) => {
        element.style.opacity = "";
        element.style.visibility = "";
      });
    }
    if (options.restoreFocus !== false && returnFocusAfterRationale) {
      detailsButton?.focus({ preventScroll: true });
    }
    returnFocusAfterRationale = false;
  }

  function openRationale() {
    if (!rationaleDrawer || state !== STATE.RESULT || root.classList.contains("is-rationale-open")) return;
    root.classList.add("is-rationale-open");
    rationaleDrawer.setAttribute("aria-hidden", "false");
    rationaleDrawer.style.pointerEvents = "auto";
    detailsButton?.setAttribute("aria-expanded", "true");
    returnFocusAfterRationale = true;
    const content = [
      ...evidenceData().map((item) => item.bay),
      root.querySelector(".adjudication-core"),
      root.querySelector(".threshold-console"),
      root.querySelector(".verdict-summary"),
      postVerdict,
    ].filter(Boolean);
    if (gsap && !prefersReducedMotion()) {
      gsap.to(content, { autoAlpha: 0.1, scale: 0.975, duration: 0.28, ease: "power2.inOut" });
      gsap.fromTo(
        rationaleDrawer,
        { autoAlpha: 0, y: 18, scale: 0.96 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.42,
          ease: "power3.out",
          onComplete: () => detailsCloseButton?.focus({ preventScroll: true }),
        }
      );
    } else {
      content.forEach((element) => {
        element.style.opacity = "0.1";
      });
      rationaleDrawer.style.opacity = "1";
      rationaleDrawer.style.visibility = "visible";
      rationaleDrawer.style.transform = "none";
      detailsCloseButton?.focus({ preventScroll: true });
    }
  }

  function resetVisualState(items) {
    timeline?.kill();
    timeline = null;
    resetTimeline?.kill();
    resetTimeline = null;
    closeRationale({ restoreFocus: false });
    delete root.dataset.focusedEvidence;
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
    setButtons("idle");
    if (postVerdict) {
      postVerdict.style.opacity = "0";
      postVerdict.style.visibility = "hidden";
    }
  }

  function setIdleState(options = {}) {
    const items = evidenceData();
    resetVisualState(items);
    setState(STATE.IDLE);
    if (!options.silent) announce("優先級裁決已重設，等待啟動");
  }

  function prepareForCompute(items) {
    setState(STATE.ARMING);
    setButtons("busy");
    setPhase("ARMING", "投影環鎖定六項證據");
    setFormula("PRIORITY COMPUTE", "固定依 01–06 順序換算六項證據。");
    announce("開始優先級裁決");
    if (!gsap) return;
    gsap.set(items.map((item) => item.bay), { autoAlpha: 0.48, filter: "brightness(.76)" });
    gsap.set(items.map((item) => item.beam).filter(Boolean), { autoAlpha: 0, strokeDashoffset: 1 });
    gsap.set([alertElement, scanline, postVerdict].filter(Boolean), { autoAlpha: 0 });
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
    setPhase("THRESHOLD CHECK", `${result.score} 分正在比對處理門檻`);
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
    setButtons("result");
    showAlert(result.level === "RED" ? "CRITICAL PRIORITY" : "PRIORITY LOCKED", result.level === "RED");
    if (options.stable) alertElement?.classList.add("is-stable");
    root.setAttribute("aria-busy", "false");
    startButton?.setAttribute("aria-busy", "false");
    announce(`最終優先級為${result.level}，分數${result.score}，已推入最高處理隊列`);
  }

  function setFinalState() {
    timeline?.kill();
    timeline = null;
    entryTimeline?.kill();
    entryTimeline = null;
    const items = evidenceData();
    const result = resultData(items);
    applyResultState(result, { stable: true });
    root.dataset.entryComplete = "true";
    if (!gsap) {
      if (postVerdict) {
        postVerdict.style.opacity = "1";
        postVerdict.style.visibility = "visible";
      }
      return;
    }
    gsap.set([holographicPanel, controlDeck], { autoAlpha: 1, y: 0, scale: 1, scaleY: 1, clearProps: "clipPath" });
    gsap.set(projectionColumn, { autoAlpha: 0.3, scaleY: 1 });
    gsap.set(items.map((item) => item.bay), { autoAlpha: 0.88, x: 0, scale: 1, filter: "brightness(.98)" });
    gsap.set(items.map((item) => item.beam).filter(Boolean), { autoAlpha: 0, strokeDashoffset: 0 });
    gsap.set([alertElement, thresholdPointer, postVerdict].filter(Boolean), { autoAlpha: 1, y: 0, scale: 1 });
  }

  function buildReducedTimeline(items, result) {
    prepareForCompute(items);
    const next = gsap.timeline({
      paused: true,
      defaults: { ease: "none" },
      onComplete: () => {
        timeline = null;
        alertElement?.classList.add("is-stable");
      },
    });
    next.call(() => showAlert("PRIORITY COMPUTE"), null, 0.02);
    next.call(() => setState(STATE.CALCULATING), null, 0.08);
    items.forEach((item, index) => {
      next.call(() => {
        beginEvidence(items, item);
        completeEvidence(items, item);
        setCoreValue(items.slice(0, index + 1).reduce((sum, entry) => sum + entry.earnedPoints, 0));
      }, null, 0.1 + index * 0.07);
    });
    next.call(() => applyTotalState(result), null, 0.55);
    next.call(() => applyThresholdState(result), null, 0.62);
    next.call(() => applyResultState(result), null, 0.72);
    next.set(postVerdict, { autoAlpha: 1 }, 0.78);
    return next;
  }

  function buildTimeline(items, result) {
    prepareForCompute(items);
    const cumulative = { value: 0 };
    const next = gsap.timeline({
      paused: true,
      defaults: { ease: "power2.out" },
      onComplete: () => {
        timeline = null;
        alertElement?.classList.add("is-stable");
      },
    });

    next.addLabel("power", 0);
    next.to(root.querySelector(".compute-pressure-core"), {
      y: 3,
      scale: 0.95,
      duration: 0.1,
      ease: "power2.in",
    }, "power");
    next.to(root.querySelector(".compute-lock-ring"), {
      rotation: 72,
      scale: 0.84,
      duration: 0.24,
      ease: "power3.inOut",
    }, "power");
    next.to(root.querySelector(".compute-pressure-core"), {
      y: 0,
      scale: 1,
      duration: 0.15,
      ease: "back.out(2)",
    }, "power+=0.11");
    next.fromTo(
      root.querySelectorAll(".projector-ring i"),
      { autoAlpha: 0.08, scale: 0.7 },
      { autoAlpha: 1, scale: 1, duration: 0.26, stagger: 0.045, ease: "power3.out" },
      "power"
    );
    next.call(() => showAlert("PRIORITY COMPUTE"), null, 0.12);
    next.fromTo(scanline, { autoAlpha: 0, yPercent: -140 }, { autoAlpha: 0.11, yPercent: 140, duration: 0.42, ease: "none" }, 0.1);

    next.addLabel("evidence", 0.24);
    next.call(() => setState(STATE.CALCULATING), null, "evidence");
    let accumulated = 0;
    items.forEach((item, index) => {
      const at = 0.24 + index * 0.13;
      const before = accumulated;
      const counter = { value: 0 };
      accumulated += item.earnedPoints;
      next.call(() => beginEvidence(items, item), null, at);
      next.to([item.bay, item.sector].filter(Boolean), {
        autoAlpha: 1,
        filter: "brightness(1.3) saturate(1.12)",
        duration: 0.1,
      }, at);
      if (item.beam) {
        next.fromTo(item.beam, {
          autoAlpha: 0,
          strokeDashoffset: 1,
        }, {
          autoAlpha: 0.78,
          strokeDashoffset: 0,
          duration: 0.22,
          ease: "power1.inOut",
        }, at + 0.02);
      }
      next.to(counter, {
        value: item.earnedPoints,
        duration: 0.26,
        ease: "power1.out",
        onUpdate: () => {
          setEvidenceValue(item, counter.value);
          setArcValue(items, item, counter.value);
          cumulative.value = before + counter.value;
          setCoreValue(cumulative.value);
        },
      }, at + 0.025);
      next.call(() => completeEvidence(items, item), null, at + 0.26);
      next.to([item.bay, item.sector].filter(Boolean), {
        autoAlpha: 0.88,
        filter: "brightness(.98)",
        duration: 0.1,
      }, at + 0.26);
      if (item.beam) next.to(item.beam, { autoAlpha: 0.12, duration: 0.1 }, at + 0.25);
    });

    next.addLabel("total", 1.2);
    next.call(() => applyTotalState(result), null, "total");
    next.to(root.querySelector(".score-dial-readout"), {
      scale: 1.08,
      duration: 0.14,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    }, "total");

    next.addLabel("threshold", 1.38);
    next.call(() => applyThresholdState(result), null, "threshold");
    next.fromTo(thresholdPointer, {
      autoAlpha: 0,
      "--threshold-position": "0%",
    }, {
      autoAlpha: 1,
      "--threshold-position": `${result.score}%`,
      duration: 0.36,
      ease: "power3.inOut",
    }, "threshold");
    selectAll("[data-gate-level]").forEach((gate, index) => {
      next.to(gate, {
        filter: "brightness(1.22)",
        duration: 0.06,
        yoyo: true,
        repeat: 1,
      }, 1.4 + index * 0.07);
    });

    next.addLabel("result", 1.82);
    next.call(() => applyResultState(result), null, "result");
    next.fromTo(alertElement, {
      autoAlpha: 0,
      scaleX: 0.88,
    }, {
      autoAlpha: 1,
      scaleX: 1,
      duration: 0.18,
      ease: "power3.out",
    }, "result");
    next.to(root.querySelector(".score-dial"), {
      scale: 1.055,
      duration: 0.16,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    }, "result");
    next.fromTo(postVerdict, {
      autoAlpha: 0,
      y: 10,
    }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.28,
      ease: "power3.out",
    }, "result+=0.18");
    next.to(postVerdict, {
      scale: 1.025,
      duration: 0.14,
      yoyo: true,
      repeat: 1,
      ease: "sine.inOut",
    }, "result+=0.38");
    next.to(root.querySelector(".compute-lock-ring"), {
      rotation: 0,
      scale: 1,
      duration: 0.22,
      ease: "power2.out",
    }, "result+=0.08");
    return next;
  }

  function startCompute() {
    if (!active || disposed || ![STATE.IDLE, STATE.ARMING].includes(state)) return;
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

  function playEntry(options = {}) {
    if (!active || disposed) return;
    entryTimeline?.kill();
    entryTimeline = null;
    resetTimeline?.kill();
    resetTimeline = null;
    setIdleState({ silent: true });
    setState(STATE.ARMING);
    setButtons("busy");
    root.dataset.entryComplete = "false";
    const items = evidenceData();
    const bays = items.map((item) => item.bay);
    const sectors = items.map((item) => item.sector).filter(Boolean);
    if (!gsap || prefersReducedMotion()) {
      root.dataset.entryComplete = "true";
      if (gsap) {
        gsap.set([holographicPanel, controlDeck], { autoAlpha: 1, y: 0, scale: 1, scaleY: 1, clearProps: "clipPath" });
        gsap.set(projectionColumn, { autoAlpha: 0.28, scaleY: 1 });
        gsap.set(bays, { autoAlpha: 0.68, scaleX: 1 });
        gsap.set(sectors, { autoAlpha: 1, scale: 1 });
      }
      startCompute();
      return;
    }

    entryTimeline = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        root.dataset.entryComplete = "true";
        entryTimeline = null;
        startCompute();
      },
    });
    if (!options.restart) {
      entryTimeline.fromTo(root.querySelector(".adjudication-room img"), {
        filter: "brightness(.22) saturate(.5)",
        scale: 1.028,
      }, {
        filter: "brightness(.62) saturate(.7) contrast(1.06)",
        scale: 1.012,
        duration: 0.68,
      }, 0);
    }
    entryTimeline.fromTo(controlDeck, {
      autoAlpha: 0.08,
      y: 64,
      scale: 0.975,
    }, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.66,
      ease: "back.out(1.35)",
    }, 0.02);
    entryTimeline.fromTo(root.querySelectorAll(".projector-ring i"), {
      autoAlpha: 0,
      scale: 0.54,
    }, {
      autoAlpha: 1,
      scale: 1,
      duration: 0.34,
      stagger: 0.06,
      ease: "back.out(1.6)",
    }, 0.23);
    entryTimeline.fromTo(sectors, {
      autoAlpha: 0,
      scale: 0.76,
    }, {
      autoAlpha: 1,
      scale: 1,
      duration: 0.24,
      stagger: 0.04,
      ease: "back.out(1.5)",
    }, 0.3);
    entryTimeline.fromTo(projectionColumn, {
      autoAlpha: 0,
      scaleY: 0.08,
      transformOrigin: "50% 100%",
    }, {
      autoAlpha: 0.28,
      scaleY: 1,
      duration: 0.56,
      ease: "power2.inOut",
    }, 0.28);
    entryTimeline.fromTo(holographicPanel, {
      autoAlpha: 0.12,
      scaleY: 0.06,
      clipPath: "inset(94% 0 0 0)",
      transformOrigin: "50% 100%",
    }, {
      autoAlpha: 1,
      scaleY: 1,
      clipPath: "inset(0% 0 0 0)",
      duration: 0.64,
      ease: "power3.out",
    }, 0.32);
    entryTimeline.fromTo(glassSweep, {
      autoAlpha: 0,
      xPercent: 0,
    }, {
      autoAlpha: 0.7,
      xPercent: 1000,
      duration: 0.52,
      ease: "power1.inOut",
    }, 0.42);
    entryTimeline.fromTo(root.querySelector(".adjudication-core"), {
      autoAlpha: 0,
      scale: 0.72,
      filter: "blur(6px)",
    }, {
      autoAlpha: 1,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.38,
      ease: "back.out(1.45)",
    }, 0.5);
    entryTimeline.fromTo(bays, {
      autoAlpha: 0,
      scaleX: 0.35,
      transformOrigin: (index) => index < 3 ? "left center" : "right center",
    }, {
      autoAlpha: 0.68,
      scaleX: 1,
      duration: 0.22,
      stagger: 0.045,
      ease: "power2.out",
    }, 0.5);
    entryTimeline.to([glassSweep, crtScan].filter(Boolean), { autoAlpha: 0, duration: 0.08 }, 0.88);
  }

  function restartCompute() {
    if (!active || disposed || state !== STATE.RESULT) return;
    closeRationale({ restoreFocus: false });
    setState(STATE.RESETTING);
    setButtons("busy");
    timeline?.kill();
    timeline = null;
    if (!gsap || prefersReducedMotion()) {
      playEntry({ restart: true });
      return;
    }
    resetTimeline = gsap.timeline({
      onComplete: () => {
        resetTimeline = null;
        playEntry({ restart: true });
      },
    });
    resetTimeline.to(holographicPanel, {
      autoAlpha: 0.15,
      scaleY: 0.06,
      clipPath: "inset(84% 0 0 0)",
      duration: 0.3,
      ease: "power3.in",
      transformOrigin: "50% 100%",
    }, 0);
    resetTimeline.to(projectionColumn, {
      autoAlpha: 0,
      scaleY: 0.08,
      duration: 0.25,
      ease: "power2.in",
      transformOrigin: "50% 100%",
    }, 0);
    resetTimeline.to(root.querySelectorAll(".projector-ring i"), {
      autoAlpha: 0.12,
      scale: 0.68,
      duration: 0.22,
      stagger: 0.035,
    }, 0.02);
  }

  function activatePrimaryButton() {
    if (state === STATE.RESULT) restartCompute();
    else if (state === STATE.IDLE) startCompute();
  }

  function setFocusedEvidence(index) {
    if (!Number.isInteger(index) || index < 0 || index > 5) {
      delete root.dataset.focusedEvidence;
      evidenceData().forEach((item) => {
        item.bay.classList.remove("is-linked");
        item.sector?.classList.remove("is-linked");
        item.segment?.classList.remove("is-linked");
      });
      return;
    }
    root.dataset.focusedEvidence = String(index);
    evidenceData().forEach((item) => {
      const linked = item.index === index;
      item.bay.classList.toggle("is-linked", linked);
      item.sector?.classList.toggle("is-linked", linked);
      item.segment?.classList.toggle("is-linked", linked);
    });
  }

  function interactiveEvidenceTarget(target) {
    return target instanceof Element ? target.closest("[data-evidence-track], [data-console-sector]") : null;
  }

  function targetEvidenceIndex(target) {
    if (!target) return -1;
    const raw = target.hasAttribute("data-evidence-track")
      ? target.getAttribute("data-evidence-track")
      : target.getAttribute("data-console-sector");
    return Number(raw);
  }

  function onEvidencePointerOver(event) {
    const target = interactiveEvidenceTarget(event.target);
    if (target) setFocusedEvidence(targetEvidenceIndex(target));
  }

  function onEvidencePointerOut(event) {
    const target = interactiveEvidenceTarget(event.target);
    if (!target) return;
    const related = interactiveEvidenceTarget(event.relatedTarget);
    if (related && targetEvidenceIndex(related) === targetEvidenceIndex(target)) return;
    setFocusedEvidence(-1);
  }

  function onEvidenceFocusIn(event) {
    const target = interactiveEvidenceTarget(event.target);
    if (target) setFocusedEvidence(targetEvidenceIndex(target));
  }

  function onEvidenceFocusOut(event) {
    const related = interactiveEvidenceTarget(event.relatedTarget);
    if (related) setFocusedEvidence(targetEvidenceIndex(related));
    else setFocusedEvidence(-1);
  }

  function onPointerMove(event) {
    if (!gsap || prefersReducedMotion() || global.innerWidth < 900 || root.classList.contains("is-rationale-open")) return;
    const bounds = root.getBoundingClientRect();
    const relativeX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) - 0.5;
    const relativeY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1) - 0.5;
    panelRotationY?.(relativeX * 2.4);
    panelRotationX?.(relativeY * -1.8);
  }

  function resetParallax() {
    panelRotationY?.(0);
    panelRotationX?.(0);
  }

  function onKeydown(event) {
    if (event.key === "Escape" && root.classList.contains("is-rationale-open")) {
      event.preventDefault();
      closeRationale();
    }
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
    resetTimeline?.kill();
    timeline = null;
    entryTimeline = null;
    resetTimeline = null;
  }

  function onPanelChange() {
    const wasActive = active;
    active = Boolean(panel?.classList.contains("active"));
    if (active && !wasActive) {
      waitingForTransition = document.documentElement.classList.contains("is-starry-transitioning");
      if (!waitingForTransition) playEntry();
    } else if (!active && wasActive) {
      waitingForTransition = false;
      stopActiveTimelines();
      setIdleState({ silent: true });
    }
  }

  function onTransitionComplete(event) {
    if (event.detail?.to !== "matrix" || !active) return;
    waitingForTransition = false;
    playEntry();
  }

  function onDataChange() {
    const nextSignature = dataSignature();
    if (nextSignature === lastDataSignature) return;
    lastDataSignature = nextSignature;
    if (active) playEntry();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      timeline?.pause();
      entryTimeline?.pause();
      resetTimeline?.pause();
    } else if (active) {
      timeline?.resume();
      entryTimeline?.resume();
      resetTimeline?.resume();
    }
  }

  function onMotionChange() {
    root.dataset.motion = prefersReducedMotion() ? "reduced" : "full";
    stopActiveTimelines();
    if (active) playEntry();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopActiveTimelines();
    panelObserver?.disconnect();
    dataObserver?.disconnect();
    startButton?.removeEventListener("click", activatePrimaryButton);
    detailsButton?.removeEventListener("click", openRationale);
    detailsCloseButton?.removeEventListener("click", closeRationale);
    root.removeEventListener("pointerover", onEvidencePointerOver);
    root.removeEventListener("pointerout", onEvidencePointerOut);
    root.removeEventListener("focusin", onEvidenceFocusIn);
    root.removeEventListener("focusout", onEvidenceFocusOut);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerleave", resetParallax);
    global.removeEventListener("keydown", onKeydown);
    global.removeEventListener("starrylink:page-transition-complete", onTransitionComplete);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener?.("change", onMotionChange);
  }

  if (gsap) {
    panelRotationX = gsap.quickTo(holographicPanel, "rotationX", { duration: 0.5, ease: "power3.out" });
    panelRotationY = gsap.quickTo(holographicPanel, "rotationY", { duration: 0.5, ease: "power3.out" });
  }

  startButton?.addEventListener("click", activatePrimaryButton);
  detailsButton?.addEventListener("click", openRationale);
  detailsCloseButton?.addEventListener("click", closeRationale);
  root.addEventListener("pointerover", onEvidencePointerOver);
  root.addEventListener("pointerout", onEvidencePointerOut);
  root.addEventListener("focusin", onEvidenceFocusIn);
  root.addEventListener("focusout", onEvidenceFocusOut);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerleave", resetParallax);
  global.addEventListener("keydown", onKeydown);
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
    openRationale,
    closeRationale,
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
        physicalSectorCount: items.filter((item) => item.sector).length,
        beamCount: items.filter((item) => item.beam).length,
        rationaleOpen: root.classList.contains("is-rationale-open"),
        panelProjected: root.dataset.entryComplete === "true",
        timelineActive: Boolean(timeline),
        entryTimelineActive: Boolean(entryTimeline),
      };
    },
  };
})(window);
