(function (global) {
  const APP_KIND = "xingye-sea-ground-space-demo";
  const STORAGE_KEY = "xingye-sea-ground-space-state-v2";
  const lowData = global.XY_LOW_DATA;
  const communicationEngine = global.XY_COMMUNICATION;

  const actionLabels = {
    MONITOR: "持續觀察",
    CALL_BACK: "守望隊主動確認",
    SEND_VOLUNTEER: "優先派遣守望隊",
    UPGRADE_CHANNEL: "優先派遣並升級通訊通道",
  };

  const levelActions = {
    GREEN: "MONITOR",
    YELLOW: "MONITOR",
    ORANGE: "SEND_VOLUNTEER",
    RED: "UPGRADE_CHANNEL",
  };

  const replyScores = {
    SAFE: -8,
    NEED_HELP: 38,
    INJURED: 42,
    TRAPPED: 54,
    NEED_MEDICAL: 50,
    CANNOT_TALK: 34,
    CANNOT_MOVE: 54,
    DISCOMFORT: 42,
    LOCATION_UNKNOWN: 22,
    NO_RESPONSE: 26,
  };

  let state = normalizeState(loadLocalState() || createInitialState());
  let saveTimer = null;
  let pollTimer = null;
  const listeners = new Set();
  const transport = {
    serverAvailable: false,
    connectedClients: 0,
    lastError: null,
    applyingRemote: false,
  };

  const broadcast = "BroadcastChannel" in global ? new BroadcastChannel("xingye-mvp-store") : null;
  if (broadcast) {
    broadcast.addEventListener("message", (event) => {
      const incoming = event.data?.state;
      if (incoming?.app === APP_KIND && Number(incoming.revision || 0) > Number(state.revision || 0)) {
        applyRemoteState(incoming, "broadcast");
      }
    });
  }

  global.addEventListener?.("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      if (incoming?.app === APP_KIND && Number(incoming.revision || 0) > Number(state.revision || 0)) {
        applyRemoteState(incoming, "storage");
      }
    } catch (error) {
      // Ignore malformed local storage written by older demos.
    }
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso(nowMs = Date.now()) {
    return new Date(nowMs).toISOString();
  }

  function minutesAgo(minutes) {
    return Date.now() - minutes * 60000;
  }

  function createTarget(config) {
    const route = lowData.routeForSignal(config.signalQuality);
    return {
      id: config.id,
      name: config.name,
      age: config.age,
      role: config.role,
      phoneOnline: config.phoneOnline ?? true,
      signalQuality: config.signalQuality,
      battery: config.battery,
      location: {
        lat: config.lat ?? null,
        lng: config.lng ?? null,
        accuracy: config.accuracy || "unknown",
        confirmed: Boolean(config.locationConfirmed),
        staticMinutes: Number(config.staticMinutes || 0),
      },
      medical: {
        chronicNote: config.chronicNote || "無特殊",
        heartRate: config.heartRate ?? null,
        spo2: config.spo2 ?? null,
        discomfort: Boolean(config.discomfort),
        injury: Boolean(config.injury),
        cannotMove: Boolean(config.cannotMove),
        breathingDifficulty: Boolean(config.breathingDifficulty),
        trapped: Boolean(config.trapped),
        hypothermia: Boolean(config.hypothermia),
      },
      latestReply: config.replyCode
        ? {
            code: config.replyCode,
            label: lowData.replyLabels[config.replyCode],
            timestamp: config.replyAt || Date.now(),
          }
        : null,
      communication: {
        primaryRoute: route.primaryRoute,
        fallbackRoute: route.fallbackRoute,
        packetSeq: config.packetSeq || 0,
        packetBytes: config.packetBytes || 0,
        ackStatus: config.ackStatus || "pending",
        retryCount: config.retryCount || 0,
        lastAckAt: config.lastAckAt || null,
        ackPendingSince: config.ackPendingSince || null,
        packetSuccessRate: config.packetSuccessRate ?? 0,
        averageLatencyMs: config.averageLatencyMs ?? 0,
        packetLossRate: config.packetLossRate ?? 0,
        lowDataMode: Boolean(config.lowDataMode),
        satelliteRecommended: Boolean(config.satelliteRecommended),
        channelScores: [],
      },
      risk: { score: 0, level: "GREEN", reason: [], action: "MONITOR", items: [] },
      lastUpdatedAt: config.lastUpdatedAt || null,
    };
  }

  function createInitialState() {
    const targets = [
      createTarget({
        id: "U-001",
        name: "阿明",
        age: 28,
        role: "general",
        signalQuality: 82,
        battery: 83,
        chronicNote: "無特殊",
        heartRate: 78,
        spo2: 98,
        replyCode: "SAFE",
        replyAt: minutesAgo(1),
        packetSeq: 2,
        packetBytes: 112,
        ackStatus: "received",
        retryCount: 0,
        lat: 25.034,
        lng: 121.565,
        accuracy: "high",
        locationConfirmed: true,
        lastAckAt: nowIso(minutesAgo(1)),
        lastUpdatedAt: nowIso(minutesAgo(1)),
      }),
      createTarget({
        id: "U-013",
        name: "林奶奶",
        age: 82,
        role: "elder",
        signalQuality: 48,
        battery: 52,
        chronicNote: "高齡",
        heartRate: 88,
        spo2: 95,
        replyCode: "NO_RESPONSE",
        replyAt: minutesAgo(4),
        packetSeq: 4,
        packetBytes: 118,
        ackStatus: "retrying",
        retryCount: 1,
        lat: 25.037,
        lng: 121.568,
        accuracy: "medium",
        locationConfirmed: true,
        staticMinutes: 18,
        lastAckAt: nowIso(minutesAgo(4)),
        lastUpdatedAt: nowIso(minutesAgo(4)),
      }),
      createTarget({
        id: "U-021",
        name: "陳先生",
        age: 67,
        role: "patient",
        signalQuality: 24,
        battery: 36,
        chronicNote: "行動不便，疑似受困",
        heartRate: 124,
        spo2: 91,
        breathingDifficulty: true,
        trapped: true,
        replyCode: "NEED_HELP",
        replyAt: minutesAgo(0.5),
        packetSeq: 5,
        packetBytes: 124,
        ackStatus: "failed",
        retryCount: 4,
        lat: 25.033,
        lng: 121.558,
        accuracy: "medium",
        locationConfirmed: true,
        staticMinutes: 8,
        lastAckAt: nowIso(minutesAgo(11)),
        lastUpdatedAt: nowIso(minutesAgo(0.5)),
      }),
      createTarget({
        id: "U-034",
        name: "王小姐",
        age: 34,
        role: "general",
        signalQuality: 45,
        battery: 14,
        chronicNote: "無特殊",
        heartRate: 92,
        spo2: 97,
        replyCode: "SAFE",
        replyAt: minutesAgo(8),
        packetSeq: 6,
        packetBytes: 112,
        ackStatus: "received",
        retryCount: 0,
        lat: 25.031,
        lng: 121.562,
        accuracy: "high",
        locationConfirmed: true,
        lastAckAt: nowIso(minutesAgo(9)),
        lastUpdatedAt: nowIso(minutesAgo(8)),
      }),
      createTarget({
        id: "U-DEMO",
        name: "Demo 使用者",
        age: 35,
        role: "general",
        signalQuality: 78,
        battery: 72,
        chronicNote: "無特殊",
        heartRate: 82,
        spo2: 98,
        packetSeq: 8,
        ackStatus: "pending",
        retryCount: 0,
        lat: 25.035,
        lng: 121.564,
        accuracy: "high",
        locationConfirmed: true,
        lastUpdatedAt: nowIso(),
      }),
    ];

    return {
      app: APP_KIND,
      revision: 1,
      updatedAt: nowIso(),
      activeTargetId: "U-DEMO",
      selectedTargetId: "U-DEMO",
      event: {
        title: "地震後海纜與地面骨幹不穩情境",
        status: "待建立",
        createdAt: null,
        network: {
          seaCableStatus: "degraded",
          groundBackboneStatus: "unstable",
          backboneLatencyMs: 1680,
          backbonePacketLossPercent: 31,
          groundCongestion: 86,
          mobileAvailable: true,
          satelliteAvailable: true,
          disasterMode: true,
        },
        script: {
          running: false,
          startedAt: null,
          elapsedSeconds: 0,
          label: "尚未啟動展示模式",
        },
      },
      targets,
      packetLog: [],
      events: [
        {
          id: "evt-init",
          targetId: "system",
          kind: "system",
          title: "星夜 MVP 已就緒",
          detail: "地震後海纜與地面骨幹不穩情境已載入，手機端與守望隊工作台讀取同一份 DemoTarget 狀態。",
          timestamp: nowIso(),
        },
      ],
    };
  }

  function normalizeState(input) {
    const next = input && input.app === APP_KIND ? input : createInitialState();
    if (!Array.isArray(next.targets) || next.targets.length === 0) next.targets = createInitialState().targets;
    if (!Array.isArray(next.packetLog)) next.packetLog = [];
    if (!Array.isArray(next.events)) next.events = [];
    if (!next.activeTargetId) next.activeTargetId = "U-DEMO";
    if (!next.selectedTargetId) next.selectedTargetId = next.activeTargetId;
    if (!next.event) next.event = createInitialState().event;
    if (!next.event.network) next.event.network = createInitialState().event.network;
    if (!next.event.script) {
      next.event.script = { running: false, startedAt: null, elapsedSeconds: 0, label: "尚未啟動展示模式" };
    }
    next.targets = next.targets.map((target) => {
      const route = lowData.routeForSignal(target.signalQuality);
      const normalized = {
        ...target,
        location: { lat: null, lng: null, accuracy: "unknown", confirmed: false, staticMinutes: 0, ...(target.location || {}) },
        medical: {
          chronicNote: "無特殊",
          heartRate: null,
          spo2: null,
          discomfort: false,
          injury: false,
          cannotMove: false,
          breathingDifficulty: false,
          trapped: false,
          hypothermia: false,
          ...(target.medical || {}),
        },
        communication: {
          primaryRoute: route.primaryRoute,
          fallbackRoute: route.fallbackRoute,
          packetSeq: 0,
          packetBytes: 0,
          ackStatus: "pending",
          retryCount: 0,
          lastAckAt: null,
          ackPendingSince: null,
          packetSuccessRate: 0,
          averageLatencyMs: 0,
          packetLossRate: 0,
          lowDataMode: false,
          satelliteRecommended: false,
          channelScores: [],
          ...(target.communication || {}),
        },
      };
      normalized.risk = calculateRisk(normalized);
      applyCommunicationDecision(normalized, next.event.network);
      return normalized;
    });
    return next;
  }

  function riskLevel(score) {
    if (score >= 80) return "RED";
    if (score >= 55) return "ORANGE";
    if (score >= 25) return "YELLOW";
    return "GREEN";
  }

  function addRisk(items, label, score, detail, visibleWhenZero = false) {
    if (score || visibleWhenZero) {
      items.push({ label, score, detail });
    }
  }

  function minutesSinceIso(value, nowMs) {
    if (!value) return 999;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.max(0, (nowMs - time) / 60000);
  }

  function applyCommunicationDecision(target, network) {
    if (!communicationEngine) return target;
    const decision = communicationEngine.decisionForTarget(target, target.risk, network);
    const primary = decision.primary;
    const fallback = decision.fallback;
    target.communication.primaryRoute = primary?.id || target.communication.primaryRoute || "SMS";
    target.communication.fallbackRoute = fallback?.id || "NONE";
    target.communication.packetSuccessRate = primary?.packetSuccessRate || 0;
    target.communication.averageLatencyMs = primary?.latencyMs || 0;
    target.communication.packetLossRate = decision.packetLossRate;
    target.communication.lowDataMode = decision.lowDataMode;
    target.communication.satelliteRecommended = decision.satelliteRecommended;
    target.communication.channelScores = decision.scores || [];
    return target;
  }

  function calculateRisk(target, nowMs = Date.now()) {
    const items = [];
    const latest = target.latestReply;
    const code = latest?.code || null;
    const replyScore = code ? replyScores[code] || 0 : 0;
    addRisk(items, "使用者回覆", replyScore, code ? `${latest.label} +${replyScore}` : "尚未回覆 +0", true);

    addRisk(items, "是否按下求救", code === "NEED_HELP" ? 20 : 0, "使用者按下需要救援 +20");

    const heartRate = Number(target.medical.heartRate);
    addRisk(items, "心率異常", heartRate > 120 || heartRate < 50 ? 12 : 0, `HR ${target.medical.heartRate ?? "-"} +12`);
    addRisk(items, "血氧偏低", Number(target.medical.spo2) < 92 ? 18 : 0, `SpO2 ${target.medical.spo2 ?? "-"} +18`);
    addRisk(items, "受傷", target.medical.injury || code === "INJURED" || code === "NEED_MEDICAL" ? 24 : 0, "受傷或需要醫療 +24");
    addRisk(items, "呼吸困難", target.medical.breathingDifficulty ? 28 : 0, "呼吸困難 +28");
    addRisk(items, "被困/無法移動", target.medical.trapped || target.medical.cannotMove || code === "TRAPPED" || code === "CANNOT_MOVE" ? 28 : 0, "被困或無法移動 +28");
    addRisk(items, "失溫", target.medical.hypothermia ? 24 : 0, "疑似失溫 +24");

    if (target.location.confirmed && target.location.accuracy === "high") {
      addRisk(items, "GPS", 0, "GPS 已確認 high +0", true);
    } else if (target.location.confirmed && ["medium", "low"].includes(target.location.accuracy)) {
      addRisk(items, "GPS 精準度", 10, `GPS accuracy ${target.location.accuracy} +10`);
    } else {
      addRisk(items, "GPS 未確認", 25, "GPS unknown +25");
    }
    addRisk(items, "使用者表示位置不明", code === "LOCATION_UNKNOWN" ? 20 : 0, "位置不明 +20");
    addRisk(items, "GPS 長時間靜止", Number(target.location.staticMinutes || 0) >= 10 ? 20 : 0, `GPS 靜止 ${target.location.staticMinutes || 0} 分鐘 +20`);

    const signal = Number(target.signalQuality || 0);
    const signalScore = signal >= 70 ? 0 : signal >= 40 ? 8 : 16;
    addRisk(items, "訊號品質", signalScore, signal >= 70 ? `signal ${signal}% +0` : signal >= 40 ? `signal ${signal}% +8` : `弱訊號 ${signal}% +16`, true);

    const pendingSince = target.communication.ackPendingSince || latest?.timestamp || nowMs;
    const pendingSeconds = (nowMs - new Date(pendingSince).getTime()) / 1000;
    const ackPendingTooLong = ["pending", "retrying"].includes(target.communication.ackStatus) && pendingSeconds > 20;
    const retryCount = Number(target.communication.retryCount || 0);
    addRisk(items, "ACK pending 超過 20 秒", ackPendingTooLong ? 10 : 0, "ACK pending +10");
    addRisk(items, "封包連續失敗", target.communication.ackStatus === "failed" || retryCount >= 3 ? 24 : retryCount >= 2 ? 12 : 0, `retry ${retryCount} / ${target.communication.ackStatus} +${target.communication.ackStatus === "failed" || retryCount >= 3 ? 24 : retryCount >= 2 ? 12 : 0}`);
    addRisk(items, "NO_RESPONSE 且 ACK failed", code === "NO_RESPONSE" && target.communication.ackStatus === "failed" ? 20 : 0, "NO_RESPONSE + failed +20");

    const battery = Number(target.battery || 0);
    const batteryScore = battery < 10 ? 24 : battery < 20 ? 16 : battery < 30 ? 8 : 0;
    addRisk(items, "手機電量", batteryScore, `battery ${battery}% +${batteryScore}`, true);

    if (latest?.timestamp) {
      const minutes = (nowMs - Number(latest.timestamp)) / 60000;
      const timeScore = minutes > 15 ? 22 : minutes >= 10 ? 16 : minutes >= 5 ? 8 : 0;
      addRisk(items, "最後回覆時間", timeScore, `${Math.max(0, Math.round(minutes))} 分鐘前 +${timeScore}`);
    }
    const syncMinutes = minutesSinceIso(target.communication.lastAckAt || target.lastUpdatedAt, nowMs);
    const syncScore = syncMinutes > 15 ? 20 : syncMinutes >= 8 ? 10 : 0;
    addRisk(items, "最後成功同步時間", syncScore, `${Math.round(syncMinutes)} 分鐘前 +${syncScore}`, true);

    const score = Math.max(0, Math.min(100, items.reduce((sum, item) => sum + Number(item.score || 0), 0)));
    const level = riskLevel(score);
    const action = levelActions[level];
    return {
      score,
      level,
      reason: items.filter((item) => item.score > 0).map((item) => item.detail),
      action,
      items,
    };
  }

  function getState() {
    return state;
  }

  function getActiveTarget(draft = state) {
    return draft.targets.find((target) => target.id === draft.activeTargetId) || draft.targets[0];
  }

  function getSelectedTarget(draft = state) {
    return draft.targets.find((target) => target.id === draft.selectedTargetId) || getActiveTarget(draft);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(meta = {}) {
    listeners.forEach((listener) => listener(state, { ...meta, transport: { ...transport } }));
  }

  function commit(mutator, reason = "update", options = {}) {
    const draft = clone(state);
    const result = mutator(draft);
    const next = normalizeState(result || draft);
    if (!options.remote) {
      next.revision = Number(state.revision || 0) + 1;
      next.updatedAt = nowIso();
    }
    state = next;
    saveLocalState(state);
    if (!options.remote) {
      broadcast?.postMessage({ state });
      scheduleServerSave(reason);
    }
    emit({ reason });
    return state;
  }

  function applyRemoteState(incoming, reason) {
    transport.applyingRemote = true;
    state = normalizeState(clone(incoming));
    saveLocalState(state);
    transport.applyingRemote = false;
    emit({ reason });
  }

  function saveLocalState(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // The demo still works without local persistence.
    }
  }

  function loadLocalState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return stored?.app === APP_KIND ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function scheduleServerSave(reason) {
    if (global.location?.protocol === "file:") return;
    global.clearTimeout(saveTimer);
    saveTimer = global.setTimeout(() => persistServerState(reason), 120);
  }

  async function persistServerState(reason) {
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, state }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      transport.serverAvailable = true;
      transport.connectedClients = payload.connectedClients || 0;
      transport.lastError = null;
      emit({ reason: "server-save" });
    } catch (error) {
      transport.serverAvailable = false;
      transport.lastError = error.message;
      emit({ reason: "server-save-failed" });
    }
  }

  async function loadServerState() {
    if (global.location?.protocol === "file:") return;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      transport.serverAvailable = true;
      transport.connectedClients = payload.connectedClients || 0;
      transport.lastError = null;
      const incoming = payload.state;
      if (incoming?.app === APP_KIND && Number(incoming.revision || 0) > Number(state.revision || 0)) {
        applyRemoteState(incoming, "server-poll");
      } else if (!incoming || incoming.app !== APP_KIND) {
        scheduleServerSave("initialize-mvp-store");
      } else {
        emit({ reason: "server-poll" });
      }
    } catch (error) {
      transport.serverAvailable = false;
      transport.lastError = error.message;
      emit({ reason: "server-unavailable" });
    }
  }

  function startSync() {
    loadServerState();
    if (!pollTimer && global.location?.protocol !== "file:") {
      pollTimer = global.setInterval(loadServerState, 1500);
    }
  }

  function addEvent(draft, targetId, title, detail, kind = "event", seq = null) {
    draft.events.unshift({
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      targetId,
      kind,
      title,
      detail,
      seq,
      timestamp: nowIso(),
    });
    draft.events = draft.events.slice(0, 80);
  }

  function addPacketLog(draft, entry) {
    draft.packetLog.unshift({
      id: `pkt-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      timestamp: nowIso(),
      ...entry,
    });
    draft.packetLog = draft.packetLog.slice(0, 80);
  }

  function updateActiveTarget(draft, updater) {
    const target = getActiveTarget(draft);
    updater(target);
    target.lastUpdatedAt = nowIso();
    return target;
  }

  function selectTarget(id) {
    commit((draft) => {
      if (draft.targets.some((target) => target.id === id)) draft.selectedTargetId = id;
    }, "select-target");
  }

  function setWeakSignal(enabled) {
    commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        item.signalQuality = enabled ? 32 : 78;
        item.phoneOnline = true;
      });
      addEvent(draft, target.id, enabled ? "切換弱訊號模擬" : "恢復良好訊號", `U-DEMO signalQuality = ${target.signalQuality}%`, "communication");
    }, "weak-signal");
  }

  function setLocation(kind) {
    commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        if (kind === "confirmed") {
          item.location = { lat: 25.035, lng: 121.564, accuracy: "high", confirmed: true, staticMinutes: 0 };
        } else {
          item.location = { lat: null, lng: null, accuracy: "unknown", confirmed: false, staticMinutes: 0 };
        }
      });
      addEvent(draft, target.id, kind === "confirmed" ? "位置已確認" : "位置待確認", kind === "confirmed" ? "GPS high，守望隊可使用定位輔助排序。" : "使用者無法提供位置，風險矩陣加入 GPS unknown。", "location");
    }, "location");
  }

  function updateMedicalFlag(flag, value) {
    commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        item.medical[flag] = Boolean(value);
        if (flag === "discomfort" && value) {
          item.medical.heartRate = 118;
          item.medical.spo2 = 94;
        }
        if (flag === "cannotMove" && value) {
          item.medical.heartRate = Math.max(Number(item.medical.heartRate || 96), 106);
          item.medical.trapped = true;
        }
        if (!item.medical.discomfort && !item.medical.cannotMove) {
          item.medical.heartRate = 82;
          item.medical.spo2 = 98;
        }
      });
      addEvent(draft, target.id, "更新身體狀態", `${flag} = ${Boolean(value)}`, "medical");
    }, "medical");
  }

  function sendReply(code) {
    const nowMs = Date.now();
    let seq = 0;
    let weak = false;
    commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        seq = Number(item.communication.packetSeq || 0) + 1;
        if (code === "SAFE") {
          item.medical.discomfort = false;
          item.medical.injury = false;
          item.medical.cannotMove = false;
          item.medical.breathingDifficulty = false;
          item.medical.trapped = false;
          item.medical.hypothermia = false;
          item.medical.heartRate = 82;
          item.medical.spo2 = 98;
        }
        if (code === "CANNOT_MOVE" || code === "TRAPPED") {
          item.medical.cannotMove = true;
          item.medical.trapped = true;
          item.medical.heartRate = Math.max(Number(item.medical.heartRate || 106), 106);
        }
        if (code === "DISCOMFORT" || code === "INJURED" || code === "NEED_MEDICAL") {
          item.medical.discomfort = true;
          item.medical.injury = true;
          item.medical.heartRate = 118;
          item.medical.spo2 = 94;
        }
        if (code === "CANNOT_TALK") {
          item.medical.breathingDifficulty = true;
          item.medical.heartRate = Math.max(Number(item.medical.heartRate || 110), 110);
        }
        if (code === "LOCATION_UNKNOWN") {
          item.location = { lat: null, lng: null, accuracy: "unknown", confirmed: false, staticMinutes: 0 };
        }
        item.latestReply = {
          code,
          label: lowData.replyLabels[code],
          timestamp: nowMs,
        };
        item.communication.packetSeq = seq;
        item.communication.ackStatus = Number(item.signalQuality || 0) < 40 ? "pending" : "received";
        item.communication.retryCount = 0;
        item.communication.ackPendingSince = nowMs;
        item.communication.lastAckAt = Number(item.signalQuality || 0) < 40 ? null : nowIso(nowMs);
      });
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      const packet = lowData.makePacket(target, code, seq, nowMs);
      target.communication.packetBytes = packet.bytes;
      weak = Number(target.signalQuality || 0) < 40;
      addPacketLog(draft, {
        targetId: target.id,
        seq,
        attempt: 1,
        replyCode: code,
        replyLabel: lowData.replyLabels[code],
        bytes: packet.bytes,
        packet: packet.preview,
        ack: weak ? null : lowData.makeAck(target.id, seq, nowMs),
        status: weak ? "pending" : "received",
        dedupe: "accepted",
        route: target.communication.primaryRoute,
      });
      addEvent(
        draft,
        target.id,
        "收到手機端回覆",
        `${target.name} 回覆「${lowData.replyLabels[code]}」，seq ${seq}，${packet.bytes} bytes。${weak ? "等待 ACK。" : "server ACK 已收到。"}`,
        "mobile",
        seq
      );
      if (!weak) {
        addEvent(draft, target.id, "ACK received", `後台已回 ACK：seq ${seq}`, "ack", seq);
      }
    }, "reply");

    if (weak) {
      global.setTimeout(() => markRetry(seq, 1), 1500);
      global.setTimeout(() => markAck(seq), 3000);
    }
  }

  function markRetry(seq, retryCount) {
    commit((draft) => {
      const target = getActiveTarget(draft);
      if (target.communication.packetSeq !== seq || target.communication.ackStatus === "received") return;
      target.communication.retryCount = retryCount;
      target.communication.ackStatus = "retrying";
      target.risk = calculateRisk(target);
      applyCommunicationDecision(target, draft.event.network);
      const packet = lowData.makePacket(target, target.latestReply.code, seq);
      addPacketLog(draft, {
        targetId: target.id,
        seq,
        attempt: retryCount + 1,
        replyCode: target.latestReply.code,
        replyLabel: target.latestReply.label,
        bytes: packet.bytes,
        packet: packet.preview,
        ack: null,
        status: "retrying",
        dedupe: "same seq retry",
        route: target.communication.primaryRoute,
      });
      addEvent(draft, target.id, "低資料模式重送", `ACK 尚未收到，seq ${seq} 進行第 ${retryCount} 次 retry。`, "retry", seq);
    }, "retry");
  }

  function markAck(seq) {
    commit((draft) => {
      const target = getActiveTarget(draft);
      if (target.communication.packetSeq !== seq || target.communication.ackStatus === "received") return;
      const ack = lowData.makeAck(target.id, seq);
      target.communication.ackStatus = "received";
      target.communication.lastAckAt = nowIso();
      target.communication.ackPendingSince = null;
      draft.packetLog = draft.packetLog.map((packet) =>
        packet.targetId === target.id && packet.seq === seq ? { ...packet, status: "received", ack } : packet
      );
      addPacketLog(draft, {
        targetId: target.id,
        seq,
        attempt: Number(target.communication.retryCount || 0) + 1,
        replyCode: target.latestReply?.code,
        replyLabel: target.latestReply?.label,
        bytes: 0,
        packet: JSON.stringify(ack),
        ack,
        status: "received",
        dedupe: "ack",
        route: "SERVER_ACK",
      });
      addEvent(draft, target.id, "ACK received", `守望隊已收到 seq ${seq}，手機端改為「已收到」。`, "ack", seq);
    }, "ack");
  }

  function resetDemo() {
    commit(() => createInitialState(), "reset");
  }

  function startScript() {
    commit((draft) => {
      const fresh = createInitialState();
      fresh.revision = Number(draft.revision || 0);
      fresh.event.status = "災害模式啟動";
      fresh.event.createdAt = nowIso();
      fresh.event.network.disasterMode = true;
      fresh.event.network.seaCableStatus = "degraded";
      fresh.event.network.groundBackboneStatus = "unstable";
      fresh.event.network.backboneLatencyMs = 1880;
      fresh.event.network.backbonePacketLossPercent = 36;
      fresh.event.script = {
        running: true,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        label: "0-10 秒：災害模式啟動，海纜與地面骨幹延遲升高，5 位目標進入待確認。",
      };
      addEvent(fresh, "system", "災害模式啟動", "地震後海纜與地面骨幹不穩，系統切換低資料量封包並重新評估通訊路徑。", "script");
      return fresh;
    }, "script-start");
  }

  function setScriptPhase(elapsedSeconds, label) {
    commit((draft) => {
      draft.event.script.elapsedSeconds = elapsedSeconds;
      draft.event.script.label = label;
      if (elapsedSeconds >= 180) draft.event.script.running = false;
    }, "script-phase");
  }

  function sendSafetyCheckins() {
    commit((draft) => {
      draft.event.status = "安全確認已送出";
      draft.targets.forEach((target) => {
        target.communication.packetSeq = Number(target.communication.packetSeq || 0) + 1;
        target.communication.packetBytes = 96;
        target.communication.ackStatus = Number(target.signalQuality || 0) < 40 ? "retrying" : "received";
        target.communication.retryCount = Number(target.signalQuality || 0) < 40 ? 1 : 0;
        target.communication.lastAckAt = target.communication.ackStatus === "received" ? nowIso() : target.communication.lastAckAt;
      });
      addEvent(draft, "system", "發送低資料安全確認", "系統只送 GPS、求救等級、生命狀態與按鍵回覆，降低海纜/骨幹異常時的丟包風險。", "script");
    }, "script-checkin");
  }

  function applyScriptReplies() {
    const presets = [
      ["U-001", "SAFE", { signalQuality: 82, location: { lat: 25.034, lng: 121.565, accuracy: "high", confirmed: true, staticMinutes: 0 } }],
      ["U-013", "NO_RESPONSE", { signalQuality: 48, location: { lat: 25.037, lng: 121.568, accuracy: "medium", confirmed: true, staticMinutes: 18 }, communication: { ackStatus: "retrying", retryCount: 1, lastAckAt: nowIso(minutesAgo(4)) } }],
      ["U-021", "NEED_HELP", { signalQuality: 24, communication: { ackStatus: "failed", retryCount: 4 }, medical: { trapped: true, breathingDifficulty: true, heartRate: 124, spo2: 91 } }],
      ["U-034", "SAFE", { battery: 14, signalQuality: 45, communication: { ackStatus: "received", retryCount: 0, lastAckAt: nowIso(minutesAgo(9)) } }],
    ];
    commit((draft) => {
      presets.forEach(([id, code, patch]) => {
        const target = draft.targets.find((item) => item.id === id);
        if (!target) return;
        const previousLocation = target.location;
        const previousMedical = target.medical;
        const previousCommunication = target.communication;
        Object.assign(target, patch);
        if (patch.location) target.location = { ...previousLocation, ...patch.location };
        if (patch.medical) target.medical = { ...previousMedical, ...patch.medical };
        if (patch.communication) target.communication = { ...previousCommunication, ...patch.communication };
        target.latestReply = { code, label: lowData.replyLabels[code], timestamp: Date.now() };
        target.communication.packetSeq = Number(target.communication.packetSeq || 0) + 1;
        target.risk = calculateRisk(target);
        applyCommunicationDecision(target, draft.event.network);
        const packet = lowData.makePacket(target, code, target.communication.packetSeq);
        target.communication.packetBytes = packet.bytes;
        if (target.communication.ackStatus !== "failed" && target.communication.ackStatus !== "retrying") {
          target.communication.ackStatus = "received";
          target.communication.lastAckAt = nowIso();
          target.communication.retryCount = 0;
        }
        addPacketLog(draft, {
          targetId: target.id,
          seq: target.communication.packetSeq,
          attempt: 1,
          replyCode: code,
          replyLabel: lowData.replyLabels[code],
          bytes: packet.bytes,
          packet: packet.preview,
          ack: lowData.makeAck(target.id, target.communication.packetSeq),
          status: "received",
          dedupe: "accepted",
          route: target.communication.primaryRoute,
        });
      });
      addEvent(draft, "system", "收到 4 位目標狀態", "阿明安全、林奶奶未回覆且 GPS 靜止、陳先生求救且封包多次失敗、王小姐低電量；U-DEMO 等待手機端操作。", "script");
    }, "script-replies");
  }

  function finalizeDispatch() {
    commit((draft) => {
      draft.event.status = "建議調度已產生";
      draft.targets.forEach((target) => {
        target.risk = calculateRisk(target);
        applyCommunicationDecision(target, draft.event.network);
      });
      addEvent(draft, "system", "建議調度", "Green/Yellow 優先 Wi-Fi、5G 或 SMS；Orange 啟用低資料量與主動確認；Red 優先 GPS/求救/生命狀態並建議衛星或高優先備援。", "dispatch");
    }, "script-dispatch");
  }

  function refreshRiskTick() {
    commit((draft) => {
      draft.targets.forEach((target) => {
        target.risk = calculateRisk(target);
        applyCommunicationDecision(target, draft.event.network);
      });
      if (draft.event.script.running && draft.event.script.startedAt) {
        draft.event.script.elapsedSeconds = Math.min(180, Math.floor((Date.now() - draft.event.script.startedAt) / 1000));
      }
    }, "risk-tick", { remote: false });
  }

  global.XY_DEMO_STORE = {
    actionLabels,
    getState,
    getActiveTarget,
    getSelectedTarget,
    subscribe,
    startSync,
    loadServerState,
    actions: {
      selectTarget,
      setWeakSignal,
      setLocation,
      updateMedicalFlag,
      sendReply,
      resetDemo,
      startScript,
      setScriptPhase,
      sendSafetyCheckins,
      applyScriptReplies,
      finalizeDispatch,
      refreshRiskTick,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
