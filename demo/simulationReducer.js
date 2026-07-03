(function (global) {
  const riskEngine = global.XY_RISK;
  const packetEngine = global.XY_PACKET;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso(offsetMinutes = 0) {
    return new Date(Date.now() + offsetMinutes * 60000).toISOString();
  }

  function logTime(state) {
    const second = Math.max(0, Number(state.runtimeSecond || 0));
    return `00:${String(second).padStart(2, "0")}`;
  }

  function appendLog(state, message, detail, type = "runtime") {
    const logs = [
      {
        id: `log-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        time: logTime(state),
        message,
        detail,
        type,
      },
      ...(state.logs || []),
    ].slice(0, 18);
    return { ...state, logs };
  }

  function responseMeta(status) {
    const map = {
      safe: { label: "我安全", packetLabel: "SAFE", assessment: "我安全", batteryDelta: -1 },
      help: { label: "需要協助", packetLabel: "HELP", assessment: "需要協助", batteryDelta: -2 },
      cannotMove: { label: "無法移動", packetLabel: "MOVE", assessment: "無法移動", batteryDelta: -2 },
      medical: { label: "身體不適", packetLabel: "MED", assessment: "身體不適", batteryDelta: -3 },
      locationUnknown: { label: "位置不明", packetLabel: "GPS?", assessment: "位置不明", batteryDelta: -2 },
      noResponse: { label: "未回覆", packetLabel: "NORES", assessment: "未回覆", batteryDelta: -1 },
    };
    return map[status] || map.help;
  }

  function syncWatchUser(state) {
    const dynamic = {
      id: state.user.id,
      displayName: state.user.displayName,
      riskScore: state.risk.score,
      riskLevel: state.risk.level,
      gps: `${state.user.gps.latitude.toFixed(3)}, ${state.user.gps.longitude.toFixed(3)} / ${state.user.gps.confidence}`,
      lastReplyAt: state.user.lastReplyAt,
      communicationMethod: state.communication.strategy,
      packetLoss: state.networkMode === "weak" ? "retry observed" : state.networkMode === "offlineQueue" ? "offline queue" : "none",
      manualIntervention: state.risk.score >= 60 || state.user.responseStatus === "noResponse",
      responseStatus: state.user.responseStatus,
    };
    const users = [dynamic].concat((state.watchTeam.users || []).filter((user) => user.id !== dynamic.id));
    const alertLevel = state.watchTeam.confirmed
      ? "Confirmed"
      : state.risk.score >= 80
        ? "Critical"
        : state.risk.score >= 60
          ? "Alert"
          : "Monitoring";
    return {
      ...state,
      watchTeam: {
        ...state.watchTeam,
        alertLevel,
        users,
      },
    };
  }

  function withRisk(state) {
    const risk = riskEngine.assessRisk(state);
    return syncWatchUser({ ...state, risk });
  }

  function queuePacket(state, options = {}) {
    const packet = packetEngine.createPacket(state, options);
    const packetQueue = [packet, ...(state.communication.packetQueue || [])].slice(0, 8);
    return {
      ...state,
      communication: {
        ...state.communication,
        packetQueue,
        activePacket: packet,
        lastPacketStatus: options.status || "sending",
        ackReceived: false,
        phase: options.phase || "sending",
        packetAnimationKey: (state.communication.packetAnimationKey || 0) + 1,
      },
    };
  }

  function applyResponse(state, responseStatus) {
    const meta = responseMeta(responseStatus);
    const gps = responseStatus === "locationUnknown"
      ? { ...state.user.gps, confidence: "low", accuracyMeters: 260, lastUpdatedAt: nowIso() }
      : { ...state.user.gps, lastUpdatedAt: nowIso() };
    let next = {
      ...state,
      user: {
        ...state.user,
        responseStatus,
        selfAssessment: meta.assessment,
        lastReplyAt: responseStatus === "noResponse" ? nowIso(-18) : nowIso(),
        battery: Math.max(4, state.user.battery + meta.batteryDelta),
        gps,
      },
      watchTeam: {
        ...state.watchTeam,
        confirmed: false,
      },
    };
    next = queuePacket(next, { kind: "STATUS", label: meta.packetLabel, status: state.networkMode === "offlineQueue" ? "queued" : "sending" });
    next = appendLog(next, `使用者回覆：${meta.label}`, "建立低資料量狀態封包，等待 ACK。", "user");
    return withRisk(next);
  }

  function createInitialSimulationState() {
    const initial = {
      isRunning: false,
      runtimeSecond: 0,
      networkMode: "normal",
      muted: true,
      selectedUserId: "U-013",
      user: {
        id: "U-013",
        displayName: "林奶奶",
        battery: 72,
        gps: {
          latitude: 22.997,
          longitude: 120.212,
          accuracyMeters: 35,
          lastUpdatedAt: nowIso(-1),
          confidence: "high",
        },
        lastReplyAt: nowIso(-2),
        responseStatus: "unknown",
        selfAssessment: "尚未回覆",
        signalStrength: 82,
      },
      communication: {
        packetQueue: [],
        activePacket: null,
        lastPacketStatus: "ready",
        retryCount: 0,
        ackReceived: false,
        strategy: "Wi-Fi + 4G / 5G",
        phase: "idle",
        packetAnimationKey: 0,
      },
      watchTeam: {
        alertLevel: "Monitoring",
        assignedMember: "守望員 A",
        confirmed: false,
        replySent: false,
        lastReceivedAt: null,
        selectedUserId: "U-013",
        users: [
          {
            id: "U-009",
            displayName: "避難住戶 B",
            riskScore: 42,
            riskLevel: "Medium",
            gps: "22.994, 120.219 / medium",
            lastReplyAt: nowIso(-9),
            communicationMethod: "SMS160",
            packetLoss: "none",
            manualIntervention: false,
            responseStatus: "help",
          },
          {
            id: "U-021",
            displayName: "巡守窗口",
            riskScore: 18,
            riskLevel: "Low",
            gps: "23.001, 120.207 / high",
            lastReplyAt: nowIso(-3),
            communicationMethod: "App Push",
            packetLoss: "none",
            manualIntervention: false,
            responseStatus: "safe",
          },
        ],
      },
      risk: {
        score: 0,
        level: "Low",
        factors: [],
        updatedAt: nowIso(),
      },
      logs: [
        {
          id: "log-initial",
          time: "00:00",
          message: "模擬待命",
          detail: "按下開始模擬後，封包、ACK、風險矩陣與守望隊狀態會同步更新。",
          type: "runtime",
        },
      ],
    };
    return withRisk(initial);
  }

  function tickSimulation(state) {
    let next = {
      ...state,
      runtimeSecond: Number(state.runtimeSecond || 0) + 1,
    };
    const phase = next.runtimeSecond % 7;
    if (phase === 1) {
      next = queuePacket(next, { kind: "STATUS", label: "GPS", status: next.networkMode === "offlineQueue" ? "queued" : "sending", phase: "sending" });
      next = appendLog(next, "封包送出", "使用者端送出 GPS + STATUS 低資料封包。", "packet");
    } else if (phase === 2) {
      next = {
        ...next,
        communication: { ...next.communication, phase: "compressing", lastPacketStatus: "sending" },
      };
      next = appendLog(next, "GPS 壓縮為短格式", "lat/lng 保留三位小數，附帶 acc、status、battery 與 timestamp。", "packet");
    } else if (phase === 3) {
      if (next.networkMode === "weak") {
        next = {
          ...next,
          communication: {
            ...next.communication,
            retryCount: Math.min(4, next.communication.retryCount + 1),
            phase: "retrying",
            lastPacketStatus: "retrying",
          },
        };
        next = appendLog(next, "ACK 延遲，啟用 retry", "弱網模式下保留原封包並附 retry 標記，不直接丟棄資料。", "retry");
      } else if (next.networkMode === "offlineQueue") {
        next = {
          ...next,
          communication: { ...next.communication, phase: "queued", lastPacketStatus: "queued" },
        };
        next = appendLog(next, "離線佇列保留封包", "封包暫存於 offline queue，恢復連線後重送。", "retry");
      } else {
        next = appendLog(next, "通訊層轉送", "通訊策略維持 Wi-Fi + 4G / 5G，自動選擇可用通道。", "packet");
      }
    } else if (phase === 4) {
      next = {
        ...next,
        communication: {
          ...next.communication,
          ackReceived: true,
          lastPacketStatus: "acked",
          phase: "ack",
        },
        watchTeam: {
          ...next.watchTeam,
          lastReceivedAt: nowIso(),
        },
      };
      next = appendLog(next, "守望隊收到 ACK", "後台確認 seq 與 dedupeKey，封包狀態改為已接收。", "ack");
    } else if (phase === 5) {
      next = withRisk(next);
      next = appendLog(next, "風險矩陣重新計算", `總分 ${next.risk.score}，等級 ${next.risk.level}。`, "risk");
    } else if (phase === 6 && next.risk.score >= 60) {
      next = appendLog(next, "觸發守望隊警報", `${next.risk.level} 風險，守望隊端進入明顯警報狀態。`, "alert");
    }
    return withRisk(next);
  }

  function simulationReducer(state, event) {
    const action = event || { type: "NOOP" };
    switch (action.type) {
      case "START_SIMULATION": {
        let next = { ...state, isRunning: true };
        next = appendLog(next, "開始模擬", "啟動 runtime controller，依序送出封包、ACK 與風險判讀。", "runtime");
        return tickSimulation(next);
      }
      case "PAUSE_SIMULATION":
        return appendLog({ ...state, isRunning: false }, "暫停模擬", "目前狀態保留，可繼續操作按鈕。", "runtime");
      case "RESET_SIMULATION":
        return createInitialSimulationState();
      case "SET_WEAK_NETWORK": {
        const enabled = action.enabled ?? state.networkMode !== "weak";
        let next = {
          ...state,
          networkMode: enabled ? "weak" : "normal",
          user: {
            ...state.user,
            signalStrength: enabled ? 28 : 82,
          },
          communication: {
            ...state.communication,
            strategy: enabled ? "低資料量模式 + 重送模式" : "Wi-Fi + 4G / 5G",
            retryCount: enabled ? Math.max(1, state.communication.retryCount) : 0,
            ackReceived: enabled ? false : state.communication.ackReceived,
            lastPacketStatus: enabled ? "retrying" : "ready",
          },
        };
        next = appendLog(next, enabled ? "使用者進入弱網路模式" : "恢復一般網路", enabled ? "啟用 low-data packet、ACK 延遲與 retry 展示。" : "重送計數歸零，回到一般傳輸策略。", "network");
        return withRisk(next);
      }
      case "SET_OFFLINE_QUEUE": {
        let next = {
          ...state,
          networkMode: "offlineQueue",
          user: { ...state.user, signalStrength: 4 },
          communication: {
            ...state.communication,
            strategy: "離線佇列 + 恢復後重送",
            lastPacketStatus: "queued",
            ackReceived: false,
          },
        };
        next = appendLog(next, "切換離線佇列", "封包不消失，先排入本機佇列等待重送。", "network");
        return withRisk(next);
      }
      case "USER_REPLY_SAFE":
        return applyResponse(state, "safe");
      case "USER_REQUEST_HELP":
        return applyResponse(state, "help");
      case "USER_CANNOT_MOVE":
        return applyResponse(state, "cannotMove");
      case "USER_MEDICAL":
        return applyResponse(state, "medical");
      case "USER_LOCATION_UNKNOWN":
        return applyResponse(state, "locationUnknown");
      case "USER_NO_RESPONSE":
        return applyResponse(state, "noResponse");
      case "SEND_PACKET":
        return withRisk(appendLog(queuePacket(state, { kind: "STATUS", label: "STATUS" }), "封包重新送出", "手動建立一筆低資料狀態封包。", "packet"));
      case "RECEIVE_ACK": {
        const next = {
          ...state,
          communication: {
            ...state.communication,
            ackReceived: true,
            lastPacketStatus: "acked",
            phase: "ack",
          },
          watchTeam: {
            ...state.watchTeam,
            lastReceivedAt: nowIso(),
          },
        };
        return withRisk(appendLog(next, "收到 ACK", "守望隊端已接收最新封包。", "ack"));
      }
      case "RECALCULATE_RISK": {
        const next = withRisk(state);
        return appendLog(next, "風險矩陣重新計算", `總分 ${next.risk.score}，等級 ${next.risk.level}。`, "risk");
      }
      case "WATCH_TEAM_CONFIRM": {
        const next = {
          ...state,
          watchTeam: {
            ...state.watchTeam,
            confirmed: true,
            replySent: true,
          },
        };
        return withRisk(appendLog(next, "守望隊確認", "處理狀態改為 confirmed；風險分數不會被歸零。", "ack"));
      }
      case "TOGGLE_MUTE":
        return appendLog({ ...state, muted: !state.muted }, state.muted ? "解除靜音" : "切換靜音", state.muted ? "若瀏覽器允許，警報音可播放。" : "保留視覺警報，不播放提示音。", "alert");
      case "SELECT_WATCH_USER":
        return {
          ...state,
          watchTeam: {
            ...state.watchTeam,
            selectedUserId: action.userId || state.user.id,
          },
        };
      case "SIMULATION_TICK":
        return state.isRunning ? tickSimulation(state) : state;
      default:
        return state;
    }
  }

  global.XY_SIMULATION = {
    createInitialSimulationState,
    simulationReducer,
    clone,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_SIMULATION;
}
