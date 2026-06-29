const $ = (id) => document.getElementById(id);

const { scenarios, channelCatalog, responseLabels, demoScript } = window.XY_DATA;
const { routeScenario, networkClass, payloadMode } = window.XY_ENGINE;

const controls = {
  scenarioSelect: $("scenarioSelect"),
  severity: $("severity"),
  bandwidth: $("bandwidth"),
  latency: $("latency"),
  packetLoss: $("packetLoss"),
  mobileAvailable: $("mobileAvailable"),
  fixedLineAvailable: $("fixedLineAvailable"),
  satelliteAvailable: $("satelliteAvailable"),
  powerRisk: $("powerRisk"),
  disasterMode: $("disasterMode"),
};

let state = {
  scenarioId: scenarios[0].id,
  event: clone(scenarios[0]),
  recipients: clone(scenarios[0].recipients),
  network: clone(scenarios[0].network),
  plan: null,
  timeline: [],
  fallbackTriggers: 0,
  activeRecipientId: scenarios[0].recipients[0].id,
  scriptIndex: 0,
  closeSummary: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function nowTime(offsetMinutes = 0) {
  const date = new Date(Date.now() + offsetMinutes * 60000);
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id) || scenarios[0];
}

function activeRecipient() {
  return state.recipients.find((recipient) => recipient.id === state.activeRecipientId) || state.recipients[0];
}

function activeDecision() {
  if (!state.plan) return null;
  const recipient = activeRecipient();
  return state.plan.decisions.find((decision) => decision.recipientId === recipient.id) || state.plan.decisions[0];
}

function addTimeline(type, title, description, channel, recipient, status) {
  state.timeline.unshift({
    time: nowTime(),
    type,
    title,
    description,
    channel,
    recipient,
    status,
  });
  state.timeline = state.timeline.slice(0, 12);
}

function syncControlsFromState() {
  controls.severity.value = state.event.severity;
  controls.bandwidth.value = state.network.bandwidthKbps;
  controls.latency.value = state.network.latencyMs;
  controls.packetLoss.value = state.network.packetLossPercent;
  controls.mobileAvailable.checked = state.network.mobileAvailable;
  controls.fixedLineAvailable.checked = state.network.fixedLineAvailable;
  controls.satelliteAvailable.checked = state.network.satelliteAvailable;
  controls.powerRisk.checked = state.network.powerRisk;
  controls.disasterMode.checked = state.network.disasterMode;
}

function syncStateFromControls() {
  state.event.severity = Number(controls.severity.value);
  state.network.bandwidthKbps = Number(controls.bandwidth.value);
  state.network.latencyMs = Number(controls.latency.value);
  state.network.packetLossPercent = Number(controls.packetLoss.value);
  state.network.mobileAvailable = controls.mobileAvailable.checked;
  state.network.fixedLineAvailable = controls.fixedLineAvailable.checked;
  state.network.satelliteAvailable = controls.satelliteAvailable.checked;
  state.network.powerRisk = controls.powerRisk.checked;
  state.network.disasterMode = controls.disasterMode.checked;
}

function calculatePlan() {
  state.plan = routeScenario(state.event, state.recipients, state.network);
  return state.plan;
}

function createEvent() {
  state.event.status = "routing";
  calculatePlan();
  addTimeline("event", "建立事件", `${state.event.heroTitle}，通知 ${state.recipients.length} 位收件者。`, "-", "-", "routing");
  render();
}

function runRouting() {
  syncStateFromControls();
  state.event.status = "waiting_ack";
  const plan = calculatePlan();
  state.recipients = state.recipients.map((recipient) => {
    const decision = plan.decisions.find((item) => item.recipientId === recipient.id);
    if (recipient.ackStatus === "acknowledged") return recipient;
    return {
      ...recipient,
      ackStatus: "delivered",
      lastChannel: decision ? decision.selectedChannel : plan.primaryChannel,
    };
  });
  addTimeline(
    "route",
    "AI 路由完成",
    `${plan.reason} 信心分數 ${plan.confidence}%。`,
    plan.primaryChannel,
    "全部收件者",
    "waiting_ack"
  );
  render();
}

function resetScenario(scenarioId) {
  const scenario = clone(getScenario(scenarioId || state.scenarioId));
  state = {
    scenarioId: scenario.id,
    event: scenario,
    recipients: clone(scenario.recipients),
    network: clone(scenario.network),
    plan: null,
    timeline: [],
    fallbackTriggers: 0,
    activeRecipientId: scenario.recipients[0].id,
    scriptIndex: 0,
    closeSummary: null,
  };
  controls.scenarioSelect.value = scenario.id;
  syncControlsFromState();
  calculatePlan();
  addTimeline("draft", "載入情境", scenario.riskText, "-", "-", "draft");
  render();
}

function simulateNoAck() {
  const plan = calculatePlan();
  state.event.status = "escalating";
  let escalated = 0;
  state.recipients = state.recipients.map((recipient) => {
    if (recipient.ackStatus === "acknowledged") return recipient;
    const decision = plan.decisions.find((item) => item.recipientId === recipient.id);
    const nextChannel = decision?.fallbackChannels[0] || "Manual Call";
    escalated += 1;
    return {
      ...recipient,
      ackStatus: "escalated",
      lastChannel: nextChannel,
      fallbackAttempts: recipient.fallbackAttempts + 1,
    };
  });
  state.fallbackTriggers += escalated;
  addTimeline("escalation", "SLA 未回覆升級", `${escalated} 位未確認者切換 fallback channel，社區守望者與管理端同步收到提醒。`, plan.fallbackChannels[0] || "Manual Call", "未確認名單", "escalated");
  render();
}

function markManual() {
  const recipient = activeRecipient();
  state.event.status = "escalating";
  state.recipients = state.recipients.map((item) =>
    item.id === recipient.id
      ? { ...item, ackStatus: "escalated", lastChannel: "Manual Call", fallbackAttempts: item.fallbackAttempts + 1 }
      : item
  );
  state.fallbackTriggers += 1;
  addTimeline("manual", "標記人工處理", `${recipient.name} 已交由人工電話或社區守望者追蹤。`, "Manual Call", recipient.name, "escalated");
  render();
}

function acknowledge(responseKey) {
  const recipient = activeRecipient();
  const label = responseLabels[responseKey] || "已回覆";
  state.recipients = state.recipients.map((item) =>
    item.id === recipient.id
      ? { ...item, ackStatus: "acknowledged", response: label, lastChannel: item.lastChannel || activeDecision()?.selectedChannel || state.plan?.primaryChannel || "-" }
      : item
  );
  state.event.status = "waiting_ack";
  addTimeline("ack", "收到 ACK 回覆", `${recipient.name} 回覆「${label}」。`, activeDecision()?.selectedChannel || "-", recipient.name, "acknowledged");
  render();
}

function redispatch() {
  const plan = calculatePlan();
  const count = state.recipients.filter((recipient) => recipient.ackStatus !== "acknowledged").length;
  addTimeline("redispatch", "重新派送", `對 ${count} 位未確認者重新派送，主通道 ${plan.primaryChannel}。`, plan.primaryChannel, "未確認名單", "delivering");
  state.event.status = "delivering";
  render();
}

function escalateFallback() {
  simulateNoAck();
}

function resolveEvent() {
  state.event.status = "resolved";
  const acknowledged = state.recipients.filter((recipient) => recipient.ackStatus === "acknowledged").length;
  const unresolved = state.recipients.filter((recipient) => recipient.ackStatus !== "acknowledged").map((recipient) => recipient.name);
  const channels = Array.from(new Set(state.recipients.map((recipient) => recipient.lastChannel).filter(Boolean)));
  state.closeSummary = {
    completionRate: Math.round((acknowledged / Math.max(1, state.recipients.length)) * 100),
    averageAckTime: `${Math.max(2, Math.round(state.plan?.estimatedAckTime || 4))} 分鐘`,
    channels,
    unresolved,
  };
  addTimeline(
    "resolved",
    "事件結案",
    `完成率 ${state.closeSummary.completionRate}%，觸發通道：${channels.join("、") || state.plan?.primaryChannel || "-" }。`,
    "Command Center",
    "管理端",
    "resolved"
  );
  render();
}

function advanceScript() {
  const step = demoScript[state.scriptIndex];
  if (!step) {
    state.scriptIndex = 0;
    render();
    return;
  }

  if (step.action === "family") {
    resetScenario("family_checkin");
    createEvent();
  }
  if (step.action === "normalNetwork") {
    state.network = { ...state.network, bandwidthKbps: 512, latencyMs: 280, packetLossPercent: 2, congestionLevel: 24, disasterMode: false };
    syncControlsFromState();
    runRouting();
  }
  if (step.action === "weakNetwork") {
    state.network = { ...state.network, bandwidthKbps: 48, latencyMs: 950, packetLossPercent: 12, congestionLevel: 78, disasterMode: true };
    syncControlsFromState();
    calculatePlan();
    addTimeline("network", "網路切換弱訊號", "頻寬降至 48kbps，延遲升至 950ms，Push 權重下降。", "-", "-", "routing");
  }
  if (step.action === "reroute") runRouting();
  if (step.action === "noAck") simulateScriptPendingAck();
  if (step.action === "guardian") {
    escalateScriptGuardian();
  }
  if (step.action === "resolve") resolveEvent();

  state.scriptIndex = Math.min(state.scriptIndex + 1, demoScript.length);
  render();
}

function simulateScriptPendingAck() {
  const plan = calculatePlan();
  state.event.status = "waiting_ack";
  state.recipients = state.recipients.map((recipient, index) => {
    const decision = plan.decisions.find((item) => item.recipientId === recipient.id);
    if (recipient.role === "elder") {
      return { ...recipient, ackStatus: "pending", response: null, lastChannel: decision?.selectedChannel || plan.primaryChannel };
    }
    if (index <= 3) {
      return { ...recipient, ackStatus: "acknowledged", response: index === 2 ? "需要協助" : "我平安", lastChannel: decision?.selectedChannel || plan.primaryChannel };
    }
    return { ...recipient, ackStatus: "delivered", lastChannel: decision?.selectedChannel || plan.primaryChannel };
  });
  addTimeline("ack", "部分 ACK 完成", "家中長者仍未確認，其餘家屬已部分回覆，管理台同步更新未確認名單。", plan.primaryChannel, "家庭群組", "waiting_ack");
}

function escalateScriptGuardian() {
  const elder = state.recipients.find((recipient) => recipient.role === "elder") || activeRecipient();
  state.event.status = "escalating";
  state.activeRecipientId = elder.id;
  state.recipients = state.recipients.map((recipient) =>
    recipient.id === elder.id
      ? { ...recipient, ackStatus: "escalated", lastChannel: "Voice IVR", fallbackAttempts: recipient.fallbackAttempts + 1 }
      : recipient
  );
  state.fallbackTriggers += 1;
  addTimeline("escalation", "升級 Voice IVR", "長者超過 SLA 未 ACK，系統改用 Voice IVR 並通知社區守望者。", "Voice IVR", elder.name, "escalated");
  addTimeline("guardian", "通知社區守望者", "社區守望者收到 SMS / Manual Call 任務，管理端進入人工追蹤。", "SMS / Manual Call", "社區守望者", "escalated");
}

function render() {
  calculatePlan();
  renderControls();
  renderHero();
  renderPhone();
  renderCommandCenter();
  renderEngine();
  renderRouteMap();
  renderScript();
}

function renderControls() {
  $("severityValue").textContent = state.event.severity;
  $("bandwidthValue").textContent = state.network.bandwidthKbps;
  $("latencyValue").textContent = state.network.latencyMs;
  $("packetLossValue").textContent = state.network.packetLossPercent;
  $("scenarioRiskTitle").textContent = state.event.riskTitle;
  $("scenarioRiskText").textContent = state.event.riskText;
}

function renderHero() {
  const plan = state.plan;
  const ackRate = ackCompletionRate();
  $("heroSeverity").textContent = `SEV-${state.event.severity}`;
  $("heroMode").textContent = networkClass(state.network);
  $("heroSla").textContent = `SLA ${state.event.slaMinutes} 分鐘`;
  $("heroPrimary").textContent = `主通道 ${plan.primaryChannel}`;
  $("headerSeverity").textContent = `SEV-${state.event.severity}`;
  $("headerMode").textContent = state.network.disasterMode ? "開啟" : "關閉";
  $("headerPrimary").textContent = plan.primaryChannel;
  $("headerAck").textContent = `${ackRate}%`;
  $("mapTitle").textContent = state.event.heroTitle;
  $("eventTitle").textContent = state.event.heroTitle;
  $("eventMessage").textContent = state.event.message;
}

function renderPhone() {
  const recipient = activeRecipient();
  const decision = activeDecision();
  $("phoneRecipient").textContent = recipient.name;
  $("phoneHeadline").textContent = headlineForScenario();
  $("phoneMessage").textContent = state.event.message;
  $("phoneChannel").textContent = recipient.lastChannel || decision?.selectedChannel || state.plan.primaryChannel;
  $("phoneSla").textContent = `${String(state.event.slaMinutes).padStart(2, "0")}:00`;
  $("phoneStatus").textContent = statusLabel(recipient.ackStatus, recipient.response);
  $("phonePayload").textContent = `${payloadMode(state.network)} · ${decision?.selectedChannel || state.plan.primaryChannel}`;
}

function headlineForScenario() {
  if (state.event.category === "medical_support") return "醫療協助確認";
  if (state.event.category === "enterprise_continuity") return "備援通知確認";
  if (state.event.category === "community_watch") return "關懷回覆";
  return "平安確認";
}

function renderCommandCenter() {
  const acknowledged = state.recipients.filter((recipient) => recipient.ackStatus === "acknowledged").length;
  const pending = state.recipients.filter((recipient) => recipient.ackStatus !== "acknowledged").length;
  $("eventStatusBadge").textContent = statusText(state.event.status);
  $("eventStatusBadge").className = `badge status-${state.event.status}`;
  $("kpiDelivery").textContent = formatPercent(state.plan.estimatedDeliveryRate);
  $("kpiAck").textContent = `${Math.round((acknowledged / Math.max(1, state.recipients.length)) * 100)}%`;
  $("kpiPending").textContent = pending;
  $("kpiFallback").textContent = state.fallbackTriggers;
  $("aiConfidence").textContent = `${state.plan.confidence}%`;
  $("aiSummary").textContent = `${state.event.heroTitle}：推薦 ${state.plan.primaryChannel}`;
  $("aiReason").textContent = decisionNarrative();
  $("aiPrimary").textContent = state.plan.primaryChannel;
  $("aiFallback").textContent = state.plan.fallbackChannels.join("、") || "無";
  $("aiEscalation").textContent = state.plan.escalationStrategy;
  $("aiRiskFlags").innerHTML = state.plan.riskFlags.map((flag) => `<span>${flag}</span>`).join("");
  $("networkBadge").textContent = networkClass(state.network);
  $("networkMetrics").innerHTML = networkMetricsHtml();
  $("channelStatus").innerHTML = channelCatalog.map(channelStatusBadge).join("");
  $("matrixPrimary").textContent = `主通道 ${state.plan.primaryChannel}`;
  $("routeScoreMatrix").innerHTML = routeScoreMatrixHtml();
  $("recipientCount").textContent = `${state.recipients.length} 人`;
  $("recipientList").innerHTML = state.recipients.map(recipientRow).join("");
  $("timelineCount").textContent = `${state.timeline.length} 筆`;
  $("timeline").innerHTML = state.timeline.map(timelineRow).join("");
}

function ackCompletionRate() {
  const acknowledged = state.recipients.filter((recipient) => recipient.ackStatus === "acknowledged").length;
  return Math.round((acknowledged / Math.max(1, state.recipients.length)) * 100);
}

function decisionNarrative() {
  const rows = state.plan.scoreTable;
  const primary = rows.find((row) => row.name === state.plan.primaryChannel) || rows[0];
  const push = rows.find((row) => row.name === "App Push");
  const compare = push && primary.name !== "App Push" ? `，高於 App Push ${push.score}` : "";
  const fallback = state.plan.fallbackChannels.join("、") || "無";
  return `${primary.name} 總分 ${primary.score}${compare}。原因：目前頻寬 ${state.network.bandwidthKbps}kbps、延遲 ${state.network.latencyMs}ms、封包遺失 ${state.network.packetLossPercent}%，且事件等級為 ${state.event.severity}，因此系統優先選擇${primary.tag}且可 ACK 的 ${primary.name}，並將 ${fallback} 設為備援。`;
}

function networkMetricsHtml() {
  const metrics = [
    ["頻寬", `${state.network.bandwidthKbps} kbps`],
    ["延遲", `${state.network.latencyMs} ms`],
    ["封包遺失", `${state.network.packetLossPercent}%`],
    ["基地台壅塞", `${state.network.congestionLevel}%`],
  ];
  return metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function channelStatusBadge(channel) {
  const score = state.plan.scoreTable.find((row) => row.id === channel.id);
  const available = score && score.availableCount > 0;
  return `<span class="channel-pill ${available ? "available" : "unavailable"}">${channel.name}<small>${channel.tag}</small></span>`;
}

function routeScoreMatrixHtml() {
  const header = `
    <div class="matrix-row matrix-head">
      <span>通道</span><span>可用性</span><span>弱網適性</span><span>長者適性</span><span>ACK</span><span>延遲</span><span>成本</span><span>總分</span><span>狀態</span>
    </div>
  `;
  const rows = state.plan.scoreTable
    .map(
      (row) => `
        <div class="matrix-row status-${matrixStatusClass(row.status)}">
          <span><strong>${row.name}</strong><small>${row.tag}</small></span>
          <span>${row.availability}%</span>
          <span>${row.weakNetworkFit}</span>
          <span>${row.elderFit}</span>
          <span>${row.ackSupport}</span>
          <span>${row.estimatedDelay}</span>
          <span>${row.cost}</span>
          <span><strong>${row.score}</strong></span>
          <span>${row.status}</span>
        </div>
      `
    )
    .join("");
  return header + rows;
}

function matrixStatusClass(status) {
  if (status === "建議") return "recommended";
  if (status === "備援") return "fallback";
  if (status === "不可用") return "unavailable";
  return "watch";
}

function recipientRow(recipient) {
  const decision = state.plan.decisions.find((item) => item.recipientId === recipient.id);
  return `
    <button class="recipient-row ${recipient.ackStatus}" type="button" data-recipient="${recipient.id}">
      <span>
        <strong>${recipient.name}</strong>
        <small>${roleLabel(recipient.role)} · ${recipient.lastChannel || decision?.selectedChannel || "-"}</small>
      </span>
      <em>${statusLabel(recipient.ackStatus, recipient.response)}</em>
    </button>
  `;
}

function timelineRow(entry) {
  return `
    <div class="timeline-item ${entry.status}">
      <time>${entry.time}</time>
      <div>
        <strong>${entry.title}</strong>
        <p>${entry.description}</p>
        <small>${entry.channel} · ${entry.recipient}</small>
      </div>
    </div>
  `;
}

function renderEngine() {
  const input = {
    EventScenario: {
      id: state.event.id,
      title: state.event.heroTitle,
      category: state.event.category,
      severity: state.event.severity,
      location: state.event.location,
      createdAt: state.event.createdAt,
      slaMinutes: state.event.slaMinutes,
      message: state.event.message,
      status: state.event.status,
    },
    NetworkCondition: state.network,
    RecipientSample: state.recipients.slice(0, 3),
  };
  $("inputJson").textContent = JSON.stringify(input, null, 2);
  $("decisionCount").textContent = `${state.plan.decisions.length} decisions`;
  $("outputJson").textContent = JSON.stringify(
    state.plan.decisions.map(({ recipientId, selectedChannel, fallbackChannels, confidence, estimatedDeliveryRate, estimatedAckTime, reason, riskFlags }) => ({
      recipientId,
      selectedChannel,
      fallbackChannels,
      confidence,
      estimatedDeliveryRate,
      estimatedAckTime,
      reason,
      riskFlags,
    })),
    null,
    2
  );
  $("scoreTable").innerHTML = state.plan.scoreTable.map(scoreRow).join("");
  $("fallbackPlan").innerHTML = fallbackPlanHtml();
}

function scoreRow(row) {
  return `
    <div class="score-row">
      <span>${row.name}<small>${row.tag}</small></span>
      <div class="score-bar"><i style="width:${row.score}%"></i></div>
      <strong>${row.score}</strong>
      <p>${row.reason}</p>
    </div>
  `;
}

function fallbackPlanHtml() {
  const summary = state.closeSummary
    ? `<div class="close-summary"><strong>結案摘要</strong><p>完成率 ${state.closeSummary.completionRate}% · 平均 ACK ${state.closeSummary.averageAckTime}</p><p>未確認：${state.closeSummary.unresolved.join("、") || "無"}</p></div>`
    : "";
  return `
    <p>${state.plan.escalationStrategy}</p>
    <ul>
      ${state.plan.fallbackChannels.map((channel) => `<li>${channel}</li>`).join("") || "<li>目前無需備援</li>"}
    </ul>
    ${summary}
  `;
}

function renderRouteMap() {
  const primary = state.plan.primaryChannel;
  const fallback = state.plan.fallbackChannels;
  const ackDone = ackCompletionRate() === 100 || state.event.status === "resolved";
  const disaster = state.network.disasterMode;
  $("routeLegend").innerHTML = `
    <span class="legend-primary">主通道高亮</span>
    <span class="legend-fallback">備援次高亮</span>
    <span class="legend-off">不可用灰化</span>
    <span class="${disaster ? "legend-disaster" : ""}">災害模式 ${disaster ? "ON" : "OFF"}</span>
    <span class="${ackDone ? "legend-ack" : ""}">ACK ${ackDone ? "完成" : "追蹤中"}</span>
  `;
  $("routeMap").innerHTML = routeFlowDiagram({ compact: false, primary, fallback, ackDone, disaster });
  $("liveRoutePrimary").textContent = primary;
  $("liveRouteFlow").innerHTML = routeFlowDiagram({ compact: true, primary, fallback, ackDone, disaster });
}

function routeFlowDiagram({ compact, primary, fallback, ackDone, disaster }) {
  const firstFallback = fallback[0] || "Manual Call";
  const secondFallback = fallback[1] || fallback[0] || "Manual Call";
  const steps = [
    { label: "事件 Event", detail: `SEV-${state.event.severity}`, type: "event" },
    { label: "AI Router", detail: networkClass(state.network), type: disaster ? "disaster" : "router" },
    { label: "主通道", detail: primary, type: "primary" },
    { label: "備援通道", detail: `${firstFallback}${secondFallback !== firstFallback ? ` / ${secondFallback}` : ""}`, type: "fallback" },
    { label: "ACK / Escalation", detail: ackDone ? "已確認" : state.event.status === "escalating" ? "需升級" : "追蹤中", type: ackDone ? "ack" : "pending" },
  ];
  return `
    <div class="route-flow-diagram ${compact ? "compact" : ""} ${disaster ? "disaster" : ""}">
      ${steps
        .map(
          (step, index) => `
            <div class="route-step ${step.type}">
              <span>${step.label}</span>
              <strong>${step.detail}</strong>
            </div>
            ${index < steps.length - 1 ? '<i class="route-arrow">↓</i>' : ""}
          `
        )
        .join("")}
    </div>
  `;
}

function renderScript() {
  const activeIndex = Math.min(state.scriptIndex, demoScript.length - 1);
  const step = demoScript[activeIndex];
  const nextStep = demoScript[Math.min(activeIndex + 1, demoScript.length - 1)];
  $("scriptStepIndex").textContent = `Step ${activeIndex + 1} / ${demoScript.length}`;
  $("scriptTitle").textContent = step.title;
  $("scriptDescription").textContent = step.description;
  $("scriptNextHint").textContent = state.scriptIndex >= demoScript.length ? "展示已完成，可重新播放。" : `下一步：${nextStep.title}`;
  $("scriptSteps").innerHTML = demoScript
    .map((item, index) => `<li class="${index < state.scriptIndex ? "done" : index === activeIndex ? "active" : ""}">${item.title}</li>`)
    .join("");
  $("nextScriptStep").textContent = state.scriptIndex >= demoScript.length ? "重新播放" : `執行 Step ${activeIndex + 1}`;
}

function statusLabel(status, response) {
  if (status === "acknowledged") return response || "已確認";
  if (status === "delivered") return "已送達";
  if (status === "failed") return "失敗";
  if (status === "escalated") return "需升級";
  return "待確認";
}

function statusText(status) {
  const map = {
    draft: "草稿",
    routing: "路由中",
    delivering: "派送中",
    waiting_ack: "等待 ACK",
    escalating: "需升級",
    resolved: "已結案",
  };
  return map[status] || status;
}

function roleLabel(role) {
  const map = {
    elder: "長者",
    parent: "家屬",
    child: "子女",
    neighbor: "鄰里",
    community_guardian: "社區守望者",
    admin: "管理者",
    responder: "救援窗口",
  };
  return map[role] || role;
}

function initialize() {
  controls.scenarioSelect.innerHTML = scenarios.map((scenario) => `<option value="${scenario.id}">${scenario.title}</option>`).join("");
  controls.scenarioSelect.value = state.scenarioId;
  syncControlsFromState();
  calculatePlan();
  bindEvents();
  resetScenario(state.scenarioId);
}

function bindEvents() {
  controls.scenarioSelect.addEventListener("change", (event) => resetScenario(event.target.value));
  [controls.severity, controls.bandwidth, controls.latency, controls.packetLoss].forEach((control) => {
    control.addEventListener("input", () => {
      syncStateFromControls();
      state.closeSummary = null;
      calculatePlan();
      render();
    });
  });
  [controls.mobileAvailable, controls.fixedLineAvailable, controls.satelliteAvailable, controls.powerRisk, controls.disasterMode].forEach((control) => {
    control.addEventListener("change", () => {
      syncStateFromControls();
      state.closeSummary = null;
      calculatePlan();
      render();
    });
  });
  $("createEvent").addEventListener("click", createEvent);
  $("runRouting").addEventListener("click", runRouting);
  $("resetDemo").addEventListener("click", () => resetScenario(state.scenarioId));
  $("openScriptMode").addEventListener("click", openScriptMode);
  $("heroStartScript").addEventListener("click", () => {
    location.hash = "#demo";
    openScriptMode();
  });
  $("closeScriptMode").addEventListener("click", closeScriptMode);
  $("simulateNoAck").addEventListener("click", simulateNoAck);
  $("markManual").addEventListener("click", markManual);
  $("resolveEvent").addEventListener("click", resolveEvent);
  $("redispatch").addEventListener("click", redispatch);
  $("escalateFallback").addEventListener("click", escalateFallback);
  $("closeFromAdmin").addEventListener("click", resolveEvent);
  $("nextScriptStep").addEventListener("click", advanceScript);
  document.querySelectorAll(".phone-actions [data-response]").forEach((button) => {
    button.addEventListener("click", () => acknowledge(button.dataset.response));
  });
  $("recipientList").addEventListener("click", (event) => {
    const row = event.target.closest("[data-recipient]");
    if (!row) return;
    state.activeRecipientId = row.dataset.recipient;
    render();
  });
}

function openScriptMode() {
  document.body.classList.add("script-open");
  $("scriptPanel").setAttribute("aria-hidden", "false");
}

function closeScriptMode() {
  document.body.classList.remove("script-open");
  $("scriptPanel").setAttribute("aria-hidden", "true");
}

initialize();
