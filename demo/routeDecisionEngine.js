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

  global.XY_ENGINE = {
    routeScenario,
    scoreChannel,
    networkClass,
    payloadMode,
    payloadBytes,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_ENGINE;
}
