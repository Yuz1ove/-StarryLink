const $ = (id) => document.getElementById(id);
const store = window.XY_DEMO_STORE;
const lowData = window.XY_LOW_DATA;
const query = new URLSearchParams(window.location.search);
const isMobileView = query.get("view") === "mobile";
let scriptTimers = [];
let activeFilter = "all";
let audioContext = null;
let alarmEnabled = false;

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

function render() {
  const state = store.getState();
  const active = store.getActiveTarget(state);
  const selected = store.getSelectedTarget(state);
  renderToolbar(state, active);
  renderDisasterBanner(state);
  renderPhone(active, state);
  renderTargets(state, selected);
  renderDetail(state, selected);
  renderRisk(selected);
  renderCommunication(selected);
  renderMatrixOverview(selected);
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
    $("networkStatus").textContent = `海纜 ${network.seaCableStatus === "degraded" ? "異常" : "正常"} / 地面骨幹 ${network.groundBackboneStatus === "unstable" ? "不穩" : "正常"} / 丟包 ${network.backbonePacketLossPercent || 0}%`;
  }
}

function renderDisasterBanner(state) {
  const banner = $("disasterBanner");
  if (!banner) return;
  const network = state.event.network || {};
  const active = state.event.script.running || state.event.status === "災害模式啟動";
  banner.classList.toggle("active", active);
  banner.innerHTML = `
    <div>
      <strong>${active ? "災害模式啟動" : "平時監測待命"}</strong>
      <span>地震後海纜與地面骨幹不穩：延遲 ${network.backboneLatencyMs || 0}ms、丟包 ${network.backbonePacketLossPercent || 0}%；系統改用低資料量封包與多路徑通訊決策。</span>
    </div>
    <small id="alertSoundStatus">${alarmEnabled ? "警報音已啟用" : "若瀏覽器擋住自動播放，請點啟用警報音。"}</small>
  `;
}

function renderPhone(target, state) {
  const communication = target.communication;
  const route = routeName(communication.primaryRoute);
  const fallback = routeName(communication.fallbackRoute);
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
    $("phoneAlertTitle").textContent = state.event.status === "災害模式啟動" ? "災害模式啟動" : "守望隊正在確認您的安全";
  }
  if (!target.latestReply) {
    $("phoneAlertCopy").textContent = "請點選下方最符合您目前狀態的按鈕。";
  } else if (target.risk.level === "RED" || target.risk.level === "ORANGE") {
    $("phoneAlertCopy").textContent = "請不要勉強移動。系統已優先傳送 GPS、求救狀態與生命狀態，並提高通訊通道優先級。";
  } else {
    $("phoneAlertCopy").textContent = "守望隊已收到，請留在安全位置，等待進一步確認。";
  }

  document.querySelectorAll("[data-reply]").forEach((button) => {
    button.classList.toggle("active", target.latestReply?.code === button.dataset.reply);
  });

  $("phoneLocationStatus").textContent = target.location.confirmed ? "位置已確認" : "位置待確認";
  $("phoneVitals").textContent = `HR ${target.medical.heartRate ?? "--"} / SpO2 ${target.medical.spo2 ?? "--"}`;
  $("discomfortToggle").checked = Boolean(target.medical.discomfort);
  $("immobileToggle").checked = Boolean(target.medical.cannotMove || target.latestReply?.code === "CANNOT_MOVE");
  $("phoneSendStatus").textContent = phoneSendStatus(target);
  $("phoneSeq").textContent = target.communication.packetSeq || "-";
  $("phoneBytes").textContent = target.communication.packetBytes ? `${target.communication.packetBytes} bytes` : "-";
  $("phoneRetry").textContent = String(target.communication.retryCount || 0);
}

function phoneSendStatus(target) {
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
      const gps = target.location.confirmed ? "有 GPS" : "GPS 待確認";
      const needsContact = ["ORANGE", "RED"].includes(target.risk.level) || target.latestReply?.code === "NO_RESPONSE";
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
            <small>${needsContact ? "需要主動聯繫" : "持續觀察"} / ${actionText(target.risk.action)}</small>
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
  $("selectedRisk").textContent = `${target.risk.level} / ${target.risk.score}`;
  $("selectedRisk").className = levelClass(target.risk.level);
  $("targetDetail").innerHTML = `
    ${detailRow("基本資料", `${target.name} / ${target.id} / ${target.age} 歲 / ${roleLabel(target.role)}`)}
    ${detailRow("最新回覆", target.latestReply ? `${target.latestReply.label}（${timeText(target.latestReply.timestamp)}）` : "尚未回覆")}
    ${detailRow("GPS 狀態", target.location.confirmed ? `${target.location.accuracy} / ${target.location.lat?.toFixed?.(3) ?? "-"}, ${target.location.lng?.toFixed?.(3) ?? "-"} / 靜止 ${target.location.staticMinutes || 0} 分` : "GPS unknown / 位置待確認")}
    ${detailRow("醫療/生命狀態", `HR ${target.medical.heartRate ?? "-"}｜SpO2 ${target.medical.spo2 ?? "-"}｜受傷 ${yesNo(target.medical.injury)}｜呼吸困難 ${yesNo(target.medical.breathingDifficulty)}｜被困 ${yesNo(target.medical.trapped || target.medical.cannotMove)}`)}
    ${detailRow("通訊狀態", `${routeName(target.communication.primaryRoute)} → ${routeName(target.communication.fallbackRoute)}｜signal ${target.signalQuality}%｜battery ${target.battery}%｜低資料 ${yesNo(target.communication.lowDataMode)}`)}
    ${detailRow("封包與 ACK", `seq ${target.communication.packetSeq || "-"}｜${target.communication.packetBytes || 0} bytes｜ACK ${ackLabel(target.communication.ackStatus)}｜retry ${target.communication.retryCount || 0}`)}
    ${detailRow("封包品質", `成功率 ${target.communication.packetSuccessRate || 0}%｜平均延遲 ${target.communication.averageLatencyMs || 0}ms｜丟包率 ${target.communication.packetLossRate || 0}%`)}
    ${detailRow("最後同步", target.communication.lastAckAt ? timeText(target.communication.lastAckAt) : target.lastUpdatedAt ? timeText(target.lastUpdatedAt) : "-")}
    ${detailRow("建議處置", `${actionText(target.risk.action)}｜主動聯繫 ${yesNo(["ORANGE", "RED"].includes(target.risk.level))}｜優先派遣 ${yesNo(target.risk.level === "RED")}`)}
  `;

  const packet = state.packetLog.find((item) => item.targetId === target.id && item.packet && Number(item.bytes || 0) > 0);
  $("packetSize").textContent = packet ? `${packet.bytes} bytes` : "0 bytes";
  $("packetPreview").textContent = packet ? formatPacket(packet) : target.id === "U-DEMO" ? "尚未收到 U-DEMO 封包" : "此目標尚無封包內容";

  const events = state.events.filter((event) => event.targetId === target.id || event.targetId === "system").slice(0, 10);
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

function bindEvents() {
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

  $("refreshLocation").addEventListener("click", () => store.actions.setLocation("confirmed"));
  $("dropLocation").addEventListener("click", () => {
    store.actions.setLocation("unknown");
    store.actions.sendReply("LOCATION_UNKNOWN");
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

  $("startDemo").addEventListener("click", runScriptMode);
  $("startDemoTop").addEventListener("click", () => {
    $("demo").scrollIntoView({ block: "start" });
    runScriptMode();
  });
  $("enableAlarm")?.addEventListener("click", enableAlarmSound);
  $("enablePhoneAlarm")?.addEventListener("click", enableAlarmSound);
  $("resetDemo").addEventListener("click", () => {
    clearScriptTimers();
    store.actions.resetDemo();
  });
  $("copyMobileLink").addEventListener("click", copyMobileLink);
}

function clearScriptTimers() {
  scriptTimers.forEach((timer) => clearTimeout(timer));
  scriptTimers = [];
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

function runScriptMode() {
  clearScriptTimers();
  enableAlarmSound().then((enabled) => {
    if (enabled) playAlarm("alert");
  });
  store.actions.startScript();
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(10, "10-30 秒：系統向 5 位目標發送低資料安全確認，後台顯示 seq、ACK 與建議路徑。");
    store.actions.sendSafetyCheckins();
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
  }, 180000));
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
