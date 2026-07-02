const $ = (id) => document.getElementById(id);
const store = window.XY_DEMO_STORE;
const lowData = window.XY_LOW_DATA;
const query = new URLSearchParams(window.location.search);
const isMobileView = query.get("view") === "mobile";
let scriptTimers = [];
let simulationTimer = null;
let activePage = isMobileView ? "demo" : "intro";
let activeFilter = "all";
let audioContext = null;
let alarmEnabled = false;
const pages = ["intro", "architecture", "demo", "matrix", "runtime"];

if (isMobileView) document.body.classList.add("mobile-view");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function durationText(seconds) {
  const safe = Math.max(0, Math.min(180, Number(seconds || 0)));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function signalLabel(signal) {
  if (signal >= 70) return "良好";
  if (signal >= 40) return "不穩";
  return "弱訊號";
}

function ackLabel(status) {
  const map = {
    pending: "等待確認",
    received: "已收到",
    retrying: "低資料重送中",
    failed: "ACK 失敗",
  };
  return map[status] || status || "-";
}

function actionText(action) {
  return store.actionLabels[action] || action || "-";
}

function levelClass(level) {
  return `level-${String(level || "GREEN").toLowerCase()}`;
}

function riskRank(level) {
  return { RED: 4, ORANGE: 3, YELLOW: 2, GREEN: 1 }[String(level || "GREEN").toUpperCase()] || 0;
}

function msText(value) {
  return `${Math.round(Number(value || 0))} ms`;
}

function routeName(route) {
  return lowData.routeLabel(route);
}

function starrySnapshot(state) {
  return state.starryState || store.getStarryState?.() || {};
}

function starryRiskLabel(level) {
  const map = {
    stable: "Stable",
    watch: "Watch",
    danger: "Danger",
    critical: "Critical",
  };
  return map[level] || "Stable";
}

function victimStatusLabel(status) {
  const map = {
    safe: "安全",
    delayed: "回覆延遲",
    injured: "受傷",
    trapped: "受困",
    no_ack: "ACK 遺失",
    sos: "SOS",
    medical_risk: "醫療風險",
  };
  return map[status] || "安全";
}

function activeRouteLabel(route) {
  const map = {
    ground_primary: "Ground Primary",
    ground_mesh: "Ground Mesh",
    gps_packet: "GPS Status Packet",
    satellite_backup: "Satellite Backup",
    sos_escalation: "SOS Escalation",
  };
  return map[route] || "Ground Primary";
}

function starryAckLabel(status) {
  const map = { ok: "ACK ok", retry: "ACK retry", lost: "ACK lost" };
  return map[status] || "ACK retry";
}

function gpsStatusLabel(status) {
  const map = { locked: "GPS locked", drifting: "GPS drifting", last_known: "last known" };
  return map[status] || "last known";
}

function clampPercent(value) {
  return `${Math.max(8, Math.min(100, Math.round(Number(value || 0))))}%`;
}

function coordinateText(value) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : "--";
}

function accuracyText(location = {}) {
  return location.confirmed ? location.accuracy || "unknown" : "unknown";
}

function locationStatusText(location = {}) {
  if (location.confirmed) return "位置已確認";
  if (["GPS_DENIED", "UNAVAILABLE"].includes(location.source)) return "無法定位";
  return "位置待確認";
}

function gpsCardLabel(location = {}) {
  if (location.confirmed) return "有 GPS";
  if (["GPS_DENIED", "UNAVAILABLE"].includes(location.source)) return "無 GPS";
  return "GPS 待確認";
}

function groundStatusText(network = {}) {
  if (network.groundBackboneStatus === "down") return "失效";
  if (network.groundBackboneStatus === "unstable") return "不穩";
  return "正常";
}

function pageIndex(page = activePage) {
  return Math.max(0, pages.indexOf(page));
}

function setActivePage(page) {
  if (!pages.includes(page)) return;
  activePage = page;
  renderPageState();
}

function renderPageState() {
  document.querySelectorAll("[data-page]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.page === activePage);
  });
  document.querySelectorAll("[data-nav-page]").forEach((button) => {
    const active = button.dataset.navPage === activePage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if ($("pageProgress")) $("pageProgress").textContent = `${pageIndex() + 1} / ${pages.length}`;
  if ($("prevPage")) $("prevPage").disabled = pageIndex() === 0;
  if ($("nextPage")) $("nextPage").disabled = pageIndex() === pages.length - 1;
}

function gotoRelativePage(offset) {
  const next = pages[pageIndex() + offset];
  if (next) setActivePage(next);
}

function render() {
  const state = store.getState();
  const active = store.getActiveTarget(state);
  const selected = store.getSelectedTarget(state);
  const starry = starrySnapshot(state);
  renderPageState();
  renderToolbar(state, active);
  renderDisasterBanner(state);
  renderArchitecture(state, active, starry);
  renderPhone(active, state, starry);
  renderTargets(state, selected);
  renderDetail(state, selected);
  renderRisk(selected);
  renderCommunication(active);
  renderMatrixOverview(selected);
  renderPacketFlow(state, active, starry);
  renderRuntime(state);
}

function renderToolbar(state, active) {
  $("demoTitle").textContent = state.event.title;
  const transport = window.__lastTransport || {};
  const sync = transport.serverAvailable
    ? `Server sync / clients ${transport.connectedClients || 0}`
    : isMobileView
      ? "Mobile local mode；啟動本機 server 可同步後台"
      : "Local single source of truth";
  $("syncStatus").textContent = sync;
  $("weakSignalToggle").checked = active.signalQuality < 40;
  $("scriptStatus").textContent = state.event.script.label;
  $("scriptTimer").textContent = `${durationText(state.event.script.elapsedSeconds)} / 03:00`;
  $("scriptProgress").style.width = `${Math.min(100, (Number(state.event.script.elapsedSeconds || 0) / 180) * 100)}%`;
  if ($("networkStatus")) {
    const network = state.event.network || {};
    $("networkStatus").textContent = `海纜 ${network.seaCableStatus === "degraded" ? "異常" : "正常"} / 地面骨幹 ${groundStatusText(network)} / 丟包 ${network.backbonePacketLossPercent || 0}%`;
  }
}

function renderDisasterBanner(state) {
  const banner = $("disasterBanner");
  if (!banner) return;
  const network = state.event.network || {};
  const activeStatuses = ["災害模式啟動", "地面網路失效", "高風險衛星備援啟用"];
  const active = state.event.script.running || activeStatuses.includes(state.event.status);
  banner.classList.toggle("active", active);
  const groundText = network.groundBackboneStatus === "down" ? "地面骨幹失效" : "地面骨幹不穩";
  banner.innerHTML = `
    <div>
      <strong>${active ? state.event.status : "平時監測待命"}</strong>
      <span>地震後海纜與${groundText}：延遲 ${network.backboneLatencyMs || 0}ms、丟包 ${network.backbonePacketLossPercent || 0}%；系統改用低資料量封包與多路徑通訊決策。</span>
    </div>
    <small id="alertSoundStatus">${alarmEnabled ? "警報音已啟用" : "若瀏覽器擋住自動播放，請點啟用警報音。"}</small>
  `;
}

function renderArchitecture(state, active, starry = starrySnapshot(state)) {
  const network = state.event.network || {};
  if ($("archSeaStatus")) {
    $("archSeaStatus").textContent =
      network.seaCableStatus === "degraded" ? "異常 / 延遲升高" : "正常監測";
  }
  if ($("archGroundStatus")) {
    const groundDown = network.groundBackboneStatus === "down";
    $("archGroundStatus").textContent = groundDown
      ? "失效 / 切換地面備援"
      : network.groundBackboneStatus === "unstable"
        ? "壅塞 / 丟包率上升"
        : "可用";
  }
  if ($("archSatelliteStatus")) {
    $("archSatelliteStatus").textContent =
      active.communication.satelliteRecommended || active.communication.primaryRoute === "SATELLITE" || starry.activeLayer === "SPACE"
        ? "高風險備援啟用"
        : "待命";
  }
  if ($("archStrategy")) {
    $("archStrategy").textContent = starry.lowDataMode ? "啟用低資料量封包" : "一般低流量同步";
  }
  if ($("archActiveRoute")) {
    $("archActiveRoute").textContent = activeRouteLabel(starry.activeRoute);
  }
  if ($("archSelectedChannel")) {
    $("archSelectedChannel").textContent = starry.selectedChannel || routeName(active.communication.primaryRoute);
  }
  if ($("archRouteDetail")) {
    $("archRouteDetail").textContent = `；${victimStatusLabel(starry.victimStatus)} / ${starryRiskLabel(starry.riskLevel)} / ${gpsStatusLabel(starry.gpsStatus)}。`;
  }
  if ($("archSeaMetric")) {
    $("archSeaMetric").textContent = `${network.backbonePacketLossPercent || 0}% loss`;
  }
  if ($("archGroundMetric")) {
    $("archGroundMetric").textContent = starryAckLabel(starry.ackStatus);
  }
  if ($("archSpaceMetric")) {
    $("archSpaceMetric").textContent = starry.activeLayer === "SPACE" ? "uplink active" : "backup ready";
  }
  if ($("archSeaHealthBar")) {
    $("archSeaHealthBar").style.width = clampPercent(100 - Number(network.backbonePacketLossPercent || 0));
  }
  if ($("archGroundHealthBar")) {
    const value = starry.groundNetwork === "failed" ? 18 : starry.groundNetwork === "weak" ? 48 : 86;
    $("archGroundHealthBar").style.width = clampPercent(value);
  }
  if ($("archSpaceHealthBar")) {
    $("archSpaceHealthBar").style.width = clampPercent(starry.activeLayer === "SPACE" ? 92 : 68);
  }
  if ($("archPacketHint")) {
    $("archPacketHint").textContent = `${active.name} 的封包從手機端送往守望隊；目前 ${starry.selectedChannel}，丟包 ${starry.packetLoss}%，${starryAckLabel(starry.ackStatus)}，失敗時重送並切換 ${starry.fallbackChannel}。`;
  }
  const map = document.querySelector(".architecture-map");
  if (map) {
    map.classList.toggle("satellite-active", active.communication.primaryRoute === "SATELLITE" || active.communication.satelliteRecommended || starry.activeLayer === "SPACE");
    map.classList.toggle("ground-down", network.groundBackboneStatus === "down");
    map.classList.toggle("layer-ground-active", starry.activeLayer === "GROUND");
    map.classList.toggle("layer-sea-active", starry.activeLayer === "SEA");
    map.classList.toggle("layer-space-active", starry.activeLayer === "SPACE");
    map.classList.toggle("sos-active", starry.activeRoute === "sos_escalation");
    map.dataset.activeRoute = starry.activeRoute || "ground_primary";
  }
  document.querySelectorAll(".route-health-row").forEach((row) => row.classList.remove("active"));
  document.querySelector(`.${String(starry.activeLayer || "GROUND").toLowerCase()}-health`)?.classList.add("active");
}

function renderPhone(target, state, starry = starrySnapshot(state)) {
  const communication = target.communication;
  const route = starry.selectedChannel || routeName(communication.primaryRoute);
  const fallback = starry.fallbackChannel || routeName(communication.fallbackRoute);
  $("phoneRoute").textContent = `目前通訊：${route}${communication.fallbackRoute !== "NONE" ? ` / 備援 ${fallback}` : ""}`;
  $("phoneAckTop").textContent = `守望隊是否收到：${ackLabel(communication.ackStatus)}`;
  $("phoneSignal").textContent = `連線狀態：${signalLabel(target.signalQuality)}（${target.signalQuality}%）`;
  if ($("phoneNetworkMode")) {
    $("phoneNetworkMode").textContent = communication.lowDataMode ? "低資料量封包已啟用" : "一般低流量同步";
  }
  if ($("phoneBattery")) {
    $("phoneBattery").textContent = `電量：${target.battery}%`;
  }

  const alert = $("phoneAlert");
  alert.className = `phone-alert ${levelClass(target.risk.level)}`;
  if ($("phoneAlertTitle")) {
    $("phoneAlertTitle").textContent =
      starry.victimStatus === "sos"
        ? "SOS 已送出"
        : state.event.status === "災害模式啟動"
          ? "災害模式啟動"
          : "守望隊正在確認您的安全";
  }
  if (!target.latestReply) {
    $("phoneAlertCopy").textContent = "請點選下方最符合您目前狀態的按鈕。";
  } else if (target.risk.level === "RED" || target.risk.level === "ORANGE") {
    $("phoneAlertCopy").textContent = "請不要勉強移動。系統已優先傳送 GPS、求救狀態與生命狀態，並提高通訊通道優先級。";
  } else {
    $("phoneAlertCopy").textContent = "守望隊已收到，請留在安全位置，等待進一步確認。";
  }

  const selectedSymptoms = new Set(starry.selectedSymptoms || target.selectedSymptoms || []);
  document.querySelectorAll("[data-reply]").forEach((button) => {
    const code = button.dataset.reply;
    const active = code === "SAFE" ? selectedSymptoms.size === 0 && target.latestReply?.code === "SAFE" : selectedSymptoms.has(code);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if ($("phoneSymptomScore")) {
    const labels = [...selectedSymptoms].map((code) => store.symptomOptions?.[code]?.label || lowData.replyLabels[code] || code);
    $("phoneSymptomScore").textContent = labels.length
      ? `症狀分數 ${starry.symptomScore} / 風險 ${starryRiskLabel(starry.riskLevel)}：${labels.join("、")}`
      : `症狀分數 0 / 風險 ${starryRiskLabel(starry.riskLevel)}`;
  }

  $("phoneLocationStatus").textContent = locationStatusText(target.location);
  if ($("phoneGpsLat")) $("phoneGpsLat").textContent = coordinateText(target.location.lat);
  if ($("phoneGpsLng")) $("phoneGpsLng").textContent = coordinateText(target.location.lng);
  if ($("phoneGpsAccuracy")) $("phoneGpsAccuracy").textContent = accuracyText(target.location);
  $("phoneVitals").textContent = `HR ${target.medical.heartRate ?? "--"} / SpO2 ${target.medical.spo2 ?? "--"}`;
  $("discomfortToggle").checked = Boolean(target.medical.discomfort);
  $("immobileToggle").checked = Boolean(target.medical.cannotMove || target.latestReply?.code === "CANNOT_MOVE");
  $("phoneSendStatus").textContent = phoneSendStatus(target);
  $("phoneSeq").textContent = target.communication.packetSeq || "-";
  $("phoneBytes").textContent = target.communication.packetBytes ? `${target.communication.packetBytes} bytes` : "-";
  $("phoneRetry").textContent = String(target.communication.retryCount || 0);
}

function renderPacketFlow(state, active, starry = starrySnapshot(state)) {
  const latestPacket =
    state.packetLog.find((item) => item.targetId === active.id && item.packet) || state.packetLog.find((item) => item.packet);
  const communication = active.communication || {};
  const lastStatus = latestPacket?.status || communication.ackStatus || "pending";
  if ($("packetFlowStatus")) {
    const label = lastStatus === "received" ? "傳送成功" : lastStatus === "retrying" ? "重送中" : lastStatus === "failed" ? "切換通道" : "等待 ACK";
    $("packetFlowStatus").textContent = label;
  }
  if ($("packetSeqLive")) $("packetSeqLive").textContent = communication.packetSeq || latestPacket?.seq || "-";
  if ($("packetRetryLive")) {
    const retry = communication.retryCount || Math.max(0, Number(latestPacket?.attempt || 1) - 1);
    $("packetRetryLive").textContent = String(retry || starry.recoveryCounter || 0);
  }
  if ($("packetChannelLive")) $("packetChannelLive").textContent = starry.selectedChannel || routeName(communication.primaryRoute || latestPacket?.route);
  if ($("packetChecksumLive")) $("packetChecksumLive").textContent = packetChecksum(latestPacket);
  const animation = $("packetAnimation");
  if (animation) {
    animation.classList.remove("packet-success", "packet-retry", "packet-failed", "packet-satellite");
    animation.classList.add(
      lastStatus === "received" ? "packet-success" : lastStatus === "retrying" ? "packet-retry" : lastStatus === "failed" ? "packet-failed" : "packet-retry"
    );
    animation.classList.toggle("packet-satellite", communication.primaryRoute === "SATELLITE" || communication.satelliteRecommended || starry.activeLayer === "SPACE");
  }
}

function packetChecksum(packet) {
  if (!packet?.packet) return "----";
  try {
    const parsed = JSON.parse(packet.packet);
    return parsed.checksum || parsed.c || "----";
  } catch (error) {
    const match = String(packet.packet).match(/"checksum":\s*"([^"]+)"/) || String(packet.packet).match(/"c":\s*"([^"]+)"/);
    return match?.[1] || "----";
  }
}

function renderRuntime(state) {
  if (!$("runtimeLog")) return;
  const events = state.events.slice(0, 12);
  $("runtimeLog").innerHTML = events.length
    ? events
        .map(
          (event) => `
            <article class="event-item">
              <strong>[${timeText(event.timestamp)}] ${escapeHtml(event.title)}</strong>
              <span>${escapeHtml(event.detail)}</span>
              <small>${escapeHtml(event.kind || "event")}${event.seq ? ` / packetSeq #${event.seq}` : ""}</small>
            </article>
          `
        )
        .join("")
    : `<p class="empty">尚無 runtime 事件</p>`;
}

function phoneSendStatus(target) {
  if (!target.latestReply && target.communication.ackStatus === "received" && target.communication.packetBytes) return "守望隊已收到";
  if (!target.latestReply && target.communication.ackStatus === "retrying") return "正在以低資料模式重送";
  if (!target.latestReply) return "尚未送出";
  if (target.communication.ackStatus === "received") return "守望隊已收到";
  if (target.communication.ackStatus === "retrying") return "正在以低資料模式重送";
  if (target.communication.ackStatus === "failed") return "ACK 失敗，等待重送";
  return "封包已送出，等待 ACK";
}

function renderTargets(state, selected) {
  const sortedTargets = state.targets
    .slice()
    .sort((a, b) => riskRank(b.risk.level) - riskRank(a.risk.level) || b.risk.score - a.risk.score || a.name.localeCompare(b.name));
  const visibleTargets = sortedTargets.filter(targetMatchesFilter);
  $("targetCount").textContent = `${visibleTargets.length} / ${state.targets.length} 位`;
  if ($("targetFilters")) {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === activeFilter);
    });
  }
  $("targetList").innerHTML = visibleTargets
    .map((target) => {
      const active = target.id === selected.id ? "active" : "";
      const gps = gpsCardLabel(target.location);
      const needsContact = ["ORANGE", "RED"].includes(target.risk.level) || target.latestReply?.code === "NO_RESPONSE";
      const dispatch = target.risk.level === "RED" ? "優先派遣" : target.risk.level === "ORANGE" ? "主動確認" : "持續觀察";
      return `
        <button class="target-item ${active}" type="button" data-target-id="${escapeHtml(target.id)}">
          <span>
            <strong>${escapeHtml(target.name)}</strong>
            <small>${escapeHtml(target.id)} / ${roleLabel(target.role)}</small>
          </span>
          <span class="target-meta">
            <b class="${levelClass(target.risk.level)}">${target.risk.level} / ${target.risk.score}</b>
            <small>${escapeHtml(target.latestReply?.label || "尚未回覆")}</small>
            <small>${ackLabel(target.communication.ackStatus)} / ${gps} / ${timeText(target.lastUpdatedAt || target.communication.lastAckAt)}</small>
            <small>${routeName(target.communication.primaryRoute)} / 成功率 ${target.communication.packetSuccessRate || 0}%</small>
            <small>${needsContact ? "需要主動聯繫" : "持續觀察"} / ${dispatch} / ${actionText(target.risk.action)}</small>
          </span>
        </button>
      `;
    })
    .join("") || `<p class="empty">目前沒有符合篩選的使用者</p>`;
}

function targetMatchesFilter(target) {
  const code = target.latestReply?.code;
  if (activeFilter === "all") return true;
  if (["red", "orange", "yellow", "green"].includes(activeFilter)) {
    return String(target.risk.level || "").toLowerCase() === activeFilter;
  }
  if (activeFilter === "noResponse") return code === "NO_RESPONSE" || !target.latestReply;
  if (activeFilter === "medical") return Boolean(target.medical.injury || target.medical.breathingDifficulty || code === "NEED_MEDICAL" || code === "INJURED");
  if (activeFilter === "gpsStatic") return Number(target.location.staticMinutes || 0) >= 10;
  return true;
}

function roleLabel(role) {
  const map = { elder: "高齡", patient: "照護", general: "一般" };
  return map[role] || role;
}

function renderDetail(state, target) {
  const symptoms = target.selectedSymptoms || [];
  const symptomText = symptoms.length
    ? symptoms.map((code) => store.symptomOptions?.[code]?.label || lowData.replyLabels[code] || code).join("、")
    : "未選擇";
  const symptomScore = state.starryState?.targetId === target.id ? state.starryState.symptomScore : target.risk.items.find((item) => item.label === "受困者按鍵區")?.score || 0;
  $("selectedRisk").textContent = `${target.risk.level} / ${target.risk.score}`;
  $("selectedRisk").className = levelClass(target.risk.level);
  $("targetDetail").innerHTML = `
    ${detailRow("基本資料", `${target.name} / ${target.id} / ${target.age} 歲 / ${roleLabel(target.role)}`)}
    ${detailRow("最新回覆", target.latestReply ? `${target.latestReply.label}（${timeText(target.latestReply.timestamp)}）` : "尚未回覆")}
    ${detailRow("受困者按鍵區", `${symptomText}｜症狀分數 ${symptomScore}`)}
    ${detailRow("GPS 狀態", target.location.confirmed ? `${accuracyText(target.location)} / lat ${coordinateText(target.location.lat)}, lng ${coordinateText(target.location.lng)} / 靜止 ${target.location.staticMinutes || 0} 分` : `GPS unknown / ${locationStatusText(target.location)}`)}
    ${detailRow("醫療/生命狀態", `HR ${target.medical.heartRate ?? "-"}｜SpO2 ${target.medical.spo2 ?? "-"}｜受傷 ${yesNo(target.medical.injury)}｜呼吸困難 ${yesNo(target.medical.breathingDifficulty)}｜被困 ${yesNo(target.medical.trapped || target.medical.cannotMove)}`)}
    ${detailRow("通訊狀態", `${routeName(target.communication.primaryRoute)} → ${routeName(target.communication.fallbackRoute)}｜signal ${target.signalQuality}%｜battery ${target.battery}%｜低資料 ${yesNo(target.communication.lowDataMode)}`)}
    ${detailRow("封包與 ACK", `seq ${target.communication.packetSeq || "-"}｜${target.communication.packetBytes || 0} bytes｜ACK ${ackLabel(target.communication.ackStatus)}｜retry ${target.communication.retryCount || 0}`)}
    ${detailRow("封包品質", `成功率 ${target.communication.packetSuccessRate || 0}%｜平均延遲 ${target.communication.averageLatencyMs || 0}ms｜丟包率 ${target.communication.packetLossRate || 0}%`)}
    ${detailRow("最後同步", target.communication.lastAckAt ? timeText(target.communication.lastAckAt) : target.lastUpdatedAt ? timeText(target.lastUpdatedAt) : "-")}
    ${detailRow("建議處置", `${actionText(target.risk.action)}｜主動聯繫 ${yesNo(["ORANGE", "RED"].includes(target.risk.level))}｜優先派遣 ${yesNo(target.risk.level === "RED")}｜${target.latestReply?.code === "CANNOT_TALK" ? "只能使用按鍵流程確認" : "可使用一般確認流程"}`)}
  `;

  const packet = state.packetLog.find((item) => item.targetId === target.id && item.packet && Number(item.bytes || 0) > 0);
  $("packetSize").textContent = packet ? `${packet.bytes} bytes` : "0 bytes";
  $("packetPreview").textContent = packet ? formatPacket(packet) : target.id === "U-DEMO" ? "尚未收到 U-DEMO 封包" : "此目標尚無封包內容";

  const events = state.events.slice(0, 12);
  $("eventCount").textContent = `${events.length} 筆`;
  $("eventLog").innerHTML = events.length
    ? events
        .map(
          (event) => `
            <article class="event-item">
              <strong>${escapeHtml(event.title)}</strong>
              <span>${escapeHtml(event.detail)}</span>
              <small>${timeText(event.timestamp)}${event.seq ? ` / seq ${event.seq}` : ""}</small>
            </article>
          `
        )
        .join("")
    : `<p class="empty">尚無事件紀錄</p>`;
}

function detailRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function yesNo(value) {
  return value ? "是" : "否";
}

function formatPacket(packet) {
  if (!packet.packet) return "-";
  try {
    return JSON.stringify(JSON.parse(packet.packet), null, 2);
  } catch (error) {
    return packet.packet;
  }
}

function renderRisk(target) {
  $("riskSummary").textContent = `${target.risk.score} / ${target.risk.level}`;
  $("riskScore").textContent = target.risk.score;
  $("riskLevel").textContent = target.risk.level;
  $("riskLevel").className = levelClass(target.risk.level);
  $("riskAction").textContent = actionText(target.risk.action);

  $("riskReasons").innerHTML = target.risk.reason.length
    ? target.risk.reason.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")
    : `<span>目前沒有加分風險因素</span>`;

  $("riskMatrix").innerHTML = target.risk.items
    .map(
      (item) => `
        <div class="risk-row ${item.score > 0 ? "adds-risk" : ""}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${item.score > 0 ? "+" : ""}${item.score}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </div>
      `
    )
    .join("");
}

function renderCommunication(target) {
  if (!$("commBest")) return;
  const communication = target.communication || {};
  $("commBest").textContent = routeName(communication.primaryRoute);
  $("commFallback").textContent = routeName(communication.fallbackRoute);
  $("commSuccess").textContent = `${communication.packetSuccessRate || 0}%`;
  $("commLatency").textContent = msText(communication.averageLatencyMs);
  $("commLoss").textContent = `${communication.packetLossRate || 0}%`;
  $("commLowData").textContent = communication.lowDataMode ? "是" : "否";
  $("commSatellite").textContent = communication.satelliteRecommended ? "建議保留 / 必要時啟用" : "暫不啟用";

  $("commScoreRows").innerHTML = (communication.channelScores || [])
    .map(
      (channel) => `
        <tr>
          <td>${escapeHtml(channel.name)}</td>
          <td>${channel.score}</td>
          <td>${channel.packetSuccessRate}%</td>
          <td>${channel.latencyScore}</td>
          <td>${channel.signalStrength}</td>
          <td>${channel.gpsAvailability}</td>
          <td>${channel.channelCost}</td>
          <td>${channel.batteryImpact}</td>
        </tr>
      `
    )
    .join("");
}

function renderMatrixOverview(target) {
  if (!$("selectedMatrixTarget")) return;
  $("selectedMatrixTarget").textContent = `${target.name} / ${target.risk.level} ${target.risk.score}`;
}

function requestCurrentLocation() {
  const refreshButton = $("refreshLocation");
  const status = $("phoneLocationStatus");
  if (refreshButton) refreshButton.disabled = true;
  if (status) status.textContent = "取得定位中";

  const finish = () => {
    if (refreshButton) refreshButton.disabled = false;
  };

  if (!navigator.geolocation) {
    store.actions.setLocation("unknown", { source: "UNAVAILABLE", updateReply: false });
    finish();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      store.actions.setLocation("confirmed", {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        source: "GPS",
      });
      finish();
    },
    (error) => {
      const permissionDenied = error.code === 1 || error.code === error.PERMISSION_DENIED;
      store.actions.setLocation("unknown", {
        source: permissionDenied ? "GPS_DENIED" : "UNAVAILABLE",
        updateReply: false,
      });
      finish();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
  );
}

function bindEvents() {
  document.querySelectorAll("[data-nav-page]").forEach((button) => {
    button.addEventListener("click", () => setActivePage(button.dataset.navPage));
  });

  document.querySelectorAll("[data-page-target]").forEach((button) => {
    button.addEventListener("click", () => setActivePage(button.dataset.pageTarget));
  });

  $("prevPage")?.addEventListener("click", () => gotoRelativePage(-1));
  $("nextPage")?.addEventListener("click", () => gotoRelativePage(1));
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const tagName = event.target?.tagName;
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
    if (event.key === "ArrowRight") gotoRelativePage(1);
    if (event.key === "ArrowLeft") gotoRelativePage(-1);
  });

  document.querySelectorAll("[data-reply]").forEach((button) => {
    button.addEventListener("click", () => store.actions.sendReply(button.dataset.reply));
  });

  $("targetList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-target-id]");
    if (button) store.actions.selectTarget(button.dataset.targetId);
  });
  $("targetFilters")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    const state = store.getState();
    const selected = store.getSelectedTarget(state);
    const visible = state.targets
      .slice()
      .sort((a, b) => riskRank(b.risk.level) - riskRank(a.risk.level) || b.risk.score - a.risk.score || a.name.localeCompare(b.name))
      .filter(targetMatchesFilter);
    if (visible.length && !visible.some((target) => target.id === selected.id)) {
      store.actions.selectTarget(visible[0].id);
    } else {
      render();
    }
  });

  $("refreshLocation").addEventListener("click", requestCurrentLocation);
  $("dropLocation").addEventListener("click", () => {
    store.actions.setLocation("unknown", { source: "UNAVAILABLE", updateReply: true });
  });

  $("discomfortToggle").addEventListener("change", (event) => {
    store.actions.updateMedicalFlag("discomfort", event.target.checked);
  });
  $("immobileToggle").addEventListener("change", (event) => {
    store.actions.updateMedicalFlag("cannotMove", event.target.checked);
  });
  $("weakSignalToggle").addEventListener("change", (event) => {
    store.actions.setWeakSignal(event.target.checked);
  });

  $("startDemo").addEventListener("click", startDisasterDemo);
  $("startDemoTop").addEventListener("click", () => {
    setActivePage("demo");
    startDisasterDemo();
  });
  $("pauseDemo")?.addEventListener("click", pauseDisasterDemo);
  $("simulatePacketLoss")?.addEventListener("click", () => store.actions.simulatePacketLoss());
  $("simulateGroundDown")?.addEventListener("click", () => store.actions.simulateGroundNetworkDown());
  $("enableSatelliteFallback")?.addEventListener("click", () => store.actions.enableSatelliteFallback());
  $("enableAlarm")?.addEventListener("click", enableAlarmSound);
  $("enablePhoneAlarm")?.addEventListener("click", enableAlarmSound);
  $("resetDemo").addEventListener("click", () => {
    clearScriptTimers();
    clearSimulationTimer();
    store.actions.resetDemo();
  });
  $("copyMobileLink").addEventListener("click", copyMobileLink);
}

function clearScriptTimers() {
  scriptTimers.forEach((timer) => clearTimeout(timer));
  scriptTimers = [];
}

function clearSimulationTimer() {
  if (simulationTimer) {
    clearTimeout(simulationTimer);
    simulationTimer = null;
  }
}

function updateAlarmStatus(text) {
  const status = $("alertSoundStatus");
  if (status) status.textContent = text;
  if ($("phoneAlarmStatus")) $("phoneAlarmStatus").textContent = text;
}

async function enableAlarmSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      updateAlarmStatus("此瀏覽器不支援 Web Audio，保留視覺警示。");
      return false;
    }
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === "suspended") await audioContext.resume();
    alarmEnabled = true;
    updateAlarmStatus("警報音已啟用");
    playAlarm("ready");
    return true;
  } catch (error) {
    updateAlarmStatus("瀏覽器限制自動播放，請再次點擊啟用警報音。");
    return false;
  }
}

function playAlarm(kind = "alert") {
  if (!alarmEnabled || !audioContext) {
    updateAlarmStatus("請點擊啟用警報音；視覺警示已啟動。");
    return;
  }
  const now = audioContext.currentTime;
  const frequencies = kind === "ready" ? [660] : [880, 660, 880];
  frequencies.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.16);
    gain.gain.setValueAtTime(0.0001, now + index * 0.16);
    gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.16 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.13);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + index * 0.16);
    oscillator.stop(now + index * 0.16 + 0.14);
  });
}

function startDisasterDemo() {
  clearScriptTimers();
  clearSimulationTimer();
  enableAlarmSound().then((enabled) => {
    if (enabled) playAlarm("alert");
  });
  store.actions.startScript();
  store.actions.sendSafetyCheckins();
  startPacketLoop();
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(10, "10-30 秒：系統向 5 位目標發送低資料安全確認，後台顯示 seq、ACK 與建議路徑。");
  }, 10000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(30, "30-60 秒：4 位目標自動進入差異狀態，U-DEMO 保留給手機實機操作。");
    store.actions.applyScriptReplies();
  }, 30000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(60, "60-120 秒：操作 U-DEMO，後台立即更新風險矩陣、通訊矩陣、ACK 與 retry。");
  }, 60000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(120, "120-180 秒：守望隊依 Green / Yellow / Orange / Red 產生調度與通訊升級建議。");
    store.actions.finalizeDispatch();
  }, 120000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(180, "展示完成：低資料封包、ACK、retry、海地星空路徑切換與風險排序已完成。");
    clearSimulationTimer();
  }, 180000));
}

function pauseDisasterDemo() {
  clearScriptTimers();
  clearSimulationTimer();
  store.actions.pauseScript();
}

function startPacketLoop() {
  clearSimulationTimer();
  const tick = () => {
    const state = store.getState();
    if (!state.event.script.running) {
      clearSimulationTimer();
      return;
    }
    store.actions.simulatePacketEvent();
    simulationTimer = setTimeout(tick, 1500 + Math.round(Math.random() * 1500));
  };
  simulationTimer = setTimeout(tick, 1600);
}

async function copyMobileLink() {
  let url = `${location.origin}${location.pathname}?view=mobile&recipient=U-DEMO`;
  try {
    const response = await fetch("/api/demo-link?recipient=U-DEMO", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (payload.mobileUrl) url = payload.mobileUrl;
    }
  } catch (error) {
    // Static file previews fall back to the current origin.
  }
  try {
    await navigator.clipboard.writeText(url);
    $("syncStatus").textContent = `手機連結已複製：${url}`;
  } catch (error) {
    $("syncStatus").textContent = `手機連結：${url}`;
  }
}

store.subscribe((_state, meta) => {
  window.__lastTransport = meta.transport || window.__lastTransport || {};
  render();
});

bindEvents();
store.startSync();
render();
setInterval(() => {
  const state = store.getState();
  const hasInFlightPacket = state.targets.some(
    (target) => target.latestReply && ["pending", "retrying"].includes(target.communication.ackStatus)
  );
  if (state.event.script.running || hasInFlightPacket) {
    store.actions.refreshRiskTick();
  } else {
    render();
  }
}, 1000);
