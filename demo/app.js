const $ = (id) => document.getElementById(id);
const store = window.XY_DEMO_STORE;
const lowData = window.XY_LOW_DATA;
const query = new URLSearchParams(window.location.search);
const isMobileView = query.get("view") === "mobile";
let scriptTimers = [];

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
  return `level-${String(level || "LOW").toLowerCase()}`;
}

function render() {
  const state = store.getState();
  const active = store.getActiveTarget(state);
  const selected = store.getSelectedTarget(state);
  renderToolbar(state, active);
  renderPhone(active);
  renderTargets(state, selected);
  renderDetail(state, selected);
  renderRisk(selected);
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
}

function renderPhone(target) {
  const communication = target.communication;
  const route = lowData.routeLabel(communication.primaryRoute);
  const fallback = lowData.routeLabel(communication.fallbackRoute);
  $("phoneRoute").textContent = `目前通訊：${route}${communication.fallbackRoute !== "NONE" ? ` / 備援 ${fallback}` : ""}`;
  $("phoneAckTop").textContent = `守望隊是否收到：${ackLabel(communication.ackStatus)}`;
  $("phoneSignal").textContent = `連線狀態：${signalLabel(target.signalQuality)}（${target.signalQuality}%）`;

  const alert = $("phoneAlert");
  alert.className = `phone-alert ${levelClass(target.risk.level)}`;
  if (!target.latestReply) {
    $("phoneAlertCopy").textContent = "請點選下方最符合您目前狀態的按鈕。";
  } else if (target.risk.level === "HIGH" || target.risk.level === "CRITICAL") {
    $("phoneAlertCopy").textContent = "請不要勉強移動，系統已提高處理優先度。";
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
  $("targetCount").textContent = `${state.targets.length} 位`;
  $("targetList").innerHTML = state.targets
    .map((target) => {
      const active = target.id === selected.id ? "active" : "";
      const gps = target.location.confirmed ? "有 GPS" : "GPS 待確認";
      return `
        <button class="target-item ${active}" type="button" data-target-id="${escapeHtml(target.id)}">
          <span>
            <strong>${escapeHtml(target.name)}</strong>
            <small>${escapeHtml(target.id)} / ${roleLabel(target.role)}</small>
          </span>
          <span class="target-meta">
            <b class="${levelClass(target.risk.level)}">${target.risk.level}</b>
            <small>${escapeHtml(target.latestReply?.label || "尚未回覆")}</small>
            <small>${ackLabel(target.communication.ackStatus)} / ${gps}</small>
            <small>${actionText(target.risk.action)}</small>
          </span>
        </button>
      `;
    })
    .join("");
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
    ${detailRow("位置狀態", target.location.confirmed ? `${target.location.accuracy} / ${target.location.lat?.toFixed?.(3) ?? "-"}, ${target.location.lng?.toFixed?.(3) ?? "-"}` : "GPS unknown / 位置待確認")}
    ${detailRow("醫療/身體", `備註：${target.medical.chronicNote}｜HR ${target.medical.heartRate ?? "-"}｜SpO2 ${target.medical.spo2 ?? "-"}｜身體不適 ${yesNo(target.medical.discomfort)}｜無法移動 ${yesNo(target.medical.cannotMove || target.latestReply?.code === "CANNOT_MOVE")}`)}
    ${detailRow("通訊狀態", `${lowData.routeLabel(target.communication.primaryRoute)} → ${lowData.routeLabel(target.communication.fallbackRoute)}｜signal ${target.signalQuality}%｜battery ${target.battery}%`)}
    ${detailRow("封包與 ACK", `seq ${target.communication.packetSeq || "-"}｜${target.communication.packetBytes || 0} bytes｜ACK ${ackLabel(target.communication.ackStatus)}｜retry ${target.communication.retryCount || 0}`)}
    ${detailRow("最後更新", target.lastUpdatedAt ? timeText(target.lastUpdatedAt) : "-")}
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

function bindEvents() {
  document.querySelectorAll("[data-reply]").forEach((button) => {
    button.addEventListener("click", () => store.actions.sendReply(button.dataset.reply));
  });

  $("targetList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-target-id]");
    if (button) store.actions.selectTarget(button.dataset.targetId);
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

function runScriptMode() {
  clearScriptTimers();
  store.actions.startScript();
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(10, "10-30 秒：系統向 5 位目標發送安全確認，後台顯示 seq 與 ACK。");
    store.actions.sendSafetyCheckins();
  }, 10000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(30, "30-60 秒：4 位目標回覆，U-DEMO 保留給手機實機操作。");
    store.actions.applyScriptReplies();
  }, 30000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(60, "60-120 秒：操作 U-DEMO，後台立即更新風險矩陣、ACK 與 retry。");
  }, 60000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(120, "120-180 秒：守望隊依 LOW / MEDIUM / HIGH / CRITICAL 產生調度建議。");
    store.actions.finalizeDispatch();
  }, 120000));
  scriptTimers.push(setTimeout(() => {
    store.actions.setScriptPhase(180, "展示完成：低資料封包、ACK、retry、fallback 與風險排序已完成。");
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
