const $ = (id) => document.getElementById(id);
const store = window.XY_DEMO_STORE;
const lowData = window.XY_LOW_DATA;
const syncService = window.XY_SYNC_SERVICE;
const networkSimulation = window.XY_NETWORK_SIMULATION;
const query = new URLSearchParams(window.location.search);
const isMobileView = query.get("view") === "mobile";
let scriptTimers = [];
let simulationTimer = null;
let activePage = isMobileView ? "demo" : "intro";
let activeFilter = "all";
let audioContext = null;
let alarmEnabled = false;
const persistedAppPacketKeys = new Set();
const pages = ["intro", "architecture", "demo", "matrix", "runtime"];
const deploymentHealth = {
  frontendLoaded: { status: "ok", detail: "DOM + app.js loaded" },
  apiHealth: { status: "checking", detail: "not checked" },
  apiState: { status: "checking", detail: "not checked" },
  apiAction: { status: "checking", detail: "not checked" },
  lastCheckedAt: null,
};

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

function starryLayerLabel(layer) {
  const map = { GROUND: "Ground", SEA: "Sea", SPACE: "Space" };
  return map[layer] || "Ground";
}

function gpsStatusLabel(status) {
  const map = { locked: "GPS confirmed", drifting: "GPS drifting", last_known: "位置待確認", denied: "GPS_DENIED", unavailable: "GPS_UNAVAILABLE", manual: "manual location" };
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

function riskDisplayText(risk = {}) {
  const display = Number(risk.displayRiskScore ?? risk.score ?? 0);
  const raw = Number(risk.rawRiskScore ?? display);
  return raw > display ? `${display} (raw ${raw})` : String(display);
}

function signedScoreText(value) {
  const score = Number(value || 0);
  return `${score > 0 ? "+" : ""}${score}`;
}

function accuracyText(location = {}) {
  if (String(location.source || "").startsWith("MANUAL_")) return "manual";
  if (location.source === "GPS_DENIED") return "denied";
  if (location.source === "GPS_UNAVAILABLE" || location.source === "UNAVAILABLE") return "unavailable";
  return location.confirmed ? location.accuracy || "unknown" : "unknown";
}

function locationStatusText(location = {}) {
  if (location.confirmed) return "GPS confirmed";
  if (location.source === "GPS_DENIED") return "GPS_DENIED / 位置待確認";
  if (location.source === "GPS_UNAVAILABLE" || location.source === "UNAVAILABLE") return "GPS_UNAVAILABLE / fallback 待確認";
  if (String(location.source || "").startsWith("MANUAL_")) return `${location.manualLabel || "手動回報位置"} / 需人工確認`;
  if (location.source === "SAME_LAN_SIMULATED" || location.demoEstimate) return "非真實 GPS，僅 Demo 推估";
  return "位置待確認";
}

function gpsCardLabel(location = {}) {
  if (location.confirmed) return "GPS confirmed";
  if (location.source === "GPS_DENIED") return "GPS_DENIED";
  if (location.source === "GPS_UNAVAILABLE" || location.source === "UNAVAILABLE") return "GPS_UNAVAILABLE";
  if (String(location.source || "").startsWith("MANUAL_")) return "manual";
  if (location.source === "SAME_LAN_SIMULATED" || location.demoEstimate) return "Demo 推估";
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
  renderHomeArchitecture(starry);
  renderPhone(active, state, starry);
  renderTargets(state, selected);
  renderDetail(state, selected);
  renderWorkflow(state, selected);
  renderRisk(selected);
  renderCommunication(active);
  renderMatrixOverview(selected);
  renderPacketFlow(state, active, starry);
  renderRuntime(state);
  renderDeploymentStatus(state);
  persistReportsFromPacketLog(state);
  renderResilienceSync();
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function statusText(check = {}) {
  if (check.status === "ok") return `OK${check.detail ? ` / ${check.detail}` : ""}`;
  if (check.status === "fail") return `FAIL${check.detail ? ` / ${check.detail}` : ""}`;
  if (check.status === "warn") return `WARN${check.detail ? ` / ${check.detail}` : ""}`;
  return `checking${check.detail && check.detail !== "not checked" ? ` / ${check.detail}` : ""}`;
}

function setStatusClass(id, status) {
  const element = $(id);
  if (!element) return;
  element.classList.remove("status-ok", "status-fail", "status-warn", "status-checking");
  element.classList.add(`status-${status || "checking"}`);
}

function isVercelHost() {
  return /\.vercel\.app$/i.test(location.hostname || "");
}

function renderDeploymentStatus() {
  const transport = window.__lastTransport || {};
  const checks = [deploymentHealth.apiHealth, deploymentHealth.apiState, deploymentHealth.apiAction];
  const apiUsable = checks.every((check) => check.status === "ok" || check.status === "warn");
  const syncMode = location.protocol === "file:"
    ? "localStorage only"
    : isVercelHost()
      ? (transport.serverAvailable ? "polling + action ACK / volatile serverless" : "localStorage only")
    : transport.serverAvailable
      ? (transport.liveMode === "sse" ? "SSE" : transport.liveMode === "action" ? "polling + action ack" : "polling")
      : "localStorage only";
  setText("deployFrontend", statusText(deploymentHealth.frontendLoaded));
  setText("deployApiHealth", statusText(deploymentHealth.apiHealth));
  setText("deployApiState", statusText(deploymentHealth.apiState));
  setText("deployApiAction", statusText(deploymentHealth.apiAction));
  setText("deploySyncMode", syncMode);
  setText("deployServerAvailable", String(Boolean(transport.serverAvailable)));
  setText("deployConnectedClients", String(transport.connectedClients || 0));
  setText("deployLastError", transport.lastError || deploymentHealth.apiAction.detail || "-");
  setStatusClass("deployFrontend", deploymentHealth.frontendLoaded.status);
  setStatusClass("deployApiHealth", deploymentHealth.apiHealth.status);
  setStatusClass("deployApiState", deploymentHealth.apiState.status);
  setStatusClass("deployApiAction", deploymentHealth.apiAction.status);
  setStatusClass("deployServerAvailable", transport.serverAvailable ? "ok" : apiUsable ? "warn" : "fail");
  const notice = $("deployModeNotice");
  if (!notice) return;
  if (!apiUsable) {
    notice.textContent = "目前為 Vercel static preview，本機按鈕仍可互動，但手機與電腦跨裝置同步請使用 python3 demo/api_server.py。";
    notice.className = "deployment-notice warn";
  } else if (isVercelHost()) {
    notice.textContent = "Vercel serverless preview：API 可用於畫面與 action 格式驗證；沒有外部資料庫時 state 屬 volatile，跨裝置同步不保證。完整手機/電腦同步請使用 python3 demo/api_server.py。";
    notice.className = "deployment-notice warn";
  } else {
    notice.textContent = "Python dynamic mode：本機 API、packet log、ACK、retry 與跨裝置狀態同步可用。";
    notice.className = "deployment-notice ok";
  }
}

function syncStatusLabel(status) {
  const map = {
    pending: "本地暫存",
    syncing: "同步中",
    synced: "已同步",
    failed: "同步失敗",
  };
  return map[status] || status || "-";
}

function reportRiskLabel(report = {}) {
  const map = { low: "低風險", medium: "中風險", high: "高風險", critical: "極高風險" };
  return `${report.riskScore ?? 0} ${map[report.riskLevel] || report.riskLevel || ""}`.trim();
}

function reportGpsText(report = {}) {
  if (report.latitude === null || report.latitude === undefined || report.longitude === null || report.longitude === undefined) {
    return report.locationSource === "GPS_DENIED" ? "定位未取得 / GPS_DENIED" : "定位未取得";
  }
  return `${coordinateText(report.latitude)}, ${coordinateText(report.longitude)} / ${report.locationAccuracy || "unknown"}`;
}

function simulationLinkLabel(link) {
  return networkSimulation?.linkLabel?.(link) || link || "-";
}

function groundNetworkSimulationLabel(network = {}) {
  if (network.groundNetwork === "down") return "中斷";
  if (network.groundNetwork === "unstable") return "不穩";
  return "正常";
}

function syncFlowClass(snapshot = {}) {
  if (snapshot.network?.mode === "fallback") return "fallback";
  if (snapshot.summary?.syncing > 0) return "syncing";
  if (snapshot.summary?.pending > 0 || snapshot.network?.mode === "offline") return "pending";
  if (snapshot.summary?.synced > 0) return "synced";
  return "idle";
}

function syncFlowCaption(snapshot = {}) {
  const pending = snapshot.summary?.pending || 0;
  const syncing = snapshot.summary?.syncing || 0;
  if (snapshot.network?.mode === "offline") return `完全離線：資料已先寫入本地資料庫，${pending} 筆保留在同步佇列。`;
  if (snapshot.network?.mode === "fallback") return `地面網路失效：資料保留本地，通訊鏈路標示為 ${simulationLinkLabel(snapshot.network.currentLink)} / Simulation。`;
  if (syncing > 0) return `正在補傳 ${syncing} 筆資料；完成後會寫入 syncedAt 並移出本地佇列。`;
  if (pending > 0) return `${pending} 筆資料等待補傳；恢復地面網路後會自動掃描佇列。`;
  return "正常網路下，資料先寫入本地，再完成同步確認。";
}

function renderResilienceSync() {
  const panel = $("resilienceSyncPanel");
  if (!panel) return;
  if (!syncService) {
    setText("syncNotice", "同步服務尚未載入。");
    return;
  }
  const snapshot = syncService.getSnapshot();
  const summary = snapshot.summary || {};
  const network = snapshot.network || {};
  const reports = snapshot.reports || [];
  const queueCount = (summary.pending || 0) + (summary.syncing || 0) + (summary.failed || 0);
  setText("syncPendingCount", String(summary.pending || 0));
  setText("syncSyncingCount", String(summary.syncing || 0));
  setText("syncSyncedCount", String(summary.synced || 0));
  setText("syncFailedCount", String(summary.failed || 0));
  setText("syncLastSyncedAt", summary.lastSyncedAt ? timeText(summary.lastSyncedAt) : "-");
  setText("syncGroundNetwork", groundNetworkSimulationLabel(network));
  setText("syncCurrentLink", `${simulationLinkLabel(network.currentLink)} / Simulation`);
  setText("syncLocalQueue", `${queueCount} 筆`);
  setText("syncCloudStatus", network.canRemoteSync ? network.cloudStatus || "可同步" : "等待恢復");
  setText("syncIntegrity", summary.failed ? "需重試" : "正常");
  setText("syncEventCount", `${reports.length} 筆`);
  setText("syncFlowCaption", syncFlowCaption(snapshot));

  const notice = $("syncNotice");
  if (notice) {
    notice.textContent = snapshot.notice?.message || "韌性資料同步待命";
    notice.className = `sync-notice ${snapshot.notice?.tone || ""}`.trim();
  }

  const flow = $("syncFlow");
  if (flow) flow.className = `sync-flow ${syncFlowClass(snapshot)}`;

  const rows = $("syncEventRows");
  if (!rows) return;
  rows.innerHTML = reports.length
    ? reports
        .slice(0, 10)
        .map(
          (report) => `
            <tr>
              <td>${timeText(report.createdAt)}</td>
              <td>${escapeHtml(report.userId || report.deviceId || "-")}</td>
              <td>${escapeHtml(report.name || "狀態回報")}</td>
              <td>${escapeHtml(reportRiskLabel(report))}</td>
              <td>${escapeHtml(reportGpsText(report))}</td>
              <td>${escapeHtml(simulationLinkLabel(report.selectedLink))}</td>
              <td>${Number(report.packetSizeBytes || report.compressedSizeBytes || 0)} B<br><small>${escapeHtml(report.packetMetricLabel || "Demo 封包序列化估算")} / ${report.reductionRate || 0}%</small></td>
              <td><span class="sync-badge ${escapeHtml(report.syncStatus || "pending")}">${escapeHtml(syncStatusLabel(report.syncStatus))}</span></td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="8">尚無資料，請送出測試回報或匯入預設 Demo 紀錄。</td></tr>`;
}

function packetReplyCode(packet = {}) {
  if (packet.replyCode) return packet.replyCode;
  const statusMap = {
    OK: "SAFE",
    CLEAR: "STATUS_CLEAR",
    NEED_HELP: "NEED_HELP",
    INJURED: "INJURED",
    TRAPPED: "TRAPPED",
    SICK: "NEED_MEDICAL",
    STOP: "TRAPPED",
    "LOC?": "LOCATION_UNKNOWN",
    LOCATION_UPDATE: "LOCATION_UPDATE",
    NORES: "NO_RESPONSE",
  };
  try {
    const parsed = typeof packet.packet === "string" ? JSON.parse(packet.packet) : packet.packet;
    return statusMap[parsed?.statusCode] || statusMap[parsed?.s] || parsed?.statusCode || parsed?.s || null;
  } catch (error) {
    return packet.decodeResult?.answerCode || null;
  }
}

function packetSeq(packet = {}) {
  return Number(packet.seq || packet.packetSeq || packet.decodeResult?.seq || packet.decodeResult?.packetSeq || 0);
}

function persistReportsFromPacketLog(state) {
  if (!syncService?.recordStatusReport || !Array.isArray(state?.packetLog)) return;
  state.packetLog
    .map((packet) => ({ packet, seq: packetSeq(packet), replyCode: packetReplyCode(packet) }))
    .filter(({ packet, seq, replyCode }) => packet?.targetId && seq && replyCode && Number(packet.bytes || 0) > 0)
    .slice(0, 8)
    .forEach(({ packet, seq, replyCode }) => {
      const target = state.targets.find((item) => item.id === packet.targetId);
      if (!target) return;
      const source = String(replyCode).startsWith("LOCATION") ? "location-update" : "mobile-reply";
      const key = `${packet.targetId}:${seq}:${source}:${replyCode}`;
      if (persistedAppPacketKeys.has(key)) return;
      persistedAppPacketKeys.add(key);
      Promise.resolve(
        syncService.recordStatusReport({
          state,
          target,
          replyCode,
          packetEntry: {
            ...packet,
            seq,
            replyCode,
            replyLabel: lowData.replyLabels[replyCode] || replyCode,
          },
          source,
          seq,
        })
      ).catch((error) => syncService.setNotice?.(`資料持久化失敗：${error.message}`, "warn"));
    });
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes("application/json")) throw new Error(`non-json response: ${contentType || "unknown"}`);
  return response.json();
}

async function runDeploymentHealthCheck() {
  deploymentHealth.apiHealth = { status: "checking", detail: "checking" };
  deploymentHealth.apiState = { status: "checking", detail: "checking" };
  deploymentHealth.apiAction = { status: "checking", detail: "checking" };
  renderDeploymentStatus();

  try {
    const health = await readJsonResponse(await fetch("/api/health", { cache: "no-store" }));
    const detail = health.crossDeviceSync === "not-guaranteed" ? `${health.mode} / volatile` : health.mode || health.status || "ok";
    deploymentHealth.apiHealth = { status: "ok", detail };
  } catch (error) {
    deploymentHealth.apiHealth = { status: "fail", detail: error.message };
  }

  let statePayload = null;
  try {
    statePayload = await readJsonResponse(await fetch("/api/state", { cache: "no-store" }));
    const stateReady = statePayload.state?.app === "xingye-sea-ground-space-demo";
    deploymentHealth.apiState = { status: stateReady ? "ok" : "warn", detail: stateReady ? `revision ${statePayload.state.revision || statePayload.version || 0}` : "state not initialized" };
  } catch (error) {
    deploymentHealth.apiState = { status: "fail", detail: error.message };
  }

  try {
    const current = store.getState();
    const target = store.getActiveTarget(current);
    const seq = Number(target.communication?.packetSeq || 0);
    const clientKey = localStorage.getItem("starrylink-deployment-client") || `deploy-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    localStorage.setItem("starrylink-deployment-client", clientKey);
    const actionPayload = {
      clientId: clientKey,
      targetId: target.id,
      actionType: "healthcheck",
      seq,
      idempotencyKey: `${clientKey}:${target.id}:healthcheck:${Math.floor(Date.now() / 30000)}`,
      baseRevision: Number(current.revision || 0),
      clientTimestamp: new Date().toISOString(),
      payload: {
        targetId: target.id,
        actionType: "healthcheck",
        seq,
        state: current,
      },
    };
    const action = await readJsonResponse(
      await fetch("/api/actions/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actionPayload),
      })
    );
    const ack = action.serverAck || {};
    deploymentHealth.apiAction = {
      status: ack.ok ? "ok" : "warn",
      detail: `${ack.message || "ack"} / packetSeq ${ack.packetSeq ?? seq}`,
    };
  } catch (error) {
    deploymentHealth.apiAction = { status: "fail", detail: error.message };
  }
  deploymentHealth.lastCheckedAt = new Date().toISOString();
  renderDeploymentStatus(statePayload?.state || store.getState());
}

function renderToolbar(state, active) {
  $("demoTitle").textContent = state.event.title;
  const transport = window.__lastTransport || {};
  const liveMode = String(transport.liveMode || "").toUpperCase();
  const sync = transport.serverAvailable
    ? isVercelHost()
      ? `Vercel serverless preview ${liveMode ? `(${liveMode})` : ""} / volatile state；完整跨裝置同步請用 python3 demo/api_server.py`
      : `Server sync ${liveMode ? `(${liveMode})` : ""} / clients ${transport.connectedClients || 0}`
    : location.protocol === "file:"
      ? "file:// 僅可預覽；跨裝置同步請用 python3 demo/api_server.py"
      : isMobileView
        ? "尚未同步；等待本機 server"
        : "Local single source of truth";
  $("syncStatus").textContent = sync;
  if ($("desktopSyncTelemetry")) {
    $("desktopSyncTelemetry").textContent = `手機端最後回報時間 ${timeText(active.lastUpdatedAt || active.communication.lastAckAt)} / ACK 狀態 ${ackLabel(active.communication.ackStatus)} / 封包序號 ${active.communication.packetSeq || "-"}`;
  }
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
  if ($("archSeaStatus")) {
    $("archSeaStatus").textContent = starry.groundNetwork === "normal" ? "正常監測" : "異常 / 延遲升高";
  }
  if ($("archGroundStatus")) {
    const groundStatus = {
      failed: "失效 / 切換地面備援",
      weak: "壅塞 / 丟包率上升",
      normal: "可用",
    };
    $("archGroundStatus").textContent = groundStatus[starry.groundNetwork] || groundStatus.normal;
  }
  if ($("archSatelliteStatus")) {
    $("archSatelliteStatus").textContent =
      starry.activeLayer === "SPACE" || starry.activeRoute === "satellite_backup" || starry.activeRoute === "sos_escalation"
        ? "高風險備援啟用"
        : "待命";
  }
  if ($("archStrategy")) {
    $("archStrategy").textContent = starry.lowDataMode ? "啟用低資料量封包" : "一般低流量同步";
  }
  if ($("archLastReport")) $("archLastReport").textContent = timeText(active.lastUpdatedAt || active.communication.lastAckAt);
  if ($("archAckLive")) $("archAckLive").textContent = ackLabel(active.communication.ackStatus);
  if ($("archSeqLive")) $("archSeqLive").textContent = active.communication.packetSeq || "-";
  if ($("archGpsLive")) $("archGpsLive").textContent = gpsStatusLabel(starry.gpsStatus);
  if ($("archRiskLive")) $("archRiskLive").textContent = `${starryRiskLabel(starry.riskLevel)} / ${starry.displayRiskScore ?? starry.riskScore ?? 0}`;
  if ($("archRawRiskLive")) $("archRawRiskLive").textContent = String(starry.rawRiskScore ?? active.risk?.rawRiskScore ?? active.risk?.score ?? 0);
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
    $("archSeaMetric").textContent = `${starry.packetLoss || 0}% loss`;
  }
  if ($("archGroundMetric")) {
    $("archGroundMetric").textContent = starryAckLabel(starry.ackStatus);
  }
  if ($("archSpaceMetric")) {
    $("archSpaceMetric").textContent =
      starry.activeRoute === "sos_escalation" ? "sos uplink" : starry.activeLayer === "SPACE" ? "uplink active" : "backup ready";
  }
  if ($("archSeaHealthBar")) {
    $("archSeaHealthBar").style.width = clampPercent(100 - Number(starry.packetLoss || 0));
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
    map.classList.toggle("satellite-active", starry.activeLayer === "SPACE");
    map.classList.toggle("ground-down", starry.groundNetwork === "failed");
    map.classList.toggle("layer-ground-active", starry.activeLayer === "GROUND");
    map.classList.toggle("layer-sea-active", starry.activeLayer === "SEA");
    map.classList.toggle("layer-space-active", starry.activeLayer === "SPACE");
    map.classList.toggle("sos-active", starry.activeRoute === "sos_escalation");
    map.dataset.activeRoute = starry.activeRoute || "ground_primary";
  }
  syncArchitectureNodes(starry);
  document.querySelectorAll(".route-health-row").forEach((row) => row.classList.remove("active"));
  document.querySelector(`.${String(starry.activeLayer || "GROUND").toLowerCase()}-health`)?.classList.add("active");
}

function renderHomeArchitecture(starry = {}) {
  const statuses = starry.moduleStatuses || {};
  setText("missionGroundStatus", statuses.ground || "可用／主要路徑");
  setText("missionAirStatus", statuses.air || "待命中");
  setText("missionSeaStatus", statuses.sea || "監測中");
  setText("missionSpaceStatus", statuses.space || "備援待命");

  const selectedRoute = starry.selectedRoute || "ground";
  document.querySelectorAll("[data-home-module]").forEach((card) => {
    const module = card.dataset.homeModule;
    const active =
      module === selectedRoute ||
      (module === "space" && selectedRoute === "satellite") ||
      (module === "sea" && starry.seaBackboneHealthy === false);
    card.classList.toggle("active", Boolean(active));
  });
  document.querySelectorAll("[data-home-route]").forEach((chip) => {
    const route = chip.dataset.homeRoute;
    chip.classList.toggle("active", route === selectedRoute);
  });
  const routeSelector = $("introRouteSelector");
  if (routeSelector) routeSelector.dataset.selectedRoute = selectedRoute;
}

function syncArchitectureNodes(starry = {}) {
  const selectedChannel = String(starry.selectedChannel || "");
  const fallbackChannel = String(starry.fallbackChannel || "");
  document.querySelectorAll("[data-arch-route], [data-arch-channel]").forEach((node) => {
    const routes = String(node.dataset.archRoute || "").split(/\s+/).filter(Boolean);
    const channel = String(node.dataset.archChannel || "");
    const routeActive = routes.includes(starry.activeRoute);
    const channelSelected = Boolean(channel && channel === selectedChannel);
    const channelFallback = Boolean(channel && channel === fallbackChannel && !channelSelected);
    node.classList.toggle("active", routeActive || channelSelected);
    node.classList.toggle("fallback", channelFallback);
  });
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
  } else if (target.latestReply.code === "STATUS_CLEAR") {
    $("phoneAlertCopy").textContent = "按鍵狀態已清除。若您目前安全，請按「我安全」完成平安回報。";
  } else {
    $("phoneAlertCopy").textContent = "守望隊已收到，請留在安全位置，等待進一步確認。";
  }

  const selectedSymptoms = new Set(starry.selectedSymptoms || target.selectedSymptoms || []);
  document.querySelectorAll("[data-reply]").forEach((button) => {
    const code = button.dataset.reply;
    const active = selectedSymptoms.has(code);
    const optionScore = store.symptomOptions?.[code]?.score;
    const score = Number.isFinite(Number(optionScore)) ? signedScoreText(optionScore) : "";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.dataset.score = score;
  });
  if ($("phoneSymptomScore")) {
    const labels = [...selectedSymptoms].map((code) => store.symptomOptions?.[code]?.label || lowData.replyLabels[code] || code);
    $("phoneSymptomScore").textContent = labels.length
      ? `按鍵 raw ${starry.symptomScore} / 顯示 ${starry.displayRiskScore ?? starry.riskScore ?? 0} / ${starryRiskLabel(starry.riskLevel)}：${labels.join("、")}`
      : `按鍵 raw 0 / 顯示 ${starry.displayRiskScore ?? starry.riskScore ?? 0} / ${starryRiskLabel(starry.riskLevel)}`;
  }

  $("phoneLocationStatus").textContent = locationStatusText(target.location);
  if ($("phoneGpsLat")) $("phoneGpsLat").textContent = coordinateText(target.location.lat);
  if ($("phoneGpsLng")) $("phoneGpsLng").textContent = coordinateText(target.location.lng);
  if ($("phoneGpsAccuracy")) $("phoneGpsAccuracy").textContent = accuracyText(target.location);
  if ($("phoneLocationNote")) {
    $("phoneLocationNote").textContent = target.location.confirmed
      ? "GPS confirmed，座標與精度會進入低資料封包。"
      : target.location.source === "GPS_DENIED"
        ? "GPS_DENIED：已保留位置待確認風險，請改用手動位置。"
        : String(target.location.source || "").startsWith("MANUAL_")
          ? "手動位置已送出；守望隊仍需人工確認。"
          : "GPS_UNAVAILABLE：Demo 會展示 fallback 流程，不顯示假座標。";
  }
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
  if ($("starryActiveRouteLive")) $("starryActiveRouteLive").textContent = activeRouteLabel(starry.activeRoute);
  if ($("starryActiveLayerLive")) $("starryActiveLayerLive").textContent = starryLayerLabel(starry.activeLayer);
  if ($("starryVictimStatusLive")) $("starryVictimStatusLive").textContent = victimStatusLabel(starry.victimStatus);
  if ($("starryRiskLive")) {
    const raw = Number(starry.rawRiskScore ?? starry.riskScore ?? 0);
    const display = Number(starry.displayRiskScore ?? starry.riskScore ?? 0);
    $("starryRiskLive").textContent = raw > display ? `${starryRiskLabel(starry.riskLevel)} / ${display} raw ${raw}` : `${starryRiskLabel(starry.riskLevel)} / ${display}`;
  }
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
  if (!target.latestReply) return "尚未同步";
  if (target.communication.ackStatus === "received") return "已同步至守望隊";
  if (["pending", "retrying"].includes(target.communication.ackStatus)) return "等待 ACK";
  return "尚未同步";
}

function renderTargets(state, selected) {
  const starry = starrySnapshot(state);
  const sortedTargets = state.targets
    .slice()
    .sort((a, b) => riskRank(b.risk.level) - riskRank(a.risk.level) || (b.risk.displayRiskScore ?? b.risk.score) - (a.risk.displayRiskScore ?? a.risk.score) || a.name.localeCompare(b.name));
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
      const linked = target.id === state.activeTargetId;
      const gps = gpsCardLabel(target.location);
      const needsContact = ["ORANGE", "RED"].includes(target.risk.level) || target.latestReply?.code === "NO_RESPONSE";
      const dispatch = target.risk.level === "RED" ? "優先派遣" : target.risk.level === "ORANGE" ? "主動確認" : "持續觀察";
      const workflow = target.workflow || {};
      return `
        <button class="target-item ${active} ${linked ? "linked" : ""}" type="button" data-target-id="${escapeHtml(target.id)}">
          <span>
            <strong>${escapeHtml(target.name)}</strong>
            <small>${escapeHtml(target.id)} / ${roleLabel(target.role)}${linked ? " / 手機同步" : ""}</small>
          </span>
          <span class="target-meta">
            <b class="${levelClass(target.risk.level)}">${target.risk.level} / ${riskDisplayText(target.risk)}</b>
            <small>${escapeHtml(target.latestReply?.label || "尚未回覆")}</small>
            <small>${ackLabel(target.communication.ackStatus)} / ${gps} / ${timeText(target.lastUpdatedAt || target.communication.lastAckAt)}</small>
            <small>${linked ? activeRouteLabel(starry.activeRoute) : routeName(target.communication.primaryRoute)} / 成功率 ${target.communication.packetSuccessRate || 0}%</small>
            <small>${needsContact ? "需要主動聯繫" : "持續觀察"} / ${dispatch} / ${actionText(target.risk.action)} / ${workflowStatusLabel(workflow)}</small>
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
  if (activeFilter === "processed") return target.workflow?.status === "processed";
  if (activeFilter === "unhandled") return target.workflow?.status !== "processed";
  if (activeFilter === "highPriority") return target.workflow?.priority === "high" || target.risk.level === "RED";
  return true;
}

function workflowStatusLabel(workflow = {}) {
  if (workflow.priority === "high") return "高優先";
  if (workflow.status === "processed") return "已處理";
  if (workflow.status === "manual_followup") return "人工追蹤";
  return "未處理";
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
  $("selectedRisk").textContent = `${target.risk.level} / ${riskDisplayText(target.risk)}`;
  $("selectedRisk").className = levelClass(target.risk.level);
  $("targetDetail").innerHTML = `
    ${detailRow("基本資料", `${target.name} / ${target.id} / ${target.age} 歲 / ${roleLabel(target.role)}`)}
    ${detailRow("最新回覆", target.latestReply ? `${target.latestReply.label}（${timeText(target.latestReply.timestamp)}）` : "尚未回覆")}
    ${detailRow("受困者按鍵區", `${symptomText}｜按鍵 raw ${symptomScore}`)}
    ${detailRow("風險分數", `display ${target.risk.displayRiskScore ?? target.risk.score}｜raw ${target.risk.rawRiskScore ?? target.risk.score}`)}
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

function renderWorkflow(_state, target) {
  const panel = $("workflowPanel");
  if (!panel || !target) return;
  const riskItems = (target.risk?.items || []).filter((item) => item.score > 0).slice(0, 5);
  const nextSteps = recommendedSteps(target);
  const locationTrust = locationTrustText(target.location);
  const workflow = target.workflow || {};
  panel.innerHTML = `
    <div class="section-line">
      <span>守望隊處理流程</span>
      <strong>${workflowStatusLabel(workflow)}</strong>
    </div>
    <div class="workflow-grid">
      <div>
        <h3>建議下一步</h3>
        <ul>${nextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div>
        <h3>為什麼</h3>
        <ul>${riskItems.length ? riskItems.map((item) => `<li>${escapeHtml(item.label)} ${signedScoreText(item.score)}：${escapeHtml(item.detail)}</li>`).join("") : "<li>目前沒有高風險加分項。</li>"}</ul>
      </div>
      <div>
        <h3>通訊方式</h3>
        <p>${escapeHtml(routeName(target.communication.primaryRoute))} / 備援 ${escapeHtml(routeName(target.communication.fallbackRoute))}</p>
        <small>${escapeHtml(target.communication.decisionReason || "依通訊矩陣加權選路。")}</small>
      </div>
      <div>
        <h3>位置可信度</h3>
        <p>${escapeHtml(locationTrust)}</p>
        <small>${escapeHtml(locationStatusText(target.location))}</small>
      </div>
    </div>
    <div class="workflow-actions">
      <button class="button primary" type="button" data-workflow-action="confirm-safe">標記已確認安全</button>
      <button class="button" type="button" data-workflow-action="follow-up">需要人工追蹤</button>
      <button class="button quiet" type="button" data-workflow-action="high-priority">標記高優先</button>
    </div>
    <div class="note-row">
      <input id="workflowNoteInput" type="text" placeholder="加入守望隊備註" value="" />
      <button id="workflowNoteButton" class="button quiet" type="button">加入備註</button>
    </div>
    <div class="note-list">
      ${(workflow.notes || []).length ? workflow.notes.map((note) => `<p><strong>${timeText(note.timestamp)}</strong>${escapeHtml(note.text)}</p>`).join("") : "<p class=\"empty\">尚無備註</p>"}
    </div>
  `;
}

function recommendedSteps(target) {
  const steps = [];
  if (target.risk.level === "RED") steps.push("升級救援");
  if (target.risk.level === "ORANGE" || target.risk.level === "RED") steps.push("派遣志工或守望隊確認");
  if (target.latestReply?.code === "CANNOT_TALK" || target.selectedSymptoms?.includes("CANNOT_TALK")) steps.push("主動文字確認，避免要求通話");
  else if (target.risk.level !== "GREEN") steps.push("主動文字確認");
  if (target.location?.confirmed) steps.push("使用 GPS confirmed 位置輔助排序");
  else steps.push("位置待確認，請要求手動回報或人工確認");
  if (target.workflow?.priority !== "high" && ["RED", "ORANGE"].includes(target.risk.level)) steps.push("通知守護者（Demo 內部流程）");
  return Array.from(new Set(steps.length ? steps : ["持續觀察 ACK 與下一次回覆"]));
}

function locationTrustText(location = {}) {
  if (location.confirmed) return `GPS / ${accuracyText(location)}`;
  if (String(location.source || "").startsWith("MANUAL_")) return `manual / ${location.manualLabel || "手動位置"}`;
  if (location.source === "GPS_DENIED") return "GPS denied / 位置待確認";
  if (location.source === "GPS_UNAVAILABLE" || location.source === "UNAVAILABLE") return "GPS unavailable / fallback 流程";
  if (location.source === "SAME_LAN_SIMULATED" || location.demoEstimate) return "非真實 GPS，僅 Demo 推估";
  return "unknown";
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
  $("riskSummary").textContent = `${target.risk.level} / ${riskDisplayText(target.risk)}`;
  $("riskScore").textContent = target.risk.displayRiskScore ?? target.risk.score;
  $("riskLevel").textContent = target.risk.level;
  $("riskLevel").className = levelClass(target.risk.level);
  $("riskAction").textContent = actionText(target.risk.action);

  $("riskReasons").innerHTML = target.risk.reason.length
    ? target.risk.reason.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")
    : `<span>目前沒有加分風險因素</span>`;

  $("riskMatrix").innerHTML = target.risk.items
    .map(
      (item) => `
        <div class="risk-row ${item.score > 0 ? "adds-risk" : item.score < 0 ? "reduces-risk" : ""}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${signedScoreText(item.score)}</strong>
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
  if ($("commReason")) $("commReason").textContent = communication.decisionReason || "依封包成功率、延遲、訊號、GPS、成本與電量影響加權選路。";

  $("commScoreRows").innerHTML = (communication.channelScores || [])
    .map(
      (channel) => `
        <tr>
          <td>${escapeHtml(channel.name)}</td>
          <td>${channel.score}</td>
          <td>${escapeHtml(channel.reason || channel.scoreBreakdown?.text || "-")}</td>
          <td>${channel.packetSuccessRate}%</td>
          <td>${channel.latencyScore}</td>
          <td>${channel.signalStrength}</td>
          <td>${channel.gpsAvailability}</td>
          <td>${channel.channelCost}</td>
          <td>${channel.batteryImpact}</td>
          <td>${escapeHtml(scoreBreakdownText(channel.scoreBreakdown))}</td>
        </tr>
      `
    )
    .join("");
}

function scoreBreakdownText(breakdown = {}) {
  const components = breakdown.components || {};
  const pieces = Object.entries(components).map(([key, value]) => `${key}:${value}`);
  if (Number.isFinite(Number(breakdown.adjustment)) && Number(breakdown.adjustment) !== 0) pieces.push(`adjust:${breakdown.adjustment}`);
  return pieces.join(" / ") || "-";
}

function renderMatrixOverview(target) {
  if (!$("selectedMatrixTarget")) return;
  $("selectedMatrixTarget").textContent = `${target.name} / ${target.risk.level} ${riskDisplayText(target.risk)}`;
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
    store.actions.setLocation("unknown", { source: "GPS_UNAVAILABLE", updateReply: false });
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
      const timeout = error.code === 3 || error.code === error.TIMEOUT;
      store.actions.setLocation("unknown", {
        source: permissionDenied ? "GPS_DENIED" : "GPS_UNAVAILABLE",
        errorCode: permissionDenied ? "permission_denied" : timeout ? "timeout" : "unavailable",
        updateReply: false,
      });
      finish();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
  );
}

function runSyncTask(task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      syncService?.setNotice?.(`操作失敗：${error.message}`, "warn");
      console.error(error);
    });
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
      .sort((a, b) => riskRank(b.risk.level) - riskRank(a.risk.level) || (b.risk.displayRiskScore ?? b.risk.score) - (a.risk.displayRiskScore ?? a.risk.score) || a.name.localeCompare(b.name))
      .filter(targetMatchesFilter);
    if (visible.length && !visible.some((target) => target.id === selected.id)) {
      store.actions.selectTarget(visible[0].id);
    } else {
      render();
    }
  });

  $("refreshLocation").addEventListener("click", requestCurrentLocation);
  $("dropLocation").addEventListener("click", () => {
    store.actions.setLocation("unknown", { source: "GPS_UNAVAILABLE", updateReply: true });
  });
  document.querySelectorAll("[data-manual-location]").forEach((button) => {
    button.addEventListener("click", () => store.actions.setManualLocation(button.dataset.manualLocation));
  });

  $("workflowPanel")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-workflow-action]");
    if (actionButton) {
      store.actions.updateWorkflow(actionButton.dataset.workflowAction);
      return;
    }
    if (event.target.closest("#workflowNoteButton")) {
      const input = $("workflowNoteInput");
      const note = input?.value?.trim();
      if (note) {
        store.actions.updateWorkflow("note", { note });
        input.value = "";
      }
    }
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
  $("simulateGroundDown")?.addEventListener("click", () => {
    networkSimulation?.simulateFallback?.("mesh");
    store.actions.simulateGroundNetworkDown();
  });
  $("enableSatelliteFallback")?.addEventListener("click", () => {
    networkSimulation?.simulateFallback?.("satellite");
    store.actions.enableSatelliteFallback();
  });
  $("enableAlarm")?.addEventListener("click", enableAlarmSound);
  $("enablePhoneAlarm")?.addEventListener("click", enableAlarmSound);
  $("resetDemo").addEventListener("click", () => {
    clearScriptTimers();
    clearSimulationTimer();
    store.actions.resetDemo();
  });
  $("copyMobileLink").addEventListener("click", copyMobileLink);
  $("deploymentRecheck")?.addEventListener("click", runDeploymentHealthCheck);
  $("syncTestReport")?.addEventListener("click", () => {
    store.actions.sendReply("INJURED");
    syncService?.setNotice?.("已送出測試回報，資料會先保存再依網路狀態同步。", "info");
  });
  $("syncWeakNetwork")?.addEventListener("click", () => {
    networkSimulation?.simulateWeak?.();
    store.actions.setWeakSignal(true);
    syncService?.setNotice?.("已切換弱網：後續回報會慢速同步並保留 retry 資訊。", "info");
  });
  $("syncOfflineMode")?.addEventListener("click", () => {
    networkSimulation?.simulateOffline?.();
    store.actions.simulateGroundNetworkDown();
    syncService?.setNotice?.("已模擬完全斷線：後續回報會進入本地同步佇列。", "warn");
  });
  $("syncFallbackMode")?.addEventListener("click", () => {
    const state = store.getState();
    const active = store.getActiveTarget(state);
    const link = active?.risk?.level === "RED" || active?.communication?.satelliteRecommended ? "satellite" : "mesh";
    networkSimulation?.simulateFallback?.(link);
    store.actions.simulateGroundNetworkDown();
    syncService?.setNotice?.(`已切換 ${simulationLinkLabel(link)}；此為 Simulation，不代表連接實體設備。`, "info");
  });
  $("syncRestoreNetwork")?.addEventListener("click", () => {
    networkSimulation?.restore?.();
    store.actions.restoreGroundNetwork?.();
    runSyncTask(() => syncService?.syncPending?.());
  });
  $("syncManualRun")?.addEventListener("click", () => runSyncTask(() => syncService?.syncPending?.()));
  $("syncImportSeed")?.addEventListener("click", () => runSyncTask(() => syncService?.seedDefaultData?.(store.getState(), { force: true })));
  $("syncClearData")?.addEventListener("click", () => {
    if (!window.confirm("確定清除韌性資料同步 Demo 資料？這不會重置星夜專案設定。")) return;
    runSyncTask(() => syncService?.clearDemoData?.());
  });
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
    store.actions.setScriptPhase(180, "展示完成：低資料封包、ACK、retry、星海地空路徑選擇與風險排序已完成。");
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
  if (location.protocol === "file:") {
    $("syncStatus").textContent = "請先執行 python3 demo/api_server.py，再用同一個區網網址開啟電腦端與手機端。";
    return;
  }
  let url = `${location.origin}${location.pathname}?view=mobile&target=U-DEMO`;
  let apiLinkAvailable = false;
  try {
    const response = await fetch("/api/demo-link?target=U-DEMO", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (payload.mobileUrl) url = payload.mobileUrl;
      apiLinkAvailable = true;
    }
  } catch (error) {
    // Static file previews fall back to the current origin.
  }
  const modeHint = apiLinkAvailable
    ? isVercelHost()
      ? "（Vercel serverless preview：此模式不保證跨裝置共享 state，完整同步請使用 python3 demo/api_server.py。）"
      : ""
    : "（目前 API 不可確認；此模式不保證跨裝置共享 state，完整同步請使用 python3 demo/api_server.py。）";
  try {
    await navigator.clipboard.writeText(url);
    $("syncStatus").textContent = `手機連結已複製：${url}${modeHint}`;
  } catch (error) {
    $("syncStatus").textContent = `手機連結：${url}${modeHint}`;
  }
}

store.subscribe((_state, meta) => {
  window.__lastTransport = meta.transport || window.__lastTransport || {};
  render();
});

syncService?.subscribe(() => renderResilienceSync());

bindEvents();
store.startSync();
runSyncTask(() => syncService?.autoSeedIfNeeded?.(store.getState()));
render();
runDeploymentHealthCheck();
setInterval(runDeploymentHealthCheck, 30000);
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
