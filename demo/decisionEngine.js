(function (global) {
  const severityRules = {
    "SEV-1": {
      primaryChannel: "Push",
      fallbackChannel: ["SMS"],
      packetMode: "normal",
      ackStrategy: "single-confirm",
      watchTeamPriority: "low",
      escalationAction: "monitor only",
      userPromptStyle: "一般提醒",
    },
    "SEV-2": {
      primaryChannel: "SMS",
      fallbackChannel: ["Push"],
      packetMode: "normal",
      ackStrategy: "single-confirm",
      watchTeamPriority: "low",
      escalationAction: "monitor only",
      userPromptStyle: "一般提醒",
    },
    "SEV-3": {
      primaryChannel: "SMS",
      fallbackChannel: ["Push", "Voice IVR"],
      packetMode: "compact",
      ackStrategy: "retry-once",
      watchTeamPriority: "medium",
      escalationAction: "manual check if overdue",
      userPromptStyle: "清楚短句",
    },
    "SEV-4": {
      primaryChannel: "SMS",
      fallbackChannel: ["Voice IVR", "Satellite Relay"],
      packetMode: "low-data",
      ackStrategy: "retry-twice",
      watchTeamPriority: "high",
      escalationAction: "assign watch team",
      userPromptStyle: "大字短句",
    },
    "SEV-5": {
      primaryChannel: "SMS",
      fallbackChannel: ["Voice IVR", "Satellite Relay", "Mesh"],
      packetMode: "low-data emergency",
      ackStrategy: "continuous retry",
      watchTeamPriority: "critical",
      escalationAction: "immediate escalation + multi-channel dispatch",
      userPromptStyle: "最少互動",
    },
  };

  const actionLabels = {
    send_push: "發送 Push",
    send_sms: "發送簡訊",
    retry_ack: "重送 ACK",
    fallback_voice_ivr: "啟動語音備援",
    fallback_satellite: "保留衛星備援",
    fallback_mesh: "啟用 Mesh 備援",
    use_last_trusted_location: "使用最後可信定位",
    mark_location_uncertain: "標示位置待確認",
    watch_team_alert: "通知守望隊",
    watch_team_high_priority: "守望隊高優先處理",
    watch_team_critical: "守望隊 Critical 處理",
    reduce_interactions: "降低互動頻率",
    send_short_packet: "優先傳送短封包",
    sustained_monitoring: "進入持續監測",
  };

  const priorityRank = { low: 1, medium: 2, high: 3, critical: 4 };

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function bumpPriority(current, next) {
    return priorityRank[next] > priorityRank[current] ? next : current;
  }

  function evaluateDecision(input = {}) {
    const severityLevel = severityRules[input.severityLevel] ? input.severityLevel : "SEV-1";
    const result = JSON.parse(JSON.stringify(severityRules[severityLevel]));
    const reasonList = [`${severityLevel} 使用 ${result.primaryChannel} 為主通道，ACK 策略為 ${result.ackStrategy}。`];
    const dispatchActions = [];

    if (result.primaryChannel === "Push") dispatchActions.push("send_push");
    if (result.primaryChannel === "SMS") dispatchActions.push("send_sms");

    if (input.networkMode === "weak") {
      result.primaryChannel = "SMS";
      result.packetMode = result.packetMode === "normal" ? "compact" : result.packetMode;
      if (!result.fallbackChannel.includes("Voice IVR")) result.fallbackChannel.push("Voice IVR");
      dispatchActions.push("send_sms");
      reasonList.push("networkMode = weak，因此優先 SMS 與 compact packet。");
    }

    if (input.networkMode === "disaster" || input.networkMode === "offlineQueue") {
      result.primaryChannel = input.networkMode === "offlineQueue" ? "Satellite Relay" : "SMS";
      result.packetMode = "low-data emergency";
      result.ackStrategy = severityLevel === "SEV-5" ? "continuous retry" : "retry-twice";
      result.fallbackChannel = unique(["Voice IVR", "Satellite Relay", "Mesh"].concat(result.fallbackChannel));
      result.watchTeamPriority = bumpPriority(result.watchTeamPriority, "high");
      dispatchActions.push("send_sms", "fallback_satellite", "retry_ack");
      reasonList.push(`${input.networkMode} 模式下資料通道不穩，保留 SMS / Satellite / low-data packet。`);
    }

    if (input.ackState === "failed") {
      result.fallbackChannel = unique(["Voice IVR", "Satellite Relay"].concat(result.fallbackChannel));
      result.ackStrategy = "continuous retry";
      result.watchTeamPriority = bumpPriority(result.watchTeamPriority, "high");
      result.escalationAction = "backup channel + watch team escalation";
      dispatchActions.push("retry_ack", "fallback_voice_ivr", "watch_team_alert");
      reasonList.push("ackState = failed，因此啟用備援通道並升級守望隊。");
    } else if (input.ackState === "retrying" || input.ackState === "pending") {
      dispatchActions.push("retry_ack");
      reasonList.push(`ackState = ${input.ackState}，保留重送與去重追蹤。`);
    }

    if (input.gpsConfidence === "low" || input.gpsConfidence === "unknown") {
      dispatchActions.push("use_last_trusted_location", "mark_location_uncertain");
      result.watchTeamPriority = bumpPriority(result.watchTeamPriority, "medium");
      reasonList.push("GPS 可信度不足，使用最後可信定位並標示位置待確認。");
    }

    if (Number(input.batteryLevel || 100) < 20) {
      result.packetMode = "low-data emergency";
      result.userPromptStyle = "最少互動";
      dispatchActions.push("send_short_packet", "reduce_interactions");
      reasonList.push("batteryLevel < 20，降低互動頻率並優先傳送短封包。");
    }

    if (input.userStatus === "IMMOBILE" || input.userStatus === "HELP" || input.userStatus === "UNWELL") {
      result.watchTeamPriority = bumpPriority(result.watchTeamPriority, input.userStatus === "HELP" ? "high" : "critical");
      result.escalationAction = result.watchTeamPriority === "critical" ? "assign watch team immediately" : result.escalationAction;
      dispatchActions.push(result.watchTeamPriority === "critical" ? "watch_team_critical" : "watch_team_high_priority");
      reasonList.push(`userStatus = ${input.userStatus}，守望隊優先級提升。`);
    }

    if (input.userStatus === "SAFE" && input.ackState === "received") {
      result.watchTeamPriority = "low";
      result.escalationAction = "sustained monitoring";
      result.ackStrategy = "single-confirm";
      dispatchActions.push("sustained_monitoring");
      reasonList.push("使用者已回覆平安且 ACK received，因此降級為持續監測。");
    }

    if (result.fallbackChannel.includes("Voice IVR")) dispatchActions.push("fallback_voice_ivr");
    if (result.fallbackChannel.includes("Satellite Relay")) dispatchActions.push("fallback_satellite");
    if (result.fallbackChannel.includes("Mesh")) dispatchActions.push("fallback_mesh");
    if (result.watchTeamPriority === "critical") dispatchActions.push("watch_team_critical");
    if (result.watchTeamPriority === "high") dispatchActions.push("watch_team_high_priority");

    const cleanedActions = unique(dispatchActions);
    return {
      inputSummary: {
        severityLevel,
        networkMode: input.networkMode || "normal",
        userStatus: input.userStatus || "SAFE",
        ackState: input.ackState || "received",
        gpsConfidence: input.gpsConfidence || "high",
        batteryLevel: Number(input.batteryLevel || 100),
        slaMinutes: Number(input.slaMinutes || 5),
      },
      primaryChannel: result.primaryChannel,
      fallbackChannel: unique(result.fallbackChannel),
      packetMode: result.packetMode,
      ackStrategy: result.ackStrategy,
      watchTeamPriority: result.watchTeamPriority,
      escalationAction: result.escalationAction,
      userPromptStyle: result.userPromptStyle,
      reasonList,
      dispatchActions: cleanedActions,
      dispatchActionLabels: cleanedActions.map((action) => actionLabels[action] || action),
      decisionSummary: `主通道 ${result.primaryChannel}，備援 ${unique(result.fallbackChannel).join(" / ") || "無"}，守望隊優先級 ${result.watchTeamPriority}。`,
    };
  }

  global.XY_DECISION = {
    evaluateDecision,
    severityRules,
    actionLabels,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_DECISION;
}
