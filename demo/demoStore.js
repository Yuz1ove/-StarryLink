(function (global) {
  const APP_KIND = "xingye-mvp-demo";
  const STORAGE_KEY = "xingye-mvp-state-v1";
  const lowData = global.XY_LOW_DATA;

  const actionLabels = {
    MONITOR: "持續追蹤",
    CALL_BACK: "人工回撥",
    SEND_VOLUNTEER: "派守望隊確認",
    SEND_MEDICAL: "通知醫療/救護並派守望隊確認",
  };

  const levelActions = {
    LOW: "MONITOR",
    MEDIUM: "CALL_BACK",
    HIGH: "SEND_VOLUNTEER",
    CRITICAL: "SEND_MEDICAL",
  };

  const replyScores = {
    SAFE: 0,
    NEED_HELP: 30,
    CANNOT_MOVE: 45,
    DISCOMFORT: 35,
    LOCATION_UNKNOWN: 20,
    NO_RESPONSE: 50,
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
      },
      medical: {
        chronicNote: config.chronicNote || "無特殊",
        heartRate: config.heartRate ?? null,
        spo2: config.spo2 ?? null,
        discomfort: Boolean(config.discomfort),
        injury: Boolean(config.injury),
        cannotMove: Boolean(config.cannotMove),
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
      },
      risk: { score: 0, level: "LOW", reason: [], action: "MONITOR", items: [] },
      lastUpdatedAt: config.lastUpdatedAt || null,
    };
  }

  function createInitialState() {
    const targets = [
      createTarget({
        id: "U-013",
        name: "林奶奶",
        age: 82,
        role: "elder",
        signalQuality: 28,
        battery: 64,
        chronicNote: "高齡",
        heartRate: 86,
        spo2: 95,
        replyCode: "NO_RESPONSE",
        replyAt: minutesAgo(12),
        packetSeq: 4,
        packetBytes: 118,
        ackStatus: "failed",
        retryCount: 3,
        accuracy: "unknown",
        locationConfirmed: false,
      }),
      createTarget({
        id: "U-021",
        name: "陳先生",
        age: 67,
        role: "patient",
        signalQuality: 72,
        battery: 58,
        chronicNote: "行動不便",
        heartRate: 92,
        spo2: 96,
        replyCode: "NEED_HELP",
        replyAt: minutesAgo(0.5),
        packetSeq: 5,
        packetBytes: 124,
        ackStatus: "received",
        retryCount: 0,
        lat: 22.999,
        lng: 120.211,
        accuracy: "high",
        locationConfirmed: true,
        lastAckAt: nowIso(minutesAgo(2)),
      }),
      createTarget({
        id: "U-034",
        name: "王伯伯",
        age: 74,
        role: "patient",
        signalQuality: 76,
        battery: 49,
        chronicNote: "洗腎返家者",
        heartRate: 104,
        spo2: 94,
        replyCode: "LOCATION_UNKNOWN",
        replyAt: minutesAgo(0.5),
        packetSeq: 6,
        packetBytes: 112,
        ackStatus: "received",
        retryCount: 0,
        accuracy: "unknown",
        locationConfirmed: false,
        lastAckAt: nowIso(minutesAgo(1)),
      }),
      createTarget({
        id: "U-052",
        name: "張小姐",
        age: 31,
        role: "general",
        signalQuality: 78,
        battery: 81,
        chronicNote: "無特殊",
        heartRate: 118,
        spo2: 94,
        discomfort: true,
        replyCode: "DISCOMFORT",
        replyAt: minutesAgo(0.5),
        packetSeq: 7,
        packetBytes: 127,
        ackStatus: "received",
        retryCount: 0,
        lat: 22.996,
        lng: 120.214,
        accuracy: "high",
        locationConfirmed: true,
        lastAckAt: nowIso(minutesAgo(1)),
      }),
      createTarget({
        id: "U-DEMO",
        name: "手機實機 DEMO",
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
        lat: 22.997,
        lng: 120.212,
        accuracy: "high",
        locationConfirmed: true,
      }),
    ];

    return {
      app: APP_KIND,
      revision: 1,
      updatedAt: nowIso(),
      activeTargetId: "U-DEMO",
      selectedTargetId: "U-DEMO",
      event: {
        title: "災害安全確認事件",
        status: "待建立",
        createdAt: null,
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
          detail: "手機端與守望隊工作台讀取同一份 DemoTarget 狀態。",
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
    if (!next.event.script) {
      next.event.script = { running: false, startedAt: null, elapsedSeconds: 0, label: "尚未啟動展示模式" };
    }
    next.targets = next.targets.map((target) => {
      const route = lowData.routeForSignal(target.signalQuality);
      const normalized = {
        ...target,
        location: { lat: null, lng: null, accuracy: "unknown", confirmed: false, ...(target.location || {}) },
        medical: {
          chronicNote: "無特殊",
          heartRate: null,
          spo2: null,
          discomfort: false,
          injury: false,
          cannotMove: false,
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
          ...(target.communication || {}),
          primaryRoute: route.primaryRoute,
          fallbackRoute: route.fallbackRoute,
        },
      };
      normalized.risk = calculateRisk(normalized);
      return normalized;
    });
    return next;
  }

  function riskLevel(score) {
    if (score >= 80) return "CRITICAL";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
  }

  function addRisk(items, label, score, detail, visibleWhenZero = false) {
    if (score || visibleWhenZero) {
      items.push({ label, score, detail });
    }
  }

  function calculateRisk(target, nowMs = Date.now()) {
    const items = [];
    const latest = target.latestReply;
    const code = latest?.code || null;
    const replyScore = code ? replyScores[code] || 0 : 0;
    addRisk(items, "使用者回覆", replyScore, code ? `${latest.label} +${replyScore}` : "尚未回覆 +0", true);

    const chronic = target.role === "elder" || (target.medical.chronicNote && target.medical.chronicNote !== "無特殊");
    addRisk(items, "慢性病/高齡", chronic ? 10 : 0, chronic ? `${target.medical.chronicNote} +10` : "無特殊 +0");

    const heartRate = Number(target.medical.heartRate);
    addRisk(items, "心率異常", heartRate > 120 || heartRate < 50 ? 20 : 0, `HR ${target.medical.heartRate ?? "-"} +20`);
    addRisk(items, "血氧偏低", Number(target.medical.spo2) < 92 ? 25 : 0, `SpO2 ${target.medical.spo2 ?? "-"} +25`);
    addRisk(items, "受傷", target.medical.injury ? 25 : 0, "injury +25");
    addRisk(items, "身體不適", target.medical.discomfort ? 20 : 0, "身體不適 +20");
    addRisk(items, "無法移動", target.medical.cannotMove || code === "CANNOT_MOVE" ? 30 : 0, "無法移動 +30");

    if (target.location.confirmed && target.location.accuracy === "high") {
      addRisk(items, "GPS", 0, "GPS 已確認 high +0", true);
    } else if (target.location.confirmed && ["medium", "low"].includes(target.location.accuracy)) {
      addRisk(items, "GPS 精準度", 10, `GPS accuracy ${target.location.accuracy} +10`);
    } else {
      addRisk(items, "GPS 未確認", 25, "GPS unknown +25");
    }
    addRisk(items, "使用者表示位置不明", code === "LOCATION_UNKNOWN" ? 20 : 0, "位置不明 +20");

    const signal = Number(target.signalQuality || 0);
    const signalScore = signal >= 70 ? 0 : signal >= 40 ? 10 : 25;
    addRisk(items, "訊號品質", signalScore, signal >= 70 ? `signal ${signal}% +0` : signal >= 40 ? `signal ${signal}% +10` : `弱訊號 ${signal}% +25`, true);

    const pendingSince = target.communication.ackPendingSince || latest?.timestamp || nowMs;
    const pendingSeconds = (nowMs - new Date(pendingSince).getTime()) / 1000;
    const ackPendingTooLong = ["pending", "retrying"].includes(target.communication.ackStatus) && pendingSeconds > 20;
    addRisk(items, "ACK pending 超過 20 秒", ackPendingTooLong ? 15 : 0, "ACK pending +15");
    addRisk(items, "retry 次數", Number(target.communication.retryCount || 0) >= 2 ? 10 : 0, `retry ${target.communication.retryCount || 0} +10`);
    addRisk(items, "NO_RESPONSE 且 ACK failed", code === "NO_RESPONSE" && target.communication.ackStatus === "failed" ? 30 : 0, "NO_RESPONSE + failed +30");

    if (latest?.timestamp) {
      const minutes = (nowMs - Number(latest.timestamp)) / 60000;
      const timeScore = minutes > 10 ? 35 : minutes >= 5 ? 20 : minutes >= 3 ? 10 : 0;
      addRisk(items, "最後回覆時間", timeScore, `${Math.max(0, Math.round(minutes))} 分鐘前 +${timeScore}`);
    }

    const score = Math.min(100, items.reduce((sum, item) => sum + Number(item.score || 0), 0));
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
          item.location = { lat: 22.997, lng: 120.212, accuracy: "high", confirmed: true };
        } else {
          item.location = { lat: null, lng: null, accuracy: "unknown", confirmed: false };
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
          item.medical.heartRate = 82;
          item.medical.spo2 = 98;
        }
        if (code === "CANNOT_MOVE") {
          item.medical.cannotMove = true;
          item.medical.heartRate = Math.max(Number(item.medical.heartRate || 106), 106);
        }
        if (code === "DISCOMFORT") {
          item.medical.discomfort = true;
          item.medical.heartRate = 118;
          item.medical.spo2 = 94;
        }
        if (code === "LOCATION_UNKNOWN") {
          item.location = { lat: null, lng: null, accuracy: "unknown", confirmed: false };
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
        packet: packet.body,
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
      const packet = lowData.makePacket(target, target.latestReply.code, seq);
      addPacketLog(draft, {
        targetId: target.id,
        seq,
        attempt: retryCount + 1,
        replyCode: target.latestReply.code,
        replyLabel: target.latestReply.label,
        bytes: packet.bytes,
        packet: packet.body,
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
      fresh.event.status = "災害事件已建立";
      fresh.event.createdAt = nowIso();
      fresh.event.script = {
        running: true,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        label: "0-10 秒：建立災害事件，5 位目標進入待確認。",
      };
      addEvent(fresh, "system", "建立災害事件", "5 位目標進入待確認，U-DEMO 保留給手機實機操作。", "script");
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
      addEvent(draft, "system", "發送安全確認", "系統向 5 位目標送出低資料安全確認，後台顯示 seq 與 ACK。", "script");
    }, "script-checkin");
  }

  function applyScriptReplies() {
    const presets = [
      ["U-013", "SAFE", { signalQuality: 70, location: { lat: 22.998, lng: 120.213, accuracy: "high", confirmed: true } }],
      ["U-021", "NEED_HELP", {}],
      ["U-034", "LOCATION_UNKNOWN", {}],
      ["U-052", "DISCOMFORT", { medical: { discomfort: true, heartRate: 118, spo2: 94 } }],
    ];
    commit((draft) => {
      presets.forEach(([id, code, patch]) => {
        const target = draft.targets.find((item) => item.id === id);
        if (!target) return;
        Object.assign(target, patch);
        if (patch.location) target.location = patch.location;
        if (patch.medical) target.medical = { ...target.medical, ...patch.medical };
        target.latestReply = { code, label: lowData.replyLabels[code], timestamp: Date.now() };
        target.communication.packetSeq = Number(target.communication.packetSeq || 0) + 1;
        const packet = lowData.makePacket(target, code, target.communication.packetSeq);
        target.communication.packetBytes = packet.bytes;
        target.communication.ackStatus = "received";
        target.communication.lastAckAt = nowIso();
        target.communication.retryCount = 0;
        addPacketLog(draft, {
          targetId: target.id,
          seq: target.communication.packetSeq,
          attempt: 1,
          replyCode: code,
          replyLabel: lowData.replyLabels[code],
          bytes: packet.bytes,
          packet: packet.body,
          ack: lowData.makeAck(target.id, target.communication.packetSeq),
          status: "received",
          dedupe: "accepted",
          route: target.communication.primaryRoute,
        });
      });
      addEvent(draft, "system", "收到 4 位目標回覆", "安全、需要協助、位置不明、身體不適已進入風險排序；U-DEMO 等待手機端操作。", "script");
    }, "script-replies");
  }

  function finalizeDispatch() {
    commit((draft) => {
      draft.event.status = "建議調度已產生";
      draft.targets.forEach((target) => {
        target.risk = calculateRisk(target);
      });
      addEvent(draft, "system", "建議調度", "LOW 持續追蹤；MEDIUM 人工回撥；HIGH 派守望隊；CRITICAL 派守望隊 + 醫療救護。", "dispatch");
    }, "script-dispatch");
  }

  function refreshRiskTick() {
    commit((draft) => {
      draft.targets.forEach((target) => {
        target.risk = calculateRisk(target);
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
