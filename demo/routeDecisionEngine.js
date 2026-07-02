(function (global) {
  const data = global.XY_DATA || {};
  const channelCatalog = data.channelCatalog || [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits) {
    const scale = Math.pow(10, digits || 0);
    return Math.round(value * scale) / scale;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function networkClass(network) {
    if (network.disasterMode) return "災害模式";
    if (network.packetLossPercent > 30 || network.latencyMs > 1200) return "壅塞";
    if (network.bandwidthKbps < 64 || network.latencyMs > 800) return "弱網";
    return "正常";
  }

  function payloadMode(network) {
    if (network.bandwidthKbps < 16) return "CODE";
    if (network.bandwidthKbps < 64) return "SMS160";
    if (network.bandwidthKbps < 256) return "BRIEF";
    return "FULL";
  }

  function payloadBytes(event, network) {
    const mode = payloadMode(network);
    const base = Math.max(80, event.message.length * 2);
    if (mode === "CODE") return 42;
    if (mode === "SMS160") return Math.min(150, base);
    if (mode === "BRIEF") return Math.min(420, Math.max(180, base));
    return Math.min(1800, Math.max(680, base * 2));
  }

  function isAvailable(channel, recipient, network) {
    if (!channel.available) return false;
    if (channel.id === "push") return network.mobileAvailable && recipient.deviceProfile.smartphone;
    if (channel.id === "sms") return network.mobileAvailable && recipient.deviceProfile.featurePhone;
    if (channel.id === "ivr") return (network.mobileAvailable && recipient.deviceProfile.featurePhone) || (network.fixedLineAvailable && recipient.deviceProfile.fixedLine);
    if (channel.id === "line") return network.mobileAvailable && recipient.deviceProfile.smartphone && recipient.deviceProfile.lineUser;
    if (channel.id === "email") return (network.mobileAvailable || network.fixedLineAvailable) && recipient.deviceProfile.emailReachable;
    if (channel.id === "satellite") return network.satelliteAvailable && (recipient.deviceProfile.satelliteBeacon || recipient.role === "responder" || recipient.role === "community_guardian" || recipient.priority <= 2);
    if (channel.id === "manual") return true;
    return false;
  }

  function roleWeight(channel, recipient) {
    let score = 0;
    if (recipient.role === "elder") {
      if (channel.id === "ivr") score += 20;
      if (channel.id === "sms") score += 16;
      if (channel.id === "manual") score += 8;
      if (channel.id === "push") score -= 28;
      if (channel.id === "line") score -= 12;
    }
    if (recipient.role === "admin") {
      if (channel.id === "push") score += 10;
      if (channel.id === "email") score += 8;
    }
    if (recipient.role === "responder") {
      if (channel.id === "sms") score += 8;
      if (channel.id === "satellite") score += 8;
      if (channel.id === "manual") score += 8;
    }
    if (recipient.role === "community_guardian") {
      if (channel.id === "sms") score += 10;
      if (channel.id === "manual") score += 14;
    }
    return score;
  }

  function networkWeight(channel, event, network) {
    let score = 0;
    const weakNetwork = network.disasterMode || network.packetLossPercent > 30 || network.latencyMs > 1200;

    if (weakNetwork) {
      if (channel.id === "push" || channel.id === "line" || channel.id === "email") score -= 26;
      if (channel.id === "sms") score += 18;
      if (channel.id === "ivr") score += 15;
      if (channel.id === "satellite") score += 20;
    }

    if (network.bandwidthKbps < 64) {
      if (channel.id === "push" || channel.id === "line" || channel.id === "email") score -= 18;
      if (channel.id === "sms") score += 18;
      if (channel.id === "ivr") score += 12;
      if (channel.id === "satellite") score += 10;
    }

    if (!network.mobileAvailable) {
      if (channel.id === "push" || channel.id === "sms" || channel.id === "line") score -= 100;
      if (network.fixedLineAvailable && (channel.id === "ivr" || channel.id === "manual")) score += 28;
      if (!network.fixedLineAvailable && network.satelliteAvailable && channel.id === "satellite") score += 34;
    }

    if (network.powerRisk && (channel.id === "ivr" || channel.id === "manual")) score += 6;
    if (event.severity >= 4 && channel.suitableForEmergency) score += 14;
    if (event.severity >= 4 && channel.id === "email") score -= 12;
    if (event.severity >= 4 && network.satelliteAvailable && channel.id === "satellite") score += 14;

    return score;
  }

  function payloadWeight(channel, event, network) {
    const bytes = payloadBytes(event, network);
    if (bytes <= channel.payloadLimit) return 6;
    return -32;
  }

  function scoreChannel(channel, event, recipient, network) {
    const available = isAvailable(channel, recipient, network);
    const weakPenalty = Math.max(0, network.latencyMs - 400) / 38 + network.packetLossPercent * 0.78 + network.congestionLevel * 0.16;
    const internetPenalty = channel.requiresInternet ? weakPenalty : weakPenalty * 0.38;
    const preferred = recipient.preferredChannels.includes(channel.id) ? 12 : 0;
    const signalPenalty = recipient.lastKnownSignal === "poor" && channel.requiresInternet ? 12 : recipient.lastKnownSignal === "weak" && channel.requiresInternet ? 7 : 0;
    const base =
      channel.reliabilityScore * 0.36 +
      channel.latencyScore * 0.18 +
      channel.costScore * 0.12 +
      (channel.supportsAck ? 9 : 0) +
      preferred +
      roleWeight(channel, recipient) +
      networkWeight(channel, event, network) +
      payloadWeight(channel, event, network) -
      internetPenalty -
      signalPenalty;
    const score = available ? clamp(Math.round(base), 0, 99) : 0;
    const estimatedDeliveryRate = available ? clamp(round((score + channel.reliabilityScore) / 2 / 100, 2), 0.05, 0.99) : 0;
    const estimatedAckTime = available
      ? Math.max(1, Math.round((network.latencyMs / 1000 + (100 - channel.latencyScore) / 12 + (recipient.priority - 1) * 0.7) * 10) / 10)
      : null;

    return {
      channelId: channel.id,
      channelName: channel.name,
      tag: channel.tag,
      available,
      score,
      estimatedDeliveryRate,
      estimatedAckTime,
      reason: channelReason(channel, event, recipient, network, available, score),
    };
  }

  function channelReason(channel, event, recipient, network, available, score) {
    if (!available && channel.id === "push") return "App Push 需要行動資料與智慧型手機，目前條件不足。";
    if (!available && channel.id === "sms") return "SMS 需要行動網路與可收簡訊裝置，目前不可用。";
    if (!available && channel.id === "ivr") return "Voice IVR 需要行動語音或固網電話，目前不可用。";
    if (!available && channel.id === "satellite") return "衛星不可用或收件者沒有合適備援角色。";
    if (!available) return "通道目前不可用。";
    if (recipient.role === "elder" && (channel.id === "ivr" || channel.id === "sms")) return "長者族群提高語音與簡訊權重，避免只依賴 App 回覆。";
    if (network.disasterMode && channel.id === "satellite") return "事件啟用災害模式，衛星列入高優先備援。";
    if (network.bandwidthKbps < 64 && channel.id === "sms") return "頻寬低於 64kbps，SMS 符合低資料量 ACK。";
    if (network.latencyMs > 1200 && channel.id === "ivr") return "延遲偏高時，語音 IVR 比互動式資料通道更穩定。";
    if (score >= 75) return "通道可用、可靠度與收件者偏好皆符合。";
    return "通道可作為備援，但受網路品質、成本或 ACK 能力影響。";
  }

  function riskFlags(event, recipient, network) {
    const flags = [];
    if (event.severity >= 4) flags.push("高優先事件");
    if (network.disasterMode) flags.push("災害模式");
    if (network.bandwidthKbps < 64) flags.push("低頻寬");
    if (network.packetLossPercent > 30) flags.push("高封包遺失");
    if (network.latencyMs > 1200) flags.push("高延遲");
    if (network.congestionLevel > 75) flags.push("基地台壅塞");
    if (recipient.role === "elder") flags.push("長者需雙通道");
    if (!network.mobileAvailable) flags.push("行動網路不可用");
    if (network.powerRisk) flags.push("電力風險");
    return flags;
  }

  function selectDecision(event, recipient, network) {
    const scores = channelCatalog
      .map((channel) => scoreChannel(channel, event, recipient, network))
      .sort((a, b) => b.score - a.score || a.channelName.localeCompare(b.channelName));
    const availableScores = scores.filter((item) => item.available && item.score > 0);
    let primary = availableScores[0] || scores[0];
    let fallback = availableScores.filter((item) => item.channelId !== primary.channelId).slice(0, event.severity >= 4 ? 3 : 2);

    if (recipient.role === "elder") {
      const elderFallback = availableScores.filter((item) => ["sms", "ivr"].includes(item.channelId));
      const elderPrimary = elderFallback[0];
      if (elderPrimary && elderPrimary.score >= primary.score - 20) {
        primary = elderPrimary;
      }
      fallback = mergeFallback(fallback, elderFallback).slice(0, 3);
      if (!fallback.some((item) => ["sms", "ivr"].includes(item.channelId))) {
        primary = availableScores.find((item) => item.channelId === "sms" || item.channelId === "ivr") || primary;
      }
    }

    if (primary.channelId === "satellite" && network.mobileAvailable && recipient.role !== "responder") {
      const terrestrialPrimary = availableScores.find((item) => ["sms", "ivr"].includes(item.channelId) && item.score >= primary.score - 25);
      if (terrestrialPrimary) {
        fallback = mergeFallback(fallback, [primary]);
        primary = terrestrialPrimary;
      }
    }

    if (event.severity >= 4 && network.satelliteAvailable) {
      const satellite = availableScores.find((item) => item.channelId === "satellite");
      if (satellite && primary.channelId !== "satellite") fallback = mergeFallback(fallback, [satellite]).slice(0, 4);
    }

    if (event.severity >= 4 && fallback.length < 2) {
      const manual = scores.find((item) => item.channelId === "manual" && item.available);
      if (manual) fallback = mergeFallback(fallback, [manual]).slice(0, 3);
    }
    fallback = fallback.filter((item) => item.channelId !== primary.channelId);

    const flags = riskFlags(event, recipient, network);
    const confidence = clamp(Math.round(primary.score * 0.72 + fallback.length * 7 + (primary.estimatedDeliveryRate || 0) * 18), 20, 98);
    const estimatedDeliveryRate = clamp(round(primary.estimatedDeliveryRate + fallback.reduce((sum, item) => sum + item.estimatedDeliveryRate * 0.08, 0), 2), 0, 0.99);
    const estimatedAckTime = round(primary.estimatedAckTime + (recipient.role === "elder" ? 1.2 : 0) + (event.severity >= 4 ? -0.4 : 0), 1);

    return {
      recipientId: recipient.id,
      selectedChannel: primary.channelName,
      selectedChannelId: primary.channelId,
      fallbackChannels: fallback.map((item) => item.channelName),
      fallbackChannelIds: fallback.map((item) => item.channelId),
      confidence,
      estimatedDeliveryRate,
      estimatedAckTime: Math.max(1, estimatedAckTime),
      reason: decisionReason(event, recipient, network, primary, fallback, flags),
      riskFlags: flags,
      scores,
    };
  }

  function mergeFallback(existing, additions) {
    const seen = new Set();
    return existing.concat(additions).filter((item) => {
      if (!item || seen.has(item.channelId)) return false;
      seen.add(item.channelId);
      return true;
    });
  }

  function decisionReason(event, recipient, network, primary, fallback, flags) {
    const pieces = [
      `目前延遲 ${network.latencyMs}ms、頻寬 ${network.bandwidthKbps}kbps、封包遺失 ${network.packetLossPercent}%。`,
    ];
    if (network.disasterMode || network.packetLossPercent > 30 || network.latencyMs > 1200) {
      pieces.push("App Push 權重下降，SMS、Voice IVR 與 Satellite Relay 權重上升。");
    }
    if (network.bandwidthKbps < 64) {
      pieces.push("系統避免高流量通訊，優先低資料量 ACK。");
    }
    if (recipient.role === "elder") {
      pieces.push("長者族群不應只依賴 App 回覆，因此加入語音或簡訊備援。");
    }
    if (event.severity >= 4) {
      pieces.push(`事件等級 ${event.severity}，至少保留 ${Math.max(2, fallback.length)} 條備援路徑。`);
    }
    pieces.push(`因此對 ${recipient.name} 選擇 ${primary.channelName}${fallback.length ? `，備援為 ${fallback.map((item) => item.channelName).join("、")}` : ""}。`);
    if (flags.includes("行動網路不可用")) {
      pieces.push("行動網路不可用時，系統移除 Push、SMS 與 LINE，改走固網語音、人工或衛星。");
    }
    return pieces.join("");
  }

  function routeScenario(eventScenario, recipients, networkCondition) {
    const event = clone(eventScenario);
    const network = clone(networkCondition || event.network);
    const targetRecipients = clone(recipients || event.recipients);
    const decisions = targetRecipients.map((recipient) => selectDecision(event, recipient, network));
    const scoreTable = summarizeScores(decisions);
    const primaryChannel = topChannel(decisions.map((decision) => decision.selectedChannel));
    const fallbackChannels = summarizeFallbacks(decisions, event, network).filter((name) => name !== primaryChannel);
    const averageConfidence = Math.round(decisions.reduce((sum, decision) => sum + decision.confidence, 0) / Math.max(1, decisions.length));
    const estimatedDeliveryRate = clamp(
      round(decisions.reduce((sum, decision) => sum + decision.estimatedDeliveryRate, 0) / Math.max(1, decisions.length), 2),
      0,
      0.99
    );
    const allFlags = Array.from(new Set(decisions.flatMap((decision) => decision.riskFlags)));
    const escalationStrategy = escalationPlan(event, targetRecipients, network, fallbackChannels);

    return {
      eventId: event.id,
      eventTitle: event.heroTitle || event.title,
      networkClass: networkClass(network),
      payloadMode: payloadMode(network),
      payloadBytes: payloadBytes(event, network),
      primaryChannel,
      fallbackChannels,
      confidence: averageConfidence,
      estimatedDeliveryRate,
      estimatedAckTime: round(
        decisions.reduce((sum, decision) => sum + decision.estimatedAckTime, 0) / Math.max(1, decisions.length),
        1
      ),
      riskFlags: allFlags,
      reason: aggregateReason(event, network, primaryChannel, fallbackChannels, allFlags),
      escalationStrategy,
      scoreTable,
      decisions,
    };
  }

  function summarizeScores(decisions) {
    const totalRecipients = Math.max(1, decisions.length);
    const rows = channelCatalog.map((channel) => {
      const channelScores = decisions.map((decision) => decision.scores.find((score) => score.channelId === channel.id)).filter(Boolean);
      const score = Math.round(channelScores.reduce((sum, item) => sum + item.score, 0) / Math.max(1, channelScores.length));
      const availableCount = channelScores.filter((item) => item.available).length;
      const availableRatio = availableCount / totalRecipients;
      const averageDelay = channelScores
        .filter((item) => item.estimatedAckTime !== null)
        .reduce((sum, item, _index, list) => sum + item.estimatedAckTime / Math.max(1, list.length), 0);
      const topReason = channelScores.slice().sort((a, b) => b.score - a.score)[0];
      return {
        id: channel.id,
        name: channel.name,
        tag: channel.tag,
        availability: Math.round(availableRatio * 100),
        weakNetworkFit: weakNetworkFitLabel(channel, score),
        elderFit: elderFitLabel(channel),
        ackSupport: channel.supportsAck ? "支援" : "不支援",
        estimatedDelay: availableCount ? `${round(averageDelay, 1)} 分` : "不可用",
        cost: costLabel(channel.costScore),
        score,
        availableCount,
        status: scoreStatus(score, availableCount),
        reason: topReason ? topReason.reason : "未評分",
      };
    });
    return rows.sort((a, b) => b.score - a.score);
  }

  function weakNetworkFitLabel(channel, score) {
    if (score <= 0) return "不可用";
    if (["sms", "ivr", "satellite", "manual"].includes(channel.id)) return score >= 70 ? "高" : "中";
    if (channel.requiresInternet) return score >= 70 ? "中" : "低";
    return "中";
  }

  function elderFitLabel(channel) {
    if (channel.id === "ivr") return "高";
    if (channel.id === "sms" || channel.id === "manual") return "中高";
    if (channel.id === "push" || channel.id === "line") return "低";
    return "中";
  }

  function costLabel(score) {
    if (score >= 85) return "低";
    if (score >= 60) return "中";
    return "高";
  }

  function scoreStatus(score, availableCount) {
    if (!availableCount || score <= 0) return "不可用";
    if (score >= 78) return "建議";
    if (score >= 55) return "備援";
    return "觀察";
  }

  function topChannel(names) {
    const counts = names.reduce((map, name) => {
      map[name] = (map[name] || 0) + 1;
      return map;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "-";
  }

  function summarizeFallbacks(decisions, event, network) {
    const weakOrDisaster = network.disasterMode || network.bandwidthKbps < 64 || network.latencyMs > 800 || event.severity >= 4;
    const resilientNames = new Set(["SMS", "Voice IVR", "Satellite Relay", "Manual Call"]);
    const counts = decisions
      .flatMap((decision) => decision.fallbackChannels)
      .filter((name) => !weakOrDisaster || resilientNames.has(name))
      .reduce((map, name) => {
        map[name] = (map[name] || 0) + 1;
        return map;
      }, {});
    const smsFirst = !network.disasterMode && network.bandwidthKbps >= 256 && network.latencyMs < 600;
    const priority = {
      SMS: smsFirst ? 1 : 2,
      "Voice IVR": smsFirst ? 2 : 1,
      "Satellite Relay": 3,
      "Manual Call": 4,
      Email: 5,
      "App Push": 6,
      LINE: 7,
    };
    return Object.entries(counts)
      .sort((a, b) => (priority[a[0]] || 99) - (priority[b[0]] || 99) || b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([name]) => name);
  }

  function escalationPlan(event, recipients, network, fallbackChannels) {
    const elderCount = recipients.filter((recipient) => recipient.role === "elder").length;
    const guardianCount = recipients.filter((recipient) => recipient.role === "community_guardian").length;
    const parts = [];
    if (event.severity >= 4) parts.push("主要通道失敗時立即切換第一備援，不等待完整 SLA。");
    if (elderCount) parts.push("長者 5 分鐘內未 ACK，升級通知家屬或社區守望者。");
    if (guardianCount) parts.push("社區守望者同步進入未確認名單。");
    if (network.satelliteAvailable && fallbackChannels.includes("Satellite Relay")) parts.push("災害模式保留 Satellite Relay 作為最後備援。");
    if (!parts.length) parts.push("未確認者進入二次提醒，管理端可手動重新派送。");
    return parts.join("");
  }

  function aggregateReason(event, network, primaryChannel, fallbackChannels, flags) {
    const fallbackText = fallbackChannels.length ? fallbackChannels.join("、") : "無";
    const modeText = flags.includes("災害模式") ? "系統啟用災害模式，" : "";
    return `${modeText}事件等級 ${event.severity}，網路狀態為${networkClass(network)}。目前延遲 ${network.latencyMs}ms、頻寬 ${network.bandwidthKbps}kbps、封包遺失 ${network.packetLossPercent}%，因此推薦主通道 ${primaryChannel}，備援通道 ${fallbackText}。`;
  }

  const actionSeverity = {
    SAFE_OK: 1,
    NEED_HELP: 3,
    CANNOT_TALK: 4,
    NEED_MEDICAL: 5,
    LOCATION_ANOMALY: 4,
  };

  const actionBaseRisk = {
    SAFE_OK: 5,
    NEED_HELP: 45,
    CANNOT_TALK: 60,
    NEED_MEDICAL: 75,
    LOCATION_ANOMALY: 55,
  };

  const TRIAGE_FLOWS = {
    SAFE_OK: {
      title: "平安確認",
      questions: [
        {
          id: "SAFE_Q1",
          text: "是否需要稍後再次提醒您回報？",
          answers: [
            { code: "SAFE_DONE", label: "不用，現在平安", riskDelta: -10, nextQuestionId: null, nextActionHint: "記錄平安 ACK，不進入高優先待處理。" },
            { code: "SAFE_REMIND", label: "稍後再提醒", riskDelta: 0, nextQuestionId: null, nextActionHint: "保留低優先提醒，不升級。" },
            { code: "SAFE_TO_HELP", label: "其實需要協助", riskDelta: 40, nextQuestionId: null, escalateTo: "NEED_HELP", nextActionHint: "升級為需要協助，建立後續安全確認。" },
          ],
        },
      ],
    },
    NEED_HELP: {
      title: "安全確認",
      questions: [
        {
          id: "HELP_Q1",
          text: "您現在是否有立即危險？",
          answers: [
            { code: "HELP_NO_DANGER", label: "沒有立即危險", riskDelta: 0, nextQuestionId: "HELP_Q2", nextActionHint: "持續低資料按鍵確認。" },
            { code: "HELP_DANGER", label: "有危險", riskDelta: 25, nextQuestionId: "HELP_Q2", nextActionHint: "提高人工介入優先序。" },
            { code: "HELP_UNSURE", label: "不確定", riskDelta: 15, nextQuestionId: "HELP_Q2", nextActionHint: "以人工確認安全狀態。" },
          ],
        },
        {
          id: "HELP_Q2",
          text: "您身邊有人可以協助嗎？",
          answers: [
            { code: "HELP_WITH_PERSON", label: "有人在旁邊", riskDelta: -10, nextQuestionId: "HELP_Q3", nextActionHint: "可請身邊協助者留意。" },
            { code: "HELP_ALONE", label: "我一個人", riskDelta: 15, nextQuestionId: "HELP_Q3", nextActionHint: "建議人工聯繫守護者。" },
            { code: "HELP_PERSON_UNSURE", label: "不確定", riskDelta: 10, nextQuestionId: "HELP_Q3", nextActionHint: "確認身邊協助者狀態。" },
          ],
        },
        {
          id: "HELP_Q3",
          text: "您希望後台怎麼聯繫？",
          answers: [
            { code: "HELP_TEXT", label: "用文字", riskDelta: 0, nextQuestionId: null, nextActionHint: "以 LOW_DATA_TEXT 持續確認。" },
            { code: "HELP_CALL_OK", label: "可以通話", riskDelta: -5, nextQuestionId: null, nextActionHint: "可由後台人工聯繫，但保留低資料 ACK。" },
            { code: "HELP_NO_CALL", label: "不要通話", riskDelta: 10, nextQuestionId: null, nextActionHint: "避免語音作為主要方式。" },
          ],
        },
      ],
    },
    CANNOT_TALK: {
      title: "無法通話確認",
      questions: [
        {
          id: "TALK_Q1",
          text: "您現在可以看手機文字嗎？",
          answers: [
            { code: "TALK_TEXT_OK", label: "可以", riskDelta: 0, nextQuestionId: "TALK_Q2", nextActionHint: "持續文字確認。" },
            { code: "TALK_TEXT_HARD", label: "很困難", riskDelta: 15, nextQuestionId: "TALK_Q2", nextActionHint: "降低文字負擔並提高人工追蹤。" },
            { code: "TALK_TEXT_UNSURE", label: "不確定", riskDelta: 20, nextQuestionId: "TALK_Q2", nextActionHint: "提高人工確認優先序。" },
          ],
        },
        {
          id: "TALK_Q2",
          text: "您身邊有人可以幫忙看手機嗎？",
          answers: [
            { code: "TALK_HELPER_NEAR", label: "有人可以", riskDelta: -10, nextQuestionId: "TALK_Q3", nextActionHint: "可請身邊協助者留意手機。" },
            { code: "TALK_ALONE", label: "我一個人", riskDelta: 20, nextQuestionId: "TALK_Q3", nextActionHint: "建議人工聯繫守護者。" },
            { code: "TALK_HELPER_UNSURE", label: "不確定", riskDelta: 10, nextQuestionId: "TALK_Q3", nextActionHint: "確認是否有協助者。" },
          ],
        },
        {
          id: "TALK_Q3",
          text: "是否需要後台改用文字持續確認？",
          answers: [
            { code: "TALK_NEED_TEXT", label: "需要", riskDelta: 5, nextQuestionId: null, nextActionHint: "以 LOW_DATA_TEXT / SMS_SIMULATED 持續確認。" },
            { code: "TALK_NO_TEXT", label: "暫時不用", riskDelta: 0, nextQuestionId: null, nextActionHint: "保留低資料 ACK 追蹤。" },
            { code: "TALK_CANNOT_DECIDE", label: "我無法判斷", riskDelta: 20, nextQuestionId: null, nextActionHint: "建議人工介入確認。" },
          ],
        },
      ],
    },
    NEED_MEDICAL: {
      title: "醫療協助確認",
      questions: [
        {
          id: "MED_Q1",
          text: "您現在還能繼續點選手機回覆嗎？",
          answers: [
            { code: "MED_CAN_REPLY", label: "可以", riskDelta: 0, nextQuestionId: "MED_Q2", nextActionHint: "持續低資料按鍵確認。" },
            { code: "MED_REPLY_HARD", label: "很困難", riskDelta: 25, nextQuestionId: "MED_Q2", nextActionHint: "建議立即守護者確認。" },
            { code: "MED_REPLY_UNSURE", label: "無法確認", riskDelta: 30, nextQuestionId: "MED_Q2", nextActionHint: "建議立即守護者確認。" },
          ],
        },
        {
          id: "MED_Q2",
          text: "您身邊有人可以協助留意嗎？",
          answers: [
            { code: "MED_WITH_PERSON", label: "有人在旁邊", riskDelta: -10, nextQuestionId: "MED_Q3", nextActionHint: "請身邊協助者留意並等待後台聯繫。" },
            { code: "MED_ALONE", label: "我一個人", riskDelta: 25, nextQuestionId: "MED_Q3", nextActionHint: "建議優先人工聯繫與守護者確認。" },
            { code: "MED_PERSON_UNSURE", label: "不確定", riskDelta: 15, nextQuestionId: "MED_Q3", nextActionHint: "確認是否有身邊協助者。" },
          ],
        },
        {
          id: "MED_Q3",
          text: "您目前所在位置是否安全？",
          answers: [
            { code: "MED_PLACE_SAFE", label: "安全", riskDelta: -5, nextQuestionId: "MED_Q4", nextActionHint: "持續低資料確認並等待後台聯繫。" },
            { code: "MED_PLACE_UNSAFE", label: "不安全", riskDelta: 25, nextQuestionId: "MED_Q4", nextActionHint: "提高人工確認位置與守護者聯繫。" },
            { code: "MED_PLACE_UNSURE", label: "不確定", riskDelta: 15, nextQuestionId: "MED_Q4", nextActionHint: "建議人工確認位置安全。" },
          ],
        },
        {
          id: "MED_Q4",
          text: "是否需要後台立即請指定守護者聯繫？",
          answers: [
            { code: "MED_NEED_CONTACT_NOW", label: "需要立即聯繫", riskDelta: 20, nextQuestionId: null, nextActionHint: "優先人工聯繫指定守護者。" },
            { code: "MED_CAN_WAIT", label: "可以等待確認", riskDelta: 0, nextQuestionId: null, nextActionHint: "持續低資料追蹤與人工確認。" },
            { code: "MED_CANNOT_DECIDE", label: "我無法判斷", riskDelta: 20, nextQuestionId: null, nextActionHint: "建議人工介入並請守護者確認。" },
          ],
        },
      ],
    },
    LOCATION_ANOMALY: {
      title: "位置確認",
      questions: [
        {
          id: "LOC_Q1",
          text: "您現在是在家中或熟悉地點嗎？",
          answers: [
            { code: "LOC_FAMILIAR", label: "在家 / 熟悉地點", riskDelta: -10, nextQuestionId: "LOC_Q2", nextActionHint: "標示位置較可信，持續確認。" },
            { code: "LOC_UNFAMILIAR", label: "不在熟悉地點", riskDelta: 20, nextQuestionId: "LOC_Q2", nextActionHint: "建議人工確認位置。" },
            { code: "LOC_UNKNOWN", label: "我不知道", riskDelta: 25, nextQuestionId: "LOC_Q2", nextActionHint: "提高位置確認優先級。" },
          ],
        },
        {
          id: "LOC_Q2",
          text: "您可以留在目前安全位置嗎？",
          answers: [
            { code: "LOC_CAN_STAY", label: "可以", riskDelta: 0, nextQuestionId: "LOC_Q3", nextActionHint: "請留在安全位置等待確認。" },
            { code: "LOC_CANNOT_STAY", label: "不方便", riskDelta: 15, nextQuestionId: "LOC_Q3", nextActionHint: "建議人工確認位置與協助者。" },
            { code: "LOC_STAY_UNSURE", label: "不確定", riskDelta: 10, nextQuestionId: "LOC_Q3", nextActionHint: "持續位置安全確認。" },
          ],
        },
        {
          id: "LOC_Q3",
          text: "是否需要後台請守護者協助確認位置？",
          answers: [
            { code: "LOC_NEED_GUARDIAN", label: "需要", riskDelta: 15, nextQuestionId: null, nextActionHint: "請守護者協助確認位置。" },
            { code: "LOC_NO_GUARDIAN", label: "暫時不用", riskDelta: 0, nextQuestionId: null, nextActionHint: "保留低資料位置確認紀錄。" },
            { code: "LOC_CANNOT_DECIDE", label: "我無法判斷", riskDelta: 15, nextQuestionId: null, nextActionHint: "建議人工確認位置。" },
          ],
        },
      ],
    },
  };

  const channelNames = {
    appPush: "App Push",
    sms: "SMS",
    voiceIvr: "Voice IVR",
    line: "LINE",
    email: "Email",
    satelliteRelay: "Satellite Relay",
    manualCall: "Manual Call",
  };

  function routeActionDecision(input) {
    const action = input.action || input.actionCode || "SAFE_OK";
    const network = normalizeNetworkInput(input.network || {});
    const recipient = normalizeRecipientInput(input.recipient || {});
    const channels = input.channels || {};
    const ack = input.ack || {};
    const location = normalizeLocationInput(input.location || {});
    const triageFlow = normalizeTriageFlowInput(input.triageFlow || {});
    const scenario = normalizeScenarioInput(input.scenario || {});
    const effectiveAction = effectiveActionFor(action, triageFlow);
    const severity = Number(input.severity || input.eventSeverity || actionSeverity[effectiveAction] || actionSeverity[action] || 1);
    const conversation = normalizeConversationInput(input.conversation || {}, triageFlow);
    const triage = normalizeTriageInput(input.triage || {}, conversation, triageFlow);
    const disasterMode = Boolean(input.disasterMode ?? scenario.disasterMode);
    const priority = actionChannelPriority(effectiveAction);
    const scores = [
      scoreActionChannel("appPush", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
      scoreActionChannel("sms", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
      scoreActionChannel("voiceIvr", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
      scoreActionChannel("line", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
      scoreActionChannel("email", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
      scoreActionChannel("satelliteRelay", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
      scoreActionChannel("manualCall", effectiveAction, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow, triage, scenario),
    ].sort((a, b) => b.score - a.score || (priority[a.channel] || 99) - (priority[b.channel] || 99) || a.channel.localeCompare(b.channel));
    const available = scores.filter((item) => item.available && item.score > 0);
    const primary = available[0] || scores[0];
    const backup = available.filter((item) => item.channel !== primary.channel).slice(0, severity >= 4 ? 3 : 2);
    const risk = actionRiskDetails(effectiveAction, severity, disasterMode, network, recipient, ack, location, conversation, triageFlow, triage, scenario);
    const riskScore = risk.finalScore;
    const nextQuestion = nextQuestionForTriage(triageFlow);
    const escalationRequired =
      riskScore >= 60 ||
      effectiveAction !== "SAFE_OK" ||
      ack.lastStatus === "timeout" ||
      ack.status === "timeout" ||
      ack.status === "retrying" ||
      Number(ack.retryCount || 0) >= 2 ||
      conversationRequiresEscalation(effectiveAction, conversation, location, triageFlow);
    const nextActions = nextActionsFor(effectiveAction, escalationRequired, location, conversation, triageFlow);
    const ackPlan = ackPlanFor(effectiveAction, severity, network, ack, conversation, triageFlow);
    const dispatchSuggestion = dispatchSuggestionFor(effectiveAction, riskScore, location, conversation, triageFlow);
    const recommendedOperatorAction = recommendedOperatorActionFor(effectiveAction, riskScore, location, conversation, triageFlow);

    return {
      action: effectiveAction,
      originalAction: action,
      primaryChannel: primary.name,
      backupChannels: backup.map((item) => item.name),
      escalationRequired,
      escalationReason: escalationRequired ? escalationReasonFor(effectiveAction, ack, location, conversation, triageFlow) : "低風險 ACK 已記錄，持續監測即可。",
      riskScore,
      riskTier: risk.tier,
      baseScore: risk.baseScore,
      totalDelta: risk.totalDelta,
      finalRiskScore: risk.finalScore,
      scoringMatrix: risk.scoringMatrix,
      riskReasons: risk.reasons,
      riskModifiers: risk.modifiers,
      recentRiskDelta: risk.lastAnswerDelta,
      nextQuestion,
      recommendedAction: recommendedOperatorAction,
      recommendedOperatorAction,
      routeScoreTable: scores,
      decisionReason: decisionReasonForAction(effectiveAction, severity, network, primary, backup, riskScore, conversation, triageFlow, risk),
      nextActions,
      ackPlan,
      dispatchSuggestion,
      communicationWarnings: communicationWarningsFor(recipient, effectiveAction),
      locationWarnings: locationWarningsFor(location, effectiveAction),
      conversation: conversationSummary(conversation, triageFlow),
      whyNotOtherChannels: scores
        .filter((item) => item.channel !== primary.channel)
        .slice(-3)
        .map((item) => `${item.name}：${item.reason}`),
    };
  }

  function actionChannelPriority(action) {
    if (action === "NEED_MEDICAL") return { sms: 1, manualCall: 2, satelliteRelay: 3, voiceIvr: 4, line: 5, appPush: 6, email: 7 };
    if (action === "CANNOT_TALK") return { sms: 1, manualCall: 2, line: 3, appPush: 4, satelliteRelay: 5, email: 6, voiceIvr: 7 };
    if (action === "LOCATION_ANOMALY") return { sms: 1, manualCall: 2, appPush: 3, line: 4, satelliteRelay: 5, voiceIvr: 6, email: 7 };
    if (action === "SAFE_OK") return { appPush: 1, sms: 2, line: 3, email: 4, voiceIvr: 5, manualCall: 6, satelliteRelay: 7 };
    return { sms: 1, voiceIvr: 2, manualCall: 3, satelliteRelay: 4, appPush: 5, line: 6, email: 7 };
  }

  function normalizeNetworkInput(network) {
    const rawLoss = Number(network.packetLossRate ?? network.packetLossPercent ?? 0);
    return {
      bandwidthKbps: Number(network.bandwidthKbps ?? 128),
      latencyMs: Number(network.latencyMs ?? 400),
      packetLossRate: rawLoss <= 1 ? Math.round(rawLoss * 1000) / 10 : rawLoss,
      baseStationCongestion: Number(network.baseStationCongestion ?? network.congestionLevel ?? 30),
      sseConnected: network.sseConnected !== false,
    };
  }

  function normalizeRecipientInput(recipient) {
    const hasGuardian = Boolean(recipient.guardianPhoneMasked || recipient.guardianContactMasked || recipient.guardianName);
    const preferredChannels = Array.isArray(recipient.preferredChannels) ? recipient.preferredChannels : [];
    return {
      ...recipient,
      canUseVoice: recipient.canUseVoice !== false,
      canUseText: recipient.canUseText !== false,
      elderFriendly: recipient.elderFriendly !== false,
      preferredChannels,
      communicationProfileComplete: recipient.communicationProfileComplete ?? Boolean(hasGuardian && preferredChannels.length && recipient.phoneMasked),
      guardianPhoneMasked: recipient.guardianPhoneMasked || recipient.guardianContactMasked || "",
    };
  }

  function normalizeLocationInput(location) {
    const source = location.source || (location.gpsDenied ? "GPS_DENIED" : location.simulated ? "SAME_LAN_SIMULATED" : location.lat || location.lng ? "GPS" : "UNKNOWN");
    const accuracy = Number(location.accuracy ?? location.accuracyMeters ?? 0);
    return {
      ...location,
      source,
      accuracy,
      simulated: Boolean(location.simulated || source === "SAME_LAN_SIMULATED" || source === "DEMO_FALLBACK"),
      sameLan: Boolean(location.sameLan),
      confidence: Number(location.confidence ?? (source === "GPS" && accuracy && accuracy <= 80 ? 0.9 : location.sameLan ? 0.72 : source === "UNKNOWN" ? 0.2 : 0.45)),
      isAnomaly: Boolean(location.isAnomaly || location.anomaly),
      gpsDenied: Boolean(location.gpsDenied || source === "GPS_DENIED"),
      distanceToHelperKm: Number(location.distanceToHelperKm ?? location.helperDistanceKm ?? 0),
    };
  }

  function normalizeScenarioInput(scenario) {
    return {
      disasterMode: Boolean(scenario.disasterMode),
      powerRisk: Boolean(scenario.powerRisk),
      mobileNetworkRisk: Boolean(scenario.mobileNetworkRisk),
      satelliteAvailable: Boolean(scenario.satelliteAvailable),
      disasterCountdownState: scenario.disasterCountdownState || "idle",
    };
  }

  function normalizeTriageInput(triage, conversation, triageFlow) {
    const answerCodes = new Set((triageFlow.answers || []).map((answer) => answer.answerCode));
    const lastAnswerCode = triage.lastAnswerCode || triageFlow.lastAnswerCode || conversation.lastAnswerCode || null;
    return {
      lastAnswerCode,
      elderResponded: Boolean(triage.elderResponded ?? conversation.elderResponded),
      alone: Boolean(triage.alone || answerCodes.has("MED_ALONE") || answerCodes.has("HELP_ALONE") || answerCodes.has("TALK_ALONE")),
      unableToRespond: Boolean(triage.unableToRespond || conversation.unableToRespond),
      safetyConfirmed: Boolean(triage.safetyConfirmed || conversation.safetyConfirmed),
      unansweredCount: Number(triage.unansweredCount ?? triageFlow.unansweredCount ?? 0),
    };
  }

  function normalizeTriageFlowInput(flow) {
    const answers = Array.isArray(flow.answers)
      ? flow.answers.map((answer) => {
          const answerCode = answer.answerCode || answer.code || answer.ans;
          const definition = answerDefinition(flow.flowId || flow.actionCode, answer.questionId, answerCode);
          return {
            questionId: answer.questionId || answer.q || definition?.questionId || null,
            answerCode,
            label: answer.label || definition?.label || answerCode || "",
            riskDelta: Number(answer.riskDelta ?? definition?.riskDelta ?? 0),
            nextActionHint: answer.nextActionHint || definition?.nextActionHint || "",
            answeredAt: answer.answeredAt || null,
          };
        })
      : [];
    const lastAnswer = answers[answers.length - 1] || null;
    const flowId = flow.flowId || flow.actionCode || null;
    const questionIds = questionIdsForFlow(flowId);
    return {
      flowId,
      title: flow.title || TRIAGE_FLOWS[flowId]?.title || "",
      currentQuestionId: flow.currentQuestionId || null,
      completedQuestionIds: Array.isArray(flow.completedQuestionIds) ? flow.completedQuestionIds : answers.map((answer) => answer.questionId).filter(Boolean),
      lastAnswerCode: flow.lastAnswerCode || lastAnswer?.answerCode || null,
      lastAnswerLabel: flow.lastAnswerLabel || lastAnswer?.label || null,
      answers,
      unansweredCount: Number(flow.unansweredCount || 0),
      flowComplete: Boolean(flow.flowComplete),
      questionCount: questionIds.length,
      escalatedTo: flow.escalatedTo || null,
    };
  }

  function effectiveActionFor(action, triageFlow) {
    if (triageFlow.escalatedTo) return triageFlow.escalatedTo;
    if (triageFlow.answers.some((answer) => answer.answerCode === "SAFE_TO_HELP")) return "NEED_HELP";
    return triageFlow.flowId && TRIAGE_FLOWS[triageFlow.flowId] ? triageFlow.flowId : action;
  }

  function questionIdsForFlow(flowId) {
    return (TRIAGE_FLOWS[flowId]?.questions || []).map((question) => question.id);
  }

  function questionDefinition(flowId, questionId) {
    return (TRIAGE_FLOWS[flowId]?.questions || []).find((question) => question.id === questionId) || null;
  }

  function answerDefinition(flowId, questionId, answerCode) {
    const flows = flowId && TRIAGE_FLOWS[flowId] ? [TRIAGE_FLOWS[flowId]] : Object.values(TRIAGE_FLOWS);
    for (const flow of flows) {
      for (const question of flow.questions || []) {
        if (questionId && question.id !== questionId) continue;
        const answer = (question.answers || []).find((item) => item.code === answerCode);
        if (answer) return { ...answer, questionId: question.id };
      }
    }
    return null;
  }

  function nextQuestionForTriage(triageFlow) {
    if (!triageFlow.flowId || triageFlow.flowComplete) return null;
    const question = questionDefinition(triageFlow.flowId, triageFlow.currentQuestionId);
    if (!question) return null;
    const questionIds = questionIdsForFlow(triageFlow.flowId);
    const index = Math.max(0, questionIds.indexOf(question.id));
    return {
      flowId: triageFlow.flowId,
      title: TRIAGE_FLOWS[triageFlow.flowId].title,
      questionId: question.id,
      text: question.text,
      index: index + 1,
      total: questionIds.length,
      answers: question.answers.map((answer) => ({
        code: answer.code,
        label: answer.label,
        riskDelta: answer.riskDelta,
        nextActionHint: answer.nextActionHint,
      })),
    };
  }

  function normalizeConversationInput(conversation, triageFlow = {}) {
    const lastCode = triageFlow.lastAnswerCode;
    const lastLabel = triageFlow.lastAnswerLabel || conversation.lastQuickReply || null;
    const hardCodes = new Set(["MED_REPLY_HARD", "MED_REPLY_UNSURE", "TALK_TEXT_HARD", "TALK_TEXT_UNSURE", "TALK_CANNOT_DECIDE"]);
    const unableCodes = new Set(["MED_REPLY_UNSURE", "TALK_CANNOT_DECIDE", "LOC_CANNOT_DECIDE", "MED_CANNOT_DECIDE"]);
    const safetyCodes = new Set(["SAFE_DONE", "HELP_NO_DANGER", "MED_PLACE_SAFE", "LOC_FAMILIAR"]);
    return {
      hasActiveThread: Boolean(conversation.hasActiveThread || triageFlow.flowId),
      lastReplyFromElderAt: conversation.lastReplyFromElderAt || null,
      elderResponded: Boolean(conversation.elderResponded || triageFlow.answers?.length),
      lastQuickReply: lastLabel,
      lastAnswerCode: lastCode || null,
      unansweredOperatorMessages: Number(conversation.unansweredOperatorMessages || 0),
      unansweredMinutes: Number(conversation.unansweredMinutes || 0),
      safetyConfirmed: Boolean(conversation.safetyConfirmed || safetyCodes.has(lastCode) || triageFlow.answers?.some((answer) => answer.answerCode === "SAFE_DONE")),
      unableToRespond: Boolean(conversation.unableToRespond || hardCodes.has(lastCode) || unableCodes.has(lastCode)),
    };
  }

  function scoreActionChannel(channel, action, severity, disasterMode, network, recipient, channels, ack, location, conversation, triageFlow = {}, triage = {}, scenario = {}) {
    const weakNetwork = disasterMode || network.bandwidthKbps < 64 || network.latencyMs > 900 || network.packetLossRate > 18 || scenario.mobileNetworkRisk;
    const canUseVoice = recipient.canUseVoice !== false;
    const canUseText = recipient.canUseText !== false;
    const textChannel = ["sms", "appPush", "line", "email"].includes(channel);
    let available = channels[channel] !== false;
    if (channel === "voiceIvr" && !canUseVoice) available = false;
    if (textChannel && !canUseText) available = false;
    let score = available ? 50 : 0;
    const reasons = [];
    const elderFriendly = recipient.elderFriendly !== false;
    const preferred = recipient.preferredChannels || [];

    if (!available) reasons.push("通道目前不可用。");
    if (channel === "sms") {
      score += weakNetwork ? 28 : 12;
      if (canUseText) score += 10;
      if (preferred.includes("sms") || preferred.includes("LOW_DATA_TEXT")) score += 8;
      reasons.push("低資料量、可 ACK，弱網下可靠。");
    }
    if (channel === "appPush") {
      score += weakNetwork ? -34 : 22;
      if (!network.sseConnected) score -= 14;
      reasons.push(weakNetwork ? "弱網或災害模式下不可作為唯一通道。" : "網路正常時低成本且可追蹤。");
    }
    if (channel === "voiceIvr") {
      score += elderFriendly ? 14 : 4;
      if (action === "CANNOT_TALK" || triageFlow.answers?.some((answer) => ["HELP_NO_CALL", "TALK_NEED_TEXT", "TALK_CANNOT_DECIDE"].includes(answer.answerCode))) {
        score -= 45;
        reasons.push("使用者回報無法通話，語音不可作為主要回覆方式。");
      } else if (conversation.unableToRespond) {
        score -= 32;
        reasons.push("對話狀態顯示長者無法確認或無法回覆，語音不作主要方式。");
      } else if (canUseVoice) {
        score += severity >= 4 ? 12 : 4;
        reasons.push("可作長者友善備援。");
      } else {
        score -= 30;
        reasons.push("使用者不適合語音。");
      }
      if (channel === "voiceIvr" && !canUseVoice) score = 0;
    }
    if (channel === "line") {
      score += weakNetwork ? -22 : 8;
      reasons.push("社群備援，但弱網與長者情境可靠度較低。");
    }
    if (channel === "email") {
      score += severity >= 3 ? -18 : 4;
      reasons.push("適合紀錄，不適合即時救援 ACK。");
    }
    if (channel === "satelliteRelay") {
      score += disasterMode && severity >= 4 ? 20 : -10;
      reasons.push("災害備援，不預設可用。");
    }
    if (channel === "manualCall") {
      score += severity >= 4 ? 24 : 4;
      if (action === "NEED_MEDICAL") score += 18;
      if (ack.lastStatus === "timeout" || ack.status === "timeout" || ack.status === "retrying") score += 14;
      if (conversation.lastQuickReply === "我一個人" || triage.alone) score += 14;
      if (conversation.unansweredOperatorMessages > 0 && !conversation.elderResponded) score += 12;
      reasons.push("高風險或無 ACK 時建議人工介入。");
    }
    if (action === "NEED_MEDICAL" && ["sms", "manualCall"].includes(channel)) score += 16;
    if (action === "LOCATION_ANOMALY" && ["sms", "manualCall"].includes(channel)) score += 10;
    if (conversation.hasActiveThread && channel === "sms") score += 6;
    if (conversation.safetyConfirmed && channel === "manualCall" && action !== "NEED_MEDICAL") score -= 10;
    if (action === "SAFE_OK" && channel === "manualCall") score -= 22;
    if ((location.simulated || location.gpsDenied || location.source === "UNKNOWN") && location.confidence < 0.6 && channel === "manualCall") score += 6;
    if (!recipient.communicationProfileComplete && channel === "manualCall") score += 4;

    return {
      channel,
      name: channelNames[channel],
      available,
      score: available ? clamp(Math.round(score), 0, 99) : 0,
      reason: reasons.join(" "),
    };
  }

  function actionRiskDetails(action, severity, disasterMode, network, recipient, ack, location, conversation, triageFlow, triage = {}, scenario = {}) {
    const baseScore = actionBaseRisk[action] ?? 30;
    const scoringMatrix = [];
    const addFactor = (factor, currentValue, scoreDelta, reason, confidence = "medium") => {
      scoringMatrix.push({ factor, currentValue, scoreDelta: Number(scoreDelta || 0), reason, confidence });
    };
    addFactor("事件類型", action, baseScore, `${action} 基礎風險`, "high");
    addFactor("事件嚴重度", `SEV-${severity}`, severity >= 5 ? 10 : severity >= 4 ? 6 : severity <= 1 ? -3 : 0, "事件等級提高處理優先序", "high");
    addFactor("災害模式", disasterMode ? "開啟" : "關閉", disasterMode ? 10 : 0, disasterMode ? "弱網與通訊壅塞風險提高" : "未啟用災害模式", "high");
    addFactor("網路頻寬", `${network.bandwidthKbps}kbps`, network.bandwidthKbps < 64 ? 5 : 0, network.bandwidthKbps < 64 ? "頻寬低於 64kbps，偏向低資料文字封包" : "頻寬足以承載一般摘要封包", "high");
    addFactor("延遲", `${network.latencyMs}ms`, network.latencyMs > 900 ? 5 : 0, network.latencyMs > 900 ? "延遲偏高，互動式資料通道可靠度下降" : "延遲在 demo 可接受範圍", "high");
    addFactor("封包遺失率", `${network.packetLossRate}%`, network.packetLossRate > 18 ? 5 : 0, network.packetLossRate > 18 ? "封包遺失偏高，需要 serverAck / retry / dedupe" : "封包遺失未達高風險門檻", "high");
    addFactor("基地台壅塞", `${network.baseStationCongestion || 0}%`, network.baseStationCongestion > 70 ? 5 : 0, network.baseStationCongestion > 70 ? "基地台壅塞提高通訊失敗風險" : "基地台壅塞未達高風險門檻", "medium");
    const ackStatus = ack.status || ack.lastStatus || (ack.received ? "acknowledged" : "waiting_ack");
    addFactor(
      "ACK 狀態",
      ackStatus,
      ack.received ? -10 : ackStatus === "timeout" ? 18 : ackStatus === "retrying" ? 12 : ack.received === false ? 8 : 0,
      ack.received ? "已確認訊號送達" : "尚未取得完整 serverAck",
      "high"
    );
    addFactor("是否可通話", recipient.canUseVoice ? "可通話" : "不可通話", recipient.canUseVoice ? -2 : 8, recipient.canUseVoice ? "語音可作備援" : "Voice IVR 不可作為主要方式", "high");
    addFactor("是否可文字", recipient.canUseText ? "可文字" : "不可文字", recipient.canUseText ? -6 : 10, recipient.canUseText ? "弱網下可使用低資料文字" : "文字通道不可用，提高人工確認風險", "high");
    addFactor(
      "長者最近回答",
      triage.elderResponded ? triage.lastAnswerCode || "已回覆" : "未回覆",
      (triage.elderResponded ? -5 : conversation.hasActiveThread ? 10 : 0) + (triage.unableToRespond ? 20 : 0) + (triage.safetyConfirmed ? -15 : 0),
      triage.unableToRespond ? "長者回覆困難或無法確認" : triage.safetyConfirmed ? "已收到安全確認" : "安全對答狀態影響風險",
      "medium"
    );
    addFactor("是否獨自一人", triage.alone ? "我一個人" : "未回報獨自一人", triage.alone ? 25 : 0, triage.alone ? "缺乏現場協助" : "尚未顯示獨自一人", "medium");
    const locationLabel = locationLabelFor(location);
    addFactor("位置來源", locationLabel, locationDeltaFor(location), locationReasonFor(location), location.source === "GPS" ? "high" : "medium");
    addFactor("GPS 精準度", accuracyLabel(location), gpsAccuracyDelta(location), gpsAccuracyReason(location), location.source === "GPS" ? "high" : "low");
    addFactor("位置是否異常", location.isAnomaly || action === "LOCATION_ANOMALY" ? "異常" : "未標記異常", location.isAnomaly || action === "LOCATION_ANOMALY" ? 20 : 0, "位置異常需人工確認", "medium");
    addFactor("最近協助者距離", helperDistanceLabel(location), helperDistanceDelta(location), "協助者距離影響人工跟進優先序", "medium");
    addFactor(
      "通訊資料完整度",
      recipient.communicationProfileComplete ? "完整" : "缺漏 / 待確認",
      recipient.communicationProfileComplete ? -5 : 12,
      recipient.communicationProfileComplete ? "可聯繫指定守護者" : "守護者或首選通道資料待確認",
      "high"
    );
    addFactor(
      "未回覆時間",
      `${conversation.unansweredMinutes || 0} 分鐘 / ${conversation.unansweredOperatorMessages || 0} 則`,
      conversation.unansweredOperatorMessages > 0 ? Math.min(24, conversation.unansweredOperatorMessages * 7 + (conversation.unansweredMinutes >= 5 ? 8 : 0)) : 0,
      "後台訊息未回覆會提高追蹤優先序",
      "medium"
    );
    addFactor("retry 次數", Number(ack.retryCount || 0), Math.min(20, Number(ack.retryCount || 0) * 5), "retry 次數增加代表鏈路不穩", "high");

    const modifiers = scoringMatrix.slice(1).filter((item) => item.scoreDelta).map((item) => ({ label: item.factor, delta: item.scoreDelta }));
    for (const answer of triageFlow.answers || []) {
      const label = answer.label || answer.answerCode;
      if (Number(answer.riskDelta || 0)) {
        modifiers.push({ label: `按鍵回覆：${label}`, delta: Number(answer.riskDelta || 0) });
      }
    }
    if (triageFlow.answers?.some((answer) => ["LOC_UNKNOWN", "LOC_UNFAMILIAR"].includes(answer.answerCode))) modifiers.push({ label: "位置不確定", delta: 10 });
    if (triageFlow.answers?.some((answer) => ["MED_PLACE_UNSAFE"].includes(answer.answerCode))) modifiers.push({ label: "目前位置不安全", delta: 10 });
    if (triageFlow.answers?.some((answer) => ["MED_NEED_CONTACT_NOW", "LOC_NEED_GUARDIAN"].includes(answer.answerCode))) modifiers.push({ label: "要求立即聯繫", delta: 5 });
    if (scenario.powerRisk) modifiers.push({ label: "電力風險", delta: 5 });
    if (scenario.mobileNetworkRisk) modifiers.push({ label: "行動網路風險", delta: 5 });
    const totalDelta = modifiers.reduce((sum, item) => sum + item.delta, 0);
    let finalScore = clamp(Math.round(baseScore + totalDelta), 0, 100);
    if (action === "NEED_MEDICAL" && conversation.safetyConfirmed) finalScore = Math.max(55, Math.min(finalScore, 79));
    const lastAnswer = (triageFlow.answers || [])[triageFlow.answers.length - 1];
    const reasons = [`${action} base ${baseScore}`].concat(modifiers.map((item) => `${item.label} ${item.delta > 0 ? "+" : ""}${item.delta}`));
    return {
      baseScore,
      totalDelta,
      scoringMatrix,
      modifiers,
      finalScore,
      tier: riskTier(finalScore),
      reasons,
      lastAnswerDelta: lastAnswer ? Number(lastAnswer.riskDelta || 0) : 0,
    };
  }

  function actionRiskScore(action, _severity, disasterMode, network, recipient, ack, location, conversation) {
    return actionRiskDetails(action, _severity || actionSeverity[action] || 1, disasterMode, network, normalizeRecipientInput(recipient || {}), ack || {}, normalizeLocationInput(location || {}), conversation || {}, {}, {}).finalScore;
  }

  function locationLabelFor(location) {
    if (location.source === "GPS") return "GPS";
    if (location.gpsDenied || location.source === "GPS_DENIED") return "GPS 權限拒絕";
    if (location.sameLan || location.source === "SAME_LAN_SIMULATED") return "同網路模擬";
    if (location.source === "DEMO_FALLBACK") return "demo fallback profile";
    return "位置待確認";
  }

  function locationDeltaFor(location) {
    if (location.source === "GPS" && location.accuracy && location.accuracy <= 80) return -8;
    if (location.source === "GPS") return 2;
    if (location.gpsDenied || location.source === "GPS_DENIED") return 10;
    if (location.sameLan || location.source === "SAME_LAN_SIMULATED") return 4;
    if (location.source === "DEMO_FALLBACK") return 8;
    return 15;
  }

  function locationReasonFor(location) {
    if (location.source === "GPS" && location.accuracy && location.accuracy <= 80) return "GPS 定位可信度較高，降低位置不確定風險";
    if (location.source === "GPS") return "GPS 已取得但精準度需檢查";
    if (location.gpsDenied || location.source === "GPS_DENIED") return "使用者未授權 GPS，需低資料對答確認位置";
    if (location.sameLan || location.source === "SAME_LAN_SIMULATED") return "GPS 尚未取得，改用同網路模擬定位";
    return "沒有可確認的位置來源";
  }

  function accuracyLabel(location) {
    if (!location.accuracy) return "無資料";
    return `±${Math.round(location.accuracy)}m`;
  }

  function gpsAccuracyDelta(location) {
    if (location.source !== "GPS") return location.source === "UNKNOWN" ? 5 : 0;
    if (location.accuracy <= 50) return -5;
    if (location.accuracy <= 150) return 3;
    return 12;
  }

  function gpsAccuracyReason(location) {
    if (location.source !== "GPS") return "GPS 未提供精準度";
    if (location.accuracy <= 50) return "位置可信度較高";
    if (location.accuracy <= 150) return "可用但仍建議人工確認";
    return "GPS 精準度偏低，位置確認優先級提高";
  }

  function helperDistanceLabel(location) {
    if (!location.distanceToHelperKm) return "未知";
    return `${round(location.distanceToHelperKm, 1)}km`;
  }

  function helperDistanceDelta(location) {
    if (!location.distanceToHelperKm) return 5;
    if (location.distanceToHelperKm <= 1.5) return -4;
    if (location.distanceToHelperKm >= 5) return 8;
    return 0;
  }

  function communicationWarningsFor(recipient, action) {
    const warnings = [];
    if (!recipient.communicationProfileComplete) warnings.push("通訊資料缺漏，請人工確認 recipient profile。");
    if (!recipient.guardianPhoneMasked && action === "NEED_MEDICAL") warnings.push("NEED_MEDICAL 但缺守護者 masked phone，建議人工確認通訊資料。");
    if (recipient.canUseVoice === false) warnings.push("不可通話，Voice IVR 不可作為唯一主要方式。");
    if (recipient.canUseText === false) warnings.push("不可文字，低資料按鍵回覆需備援人工確認。");
    warnings.push("此 demo 未連接真實 SMS、119、醫療或推播服務。");
    return warnings;
  }

  function locationWarningsFor(location, action) {
    const warnings = [];
    if (location.source === "GPS" && location.accuracy) warnings.push(`GPS 定位已取得，精準度約 ±${Math.round(location.accuracy)} 公尺。`);
    if (location.gpsDenied || location.source === "GPS_DENIED") warnings.push("使用者未授權 GPS，請以低資料對答確認位置。");
    if (location.simulated || location.sameLan) warnings.push("此為 demo 推測定位，非真實 GPS。");
    if (location.source === "UNKNOWN") warnings.push("位置待確認。");
    if (action === "LOCATION_ANOMALY" || location.isAnomaly) warnings.push("位置異常已提高人工位置確認優先級。");
    return warnings;
  }

  function riskTier(score) {
    if (score >= 80) return "緊急優先";
    if (score >= 60) return "高風險";
    if (score >= 30) return "中風險";
    return "低風險";
  }

  function triageDedupeStatus(seen, packet, nowMs = Date.now(), windowMs = 15000) {
    const key = packet.d || packet.dedupeKey || [
      packet.r || packet.recipientId,
      packet.a || packet.action,
      packet.seq || packet.sequence || "-",
      packet.q || packet.questionId || "-",
      packet.ans || packet.answerCode || "-",
    ].join("|");
    const previous = seen[key];
    const duplicate = typeof previous === "number" && nowMs - previous <= windowMs;
    if (!duplicate) seen[key] = nowMs;
    return {
      key,
      duplicate,
      status: duplicate ? 202 : 200,
      message: duplicate ? "duplicate ACK" : "serverAck OK",
    };
  }

  function decisionReasonForAction(action, severity, network, primary, backup, riskScore, conversation, triageFlow, risk) {
    const backupText = backup.length ? backup.map((item) => item.name).join("、") : "無";
    const convoText = conversation.hasActiveThread
      ? `對話狀態：${conversation.elderResponded ? `長者已回覆 ${conversation.lastQuickReply || ""}` : "尚未收到長者回覆"}，${conversation.safetyConfirmed ? "已安全確認" : "尚未安全確認"}。`
      : "尚未建立安全確認對話。";
    const triageText = triageFlow.flowId
      ? `安全對答：${triageFlow.title || triageFlow.flowId}，完成 ${triageFlow.completedQuestionIds.length}/${triageFlow.questionCount}，最近答案 ${triageFlow.lastAnswerLabel || "尚無"}。`
      : "";
    const reasonText = (risk?.reasons || []).slice(0, 5).join("、");
    return `Action ${action}，SEV-${severity}，風險 ${riskScore}（${riskTier(riskScore)}）。目前頻寬 ${network.bandwidthKbps}kbps、延遲 ${network.latencyMs}ms、封包遺失 ${network.packetLossRate}%，因此主通道採 ${primary.name}，備援 ${backupText}。${convoText}${triageText}風險原因：${reasonText}。${primary.reason}`;
  }

  function escalationReasonFor(action, ack, location, conversation, triageFlow = {}) {
    if (conversation.unansweredOperatorMessages > 0 && !conversation.elderResponded) return "後台模擬訊息尚未收到長者回覆，建議升級處理。";
    if (conversation.lastQuickReply === "我一個人" || triageFlow.answers?.some((answer) => ["MED_ALONE", "HELP_ALONE", "TALK_ALONE"].includes(answer.answerCode))) return "長者回覆我一個人，需優先人工聯繫並確認守護者協助。";
    if (["我無法確認", "我無法回覆", "我無法判斷"].includes(conversation.lastQuickReply)) return "長者無法確認安全狀態，需升級人工追蹤。";
    if (triageFlow.answers?.some((answer) => ["MED_REPLY_HARD", "MED_REPLY_UNSURE"].includes(answer.answerCode))) return "長者回覆困難，建議立即守護者確認。";
    if (triageFlow.answers?.some((answer) => answer.answerCode === "LOC_UNKNOWN")) return "位置不確定，建議人工確認位置。";
    if (action === "NEED_MEDICAL") return "需要醫療協助，需守護指揮中心人工追蹤與守護者模擬通知。";
    if (action === "CANNOT_TALK") return "使用者無法通話，避免語音作為主要回覆，改用文字與人工追蹤。";
    if (action === "LOCATION_ANOMALY") return `位置狀態需確認；目前為${location.simulated ? "模擬推估" : "未知"}定位，不可視為真實 GPS。`;
    if (action === "NEED_HELP") return "使用者需要協助，若後續無 ACK 則升級。";
    if (ack.lastStatus === "timeout") return "ACK 逾時，需升級備援。";
    return "需持續追蹤。";
  }

  function ackPlanFor(action, severity, network, ack, conversation, triageFlow = {}) {
    const deadline = action === "NEED_MEDICAL" ? 2 : severity >= 4 ? 5 : 10;
    return {
      required: action !== "SAFE_OK" || ack.required !== false,
      deadlineMinutes: deadline,
      retryCount: Number(ack.retryCount || 0),
      mode: network.bandwidthKbps < 64 ? "SMS160 / LOW_DATA_TEXT / ACK tracking" : "Adaptive ACK",
      nextQuestionId: triageFlow.currentQuestionId || null,
      note: conversation.unansweredOperatorMessages > 0
        ? "後台訊息尚未回覆，保留 Low Data Text 並建議人工追蹤。"
        : action === "SAFE_OK"
          ? "記錄平安 ACK，無需高優先升級。"
          : "未收到後續 ACK 時進入需處理名單並保留人工追蹤。",
    };
  }

  function nextActionsFor(action, escalationRequired, location, conversation, triageFlow = {}) {
    if (action === "SAFE_OK") return ["記錄 ACK", "維持監測", triageFlow.flowComplete ? "安全確認完成" : "保留平安確認題目"].filter(Boolean);
    const actions = ["更新需要處理名單", "保留 Low Data ACK 記錄"];
    if (action === "NEED_MEDICAL") actions.push("守護指揮中心人工確認", "模擬通知守護者");
    if (action === "CANNOT_TALK") actions.push("優先文字確認", "避免語音作為唯一回覆方式");
    if (action === "LOCATION_ANOMALY") actions.push("標示同網路位置為模擬推估", "確認最近協助者");
    if (conversation.lastQuickReply === "我一個人" || triageFlow.answers?.some((answer) => ["MED_ALONE", "HELP_ALONE", "TALK_ALONE"].includes(answer.answerCode))) actions.push("優先人工聯繫並確認指定守護者");
    if (["我無法確認", "我無法回覆", "我無法判斷"].includes(conversation.lastQuickReply)) actions.push("升級人工追蹤");
    if (triageFlow.currentQuestionId) actions.push(`推送下一題 ${triageFlow.currentQuestionId}`);
    if (conversation.safetyConfirmed) actions.push("風險降低但保留追蹤紀錄");
    if (conversation.unansweredOperatorMessages > 0) actions.push("後台訊息逾時未回覆時升級處理");
    if (escalationRequired) actions.push("若逾時未 ACK，升級備援");
    if (location.simulated) actions.push("顯示非真實 GPS 說明");
    return actions;
  }

  function dispatchSuggestionFor(action, riskScore, location, conversation, triageFlow = {}) {
    if (action === "SAFE_OK") return "低風險，守護指揮中心記錄平安回覆。";
    const helper = location.nearestHelper || "社區守望者";
    const eta = location.etaMinutes || Math.max(3, Math.round(14 - riskScore / 12));
    const answerCodes = new Set((triageFlow.answers || []).map((answer) => answer.answerCode));
    if (answerCodes.has("MED_ALONE") && answerCodes.has("MED_REPLY_HARD")) return "需要醫療 + 獨自一人 + 回覆困難：建議優先人工聯繫與守護者確認。";
    if (answerCodes.has("MED_REPLY_HARD") || answerCodes.has("MED_REPLY_UNSURE")) return "長者回覆困難：建議立即守護者確認，並持續低資料按鍵確認。";
    if (conversation.lastQuickReply === "我一個人" || answerCodes.has("MED_ALONE") || answerCodes.has("HELP_ALONE") || answerCodes.has("TALK_ALONE")) return `長者已回覆：我一個人。${action === "NEED_MEDICAL" ? "事件為需要醫療，且目前無法確認身邊協助者，" : ""}建議優先人工聯繫並通知指定守護者。`;
    if (answerCodes.has("LOC_UNKNOWN")) return "位置不確定：建議人工確認位置，並標示同網路定位為非真實 GPS。";
    if (["我無法確認", "我無法回覆", "我無法判斷"].includes(conversation.lastQuickReply)) return "長者無法確認安全狀態，建議升級人工追蹤並使用低資料文字持續確認。";
    if (conversation.safetyConfirmed && action !== "NEED_MEDICAL") return "已收到安全確認，風險降低；仍保留事件紀錄與後續觀察。";
    if (action === "NEED_MEDICAL") return `最高優先級：建議守護指揮中心人工追蹤，並以 demo 模擬通知 ${helper}，預估 ${eta} 分鐘內可聯繫。`;
    if (action === "CANNOT_TALK") return "高風險：以 SMS / Low Data Text 為主，人工追蹤時避免要求使用者通話。";
    if (action === "LOCATION_ANOMALY") return `需確認位置：顯示同網路推估位置與 ${helper}，但明確標示非真實 GPS。`;
    return `中高風險：建議通知 ${helper} 並持續 ACK 追蹤。`;
  }

  function recommendedOperatorActionFor(action, riskScore, location, conversation, triageFlow = {}) {
    if (action === "SAFE_OK" && triageFlow.lastAnswerCode === "SAFE_DONE") return "記錄平安 ACK，不進入高優先待處理。";
    if (triageFlow.lastAnswerCode === "SAFE_TO_HELP") return "SAFE_OK 已升級 NEED_HELP，請建立需要協助追蹤。";
    if (riskScore >= 80) return dispatchSuggestionFor(action, riskScore, location, conversation, triageFlow);
    if (riskScore >= 60) return "高風險：請守護指揮中心人工檢視，持續低資料按鍵確認。";
    if (riskScore >= 30) return "中風險：保留 ACK 追蹤並觀察下一題回答。";
    return "低風險：記錄狀態並維持監測。";
  }

  function conversationRequiresEscalation(action, conversation, location, triageFlow = {}) {
    if (!conversation.hasActiveThread) return false;
    if (action === "NEED_MEDICAL" && !conversation.elderResponded) return true;
    if (action === "LOCATION_ANOMALY" && !conversation.elderResponded && location.simulated) return true;
    if (conversation.lastQuickReply === "我一個人" || triageFlow.answers?.some((answer) => ["MED_ALONE", "HELP_ALONE", "TALK_ALONE"].includes(answer.answerCode))) return true;
    if (["我無法確認", "我無法回覆", "我無法判斷"].includes(conversation.lastQuickReply)) return true;
    if (triageFlow.answers?.some((answer) => ["MED_REPLY_HARD", "MED_REPLY_UNSURE", "LOC_UNKNOWN", "MED_PLACE_UNSAFE", "MED_NEED_CONTACT_NOW"].includes(answer.answerCode))) return true;
    return conversation.unansweredOperatorMessages > 0 && conversation.unansweredMinutes >= 5;
  }

  function conversationSummary(conversation, triageFlow = {}) {
    return {
      hasActiveThread: conversation.hasActiveThread,
      elderResponded: conversation.elderResponded,
      lastQuickReply: conversation.lastQuickReply,
      lastAnswerCode: conversation.lastAnswerCode || triageFlow.lastAnswerCode || null,
      unansweredOperatorMessages: conversation.unansweredOperatorMessages,
      safetyConfirmed: conversation.safetyConfirmed,
      unableToRespond: conversation.unableToRespond,
      triageFlow: triageFlow.flowId
        ? {
            flowId: triageFlow.flowId,
            currentQuestionId: triageFlow.currentQuestionId,
            completedQuestionIds: triageFlow.completedQuestionIds,
            lastAnswerCode: triageFlow.lastAnswerCode,
            flowComplete: triageFlow.flowComplete,
          }
        : null,
      status: conversation.safetyConfirmed
        ? "safety_confirmed"
        : conversation.elderResponded
          ? "elder_replied"
          : conversation.hasActiveThread
            ? "waiting_elder_reply"
            : "no_thread",
    };
  }

  global.XY_ENGINE = {
    TRIAGE_FLOWS,
    routeScenario,
    routeActionDecision,
    scoreChannel,
    networkClass,
    payloadMode,
    payloadBytes,
    riskTier,
    triageDedupeStatus,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_ENGINE;
}
