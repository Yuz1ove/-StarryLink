(function (global) {
  const WEIGHTS = {
    packetSuccessRate: 0.35,
    latencyScore: 0.2,
    signalStrength: 0.15,
    gpsAvailability: 0.15,
    channelCost: 0.1,
    batteryImpact: 0.05,
  };

  const channelTemplates = [
    {
      id: "WIFI",
      name: "Wi-Fi",
      layer: "Ground",
      packetSuccessRate: 84,
      latencyMs: 240,
      signalStrength: 78,
      gpsAvailability: 92,
      channelCost: 96,
      batteryImpact: 88,
      available: true,
    },
    {
      id: "LTE",
      name: "5G / LTE",
      layer: "Ground",
      packetSuccessRate: 82,
      latencyMs: 310,
      signalStrength: 74,
      gpsAvailability: 92,
      channelCost: 86,
      batteryImpact: 78,
      available: true,
    },
    {
      id: "SMS",
      name: "SMS",
      layer: "Ground",
      packetSuccessRate: 76,
      latencyMs: 1250,
      signalStrength: 68,
      gpsAvailability: 76,
      channelCost: 82,
      batteryImpact: 92,
      available: true,
    },
    {
      id: "BLE_RELAY",
      name: "BLE Relay",
      layer: "Ground Mesh",
      packetSuccessRate: 62,
      latencyMs: 2100,
      signalStrength: 58,
      gpsAvailability: 64,
      channelCost: 90,
      batteryImpact: 84,
      available: true,
    },
    {
      id: "SATELLITE",
      name: "Satellite Backup",
      layer: "Space",
      packetSuccessRate: 68,
      latencyMs: 1700,
      signalStrength: 62,
      gpsAvailability: 88,
      channelCost: 38,
      batteryImpact: 42,
      available: true,
    },
  ];

  const riskRank = { GREEN: 1, YELLOW: 2, ORANGE: 3, RED: 4 };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 0) {
    const scale = Math.pow(10, digits);
    return Math.round(value * scale) / scale;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function latencyScoreFromMs(ms) {
    const value = Number(ms || 0);
    if (value <= 150) return 96;
    if (value <= 300) return 88;
    if (value <= 700) return 72;
    if (value <= 1300) return 54;
    if (value <= 2200) return 38;
    return 24;
  }

  function normalizeRiskLevel(userRisk) {
    const level = String(userRisk?.level || userRisk || "GREEN").toUpperCase();
    if (level === "CRITICAL" || level === "HIGH") return "RED";
    if (level === "MEDIUM") return "ORANGE";
    if (riskRank[level]) return level;
    return "GREEN";
  }

  function isBackboneUnstable(network = {}) {
    return Boolean(
      network.disasterMode ||
        network.seaCableStatus === "degraded" ||
        network.groundBackboneStatus === "down" ||
        network.groundBackboneStatus === "unstable" ||
        Number(network.backboneLatencyMs || 0) >= 1200 ||
        Number(network.backbonePacketLossPercent || 0) >= 20
    );
  }

  function buildChannelStates(target = {}, network = {}) {
    const signal = Number(target.signalQuality || 0);
    const gpsOk = target.location?.confirmed ? 100 : target.location?.accuracy === "medium" ? 70 : 36;
    const battery = Number(target.battery || 0);
    const backboneUnstable = isBackboneUnstable(network);
    const groundDown = network.groundBackboneStatus === "down" || network.mobileAvailable === false;
    const packetLoss = Number(network.backbonePacketLossPercent || 0);
    const mobileCongestion = Number(network.groundCongestion || 0);
    const groundPenalty = groundDown ? 32 : backboneUnstable ? 14 : 0;
    const signalPenalty = signal < 40 ? 18 : signal < 70 ? 7 : 0;
    const batteryPenalty = battery < 15 ? 14 : battery < 25 ? 7 : 0;

    return channelTemplates.map((template) => {
      const channel = clone(template);
      if (channel.id === "WIFI") {
        channel.packetSuccessRate -= groundPenalty + signalPenalty + packetLoss * 0.28;
        channel.latencyMs += groundDown ? 1600 : backboneUnstable ? 920 : 0;
        channel.signalStrength = Math.min(channel.signalStrength, signal + 8);
      }
      if (channel.id === "LTE") {
        channel.packetSuccessRate -= groundPenalty + signalPenalty + mobileCongestion * 0.12 + packetLoss * 0.22;
        channel.latencyMs += groundDown ? 1500 : backboneUnstable ? 720 : 0;
        channel.signalStrength = Math.min(channel.signalStrength, signal + 4);
      }
      if (channel.id === "SMS") {
        channel.packetSuccessRate -= signal < 28 ? 16 : signal < 45 ? 6 : 0;
        channel.packetSuccessRate += groundDown ? 4 : 0;
        channel.latencyMs += groundDown ? 980 : mobileCongestion > 80 ? 850 : backboneUnstable ? 280 : 0;
        channel.signalStrength = Math.max(44, Math.min(86, signal + 12));
      }
      if (channel.id === "BLE_RELAY") {
        channel.packetSuccessRate += groundDown ? 18 : backboneUnstable ? 12 : 0;
        channel.latencyMs += signal < 35 ? 600 : 0;
        channel.signalStrength = Math.max(46, Math.min(80, signal + 18));
      }
      if (channel.id === "SATELLITE") {
        channel.packetSuccessRate += groundDown ? 22 : backboneUnstable ? 16 : 0;
        channel.channelCost += groundDown ? 28 : backboneUnstable ? 18 : 0;
        channel.latencyMs += 0;
      }
      channel.gpsAvailability = Math.round((channel.gpsAvailability + gpsOk) / 2);
      channel.batteryImpact = clamp(channel.batteryImpact - batteryPenalty, 0, 100);
      channel.packetSuccessRate = clamp(Math.round(channel.packetSuccessRate), 0, 100);
      channel.signalStrength = clamp(Math.round(channel.signalStrength), 0, 100);
      channel.gpsAvailability = clamp(Math.round(channel.gpsAvailability), 0, 100);
      channel.channelCost = clamp(Math.round(channel.channelCost), 0, 100);
      channel.latencyScore = latencyScoreFromMs(channel.latencyMs);
      return channel;
    });
  }

  function calculateChannelScore(channelState, userRisk, network = {}) {
    const riskLevel = normalizeRiskLevel(userRisk);
    const backboneUnstable = isBackboneUnstable(network);
    const score =
      Number(channelState.packetSuccessRate || 0) * WEIGHTS.packetSuccessRate +
      Number(channelState.latencyScore || 0) * WEIGHTS.latencyScore +
      Number(channelState.signalStrength || 0) * WEIGHTS.signalStrength +
      Number(channelState.gpsAvailability || 0) * WEIGHTS.gpsAvailability +
      Number(channelState.channelCost || 0) * WEIGHTS.channelCost +
      Number(channelState.batteryImpact || 0) * WEIGHTS.batteryImpact;
    let adjustment = 0;
    if (channelState.id === "SATELLITE") {
      if (riskLevel === "RED") adjustment += 18;
      if (riskLevel === "ORANGE") adjustment += 8;
      if (backboneUnstable) adjustment += 10;
      if (network.groundBackboneStatus === "down" || network.mobileAvailable === false) adjustment += 16;
      if (riskLevel === "GREEN" || riskLevel === "YELLOW") adjustment -= 16;
    }
    if (["WIFI", "LTE"].includes(channelState.id) && backboneUnstable) adjustment -= 8;
    if (channelState.id === "BLE_RELAY" && backboneUnstable) adjustment += 6;
    if (channelState.id === "BLE_RELAY" && (riskLevel === "GREEN" || riskLevel === "YELLOW")) adjustment -= 8;
    if (channelState.id === "SMS" && ["YELLOW", "ORANGE"].includes(riskLevel)) adjustment += 5;
    return clamp(round(score + adjustment, 1), 0, 100);
  }

  function selectBestChannel(channels, userRisk, network = {}) {
    const riskLevel = normalizeRiskLevel(userRisk);
    const scored = channels
      .filter((channel) => channel.available !== false)
      .map((channel) => ({
        ...channel,
        score: calculateChannelScore(channel, userRisk, network),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const primary = scored[0] || null;
    const fallback = scored.find((channel) => channel.id !== primary?.id) || null;
    const satellite = scored.find((channel) => channel.id === "SATELLITE");
    const packetLossRate = primary ? clamp(round(100 - primary.packetSuccessRate, 1), 0, 100) : 0;
    const lowDataMode =
      isBackboneUnstable(network) ||
      packetLossRate >= 18 ||
      riskLevel === "ORANGE" ||
      riskLevel === "RED" ||
      ["SMS", "BLE_RELAY", "SATELLITE"].includes(primary?.id);
    const satelliteRecommended = Boolean(
      satellite &&
        satellite.score >= 58 &&
        (riskLevel === "RED" || (riskLevel === "ORANGE" && isBackboneUnstable(network)) || primary?.id === "SATELLITE")
    );
    return {
      primary,
      fallback,
      satellite,
      scores: scored,
      lowDataMode,
      satelliteRecommended,
      packetLossRate,
      averageLatencyMs: primary?.latencyMs || 0,
      summary: primary
        ? `${primary.name}${fallback ? `，備援 ${fallback.name}` : ""}`
        : "目前沒有可用通道",
    };
  }

  function decisionForTarget(target, userRisk, network = {}) {
    return selectBestChannel(buildChannelStates(target, network), userRisk, network);
  }

  global.XY_COMMUNICATION = {
    WEIGHTS,
    channelTemplates,
    buildChannelStates,
    calculateChannelScore,
    selectBestChannel,
    decisionForTarget,
    isBackboneUnstable,
    normalizeRiskLevel,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_COMMUNICATION;
}
