(function (global) {
  "use strict";

  const lowData = global.XY_LOW_DATA;
  const store = global.XY_DEMO_STORE;
  const motionQuery = global.matchMedia("(prefers-reduced-motion: reduce)");
  const phaseLabels = [
    "手機端建立求救封包",
    "封包壓縮中",
    "主要通道健康檢查",
    "通訊矩陣評分中",
    "備援路徑已選定",
    "低資料封包傳送中",
    "應變中心接收中",
    "ACK 回傳與核對",
    "風險與優先序已更新",
  ];
  const phaseTimes = [0, 720, 1450, 2200, 3200, 4050, 4950, 5800, 6650];
  const nodeNames = ["phone", "packet", "analysis", "matrix", "route", "ack", "risk"];
  const ackLabels = {
    received: "已收到 ACK",
    retrying: "重送中 / 等待 ACK",
    failed: "ACK 未收到",
    pending: "等待 ACK",
  };
  const routeLabels = {
    WIFI: "Wi-Fi",
    LTE: "5G / LTE",
    SMS: "SMS 低資料",
    BLE_RELAY: "BLE Mesh",
    SATELLITE: "衛星備援",
  };
  let viewModel = null;
  let timers = [];
  let currentStep = -1;
  let active = false;
  let played = false;
  let bound = false;
  let mobileEvidenceMode = null;
  let transitionObserver = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value ?? "—";
  }

  function clampScore(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function formatScore(value) {
    const score = clampScore(value);
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
  }

  function formatTime(value) {
    if (!value) return "狀態快照";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "狀態快照";
    return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }

  function activeTarget(state) {
    if (store?.getActiveTarget) return store.getActiveTarget(state);
    return state.targets?.find((target) => target.id === state.activeTargetId) || state.targets?.[0] || {};
  }

  function latestPacketFor(state, target) {
    return (
      state.packetLog?.find((packet) => packet.targetId === target.id && (packet.packet || packet.bytes)) ||
      state.packetLog?.find((packet) => packet.packet || packet.bytes) ||
      null
    );
  }

  function derivedPacket(state, target) {
    const communication = target.communication || {};
    const latest = latestPacketFor(state, target);
    const seq = Number(communication.packetSeq || latest?.seq || latest?.packetSeq || 0);
    const replyCode = target.latestReply?.code || latest?.replyCode || "STATUS_CLEAR";
    let computed = null;
    try {
      computed = lowData?.makePacket?.(target, replyCode, Math.max(1, seq || 1));
    } catch (error) {
      computed = null;
    }
    const bytes = Number(communication.packetBytes || latest?.bytes || computed?.bytes || 0);
    const originalBytes = Number(computed?.preview ? lowData?.estimateBytes?.(computed.preview) : 0);
    const reduction = originalBytes > bytes && bytes > 0 ? Math.round((1 - bytes / originalBytes) * 100) : 0;
    return {
      seq,
      bytes,
      originalBytes,
      reduction,
      timestamp: latest?.timestamp || latest?.createdAt || target.lastUpdatedAt || state.updatedAt,
      latest,
    };
  }

  function channelScoreMap(communication) {
    return new Map((communication.channelScores || []).map((channel) => [channel.id, channel]));
  }

  function localizeReason(value) {
    return String(value || "")
      .replace(/RED risk/gi, "紅色風險")
      .replace(/ORANGE risk/gi, "橙色風險")
      .replace(/YELLOW risk/gi, "黃色風險")
      .replace(/GREEN risk/gi, "綠色風險")
      .replace(/backbone unstable/gi, "骨幹不穩")
      .replace(/backbone stable/gi, "骨幹穩定")
      .replace(/ground down/gi, "地面中斷")
      .replace(/not high risk/gi, "非高風險")
      .replace(/high risk/gi, "高風險")
      .replace(/medium risk low-data fit/gi, "中風險低資料適配")
      .replace(/SMS low-data fit/gi, "SMS 低資料適配")
      .replace(/Satellite Backup/gi, "衛星備援")
      .replace(/channelScore/gi, "通道評分");
  }

  function channelName(channel, fallback = "路徑映射") {
    return routeLabels[channel?.id] || localizeReason(channel?.name) || fallback;
  }

  function shortReason(channel, fallback) {
    if (!channel) return fallback;
    const reasons = channel.scoreBreakdown?.reasons || [];
    if (reasons.length) return localizeReason(reasons.join("；"));
    return localizeReason(channel.reason || channel.scoreBreakdown?.text || fallback);
  }

  function buildCandidates(target, network, starry) {
    const communication = target.communication || {};
    const scores = channelScoreMap(communication);
    const primary = scores.get(communication.primaryRoute) || (communication.channelScores || [])[0] || null;
    const meshSource = ["SMS", "BLE_RELAY"].includes(communication.primaryRoute)
      ? primary
      : scores.get("BLE_RELAY") || scores.get("SMS") || primary;
    const groundDown = network.groundBackboneStatus === "down" || network.mobileAvailable === false;
    const groundWeak =
      groundDown ||
      network.groundBackboneStatus === "unstable" ||
      network.seaCableStatus === "degraded" ||
      Number(network.backbonePacketLossPercent || 0) >= 20;
    const selectedRoute = starry.selectedRoute || (communication.primaryRoute === "SATELLITE" ? "satellite" : "ground");
    let selectedId = "LORA";
    if (selectedRoute === "air" && network.airAvailable !== false) selectedId = "DRONE_RELAY";
    else if (selectedRoute === "satellite" || communication.primaryRoute === "SATELLITE") selectedId = "SATELLITE";
    else if (communication.primaryRoute === "LTE") selectedId = "LTE";
    else if (communication.primaryRoute === "WIFI") selectedId = "WIFI";

    const actualPrimaryName = routeLabels[communication.primaryRoute] || primary?.name || communication.primaryRoute || "低資料通道";
    const candidates = [
      {
        id: "LTE",
        name: "5G / LTE",
        source: scores.get("LTE"),
        available: !groundDown && scores.get("LTE")?.available !== false,
        reason: groundDown ? "地面行動網路失效，降為不可用" : shortReason(scores.get("LTE"), "依訊號與延遲評分"),
      },
      {
        id: "WIFI",
        name: "Wi-Fi",
        source: scores.get("WIFI"),
        available: !groundDown && scores.get("WIFI")?.available !== false,
        reason: groundDown ? "地面骨幹失效，Wi-Fi 無法送達中心" : shortReason(scores.get("WIFI"), "依成功率與成本評分"),
      },
      {
        id: "LORA",
        name: "LoRa / 低資料網",
        source: meshSource,
        available: Boolean(meshSource) && meshSource?.available !== false,
        reason: meshSource
          ? `由 ${channelName(meshSource)} 低資料／mesh 能力映射；${shortReason(meshSource, "弱網可用")}`
          : "目前沒有低資料 mesh 評分",
      },
      {
        id: "DRONE_RELAY",
        name: "無人機中繼",
        source: primary,
        available: network.airAvailable !== false,
        reason:
          network.airAvailable === false
            ? "空中中繼目前不可用"
            : `${groundWeak ? "地面骨幹不穩" : "空中節點待命"}；承載 ${actualPrimaryName} 通道評分`,
      },
      {
        id: "SATELLITE",
        name: "衛星備援",
        source: scores.get("SATELLITE"),
        available: network.satelliteAvailable !== false && scores.get("SATELLITE")?.available !== false,
        reason:
          network.satelliteAvailable === false
            ? "衛星服務目前不可用"
            : shortReason(scores.get("SATELLITE"), "高風險與地面中斷時提高權重"),
      },
    ].map((candidate) => ({
      ...candidate,
      score: clampScore(candidate.source?.score),
      selected: candidate.id === selectedId,
    }));

    if (!candidates.some((candidate) => candidate.selected && candidate.available)) {
      const fallback = candidates
        .filter((candidate) => candidate.available)
        .sort((a, b) => b.score - a.score)[0];
      candidates.forEach((candidate) => {
        candidate.selected = candidate === fallback;
      });
    }
    return { candidates, primary, groundDown, groundWeak, actualPrimaryName };
  }

  function riskPriority(target) {
    const workflow = target.workflow || {};
    if (workflow.priority === "urgent") return "P0 / 立即處理";
    if (workflow.priority === "high") return "P1 / 高優先";
    const level = String(target.risk?.level || "GREEN").toUpperCase();
    if (level === "RED") return "P0 / 立即處理";
    if (level === "ORANGE") return "P1 / 優先確認";
    if (level === "YELLOW") return "P2 / 持續追蹤";
    return "P3 / 一般監測";
  }

  function matchingEvent(state, targetId, pattern) {
    return (state.events || []).find((event) => {
      const sameTarget = event.targetId === targetId || event.targetId === "system";
      return sameTarget && pattern.test(`${event.title || ""} ${event.detail || ""}`);
    });
  }

  function buildViewModel(state) {
    const target = activeTarget(state);
    const communication = target.communication || {};
    const network = state.event?.network || {};
    const starry = state.starryState || global.starryState || {};
    const packet = derivedPacket(state, target);
    const channelData = buildCandidates(target, network, starry);
    const selected = channelData.candidates.find((candidate) => candidate.selected) || channelData.candidates[0];
    const ackStatus = communication.ackStatus || packet.latest?.status || "pending";
    const ackReceived = ackStatus === "received" || packet.latest?.status === "received";
    const path =
      selected.id === "DRONE_RELAY"
        ? `無人機中繼 → ${channelData.actualPrimaryName}`
        : selected.id === "LORA"
          ? `${selected.name} → 應變中心`
          : `${selected.name} → 應變中心`;
    const latency = Number(communication.averageLatencyMs || channelData.primary?.latencyMs || 0);
    const retry = Number(communication.retryCount || Math.max(0, Number(packet.latest?.attempt || 1) - 1));
    const displayRisk = Number(target.risk?.displayRiskScore ?? target.risk?.score ?? starry.displayRiskScore ?? 0);
    const rawRisk = Number(target.risk?.rawRiskScore ?? target.risk?.score ?? starry.rawRiskScore ?? displayRisk);
    const riskLevel = String(target.risk?.level || "GREEN").toUpperCase();
    const networkEvent = matchingEvent(state, target.id, /失效|中斷|丟包|網路|network|failed/i);
    const scoreEvent = matchingEvent(state, target.id, /矩陣|評分|selectedChannel|decision/i);
    const ackEvent = matchingEvent(state, target.id, /ACK|delivered|接收/i);
    const riskEvent = matchingEvent(state, target.id, /風險|risk|優先/i);
    const timeline = [
      {
        time: packet.timestamp,
        title: "求救封包建立",
        detail: `packetSeq #${packet.seq || "—"}`,
      },
      {
        time: networkEvent?.timestamp || state.updatedAt,
        title: channelData.groundDown ? "主要通道失效" : channelData.groundWeak ? "主要通道劣化" : "主要通道可用",
        detail: `封包遺失 ${Number(network.backbonePacketLossPercent || 0)}%`,
      },
      {
        time: scoreEvent?.timestamp || state.updatedAt,
        title: "路徑評分完成",
        detail: `${formatScore(selected.score)} / 100`,
      },
      {
        time: networkEvent?.timestamp || packet.timestamp,
        title: channelData.groundWeak ? "備援通道切換" : "通道確認",
        detail: selected.name,
      },
      {
        time: ackEvent?.timestamp || communication.lastAckAt,
        title: ackReceived ? "應變中心接收" : "應變中心等待",
        detail: ackReceived ? "封包已接收" : ackLabels[ackStatus] || ackStatus,
      },
      {
        time: communication.lastAckAt || ackEvent?.timestamp,
        title: ackReceived ? "ACK 返回" : "ACK 狀態",
        detail: ackLabels[ackStatus] || ackStatus,
      },
      {
        time: riskEvent?.timestamp || target.lastUpdatedAt || state.updatedAt,
        title: "風險分數更新",
        detail: `${riskLevel} / ${displayRisk}`,
      },
    ];

    return {
      state,
      target,
      network,
      starry,
      communication,
      packet,
      candidates: channelData.candidates,
      selected,
      path,
      selectedReason: selected.reason,
      scenario: state.event?.title || "災害情境未命名",
      ackStatus,
      ackLabel: ackLabels[ackStatus] || ackStatus || "等待 ACK",
      ackReceived,
      delivery:
        ackReceived ? "已送達" : ackStatus === "failed" ? "尚未送達" : ackStatus === "retrying" ? "重送中" : "等待回報",
      latency,
      retry,
      displayRisk,
      rawRisk,
      riskLevel,
      priority: riskPriority(target),
      groundDown: channelData.groundDown,
      groundWeak: channelData.groundWeak,
      timeline,
    };
  }

  function renderCandidates(model) {
    const list = byId("runtimeChannelList");
    if (!list) return;
    list.innerHTML = model.candidates
      .map((candidate) => {
        const stateLabel = candidate.selected
          ? `已選擇 · ${channelName(candidate.source)}`
          : candidate.available
            ? "候選通道"
            : "不可用";
        return `<article class="runtime-channel-card" data-channel-id="${escapeHtml(candidate.id)}" data-available="${candidate.available}" data-selected="${candidate.selected}">
          <header><h5>${escapeHtml(candidate.name)}</h5><strong>${formatScore(candidate.score)}</strong></header>
          <p>${escapeHtml(candidate.reason)}</p>
          <footer>${escapeHtml(stateLabel)}</footer>
        </article>`;
      })
      .join("");
  }

  function renderEvidence(model) {
    const evidence = byId("runtimeDecisionEvidence");
    if (evidence) {
      const ranked = model.candidates.slice().sort((a, b) => b.score - a.score).slice(0, 3);
      evidence.innerHTML = ranked
        .map(
          (candidate) => `<article>
            <strong>${escapeHtml(candidate.name)} · ${formatScore(candidate.score)} / 100</strong>
            <span>${escapeHtml(candidate.reason)}</span>
          </article>`
        )
        .join("");
    }
    const timeline = byId("runtimeTimeline");
    if (timeline) {
      timeline.innerHTML = model.timeline
        .map(
          (item) => `<li>
            <time datetime="${escapeHtml(item.time || "")}">${escapeHtml(formatTime(item.time))}</time>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
          </li>`
        )
        .join("");
    }
  }

  function renderValues(model) {
    const packetLabel = model.packet.bytes ? `${model.packet.bytes} B` : "等待封包";
    const compressionLabel = model.packet.reduction
      ? `${model.packet.originalBytes} → ${model.packet.bytes} B`
      : packetLabel;
    const scoreLabel = `${formatScore(model.selected.score)} / 100`;
    const riskLabel = model.rawRisk > model.displayRisk
      ? `${model.displayRisk} / 原始 ${model.rawRisk}`
      : `${model.displayRisk} / ${model.riskLevel}`;

    setText("runtimeScenario", model.scenario);
    setText("runtimePacketBytes", packetLabel);
    setText("runtimeSelectedPath", model.path);
    setText("runtimeAckSummary", model.ackLabel);
    setText("runtimeLatencyRetry", `${model.latency || 0} ms / ${model.retry} 次`);

    setText("runtimeNodePhoneValue", model.target.latestReply?.label || `狀態封包 #${model.packet.seq || "—"}`);
    setText("runtimeNodePacketValue", compressionLabel);
    setText(
      "runtimeNodeAnalysisValue",
      model.groundDown
        ? "主要路徑失效"
        : model.groundWeak
          ? `${Number(model.network.backbonePacketLossPercent || 0)}% loss / 劣化`
          : "主要路徑可用"
    );
    setText("runtimeNodeMatrixValue", scoreLabel);
    setText("runtimeNodeRouteValue", model.path);
    setText("runtimeNodeAckValue", model.ackLabel);
    setText("runtimeNodeRiskValue", riskLabel);

    setText("runtimeChannelDecision", `${model.selected.name}｜${scoreLabel}｜${channelName(model.selected.source)}`);
    setText("runtimeResultScore", formatScore(model.selected.score));
    setText("runtimeResultPath", model.path);
    setText("runtimeResultReason", model.selectedReason);
    setText("runtimeResultSeq", model.packet.seq ? `#${model.packet.seq}` : "—");
    setText("runtimeResultRisk", riskLabel);
    setText("runtimeResultAck", model.ackLabel);
    setText("runtimeResultDelivery", model.delivery);
    setText("runtimeResultRetry", `${model.retry} 次`);
    setText("runtimeResultLatency", model.latency ? `${model.latency} ms` : "估算中");
    setText("runtimeResultPriority", model.priority);
    renderCandidates(model);
    renderEvidence(model);
  }

  function setNodeStatus(name, status, label) {
    const node = document.querySelector(`[data-runtime-node="${name}"]`);
    if (!node) return;
    node.dataset.status = status;
    const statusNode = node.querySelector("[data-runtime-node-status]");
    if (statusNode) statusNode.textContent = label;
  }

  function resetNodeStatuses() {
    nodeNames.forEach((name) => setNodeStatus(name, "waiting", "等待"));
  }

  function finalAnalysisStatus(model) {
    if (model.groundDown) return ["failed", "失敗 · 路徑中斷"];
    if (model.groundWeak) return ["failed", "劣化 · 啟動備援"];
    return ["success", "成功 · 路徑健康"];
  }

  function finalAckStatus(model) {
    if (model.ackReceived) return ["success", "成功 · ACK 已返回"];
    if (model.ackStatus === "failed") return ["failed", "失敗 · 未收到 ACK"];
    return ["processing", model.ackStatus === "retrying" ? "處理中 · 重送" : "處理中 · 等待 ACK"];
  }

  function applyStep(step) {
    if (!viewModel) return;
    const panel = document.querySelector('.runtime-panel[data-page="runtime"]');
    if (!panel) return;
    currentStep = step;
    panel.dataset.runtimeStep = String(step);
    resetNodeStatuses();

    if (step === 0) setNodeStatus("phone", "processing", "處理中 · 建立訊號");
    if (step >= 1) setNodeStatus("phone", "success", "成功 · 狀態已建立");
    if (step === 1) setNodeStatus("packet", "processing", "處理中 · 壓縮欄位");
    if (step >= 2) setNodeStatus("packet", "success", "成功 · 低資料量");
    if (step === 2) setNodeStatus("analysis", "processing", "處理中 · 健康檢查");
    if (step >= 3) setNodeStatus("analysis", ...finalAnalysisStatus(viewModel));
    if (step === 3) setNodeStatus("matrix", "processing", "處理中 · 加權評分");
    if (step >= 4) setNodeStatus("matrix", "success", "成功 · 評分完成");
    if (step === 4) setNodeStatus("route", "processing", "處理中 · 鎖定路徑");
    if (step >= 5) setNodeStatus("route", "success", "成功 · 備援已選");
    if (step >= 5 && step < 7) setNodeStatus("ack", "processing", step === 5 ? "處理中 · 傳送" : "處理中 · 回傳 ACK");
    if (step >= 7) setNodeStatus("ack", ...finalAckStatus(viewModel));
    if (step === 7) setNodeStatus("risk", "processing", "處理中 · 更新排序");
    if (step >= 8) setNodeStatus("risk", "success", "成功 · 優先序已更新");

    setText("runtimeStageProgress", `${Math.min(9, step + 1)} / 9`);
    setText("runtimeRunState", phaseLabels[step] || "流程已完成");
    setText("runtimeLive", phaseLabels[step] || "流程已完成");
  }

  function clearTimers() {
    timers.forEach((timer) => global.clearTimeout(timer));
    timers = [];
  }

  function settle() {
    const panel = document.querySelector('.runtime-panel[data-page="runtime"]');
    const replay = byId("runtimeReplay");
    if (!panel || !viewModel) return;
    applyStep(8);
    panel.dataset.runtimeStep = "settled";
    panel.classList.remove("is-running");
    panel.classList.add("is-settled");
    if (replay) replay.disabled = false;
    setText("runtimeRunState", viewModel.ackReceived ? "流程完成 · ACK 已確認" : `流程已呈現 · ${viewModel.ackLabel}`);
    setText("runtimeLive", `流程已完成。${viewModel.path}，${viewModel.ackLabel}，風險 ${viewModel.displayRisk}。`);
  }

  function replay() {
    if (!viewModel || !active || document.documentElement.classList.contains("is-starry-transitioning")) return;
    const panel = document.querySelector('.runtime-panel[data-page="runtime"]');
    const replayButton = byId("runtimeReplay");
    if (!panel) return;
    clearTimers();
    played = true;
    panel.classList.remove("is-settled");
    panel.classList.add("is-running");
    panel.dataset.runtimeStep = "0";
    if (replayButton) replayButton.disabled = true;
    resetNodeStatuses();

    if (motionQuery.matches) {
      settle();
      return;
    }

    phaseTimes.forEach((time, step) => {
      timers.push(global.setTimeout(() => {
        if (active) applyStep(step);
      }, time));
    });
    timers.push(global.setTimeout(() => {
      if (active) settle();
    }, 7200));
  }

  function selectTab(name, moveFocus) {
    const tabs = Array.from(document.querySelectorAll("[data-runtime-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-runtime-panel]"));
    tabs.forEach((tab) => {
      const selected = tab.dataset.runtimeTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) tab.focus();
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.runtimePanel !== name;
    });
  }

  function syncEvidenceMode() {
    const evidence = byId("runtimeEvidence");
    if (!evidence) return;
    const isMobile = global.innerWidth <= 760;
    if (mobileEvidenceMode === isMobile) return;
    mobileEvidenceMode = isMobile;
    evidence.open = false;
  }

  function bind() {
    if (bound) return;
    bound = true;
    const replayButton = byId("runtimeReplay");
    replayButton?.addEventListener("click", replay);
    replayButton?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault();
      if (!replayButton.disabled) replay();
    });
    document.querySelectorAll("#runtimeEvidence > summary, .runtime-code-drawer > summary").forEach((summary) => {
      summary.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
        event.preventDefault();
        const details = summary.parentElement;
        if (details instanceof HTMLDetailsElement) details.open = !details.open;
      });
    });
    document.querySelector(".runtime-tabs")?.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-runtime-tab]");
      if (tab) selectTab(tab.dataset.runtimeTab, false);
    });
    document.querySelector(".runtime-tabs")?.addEventListener("keydown", (event) => {
      const tabs = Array.from(document.querySelectorAll("[data-runtime-tab]"));
      const index = tabs.indexOf(event.target);
      if (index < 0) return;
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next].dataset.runtimeTab, true);
    });
    global.addEventListener("resize", syncEvidenceMode, { passive: true });
    motionQuery.addEventListener?.("change", (event) => {
      if (event.matches && active && currentStep >= 0 && currentStep < 8) {
        clearTimers();
        settle();
      }
    });
    transitionObserver = new MutationObserver(() => {
      const transitioning = document.documentElement.classList.contains("is-starry-transitioning");
      if (transitioning && active && played && currentStep < 8) {
        clearTimers();
        played = false;
        resetNodeStatuses();
        setText("runtimeRunState", "等待頁面轉場");
        return;
      }
      if (active && viewModel && !played && !transitioning) replay();
    });
    transitionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    syncEvidenceMode();
  }

  function render(state) {
    if (!state || !byId("runtimeChannelList")) return;
    viewModel = buildViewModel(state);
    renderValues(viewModel);
    const panel = document.querySelector('.runtime-panel[data-page="runtime"]');
    if (panel?.classList.contains("is-settled")) {
      applyStep(8);
      panel.dataset.runtimeStep = "settled";
      setText("runtimeRunState", viewModel.ackReceived ? "流程完成 · ACK 已確認" : `流程已呈現 · ${viewModel.ackLabel}`);
    } else if (currentStep >= 0) {
      applyStep(Math.min(8, currentStep));
    }
    if (active && !played && !document.documentElement.classList.contains("is-starry-transitioning")) replay();
  }

  function setActive(nextActive) {
    const wasActive = active;
    active = Boolean(nextActive);
    if (!active) {
      clearTimers();
      const replayButton = byId("runtimeReplay");
      if (replayButton) replayButton.disabled = false;
      return;
    }
    if (!wasActive) {
      played = false;
      if (document.documentElement.classList.contains("is-starry-transitioning")) {
        setText("runtimeRunState", "等待頁面轉場");
      } else if (viewModel) replay();
    }
  }

  bind();
  global.XY_RUNTIME_PAGE = {
    render,
    replay,
    setActive,
    getViewModel() {
      return viewModel;
    },
  };
})(window);
