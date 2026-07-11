(function (global) {
  const APP_KIND = "xingye-sea-ground-space-demo";
  const STORAGE_KEY = "xingye-sea-ground-space-state-v2";
  const CLIENT_ID_KEY = "xingye-sea-ground-space-client-id";
  const lowData = global.XY_LOW_DATA;
  const communicationEngine = global.XY_COMMUNICATION;
  const syncService = global.XY_SYNC_SERVICE;

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
    STATUS_CLEAR: 0,
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

  const defaultStarryState = {
    selectedSymptoms: [],
    symptomScore: 0,
    riskScore: 0,
    rawRiskScore: 0,
    displayRiskScore: 0,
    riskLevel: "stable",
    victimStatus: "safe",
    groundNetwork: "normal",
    packetLoss: 0,
    ackStatus: "ok",
    gpsStatus: "locked",
    activeRoute: "ground_primary",
    activeLayer: "GROUND",
    selectedRoute: "ground",
    groundAvailable: true,
    airAvailable: true,
    seaBackboneHealthy: true,
    satelliteAvailable: true,
    moduleStatuses: {
      ground: "可用／主要路徑",
      air: "待命中",
      sea: "監測中",
      space: "備援待命",
    },
    alertTriggered: false,
    lowDataMode: false,
    fallbackChannel: "BLE Relay",
    selectedChannel: "5G / LTE",
    recoveryCounter: 0,
    targetId: null,
    targetName: "",
  };

  const symptomOptions = {
    SOS_BUTTON: { label: "大型求救按鈕", score: 58, status: "sos" },
    SAFE: { label: "我安全", score: -8, status: "safe" },
    NEED_HELP: { label: "需要救援", score: 58, status: "sos" },
    INJURED: { label: "我受傷", score: 66, status: "injured" },
    TRAPPED: { label: "我被困住", score: 82, status: "trapped" },
    NEED_MEDICAL: { label: "我需要醫療", score: 74, status: "medical_risk" },
    CANNOT_TALK: { label: "無法說話", score: 62, status: "medical_risk" },
    DISCOMFORT: { label: "身體不適", score: 42, status: "medical_risk" },
  };

  const highRiskSymptoms = ["SOS_BUTTON", "NEED_HELP", "INJURED", "TRAPPED", "NEED_MEDICAL", "CANNOT_TALK", "DISCOMFORT"];
  const symptomPriority = ["SOS_BUTTON", "INJURED", "TRAPPED", "NEED_MEDICAL", "CANNOT_TALK", "NEED_HELP", "SAFE", "DISCOMFORT"];
  const replyPriority = ["SOS_BUTTON", "TRAPPED", "NEED_MEDICAL", "CANNOT_TALK", "INJURED", "NEED_HELP", "DISCOMFORT", "SAFE"];
  const manualLocationOptions = {
    HOME: { label: "我在家", source: "MANUAL_HOME", riskLabel: "manual/home" },
    SCHOOL: { label: "我在學校", source: "MANUAL_SCHOOL", riskLabel: "manual/school" },
    SHELTER: { label: "我在避難點", source: "MANUAL_SHELTER", riskLabel: "manual/shelter" },
    UNKNOWN: { label: "我不知道位置", source: "MANUAL_UNKNOWN", riskLabel: "manual/unknown" },
  };

  let demoState = normalizeState(loadLocalState() || createInitialState());
  let saveTimer = null;
  let pollTimer = null;
  let eventSource = null;
  let acceptedServerState = false;
  const listeners = new Set();
  const persistedPacketKeys = new Set();
  const transport = {
    serverAvailable: false,
    connectedClients: 0,
    lastError: null,
    applyingRemote: false,
    liveMode: "local",
  };

  function isVercelPreviewHost() {
    return /\.vercel\.app$/i.test(global.location?.hostname || "");
  }

  const broadcast = "BroadcastChannel" in global ? new BroadcastChannel("xingye-mvp-store") : null;
  if (broadcast) {
    broadcast.addEventListener("message", (event) => {
      const incoming = event.data?.state;
      if (shouldAcceptRemote(incoming, "broadcast")) {
        applyRemoteState(incoming, "broadcast");
      }
    });
  }

  global.addEventListener?.("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      if (shouldAcceptRemote(incoming, "storage")) {
        applyRemoteState(incoming, "storage");
      }
    } catch (error) {
      // Ignore malformed local storage written by older demos.
    }
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clientId() {
    try {
      let value = localStorage.getItem(CLIENT_ID_KEY);
      if (!value) {
        value = `client-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        localStorage.setItem(CLIENT_ID_KEY, value);
      }
      return value;
    } catch (error) {
      return "client-memory";
    }
  }

  function nowIso(nowMs = Date.now()) {
    return new Date(nowMs).toISOString();
  }

  function minutesAgo(minutes) {
    return Date.now() - minutes * 60000;
  }

  function roundCoordinate(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 10000) / 10000;
  }

  function accuracyMeters(value) {
    if (value === "high") return 30;
    if (value === "medium") return 120;
    if (value === "low") return 300;
    const number = Number(String(value || "").match(/[\d.]+/)?.[0]);
    return Number.isFinite(number) ? number : null;
  }

  function accuracyText(value) {
    if (value === "high" || value === "medium" || value === "low") return value;
    const meters = accuracyMeters(value);
    if (Number.isFinite(meters)) return `${Math.round(meters)}m`;
    return value || "unknown";
  }

  function stateUpdatedMs(value) {
    const time = new Date(value?.updatedAt || value?.serverUpdatedAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function shouldAcceptRemote(incoming, source = "remote") {
    if (!incoming || incoming.app !== APP_KIND) return false;
    if (source === "server-initial") return true;
    const incomingRevision = Number(incoming.revision || 0);
    const currentRevision = Number(demoState.revision || 0);
    if (incomingRevision > currentRevision) return true;
    if (incomingRevision === currentRevision && stateUpdatedMs(incoming) > stateUpdatedMs(demoState)) return true;
    return stateUpdatedMs(incoming) > stateUpdatedMs(demoState);
  }

  function normalizeSymptoms(symptoms = []) {
    const input = Array.isArray(symptoms) ? symptoms : [];
    const unique = new Set(input.filter((code) => symptomOptions[code]));
    const hasHighRisk = highRiskSymptoms.some((code) => code !== "SAFE" && unique.has(code));
    if (hasHighRisk) unique.delete("SAFE");
    return symptomPriority.filter((code) => unique.has(code));
  }

  function symptomsAfterAction(currentSymptoms = [], code) {
    if (code === "STATUS_CLEAR") return [];
    if (code === "SAFE") return ["SAFE"];
    const symptoms = new Set(normalizeSymptoms(currentSymptoms));
    if (highRiskSymptoms.includes(code)) {
      symptoms.delete("SAFE");
      symptoms.add(code);
    } else if (symptomOptions[code]) {
      symptoms.add(code);
    }
    return normalizeSymptoms([...symptoms]);
  }

  function inferSymptomsFromConfig(config = {}) {
    const symptoms = new Set();
    if (symptomOptions[config.replyCode]) symptoms.add(config.replyCode);
    if (config.replyCode === "NEED_HELP") symptoms.add("NEED_HELP");
    if (config.trapped || config.cannotMove) symptoms.add("TRAPPED");
    if (config.breathingDifficulty) symptoms.add("CANNOT_TALK");
    if (config.injury || config.replyCode === "INJURED") symptoms.add("INJURED");
    if (config.replyCode === "NEED_MEDICAL") symptoms.add("NEED_MEDICAL");
    if (config.discomfort && !symptoms.has("INJURED") && !symptoms.has("NEED_MEDICAL")) symptoms.add("DISCOMFORT");
    return normalizeSymptoms([...symptoms]);
  }

  function inferSymptomsFromTarget(target = {}) {
    const symptoms = new Set();
    const code = target.latestReply?.code;
    if (symptomOptions[code]) symptoms.add(code);
    if (target.medical?.trapped || target.medical?.cannotMove) symptoms.add("TRAPPED");
    if (target.medical?.breathingDifficulty) symptoms.add("CANNOT_TALK");
    if (target.medical?.injury || code === "INJURED") symptoms.add("INJURED");
    if (code === "NEED_MEDICAL") symptoms.add("NEED_MEDICAL");
    if (target.medical?.discomfort && !symptoms.has("INJURED") && !symptoms.has("NEED_MEDICAL")) symptoms.add("DISCOMFORT");
    return normalizeSymptoms([...symptoms]);
  }

  function calculateSymptomScore(symptoms = []) {
    return normalizeSymptoms(symptoms).reduce((sum, code) => sum + Number(symptomOptions[code]?.score || 0), 0);
  }

  function primaryReplyFromSymptoms(symptoms = []) {
    const normalized = normalizeSymptoms(symptoms);
    const primary = replyPriority.find((code) => normalized.includes(code));
    return primary || (normalized.includes("SAFE") ? "SAFE" : "STATUS_CLEAR");
  }

  function symptomLabels(symptoms = []) {
    return normalizeSymptoms(symptoms).map((code) => symptomOptions[code]?.label || lowData.replyLabels[code] || code);
  }

  function replyLabel(code) {
    return symptomOptions[code]?.label || lowData.replyLabels[code] || code;
  }

  function replyCodeFromSymptoms(symptoms = []) {
    const normalized = normalizeSymptoms(symptoms);
    return normalized.length ? primaryReplyFromSymptoms(normalized) : "STATUS_CLEAR";
  }

  function syncMedicalFromSymptoms(target) {
    const symptoms = normalizeSymptoms(target.selectedSymptoms);
    const medicalSymptoms = symptoms.filter((code) => ["INJURED", "TRAPPED", "NEED_MEDICAL", "CANNOT_TALK", "DISCOMFORT"].includes(code));
    const hasAny = medicalSymptoms.length > 0;
    const injured = symptoms.includes("INJURED") || symptoms.includes("NEED_MEDICAL");
    const discomfort = injured || symptoms.includes("DISCOMFORT");
    const trapped = symptoms.includes("TRAPPED");
    const breathingDifficulty = symptoms.includes("CANNOT_TALK") || symptoms.includes("NEED_MEDICAL");

    target.medical.discomfort = discomfort;
    target.medical.injury = injured;
    target.medical.cannotMove = trapped;
    target.medical.trapped = trapped;
    target.medical.breathingDifficulty = breathingDifficulty;
    target.medical.hypothermia = Boolean(target.medical.hypothermia && hasAny);

    if (!hasAny) {
      target.medical.heartRate = 82;
      target.medical.spo2 = 98;
      return;
    }
    if (trapped) target.medical.heartRate = Math.max(Number(target.medical.heartRate || 106), 106);
    if (discomfort || injured) {
      target.medical.heartRate = Math.max(Number(target.medical.heartRate || 112), 112);
      target.medical.spo2 = Math.min(Number(target.medical.spo2 || 95), 95);
    }
    if (breathingDifficulty) {
      target.medical.heartRate = Math.max(Number(target.medical.heartRate || 118), 118);
      target.medical.spo2 = Math.min(Number(target.medical.spo2 || 92), 92);
    }
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
      selectedSymptoms: inferSymptomsFromConfig(config),
      location: {
        lat: config.lat ?? null,
        lng: config.lng ?? null,
        accuracy: config.accuracy || "unknown",
        confirmed: Boolean(config.locationConfirmed),
        staticMinutes: Number(config.staticMinutes || 0),
        source: config.locationSource || (config.locationConfirmed ? "GPS" : "UNKNOWN"),
        updatedAt: config.locationUpdatedAt || null,
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
      workflow: {
        status: "unhandled",
        priority: "normal",
        notes: [],
        updatedAt: null,
        lastOperatorAction: null,
      },
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
          airAvailable: true,
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
    if ((!Array.isArray(next.targets) || next.targets.length === 0) && Array.isArray(next.recipients)) {
      next.targets = next.recipients;
    }
    if (next.event?.recipients && !next.event.targets) {
      next.event.targets = next.event.recipients;
    }
    delete next.recipients;
    if (next.event) delete next.event.recipients;
    if (!Array.isArray(next.targets) || next.targets.length === 0) next.targets = createInitialState().targets;
    if (!Array.isArray(next.packetLog)) next.packetLog = [];
    if (!Array.isArray(next.events)) next.events = [];
    if (!next.activeTargetId) next.activeTargetId = "U-DEMO";
    if (!next.selectedTargetId) next.selectedTargetId = next.activeTargetId;
    if (!next.event) next.event = createInitialState().event;
    if (!next.event.network) next.event.network = createInitialState().event.network;
    if (next.event.network.airAvailable === undefined) next.event.network.airAvailable = true;
    if (!next.event.script) {
      next.event.script = { running: false, startedAt: null, elapsedSeconds: 0, label: "尚未啟動展示模式" };
    }
    next.targets = next.targets.map((target) => {
      const route = lowData.routeForSignal(target.signalQuality);
      const normalized = {
        ...target,
        selectedSymptoms: Array.isArray(target.selectedSymptoms) ? normalizeSymptoms(target.selectedSymptoms) : [],
        location: {
          lat: null,
          lng: null,
          accuracy: "unknown",
          confirmed: false,
          staticMinutes: 0,
          source: null,
          updatedAt: null,
          ...(target.location || {}),
        },
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
        workflow: {
          status: "unhandled",
          priority: "normal",
          notes: [],
          updatedAt: null,
          lastOperatorAction: null,
          ...(target.workflow || {}),
        },
      };
      if (!normalized.location.source) normalized.location.source = normalized.location.confirmed ? "GPS" : "UNKNOWN";
      if (!Array.isArray(target.selectedSymptoms)) normalized.selectedSymptoms = inferSymptomsFromTarget(normalized);
      normalized.risk = calculateRisk(normalized);
      applyCommunicationDecision(normalized, next.event.network);
      return normalized;
    });
    next.starryState = buildStarryState(next);
    global.starryState = next.starryState;
    return next;
  }

  function publicRiskLevel(level) {
    const map = { GREEN: "stable", YELLOW: "watch", ORANGE: "danger", RED: "critical" };
    return map[String(level || "GREEN").toUpperCase()] || "stable";
  }

  function publicGroundNetwork(network = {}) {
    if (network.groundBackboneStatus === "down" || network.mobileAvailable === false) return "failed";
    if (
      network.groundBackboneStatus === "unstable" ||
      network.seaCableStatus === "degraded" ||
      Number(network.backbonePacketLossPercent || 0) >= 20
    ) {
      return "weak";
    }
    return "normal";
  }

  function publicAckStatus(status) {
    if (status === "received") return "ok";
    if (status === "failed") return "lost";
    return "retry";
  }

  function publicGpsStatus(location = {}) {
    if (location.source === "GPS_DENIED") return "denied";
    if (location.source === "GPS_UNAVAILABLE" || location.source === "UNAVAILABLE") return "unavailable";
    if (String(location.source || "").startsWith("MANUAL_")) return "manual";
    if (!location.confirmed) return "last_known";
    const meters = accuracyMeters(location.accuracy);
    if (location.staticMinutes >= 10 || location.accuracy === "medium" || (Number.isFinite(meters) && meters > 50)) return "drifting";
    return "locked";
  }

  function publicVictimStatus(target = {}, symptoms = []) {
    const latest = target.latestReply?.code;
    const selected = new Set(normalizeSymptoms(symptoms));
    if (selected.has("SOS_BUTTON") || selected.has("NEED_HELP") || latest === "NEED_HELP") return "sos";
    if (selected.has("TRAPPED") || target.medical?.trapped || target.medical?.cannotMove) return "trapped";
    if (selected.has("NEED_MEDICAL") || selected.has("CANNOT_TALK") || target.medical?.breathingDifficulty) return "medical_risk";
    if (selected.has("INJURED") || target.medical?.injury) return "injured";
    if (latest === "NO_RESPONSE") return "delayed";
    if (target.communication?.ackStatus === "failed") return "no_ack";
    return "safe";
  }

  function publicActiveRoute(target = {}, starry = {}) {
    const primary = target.communication?.primaryRoute;
    if (starry.victimStatus === "sos") return "sos_escalation";
    if (primary === "SATELLITE" || target.communication?.satelliteRecommended) return "satellite_backup";
    if (starry.gpsStatus !== "locked" || target.latestReply?.code === "LOCATION_UPDATE") return "gps_packet";
    if (primary === "BLE_RELAY" || primary === "SMS") return "ground_mesh";
    return "ground_primary";
  }

  function publicActiveLayer(activeRoute, groundNetwork) {
    if (activeRoute === "satellite_backup" || activeRoute === "sos_escalation") return "SPACE";
    if (groundNetwork !== "normal") return "SEA";
    return "GROUND";
  }

  function publicRouteDecision(target = {}, network = {}, starryBase = {}) {
    // Ground is primary, Air is the simulated middle relay layer, Sea is backbone health, Space is reserved fallback.
    const packetLoss = Number(network.backbonePacketLossPercent || target.communication?.packetLossRate || 0);
    const signal = Number(target.signalQuality || 0);
    const risk = String(target.risk?.level || "").toUpperCase();
    const highRisk = risk === "RED" || starryBase.riskLevel === "critical" || starryBase.victimStatus === "sos";
    const groundDown = network.groundBackboneStatus === "down" || network.mobileAvailable === false;
    const groundWeak = network.groundBackboneStatus === "unstable" || packetLoss >= 20 || signal < 45;
    const groundAvailable = !groundDown && packetLoss < 45 && signal >= 35;
    const groundHealthy = groundAvailable && !groundWeak;
    const airAvailable = network.airAvailable !== false;
    const seaBackboneHealthy = network.seaCableStatus !== "degraded" && packetLoss < 20;
    const satelliteAvailable = network.satelliteAvailable !== false;
    let selectedRoute = "queued";

    if (groundHealthy) selectedRoute = "ground";
    else if (airAvailable && (groundWeak || groundDown)) selectedRoute = "air";
    else if (highRisk && satelliteAvailable) selectedRoute = "satellite";

    const moduleStatuses = {
      ground: groundDown ? "節點不可用" : groundWeak ? "弱網／切換評估" : "可用／主要路徑",
      air: groundDown && airAvailable ? "空中中繼啟用" : groundWeak && airAvailable ? "空中中繼評估中" : airAvailable ? "待命中" : "節點不可用",
      sea: seaBackboneHealthy ? "監測中" : highRisk && !airAvailable ? "骨幹異常或監測中" : "持續監測",
      space: selectedRoute === "satellite" ? "衛星備援模擬" : "備援待命",
    };

    return {
      selectedRoute,
      groundAvailable,
      airAvailable,
      seaBackboneHealthy,
      satelliteAvailable,
      moduleStatuses,
    };
  }

  function buildStarryState(draft) {
    const target = getActiveTarget(draft) || draft.targets?.[0] || {};
    const network = draft.event?.network || {};
    const symptoms = normalizeSymptoms(target.selectedSymptoms);
    const riskLevel = publicRiskLevel(target.risk?.level);
    const groundNetwork = publicGroundNetwork(network);
    const ackStatus = publicAckStatus(target.communication?.ackStatus);
    const gpsStatus = publicGpsStatus(target.location);
    const victimStatus = publicVictimStatus(target, symptoms);
    const packetLoss = Math.round(Number(target.communication?.packetLossRate ?? network.backbonePacketLossPercent ?? 0));
    const base = {
      ...defaultStarryState,
      targetId: target.id || null,
      targetName: target.name || "",
      selectedSymptoms: symptoms,
      symptomScore: calculateSymptomScore(symptoms),
      riskScore: Number(target.risk?.score || 0),
      rawRiskScore: Number(target.risk?.rawRiskScore ?? target.risk?.score ?? 0),
      displayRiskScore: Number(target.risk?.displayRiskScore ?? target.risk?.score ?? 0),
      riskLevel,
      victimStatus,
      groundNetwork,
      packetLoss,
      ackStatus,
      gpsStatus,
      activeRoute: "ground_primary",
      activeLayer: "GROUND",
      alertTriggered:
        riskLevel === "critical" ||
        riskLevel === "danger" ||
        ["sos", "trapped", "medical_risk", "no_ack"].includes(victimStatus) ||
        ackStatus === "lost",
      lowDataMode: Boolean(target.communication?.lowDataMode),
      fallbackChannel: lowData.routeLabel(target.communication?.fallbackRoute || "NONE"),
      selectedChannel: lowData.routeLabel(target.communication?.primaryRoute || "NONE"),
      recoveryCounter: Number(target.communication?.retryCount || 0),
    };
    base.activeRoute = publicActiveRoute(target, base);
    base.activeLayer = publicActiveLayer(base.activeRoute, groundNetwork);
    Object.assign(base, publicRouteDecision(target, network, base));
    return base;
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
    target.communication.decisionReason = decision.reason || decision.summary || "";
    target.communication.scoreBreakdown = primary?.scoreBreakdown || null;
    return target;
  }

  function calculateRisk(target, nowMs = Date.now()) {
    const items = [];
    const latest = target.latestReply;
    const code = latest?.code || null;
    const selectedSymptoms = normalizeSymptoms(target.selectedSymptoms);
    const selectedSet = new Set(selectedSymptoms);
    const symptomScore = calculateSymptomScore(selectedSymptoms);
    const replyScore = selectedSymptoms.length ? 0 : code ? replyScores[code] || 0 : 0;
    addRisk(items, "使用者回覆", replyScore, code ? `${latest.label} ${replyScore >= 0 ? "+" : ""}${replyScore}` : "尚未回覆 +0", true);

    addRisk(
      items,
      "受困者按鍵區",
      symptomScore,
      symptomScore
        ? `${symptomLabels(selectedSymptoms).join("、")} = raw ${symptomScore}`
        : "尚未選擇受困症狀 +0",
      true
    );
    addRisk(items, "是否按下求救", !selectedSet.has("NEED_HELP") && !selectedSet.has("SOS_BUTTON") && code === "NEED_HELP" ? 20 : 0, "使用者按下需要救援 +20");

    const heartRate = Number(target.medical.heartRate);
    addRisk(items, "心率異常", heartRate > 120 || heartRate < 50 ? 12 : 0, `HR ${target.medical.heartRate ?? "-"} +12`);
    addRisk(items, "血氧偏低", Number(target.medical.spo2) < 92 ? 18 : 0, `SpO2 ${target.medical.spo2 ?? "-"} +18`);
    addRisk(
      items,
      "受傷",
      (target.medical.injury || code === "INJURED" || code === "NEED_MEDICAL") && !selectedSet.has("INJURED") && !selectedSet.has("NEED_MEDICAL")
        ? 24
        : 0,
      "受傷或需要醫療 +24"
    );
    addRisk(items, "呼吸困難", target.medical.breathingDifficulty && !selectedSet.has("CANNOT_TALK") && !selectedSet.has("NEED_MEDICAL") ? 28 : 0, "呼吸困難 +28");
    addRisk(
      items,
      "被困/無法移動",
      (target.medical.trapped || target.medical.cannotMove || code === "TRAPPED" || code === "CANNOT_MOVE") && !selectedSet.has("TRAPPED") ? 28 : 0,
      "被困或無法移動 +28"
    );
    addRisk(items, "失溫", target.medical.hypothermia ? 24 : 0, "疑似失溫 +24");

    const gpsMeters = accuracyMeters(target.location.accuracy);
    const hasGpsMeters = Number.isFinite(gpsMeters);
    if (target.location.confirmed && (target.location.accuracy === "high" || (hasGpsMeters && gpsMeters <= 50))) {
      addRisk(items, "GPS", -5, `GPS 已確認 ${accuracyText(target.location.accuracy)} -5`, true);
    } else if (target.location.confirmed && (target.location.accuracy === "medium" || (hasGpsMeters && gpsMeters <= 150))) {
      addRisk(items, "GPS 精準度", 6, `GPS accuracy ${accuracyText(target.location.accuracy)} +6`);
    } else if (target.location.confirmed) {
      addRisk(items, "GPS 精準度", 12, `GPS accuracy ${accuracyText(target.location.accuracy)} +12`);
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

    const rawRiskScore = items.reduce((sum, item) => sum + Number(item.score || 0), 0);
    const displayRiskScore = Math.max(0, Math.min(rawRiskScore, 100));
    const score = displayRiskScore;
    const level = riskLevel(displayRiskScore);
    const action = levelActions[level];
    return {
      score,
      rawRiskScore,
      displayRiskScore,
      level,
      reason: items.filter((item) => item.score > 0).map((item) => item.detail),
      action,
      items,
    };
  }

  function getState() {
    return demoState;
  }

  function getActiveTarget(draft = demoState) {
    return draft.targets.find((target) => target.id === draft.activeTargetId) || draft.targets[0];
  }

  function getSelectedTarget(draft = demoState) {
    return draft.targets.find((target) => target.id === draft.selectedTargetId) || getActiveTarget(draft);
  }

  function getStarryState() {
    return demoState.starryState || buildStarryState(demoState);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(meta = {}) {
    recordPersistentReportsFromState(demoState, meta.reason || "store-emit");
    listeners.forEach((listener) => listener(demoState, { ...meta, transport: { ...transport } }));
  }

  function commit(mutator, reason = "update", options = {}) {
    const draft = clone(demoState);
    const result = mutator(draft);
    const next = normalizeState(result || draft);
    if (!options.remote) {
      next.revision = Number(demoState.revision || 0) + 1;
      next.updatedAt = nowIso();
    }
    demoState = next;
    saveLocalState(demoState);
    if (!options.remote) {
      broadcast?.postMessage({ state: demoState });
      if (options.persistState === true) scheduleServerSave(reason);
    }
    emit({ reason });
    return demoState;
  }

  function applyRemoteState(incoming, reason) {
    transport.applyingRemote = true;
    demoState = normalizeState(clone(incoming));
    saveLocalState(demoState);
    recordPersistentReportsFromState(demoState, reason);
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
    saveTimer = global.setTimeout(() => persistServerState(reason), 60);
  }

  async function persistServerState(reason) {
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, state: demoState }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      transport.serverAvailable = true;
      transport.connectedClients = payload.connectedClients || 0;
      transport.lastError = null;
      transport.liveMode = eventSource ? "sse" : "poll";
      emit({ reason: "server-save" });
    } catch (error) {
      transport.serverAvailable = false;
      transport.lastError = error.message;
      emit({ reason: "server-save-failed" });
    }
  }

  function actionEnvelope(actionType, targetId, payload = {}, options = {}) {
    return {
      clientId: clientId(),
      targetId,
      actionType,
      seq: options.seq ?? payload.seq ?? payload.packetSeq ?? 0,
      idempotencyKey: options.idempotencyKey || payload.idempotencyKey,
      baseRevision: options.baseRevision ?? demoState.revision ?? 0,
      clientTimestamp: nowIso(),
      payload: {
        ...payload,
        targetId,
        actionType,
        baseRevision: options.baseRevision ?? demoState.revision ?? 0,
      },
    };
  }

  function targetPatch(target) {
    return clone({
      id: target.id,
      name: target.name,
      role: target.role,
      age: target.age,
      phoneOnline: target.phoneOnline,
      signalQuality: target.signalQuality,
      battery: target.battery,
      selectedSymptoms: target.selectedSymptoms,
      location: target.location,
      medical: target.medical,
      latestReply: target.latestReply,
      communication: target.communication,
      risk: target.risk,
      workflow: target.workflow,
      lastUpdatedAt: target.lastUpdatedAt,
    });
  }

  function latestPacketFor(targetId, seq) {
    return demoState.packetLog.find((packet) => packet.targetId === targetId && (!seq || packet.seq === seq)) || null;
  }

  function actionPatchFromState(state, targetId = state.activeTargetId) {
    return {
      targetId,
      eventPatch: clone(state.event || {}),
      targetPatches: state.targets.map(targetPatch),
      starryState: clone(state.starryState || buildStarryState(state)),
    };
  }

  function recordPersistentReport(payload = {}) {
    if (!syncService?.recordStatusReport) return;
    Promise.resolve(
      syncService.recordStatusReport({
        state: payload.state || demoState,
        target: payload.target,
        replyCode: payload.replyCode,
        packetEntry: payload.packetEntry,
        source: payload.source,
        seq: payload.seq,
      })
    ).catch((error) => {
      syncService.setNotice?.(`資料持久化失敗：${error.message}`, "warn");
    });
  }

  function replyCodeFromPacketLog(packet = {}) {
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
      return packet.decodeResult?.answerCode || packet.decodeResult?.actionCode || null;
    }
  }

  function packetSeqFromPacketLog(packet = {}) {
    return Number(packet.seq || packet.packetSeq || packet.decodeResult?.seq || packet.decodeResult?.packetSeq || 0);
  }

  function recordPersistentReportsFromState(state, reason = "remote-state") {
    if (!syncService?.recordStatusReport || !Array.isArray(state?.packetLog)) return;
    state.packetLog
      .map((packet) => ({
        packet,
        seq: packetSeqFromPacketLog(packet),
        replyCode: replyCodeFromPacketLog(packet),
      }))
      .filter(({ packet, seq, replyCode }) => packet?.targetId && seq && replyCode && Number(packet.bytes || 0) > 0)
      .slice(0, 8)
      .forEach(({ packet, seq, replyCode }) => {
        const target = state.targets.find((item) => item.id === packet.targetId);
        if (!target) return;
        const source = String(replyCode || "").startsWith("LOCATION") ? "location-update" : "mobile-reply";
        const key = `${packet.targetId}:${seq}:${source}:${replyCode}`;
        if (persistedPacketKeys.has(key)) return;
        persistedPacketKeys.add(key);
        recordPersistentReport({
          state,
          target: targetPatch(target),
          replyCode,
          packetEntry: {
            ...packet,
            seq,
            replyCode,
            replyLabel: lowData.replyLabels[replyCode] || replyCode,
          },
          source,
          seq,
          reason,
        });
      });
  }

  async function postAction(bucket, actionType, payload = {}, options = {}) {
    if (global.location?.protocol === "file:") return null;
    const targetId = payload.targetId || demoState.activeTargetId;
    const envelope = actionEnvelope(actionType, targetId, payload, options);
    try {
      const response = await fetch(`/api/actions/${bucket}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      const result = await response.json();
      transport.serverAvailable = response.ok;
      transport.connectedClients = result.publicState?.connectedClients || transport.connectedClients || 0;
      transport.lastError = response.ok ? null : result.serverAck?.message || result.error || `HTTP ${response.status}`;
      transport.liveMode = eventSource ? "sse" : "action";
      const incoming = result.publicState?.state || result.state;
      if (incoming && shouldAcceptRemote(incoming, "server-action")) {
        acceptedServerState = true;
        applyRemoteState(incoming, "server-action");
      } else {
        emit({ reason: "server-action" });
      }
      return result;
    } catch (error) {
      transport.serverAvailable = false;
      transport.lastError = error.message;
      transport.liveMode = "local";
      emit({ reason: "server-action-failed" });
      return null;
    }
  }

  async function loadServerState(options = {}) {
    if (global.location?.protocol === "file:") return;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      transport.serverAvailable = true;
      transport.connectedClients = payload.connectedClients || 0;
      transport.lastError = null;
      transport.liveMode = eventSource ? "sse" : "poll";
      const incoming = payload.state;
      if (shouldAcceptRemote(incoming, options.initial || !acceptedServerState ? "server-initial" : "server-poll")) {
        acceptedServerState = true;
        applyRemoteState(incoming, options.initial ? "server-initial" : "server-poll");
      } else if (!incoming || incoming.app !== APP_KIND) {
        scheduleServerSave("initialize-mvp-store");
      } else {
        acceptedServerState = true;
        emit({ reason: "server-poll" });
      }
    } catch (error) {
      transport.serverAvailable = false;
      transport.lastError = error.message;
      transport.liveMode = "local";
      emit({ reason: "server-unavailable" });
    }
  }

  function startEventStream() {
    if (global.location?.protocol === "file:" || !("EventSource" in global) || eventSource) return;
    if (isVercelPreviewHost()) {
      transport.liveMode = "poll";
      return;
    }
    eventSource = new EventSource("/api/events");
    eventSource.addEventListener("state", (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        transport.serverAvailable = true;
        transport.connectedClients = payload.connectedClients || 0;
        transport.lastError = null;
        transport.liveMode = "sse";
        const incoming = payload.state;
        if (shouldAcceptRemote(incoming, acceptedServerState ? "server-sse" : "server-initial")) {
          acceptedServerState = true;
          applyRemoteState(incoming, "server-sse");
        } else {
          acceptedServerState = true;
          emit({ reason: "server-sse" });
        }
      } catch (error) {
        transport.lastError = error.message;
      }
    });
    eventSource.onerror = () => {
      transport.serverAvailable = false;
      transport.liveMode = "poll";
      transport.lastError = "SSE disconnected; polling fallback active";
      emit({ reason: "server-sse-error" });
    };
  }

  function startSync() {
    startEventStream();
    loadServerState({ initial: true });
    if (!pollTimer && global.location?.protocol !== "file:") {
      pollTimer = global.setInterval(loadServerState, 500);
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
    const nowMs = Date.now();
    let actionPayload = null;
    const nextState = commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        item.signalQuality = enabled ? 32 : 78;
        item.phoneOnline = true;
      });
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      draft.selectedTargetId = target.id;
      addEvent(draft, target.id, enabled ? "切換弱訊號模擬" : "恢復良好訊號", `U-DEMO signalQuality = ${target.signalQuality}%`, "communication");
      actionPayload = {
        targetId: target.id,
        seq: Number(target.communication.packetSeq || 0),
        operation: "weak-signal",
        enabled: Boolean(enabled),
        targetPatch: targetPatch(target),
        starryState: buildStarryState(draft),
      };
    }, "weak-signal");
    if (actionPayload) {
      postAction("network", "network", actionPayload, {
        seq: actionPayload.seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:network:weak:${Boolean(enabled)}:${Math.floor(nowMs / 1200)}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
    }
  }

  function setLocation(kind, options = {}) {
    const nowMs = Date.now();
    let actionPayload = null;
    const nextState = commit((draft) => {
      let seq = 0;
      const target = updateActiveTarget(draft, (item) => {
        if (kind === "confirmed") {
          item.location = {
            lat: roundCoordinate(options.lat ?? 25.035),
            lng: roundCoordinate(options.lng ?? 121.564),
            accuracy: accuracyText(options.accuracy ?? options.accuracyMeters ?? 18),
            confirmed: true,
            staticMinutes: 0,
            source: options.source || "GPS",
            updatedAt: nowIso(nowMs),
          };
          if (!item.latestReply || item.latestReply.code === "LOCATION_UNKNOWN") {
            item.latestReply = {
              code: "LOCATION_UPDATE",
              label: lowData.replyLabels.LOCATION_UPDATE,
              timestamp: nowMs,
            };
          }
        } else if (kind === "manual") {
          item.location = {
            lat: null,
            lng: null,
            accuracy: "manual",
            confirmed: false,
            staticMinutes: 0,
            source: options.source || "MANUAL_UNKNOWN",
            manualLabel: options.label || "手動位置待確認",
            demoEstimate: false,
            updatedAt: nowIso(nowMs),
          };
          item.latestReply = {
            code: options.source === "MANUAL_UNKNOWN" ? "LOCATION_UNKNOWN" : "LOCATION_UPDATE",
            label: options.label || lowData.replyLabels.LOCATION_UNKNOWN,
            timestamp: nowMs,
          };
        } else {
          item.location = {
            lat: null,
            lng: null,
            accuracy: "unknown",
            confirmed: false,
            staticMinutes: 0,
            source: options.source || "GPS_UNAVAILABLE",
            errorCode: options.errorCode || null,
            demoEstimate: Boolean(options.demoEstimate),
            updatedAt: nowIso(nowMs),
          };
          if (options.updateReply) {
            item.latestReply = {
              code: "LOCATION_UNKNOWN",
              label: lowData.replyLabels.LOCATION_UNKNOWN,
              timestamp: nowMs,
            };
          }
        }
        seq = Number(item.communication.packetSeq || 0) + 1;
        item.communication.packetSeq = seq;
        item.communication.ackStatus = "received";
        item.communication.retryCount = 0;
        item.communication.ackPendingSince = null;
        item.communication.lastAckAt = nowIso(nowMs);
      });
      draft.selectedTargetId = target.id;
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      const replyCode = kind === "confirmed" ? "LOCATION_UPDATE" : "LOCATION_UNKNOWN";
      const packet = lowData.makePacket(target, replyCode, seq, nowMs);
      target.communication.packetBytes = packet.bytes;
      const packetEntry = {
        targetId: target.id,
        seq,
        attempt: 1,
        replyCode,
        replyLabel: lowData.replyLabels[replyCode],
        bytes: packet.bytes,
        packet: packet.preview,
        ack: lowData.makeAck(target.id, seq, nowMs),
        status: "received",
        dedupe: "accepted",
        route: target.communication.primaryRoute,
      };
      addPacketLog(draft, {
        ...packetEntry,
      });
      addEvent(
        draft,
        target.id,
        kind === "confirmed" ? "GPS confirmed" : kind === "manual" ? "手動回報位置" : target.location.source === "GPS_DENIED" ? "GPS_DENIED" : "GPS_UNAVAILABLE",
        kind === "confirmed"
          ? `GPS ${target.location.lat}, ${target.location.lng} / ${target.location.accuracy}，守望隊可使用定位輔助排序。`
          : kind === "manual"
            ? `${target.location.manualLabel}；此為手動回報，需守望隊人工確認。`
            : `${target.location.source}；封包 gps.status=${target.location.source === "GPS_DENIED" ? "denied" : "unavailable"}，風險矩陣加入 GPS 未確認。`,
        "location",
        seq
      );
      actionPayload = {
        targetId: target.id,
        seq,
        source: target.location.source,
        location: clone(target.location),
        targetPatch: targetPatch(target),
        packetLogEntry: packetEntry,
        starryState: buildStarryState(draft),
      };
    }, "location");
    if (actionPayload) {
      postAction("location", "location", actionPayload, {
        seq: actionPayload.seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:location:${actionPayload.source}:${Math.floor(nowMs / 1200)}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
      recordPersistentReport({
        state: nextState,
        target: actionPayload.targetPatch,
        replyCode: kind === "confirmed" ? "LOCATION_UPDATE" : "LOCATION_UNKNOWN",
        packetEntry: actionPayload.packetLogEntry,
        source: "location-update",
        seq: actionPayload.seq,
      });
    }
  }

  function updateMedicalFlag(flag, value) {
    const nowMs = Date.now();
    let actionPayload = null;
    const nextState = commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        const symptomCode = flag === "discomfort" ? "DISCOMFORT" : flag === "cannotMove" ? "TRAPPED" : null;
        if (symptomCode) {
          const symptoms = new Set(normalizeSymptoms(item.selectedSymptoms));
          if (value) {
            symptoms.delete("SAFE");
            symptoms.add(symptomCode);
          }
          else symptoms.delete(symptomCode);
          item.selectedSymptoms = normalizeSymptoms([...symptoms]);
        }
        item.medical[flag] = Boolean(value);
        if (flag === "discomfort" && value) {
          item.medical.heartRate = 118;
          item.medical.spo2 = 94;
        }
        if (flag === "cannotMove" && value) {
          item.medical.heartRate = Math.max(Number(item.medical.heartRate || 96), 106);
          item.medical.trapped = true;
        }
        if (flag === "cannotMove" && !value) {
          item.medical.trapped = false;
        }
        syncMedicalFromSymptoms(item);
        const primary = replyCodeFromSymptoms(item.selectedSymptoms);
        if (primary === "STATUS_CLEAR") {
          item.latestReply = null;
        } else {
          item.latestReply = {
            code: primary,
            label: replyLabel(primary),
            timestamp: Date.now(),
          };
        }
        if (!item.medical.discomfort && !item.medical.cannotMove) {
          item.medical.heartRate = 82;
          item.medical.spo2 = 98;
        }
      });
      draft.selectedTargetId = target.id;
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      addEvent(draft, target.id, "更新身體狀態", `${flag} = ${Boolean(value)}；按鍵 raw ${calculateSymptomScore(target.selectedSymptoms)}`, "medical");
      actionPayload = {
        targetId: target.id,
        seq: Number(target.communication.packetSeq || 0),
        operation: "medical-flag",
        flag,
        value: Boolean(value),
        targetPatch: targetPatch(target),
        starryState: buildStarryState(draft),
      };
    }, "medical");
    if (actionPayload) {
      postAction("medical", "medical", actionPayload, {
        seq: actionPayload.seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:medical:${flag}:${Boolean(value)}:${Math.floor(nowMs / 1200)}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
    }
  }

  function sendReply(code) {
    const nowMs = Date.now();
    let seq = 0;
    let weak = false;
    let replyCode = code;
    let actionPayload = null;
    const idempotencyWindow = Math.floor(nowMs / 1500);
    const nextState = commit((draft) => {
      const target = updateActiveTarget(draft, (item) => {
        if (symptomOptions[code]) {
          item.selectedSymptoms = symptomsAfterAction(item.selectedSymptoms, code);
          syncMedicalFromSymptoms(item);
          replyCode = replyCodeFromSymptoms(item.selectedSymptoms);
        }
        if (code === "STATUS_CLEAR") {
          item.selectedSymptoms = [];
          syncMedicalFromSymptoms(item);
          replyCode = "STATUS_CLEAR";
        }
        if (code === "LOCATION_UNKNOWN") {
          item.location = {
            lat: null,
            lng: null,
            accuracy: "unknown",
            confirmed: false,
            staticMinutes: 0,
            source: "MANUAL_UNKNOWN",
            updatedAt: nowIso(nowMs),
          };
        }
        seq = Number(item.communication.packetSeq || 0) + 1;
        item.latestReply = replyCode === "STATUS_CLEAR" ? null : { code: replyCode, label: replyLabel(replyCode), timestamp: nowMs };
        item.communication.packetSeq = seq;
        item.communication.ackStatus = Number(item.signalQuality || 0) < 40 ? "pending" : "received";
        item.communication.retryCount = 0;
        item.communication.ackPendingSince = nowMs;
        item.communication.lastAckAt = Number(item.signalQuality || 0) < 40 ? null : nowIso(nowMs);
      });
      draft.selectedTargetId = target.id;
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      const packet = lowData.makePacket(target, replyCode, seq, nowMs);
      target.communication.packetBytes = packet.bytes;
      weak = Number(target.signalQuality || 0) < 40;
      const packetEntry = {
        targetId: target.id,
        seq,
        attempt: 1,
        replyCode,
        replyLabel: replyLabel(replyCode),
        bytes: packet.bytes,
        packet: packet.preview,
        ack: weak ? null : lowData.makeAck(target.id, seq, nowMs),
        status: weak ? "pending" : "received",
        dedupe: "accepted",
        route: target.communication.primaryRoute,
      };
      addPacketLog(draft, packetEntry);
      addEvent(
        draft,
        target.id,
        replyCode === "STATUS_CLEAR" ? "清除手機端狀態" : "收到手機端回覆",
        `${target.name} ${replyCode === "STATUS_CLEAR" ? "清除所有症狀" : `回覆「${replyLabel(replyCode)}」`}，rawRiskScore ${target.risk.rawRiskScore}，displayRiskScore ${target.risk.displayRiskScore}，seq ${seq}，${packet.bytes} bytes。${weak ? "等待 ACK。" : "server ACK 已收到。"}`,
        "mobile",
        seq
      );
      if (!weak) {
        addEvent(draft, target.id, "ACK received", `後台已回 ACK：seq ${seq}`, "ack", seq);
      }
      actionPayload = {
        targetId: target.id,
        seq,
        code,
        replyCode,
        targetPatch: targetPatch(target),
        packetLogEntry: packetEntry,
        starryState: buildStarryState(draft),
      };
    }, "reply");

    if (actionPayload) {
      postAction("reply", "reply", actionPayload, {
        seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:reply:${code}:${idempotencyWindow}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
      recordPersistentReport({
        state: nextState,
        target: actionPayload.targetPatch,
        replyCode: actionPayload.replyCode,
        packetEntry: actionPayload.packetLogEntry,
        source: "mobile-reply",
        seq,
      });
    }

    if (weak) {
      global.setTimeout(() => markRetry(seq, 1), 1500);
      global.setTimeout(() => markAck(seq), 3000);
    }
  }

  function markRetry(seq, retryCount) {
    let actionPayload = null;
    const nextState = commit((draft) => {
      const target = getActiveTarget(draft);
      if (target.communication.packetSeq !== seq || target.communication.ackStatus === "received") return;
      target.communication.retryCount = retryCount;
      target.communication.ackStatus = "retrying";
      target.risk = calculateRisk(target);
      applyCommunicationDecision(target, draft.event.network);
      const retryReplyCode = target.latestReply?.code || "STATUS_CLEAR";
      const packet = lowData.makePacket(target, retryReplyCode, seq);
      const packetEntry = {
        targetId: target.id,
        seq,
        attempt: retryCount + 1,
        replyCode: retryReplyCode,
        replyLabel: target.latestReply?.label || replyLabel(retryReplyCode),
        bytes: packet.bytes,
        packet: packet.preview,
        ack: null,
        status: "retrying",
        dedupe: "same seq retry",
        route: target.communication.primaryRoute,
      };
      addPacketLog(draft, packetEntry);
      addEvent(draft, target.id, "低資料模式重送", `ACK 尚未收到，seq ${seq} 進行第 ${retryCount} 次 retry。`, "retry", seq);
      actionPayload = {
        targetId: target.id,
        seq,
        operation: "retry",
        targetPatch: targetPatch(target),
        packetLogEntry: packetEntry,
        starryState: buildStarryState(draft),
      };
    }, "retry");
    if (actionPayload) {
      postAction("reply", "retry", actionPayload, {
        seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:retry:${seq}:${retryCount}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
    }
  }

  function markAck(seq) {
    let actionPayload = null;
    const nextState = commit((draft) => {
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
      actionPayload = {
        targetId: target.id,
        seq,
        operation: "ack",
        targetPatch: targetPatch(target),
        packetLogEntry: latestPacketFor(target.id, seq),
        starryState: buildStarryState(draft),
      };
    }, "ack");
    if (actionPayload) {
      postAction("reply", "ack", actionPayload, {
        seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:ack:${seq}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
    }
  }

  function riskRank(level) {
    return { RED: 4, ORANGE: 3, YELLOW: 2, GREEN: 1 }[String(level || "GREEN").toUpperCase()] || 0;
  }

  function pickSimulationTarget(draft) {
    const active = getActiveTarget(draft);
    if (Math.random() < 0.44) return active;
    return draft.targets
      .slice()
      .sort((a, b) => riskRank(b.risk.level) - riskRank(a.risk.level) || b.risk.score - a.risk.score)[0];
  }

  function simulatePacketEvent(options = {}) {
    let actionTargetId = null;
    let actionSeq = 0;
    const nextState = commit((draft) => {
      const network = draft.event.network || {};
      const target = options.targetId
        ? draft.targets.find((item) => item.id === options.targetId) || pickSimulationTarget(draft)
        : pickSimulationTarget(draft);
      const nowMs = Date.now();
      const seq = Number(target.communication.packetSeq || 0) + 1;
      actionTargetId = target.id;
      actionSeq = seq;
      const replyCode = target.latestReply?.code || "NO_RESPONSE";

      if (!target.latestReply) {
        target.latestReply = { code: "NO_RESPONSE", label: lowData.replyLabels.NO_RESPONSE, timestamp: nowMs };
      }

      target.communication.packetSeq = seq;
      target.communication.ackPendingSince = nowMs;
      target.lastUpdatedAt = nowIso(nowMs);
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, network);

      const baseSuccess = Number(target.communication.packetSuccessRate || 70);
      const networkLoss = Number(network.backbonePacketLossPercent || 0);
      const forceLoss = Boolean(options.forceLoss);
      const success = !forceLoss && Math.random() * 100 < Math.max(8, baseSuccess - networkLoss * 0.22);
      const packet = lowData.makePacket(target, replyCode, seq, nowMs);
      target.communication.packetBytes = packet.bytes;

      addPacketLog(draft, {
        targetId: target.id,
        seq,
        attempt: Number(target.communication.retryCount || 0) + 1,
        replyCode,
        replyLabel: lowData.replyLabels[replyCode],
        bytes: packet.bytes,
        packet: packet.preview,
        ack: success ? lowData.makeAck(target.id, seq, nowMs) : null,
        status: success ? "received" : "retrying",
        dedupe: success ? "accepted" : "awaiting retry",
        route: target.communication.primaryRoute,
      });
      addEvent(draft, target.id, `packetSeq #${seq} encoded`, `${target.name} 封包 ${packet.bytes} bytes，selectedChannel ${target.communication.primaryRoute}。`, "packet", seq);

      if (success) {
        target.communication.ackStatus = "received";
        target.communication.retryCount = 0;
        target.communication.lastAckAt = nowIso(nowMs);
        target.communication.ackPendingSince = null;
        addEvent(draft, target.id, "packet delivered", `${lowData.routeLabel(target.communication.primaryRoute)} 傳送成功，latency ${target.communication.averageLatencyMs}ms。`, "ack", seq);
      } else {
        target.communication.retryCount = Number(target.communication.retryCount || 0) + 1;
        target.communication.ackStatus = target.communication.retryCount >= 3 ? "failed" : "retrying";
        target.signalQuality = Math.max(16, Number(target.signalQuality || 40) - 6);
        target.risk = calculateRisk(target, nowMs);
        applyCommunicationDecision(target, network);
        addEvent(
          draft,
          target.id,
          `${lowData.routeLabel(target.communication.primaryRoute)} packet failed`,
          `retryCount ${target.communication.retryCount}；切換/保留 fallback ${lowData.routeLabel(target.communication.fallbackRoute)}。`,
          "retry",
          seq
        );
        if (target.communication.ackStatus === "failed") {
          addEvent(draft, target.id, "switched to fallback channel", `${target.name} 連續失敗，守望隊提高重送頻率並升級通訊路徑。`, "fallback", seq);
        }
      }

      draft.targets.forEach((item) => {
        item.risk = calculateRisk(item, nowMs);
        applyCommunicationDecision(item, network);
      });
    }, options.forceLoss ? "packet-loss" : "packet-event");
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState, actionTargetId), operation: options.forceLoss ? "packet-loss" : "packet-event", seq: actionSeq }, {
      seq: actionSeq,
      idempotencyKey: `${clientId()}:simulation:${options.forceLoss ? "packet-loss" : "packet-event"}:${actionTargetId}:${actionSeq}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function simulatePacketLoss() {
    simulatePacketEvent({ forceLoss: true, targetId: demoState.activeTargetId });
  }

  function simulateGroundNetworkDown() {
    let actionSeq = 0;
    const nextState = commit((draft) => {
      const nowMs = Date.now();
      draft.event.status = "地面網路失效";
      draft.event.network.groundBackboneStatus = "down";
      draft.event.network.backboneLatencyMs = 2600;
      draft.event.network.backbonePacketLossPercent = 64;
      draft.event.network.groundCongestion = 98;
      draft.event.network.mobileAvailable = false;
      draft.event.network.airAvailable = true;
      draft.targets.forEach((target) => {
        target.signalQuality = Math.min(Number(target.signalQuality || 0), target.id === "U-DEMO" ? 28 : 38);
        target.risk = calculateRisk(target, nowMs);
        applyCommunicationDecision(target, draft.event.network);
      });
      const target = getActiveTarget(draft);
      draft.selectedTargetId = target.id;
      const seq = Number(target.communication.packetSeq || 0) + 1;
      actionSeq = seq;
      const replyCode = target.latestReply?.code || "NO_RESPONSE";
      target.communication.packetSeq = seq;
      target.communication.ackStatus = "retrying";
      target.communication.retryCount = Math.max(1, Number(target.communication.retryCount || 0));
      target.communication.ackPendingSince = nowMs;
      target.lastUpdatedAt = nowIso(nowMs);
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      const packet = lowData.makePacket(target, replyCode, seq, nowMs);
      target.communication.packetBytes = packet.bytes;
      addPacketLog(draft, {
        targetId: target.id,
        seq,
        attempt: target.communication.retryCount + 1,
        replyCode,
        replyLabel: lowData.replyLabels[replyCode],
        bytes: packet.bytes,
        packet: packet.preview,
        ack: null,
        status: "retrying",
        dedupe: "awaiting retry",
        route: target.communication.primaryRoute,
      });
      addEvent(
        draft,
        "system",
        "模擬地面網路失效",
        `5G / LTE 與 Wi-Fi 權重下降，${target.name} 封包 seq ${seq} 進入 retry，selectedChannel ${lowData.routeLabel(target.communication.primaryRoute)}。`,
        "network",
        seq
      );
    }, "ground-network-down");
    postAction("network", "network", { ...actionPatchFromState(nextState), operation: "ground-network-down", seq: actionSeq }, {
      seq: actionSeq,
      idempotencyKey: `${clientId()}:network:ground-down:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function enableSatelliteFallback() {
    const nextState = commit((draft) => {
      draft.event.status = "高風險衛星備援啟用";
      draft.event.network.satelliteAvailable = true;
      draft.event.network.airAvailable = false;
      draft.event.network.disasterMode = true;
      draft.event.network.groundBackboneStatus = "down";
      draft.event.network.backbonePacketLossPercent = Math.max(Number(draft.event.network.backbonePacketLossPercent || 0), 58);
      const target = getActiveTarget(draft);
      const nowMs = Date.now();
      target.latestReply = { code: "NEED_HELP", label: lowData.replyLabels.NEED_HELP, timestamp: nowMs };
      target.selectedSymptoms = normalizeSymptoms(["NEED_HELP", "TRAPPED", "CANNOT_TALK"]);
      target.signalQuality = 18;
      target.medical.trapped = true;
      target.medical.breathingDifficulty = true;
      target.communication.ackStatus = "failed";
      target.communication.retryCount = Math.max(4, Number(target.communication.retryCount || 0));
      target.communication.lastAckAt = nowIso(minutesAgo(12));
      target.lastUpdatedAt = nowIso(nowMs);
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      addEvent(draft, target.id, "切換高風險衛星備援", `${target.name} 進入 ${target.risk.level}，Satellite Backup 提高優先級。`, "satellite");
    }, "satellite-fallback");
    const target = getActiveTarget(nextState);
    postAction("network", "network", { ...actionPatchFromState(nextState), operation: "satellite-fallback", seq: Number(target.communication.packetSeq || 0) }, {
      seq: Number(target.communication.packetSeq || 0),
      idempotencyKey: `${clientId()}:network:satellite-fallback:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function restoreGroundNetwork() {
    const nextState = commit((draft) => {
      const nowMs = Date.now();
      draft.event.status = "地面網路恢復";
      draft.event.network.disasterMode = false;
      draft.event.network.seaCableStatus = "normal";
      draft.event.network.groundBackboneStatus = "normal";
      draft.event.network.backboneLatencyMs = 220;
      draft.event.network.backbonePacketLossPercent = 2;
      draft.event.network.groundCongestion = 18;
      draft.event.network.mobileAvailable = true;
      draft.event.network.airAvailable = true;
      draft.targets.forEach((target) => {
        if (target.id === draft.activeTargetId) target.signalQuality = Math.max(Number(target.signalQuality || 0), 78);
        target.risk = calculateRisk(target, nowMs);
        applyCommunicationDecision(target, draft.event.network);
      });
      addEvent(draft, "system", "恢復地面網路", "Wi-Fi / 5G 權重恢復，系統開始補傳本地同步佇列。", "network");
    }, "ground-network-restore");
    postAction("network", "network", { ...actionPatchFromState(nextState), operation: "ground-network-restore", seq: 0 }, {
      seq: 0,
      idempotencyKey: `${clientId()}:network:restore:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function setManualLocation(kind) {
    const option = manualLocationOptions[kind] || manualLocationOptions.UNKNOWN;
    setLocation("manual", { source: option.source, label: option.label, updateReply: true });
  }

  function updateWorkflow(operation, extra = {}) {
    const nowMs = Date.now();
    let actionPayload = null;
    const nextState = commit((draft) => {
      const target = getSelectedTarget(draft);
      target.workflow = {
        status: "unhandled",
        priority: "normal",
        notes: [],
        updatedAt: null,
        lastOperatorAction: null,
        ...(target.workflow || {}),
      };
      if (operation === "confirm-safe") {
        target.workflow.status = "processed";
        target.workflow.priority = "normal";
        target.workflow.lastOperatorAction = "標記已確認安全";
        target.latestReply = { code: "SAFE", label: replyLabel("SAFE"), timestamp: nowMs };
        target.selectedSymptoms = ["SAFE"];
        syncMedicalFromSymptoms(target);
      }
      if (operation === "follow-up") {
        target.workflow.status = "manual_followup";
        target.workflow.priority = target.risk.level === "RED" ? "high" : "normal";
        target.workflow.lastOperatorAction = "需要人工追蹤";
      }
      if (operation === "high-priority") {
        target.workflow.status = "manual_followup";
        target.workflow.priority = "high";
        target.workflow.lastOperatorAction = "標記高優先";
      }
      if (operation === "note") {
        const text = String(extra.note || "").trim();
        if (text) {
          target.workflow.notes = [{ text, timestamp: nowIso(nowMs) }, ...(target.workflow.notes || [])].slice(0, 12);
          target.workflow.lastOperatorAction = "加入備註";
        }
      }
      target.workflow.updatedAt = nowIso(nowMs);
      target.lastUpdatedAt = nowIso(nowMs);
      target.risk = calculateRisk(target, nowMs);
      applyCommunicationDecision(target, draft.event.network);
      addEvent(draft, target.id, target.workflow.lastOperatorAction || "更新守望隊處理流程", extra.note || `workflow=${target.workflow.status} / priority=${target.workflow.priority}`, "workflow");
      actionPayload = {
        targetId: target.id,
        seq: Number(target.communication.packetSeq || 0),
        operation,
        note: extra.note,
        targetPatch: targetPatch(target),
        starryState: buildStarryState(draft),
      };
    }, "workflow");
    if (actionPayload) {
      postAction("medical", "workflow", actionPayload, {
        seq: actionPayload.seq,
        idempotencyKey: `${clientId()}:${actionPayload.targetId}:workflow:${operation}:${extra.note || ""}:${Math.floor(nowMs / 1200)}`,
        baseRevision: Number(nextState.revision || 0) - 1,
      });
    }
  }

  function resetDemo() {
    const nextState = commit(() => createInitialState(), "reset");
    postAction(
      "reset",
      "reset",
      { targetId: nextState.activeTargetId, seq: 0, state: nextState, starryState: nextState.starryState },
      { seq: 0, idempotencyKey: `${clientId()}:reset:${Date.now()}`, baseRevision: Number(nextState.revision || 0) - 1 }
    );
  }

  function startScript() {
    const nextState = commit((draft) => {
      const fresh = createInitialState();
      fresh.revision = Number(draft.revision || 0);
      fresh.event.status = "災害模式啟動";
      fresh.event.createdAt = nowIso();
      fresh.event.network.disasterMode = true;
      fresh.event.network.seaCableStatus = "degraded";
      fresh.event.network.groundBackboneStatus = "unstable";
      fresh.event.network.backboneLatencyMs = 1880;
      fresh.event.network.backbonePacketLossPercent = 36;
      fresh.event.network.airAvailable = true;
      fresh.event.script = {
        running: true,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        label: "0-10 秒：災害模式啟動，海纜與地面骨幹延遲升高，5 位目標進入待確認。",
      };
      addEvent(fresh, "system", "災害模式啟動", "地震後海纜與地面骨幹不穩，系統切換低資料量封包並重新評估通訊路徑。", "script");
      return fresh;
    }, "script-start");
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState), operation: "script-start", seq: 0 }, {
      seq: 0,
      idempotencyKey: `${clientId()}:simulation:script-start:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function pauseScript() {
    const nextState = commit((draft) => {
      draft.event.script.running = false;
      draft.event.script.label = "模擬已暫停：可繼續操作手機端，或重新啟動災害模式。";
      addEvent(draft, "system", "暫停模擬", "背景封包事件已停止，手機端操作仍會同步到守望隊工作台。", "script");
    }, "script-pause");
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState), operation: "script-pause", seq: 0 }, {
      seq: 0,
      idempotencyKey: `${clientId()}:simulation:script-pause:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function setScriptPhase(elapsedSeconds, label) {
    const nextState = commit((draft) => {
      draft.event.script.elapsedSeconds = elapsedSeconds;
      draft.event.script.label = label;
      if (elapsedSeconds >= 180) draft.event.script.running = false;
    }, "script-phase");
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState), operation: "script-phase", seq: elapsedSeconds }, {
      seq: elapsedSeconds,
      idempotencyKey: `${clientId()}:simulation:script-phase:${elapsedSeconds}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function sendSafetyCheckins() {
    const nextState = commit((draft) => {
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
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState), operation: "script-checkin", seq: 0 }, {
      seq: 0,
      idempotencyKey: `${clientId()}:simulation:script-checkin:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function applyScriptReplies() {
    const presets = [
      ["U-001", "SAFE", { signalQuality: 82, location: { lat: 25.034, lng: 121.565, accuracy: "high", confirmed: true, staticMinutes: 0 } }],
      ["U-013", "NO_RESPONSE", { signalQuality: 48, location: { lat: 25.037, lng: 121.568, accuracy: "medium", confirmed: true, staticMinutes: 18 }, communication: { ackStatus: "retrying", retryCount: 1, lastAckAt: nowIso(minutesAgo(4)) } }],
      ["U-021", "NEED_HELP", { signalQuality: 24, communication: { ackStatus: "failed", retryCount: 4 }, medical: { trapped: true, breathingDifficulty: true, heartRate: 124, spo2: 91 } }],
      ["U-034", "SAFE", { battery: 14, signalQuality: 45, communication: { ackStatus: "received", retryCount: 0, lastAckAt: nowIso(minutesAgo(9)) } }],
    ];
    const nextState = commit((draft) => {
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
        target.selectedSymptoms = inferSymptomsFromTarget(target);
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
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState), operation: "script-replies", seq: 0 }, {
      seq: 0,
      idempotencyKey: `${clientId()}:simulation:script-replies:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
  }

  function finalizeDispatch() {
    const nextState = commit((draft) => {
      draft.event.status = "建議調度已產生";
      draft.targets.forEach((target) => {
        target.risk = calculateRisk(target);
        applyCommunicationDecision(target, draft.event.network);
      });
      addEvent(draft, "system", "建議調度", "Green/Yellow 優先 Wi-Fi、5G 或 SMS；Orange 啟用低資料量與主動確認；Red 優先 GPS/求救/生命狀態並建議衛星或高優先備援。", "dispatch");
    }, "script-dispatch");
    postAction("simulation", "simulation", { ...actionPatchFromState(nextState), operation: "script-dispatch", seq: 0 }, {
      seq: 0,
      idempotencyKey: `${clientId()}:simulation:script-dispatch:${Math.floor(Date.now() / 1000)}`,
      baseRevision: Number(nextState.revision || 0) - 1,
    });
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
    getStarryState,
    symptomOptions,
    manualLocationOptions,
    subscribe,
    startSync,
    loadServerState,
    actions: {
      selectTarget,
      setWeakSignal,
      setLocation,
      updateMedicalFlag,
      sendReply,
      setManualLocation,
      updateWorkflow,
      resetDemo,
      startScript,
      pauseScript,
      setScriptPhase,
      sendSafetyCheckins,
      applyScriptReplies,
      finalizeDispatch,
      simulatePacketEvent,
      simulatePacketLoss,
      simulateGroundNetworkDown,
      enableSatelliteFallback,
      restoreGroundNetwork,
      refreshRiskTick,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
