(function (global) {
  const eventImpactScores = {
    general_notice: { label: "一般通知", score: 10 },
    regional_alert: { label: "區域警戒", score: 20 },
    disaster_response: { label: "災害應變", score: 35 },
    major_disaster: { label: "重大災害", score: 45 },
  };

  const networkScores = {
    normal: { label: "normal", score: 0 },
    weak: { label: "weak", score: 10 },
    disaster: { label: "disaster", score: 20 },
    offlineQueue: { label: "offlineQueue", score: 25 },
  };

  const userScores = {
    SAFE: { label: "SAFE", score: 0 },
    UNWELL: { label: "UNWELL", score: 15 },
    HELP: { label: "HELP", score: 25 },
    IMMOBILE: { label: "IMMOBILE", score: 35 },
    NO_RESPONSE: { label: "NO_RESPONSE", score: 30 },
  };

  const gpsScores = {
    high: { label: "high", score: 0 },
    medium: { label: "medium", score: 5 },
    low: { label: "low", score: 12 },
    unknown: { label: "unknown", score: 18 },
  };

  const ackScores = {
    received: { label: "received", score: 0 },
    pending: { label: "pending", score: 8 },
    retrying: { label: "retrying", score: 15 },
    failed: { label: "failed", score: 25 },
  };

  const levelBands = [
    { level: "SEV-1", title: "例行監測", min: 0, max: 24 },
    { level: "SEV-2", title: "注意追蹤", min: 25, max: 44 },
    { level: "SEV-3", title: "區域警戒", min: 45, max: 64 },
    { level: "SEV-4", title: "緊急應變", min: 65, max: 84 },
    { level: "SEV-5", title: "災害模式 / 高優先調度", min: 85, max: 100 },
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function responseDelayScore(minutes) {
    const value = Number(minutes || 0);
    if (value > 5) return { label: ">5 分鐘", score: 20 };
    if (value > 3) return { label: "3~5 分鐘", score: 15 };
    if (value > 1) return { label: "1~3 分鐘", score: 8 };
    return { label: "0~1 分鐘", score: 0 };
  }

  function levelForScore(score) {
    const safeScore = clamp(Math.round(Number(score || 0)), 0, 100);
    return levelBands.find((band) => safeScore >= band.min && safeScore <= band.max) || levelBands[0];
  }

  function normalizeKey(value, fallback) {
    return value === undefined || value === null || value === "" ? fallback : value;
  }

  function calculateSeverity(input = {}) {
    const eventImpact = eventImpactScores[normalizeKey(input.eventImpact, "general_notice")] || eventImpactScores.general_notice;
    const network = networkScores[normalizeKey(input.networkMode, "normal")] || networkScores.normal;
    const user = userScores[normalizeKey(input.userStatus, "SAFE")] || userScores.SAFE;
    const gps = gpsScores[normalizeKey(input.gpsConfidence, "high")] || gpsScores.high;
    const ack = ackScores[normalizeKey(input.ackState, "received")] || ackScores.received;
    const delay = responseDelayScore(input.responseDelayMinutes);
    const factors = [
      {
        key: "eventImpactScore",
        label: "事件影響程度",
        value: eventImpact.label,
        score: eventImpact.score,
        reason: `事件屬於「${eventImpact.label}」，給 ${eventImpact.score} 分。`,
      },
      {
        key: "networkFailureScore",
        label: "網路狀態",
        value: network.label,
        score: network.score,
        reason: `目前網路為 ${network.label}，通訊可靠度加權 ${network.score} 分。`,
      },
      {
        key: "userRiskScore",
        label: "使用者狀態",
        value: user.label,
        score: user.score,
        reason: `使用者狀態為 ${user.label}，安全確認風險加權 ${user.score} 分。`,
      },
      {
        key: "locationReliabilityScore",
        label: "GPS / 定位可信度",
        value: gps.label,
        score: gps.score,
        reason: `定位可信度為 ${gps.label}，位置不確定性加權 ${gps.score} 分。`,
      },
      {
        key: "ackFailureScore",
        label: "ACK 狀態",
        value: ack.label,
        score: ack.score,
        reason: `ACK 狀態為 ${ack.label}，送達確認風險加權 ${ack.score} 分。`,
      },
      {
        key: "responseDelayScore",
        label: "回覆延遲",
        value: delay.label,
        score: delay.score,
        reason: `距離最近回覆約 ${delay.label}，延遲風險加權 ${delay.score} 分。`,
      },
    ];
    const total = clamp(factors.reduce((sum, factor) => sum + factor.score, 0), 0, 100);
    const band = levelForScore(total);
    const reasonLabels = factors.filter((factor) => factor.score > 0).map((factor) => factor.label);
    const summary = reasonLabels.length
      ? `因${reasonLabels.join("、")}提高風險，因此判定為 ${band.level}。`
      : `各項狀態穩定，因此判定為 ${band.level}。`;
    return {
      severityScore: total,
      severityLevel: band.level,
      severityTitle: band.title,
      factors,
      formula: "severityScore = eventImpactScore + networkFailureScore + userRiskScore + locationReliabilityScore + ackFailureScore + responseDelayScore",
      summary,
      bands: levelBands,
    };
  }

  global.XY_SEVERITY = {
    calculateSeverity,
    levelForScore,
    levelBands,
    eventImpactScores,
    networkScores,
    userScores,
    gpsScores,
    ackScores,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_SEVERITY;
}
