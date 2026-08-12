(function initMatrixScoreContract(global) {
  "use strict";

  const CONTRACT_VERSION = "starrylink-priority-v1";
  const THRESHOLDS = Object.freeze([
    Object.freeze({ level: "GREEN", min: 0, max: 24, action: "監測" }),
    Object.freeze({ level: "YELLOW", min: 25, max: 54, action: "注意" }),
    Object.freeze({ level: "ORANGE", min: 55, max: 79, action: "優先" }),
    Object.freeze({ level: "RED", min: 80, max: 100, action: "緊急" }),
  ]);

  const INDICATORS = Object.freeze([
    Object.freeze({ id: "symptoms", order: 1, label: "求救與症狀", maxPoints: 30 }),
    Object.freeze({ id: "location", order: 2, label: "位置證據", maxPoints: 10 }),
    Object.freeze({ id: "medical", order: 3, label: "生命與受困狀態", maxPoints: 25 }),
    Object.freeze({ id: "delivery", order: 4, label: "送達與訊號", maxPoints: 15 }),
    Object.freeze({ id: "battery", order: 5, label: "裝置續航", maxPoints: 5 }),
    Object.freeze({ id: "recency", order: 6, label: "回覆時效", maxPoints: 15 }),
  ]);

  const SYMPTOM_POINTS = Object.freeze({
    SAFE: 0,
    STATUS_CLEAR: 0,
    DISCOMFORT: 10,
    NEED_HELP: 14,
    INJURED: 18,
    SOS_BUTTON: 20,
    CANNOT_TALK: 22,
    TRAPPED: 24,
    NEED_MEDICAL: 26,
    CANNOT_MOVE: 24,
  });

  function bounded(value, maxPoints) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(Math.round(number), maxPoints));
  }

  function validateConfig(indicators = INDICATORS, thresholds = THRESHOLDS) {
    const orders = indicators.map((item) => item.order);
    const maxTotal = indicators.reduce((sum, item) => sum + Number(item.maxPoints), 0);
    if (indicators.length !== 6) throw new Error("Priority contract must contain exactly six indicators.");
    if (new Set(orders).size !== 6 || orders.join(",") !== "1,2,3,4,5,6") {
      throw new Error("Priority indicators must have unique order 1–6.");
    }
    if (maxTotal !== 100) throw new Error(`Priority indicator maximum must total 100; received ${maxTotal}.`);
    thresholds.forEach((threshold, index) => {
      const expectedMin = index === 0 ? 0 : thresholds[index - 1].max + 1;
      if (threshold.min !== expectedMin || threshold.max < threshold.min) {
        throw new Error(`Priority threshold ${threshold.level} is not continuous.`);
      }
    });
    if (thresholds.at(-1)?.max !== 100) throw new Error("Priority thresholds must end at 100.");
    return true;
  }

  function timeMs(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function minutesSince(value, nowMs) {
    const timestamp = timeMs(value);
    if (!timestamp) return null;
    return Math.max(0, (nowMs - timestamp) / 60000);
  }

  function accuracyMeters(value) {
    if (value === "high") return 30;
    if (value === "medium") return 120;
    if (value === "low") return 300;
    const number = Number(String(value || "").match(/[\d.]+/)?.[0]);
    return Number.isFinite(number) ? number : null;
  }

  function symptomResult(target) {
    const selected = Array.isArray(target.selectedSymptoms) ? target.selectedSymptoms : [];
    const fallback = selected.length ? [] : [target.latestReply?.code].filter(Boolean);
    const codes = [...new Set([...selected, ...fallback])];
    const scores = codes.map((code) => Number(SYMPTOM_POINTS[code] || 0)).sort((a, b) => b - a);
    const earned = scores.length ? scores[0] + Math.min(6, Math.max(0, scores.length - 1) * 3) : 0;
    const labels = codes.length ? codes.join(" / ") : "NO ACTIVE DISTRESS";
    return {
      earned,
      rawStatus: labels,
      source: "受困者按鍵／回覆封包",
      rationale: scores.length > 1
        ? `最高嚴重度 ${scores[0]}；其餘 ${scores.length - 1} 項各 +3，最多補 +6`
        : scores.length
          ? `依最高求救／症狀嚴重度給分`
          : "無主動求救或症狀：0",
    };
  }

  function locationResult(target) {
    const location = target.location || {};
    const meters = accuracyMeters(location.accuracy);
    const isUnknown = target.latestReply?.code === "LOCATION_UNKNOWN";
    const isStatic = Number(location.staticMinutes || 0) >= 10;
    let earned = 10;
    let rationale = "位置未確認：10";
    if (isUnknown || isStatic) {
      earned = 10;
      rationale = isUnknown ? "使用者表示位置不明：10" : "GPS 靜止達 10 分鐘：10";
    } else if (location.confirmed && (location.accuracy === "high" || (Number.isFinite(meters) && meters <= 50))) {
      earned = 0;
      rationale = "已確認且誤差 ≤ 50m：0";
    } else if (location.confirmed && (location.accuracy === "medium" || (Number.isFinite(meters) && meters <= 150))) {
      earned = 3;
      rationale = "已確認且誤差 ≤ 150m：3";
    } else if (location.confirmed) {
      earned = 5;
      rationale = "已確認但精度偏低：5";
    } else if (location.source) {
      earned = 8;
      rationale = "有位置來源但尚未確認：8";
    }
    const accuracy = location.accuracy || "unknown";
    return {
      earned,
      rawStatus: `${location.confirmed ? "CONFIRMED" : "UNCONFIRMED"} / ${accuracy}${isStatic ? ` / STATIC ${location.staticMinutes}m` : ""}`,
      source: "GPS／手動位置 fallback",
      rationale,
    };
  }

  function medicalResult(target) {
    const medical = target.medical || {};
    const selected = new Set(Array.isArray(target.selectedSymptoms) ? target.selectedSymptoms : []);
    const parts = [
      { active: Number(medical.heartRate) > 120 || Number(medical.heartRate) < 50, points: 4, label: "HR" },
      { active: Number(medical.spo2) > 0 && Number(medical.spo2) < 92, points: 6, label: "SpO₂" },
      { active: Boolean(medical.injury) || selected.has("INJURED") || selected.has("NEED_MEDICAL"), points: 6, label: "受傷" },
      { active: Boolean(medical.breathingDifficulty) || selected.has("CANNOT_TALK"), points: 10, label: "呼吸" },
      { active: Boolean(medical.trapped || medical.cannotMove) || selected.has("TRAPPED") || selected.has("CANNOT_MOVE"), points: 12, label: "受困" },
      { active: Boolean(medical.hypothermia), points: 8, label: "失溫" },
    ];
    const active = parts.filter((part) => part.active);
    return {
      earned: active.reduce((sum, part) => sum + part.points, 0),
      rawStatus: `HR ${medical.heartRate ?? "—"} / SpO₂ ${medical.spo2 ?? "—"} / ${active.map((part) => part.label).join("+") || "STABLE"}`,
      source: "生命徵象／狀態回報",
      rationale: active.length
        ? `${active.map((part) => `${part.label} +${part.points}`).join("、")}；本項上限 25`
        : "生命徵象與受困狀態未命中：0",
    };
  }

  function deliveryResult(target, nowMs) {
    const communication = target.communication || {};
    const signal = Number(target.signalQuality || 0);
    const signalPoints = signal < 40 ? 6 : signal < 70 ? 3 : 0;
    const retryCount = Number(communication.retryCount || 0);
    const pendingSince = communication.ackPendingSince || target.latestReply?.timestamp;
    const pendingSeconds = pendingSince ? ((nowMs - timeMs(pendingSince)) / 1000) : 0;
    let ackPoints = 0;
    if (communication.ackStatus === "failed" || retryCount >= 3) ackPoints = 7;
    else if (retryCount >= 2) ackPoints = 4;
    else if (["pending", "retrying"].includes(communication.ackStatus) && pendingSeconds > 20) ackPoints = 3;
    const noResponsePoints = target.latestReply?.code === "NO_RESPONSE" && communication.ackStatus === "failed" ? 2 : 0;
    return {
      earned: signalPoints + ackPoints + noResponsePoints,
      rawStatus: `SIGNAL ${signal}% / ACK ${String(communication.ackStatus || "unknown").toUpperCase()} / RETRY ${retryCount}`,
      source: "網路遙測／ACK",
      rationale: `訊號 +${signalPoints}、ACK/retry +${ackPoints}${noResponsePoints ? "、未回覆 +2" : ""}`,
    };
  }

  function batteryResult(target) {
    const battery = Number(target.battery || 0);
    const earned = battery < 10 ? 5 : battery < 20 ? 3 : battery < 30 ? 2 : 0;
    return {
      earned,
      rawStatus: `BATTERY ${battery}%`,
      source: "裝置遙測封包",
      rationale: battery < 10 ? "< 10%：5" : battery < 20 ? "10–19%：3" : battery < 30 ? "20–29%：2" : "≥ 30%：0",
    };
  }

  function recencyResult(target, nowMs) {
    const replyMinutes = minutesSince(target.latestReply?.timestamp, nowMs);
    const syncMinutes = minutesSince(target.communication?.lastAckAt || target.lastUpdatedAt, nowMs);
    const replyPoints = replyMinutes === null ? 7 : replyMinutes > 15 ? 7 : replyMinutes >= 10 ? 5 : replyMinutes >= 5 ? 2 : 0;
    const syncPoints = syncMinutes === null ? 8 : syncMinutes > 15 ? 8 : syncMinutes >= 8 ? 4 : 0;
    return {
      earned: replyPoints + syncPoints,
      rawStatus: `REPLY ${replyMinutes === null ? "NONE" : `${Math.round(replyMinutes)}m`} / SYNC ${syncMinutes === null ? "NONE" : `${Math.round(syncMinutes)}m`}`,
      source: "回覆／ACK 時間戳",
      rationale: `回覆時效 +${replyPoints}、同步時效 +${syncPoints}`,
    };
  }

  function levelFor(score) {
    const points = bounded(score, 100);
    return THRESHOLDS.find((threshold) => points >= threshold.min && points <= threshold.max) || THRESHOLDS[0];
  }

  function scoreTarget(target = {}, options = {}) {
    validateConfig();
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const resolvers = [symptomResult, locationResult, medicalResult, deliveryResult, batteryResult, recencyResult];
    const indicators = INDICATORS.map((definition, index) => {
      const result = resolvers[index](target, nowMs);
      const earnedPoints = bounded(result.earned, definition.maxPoints);
      return Object.freeze({
        ...definition,
        rawSignal: result.source,
        rawStatus: result.rawStatus,
        maxPoints: definition.maxPoints,
        earnedPoints,
        rationale: result.rationale,
      });
    });
    const score = indicators.reduce((sum, indicator) => sum + indicator.earnedPoints, 0);
    const threshold = levelFor(score);
    return Object.freeze({
      version: CONTRACT_VERSION,
      score,
      level: threshold.level,
      action: threshold.action,
      maxScore: 100,
      indicators: Object.freeze(indicators),
      signature: indicators.map((item) => `${item.id}:${item.earnedPoints}/${item.maxPoints}`).join("|"),
    });
  }

  validateConfig();

  const api = Object.freeze({
    CONTRACT_VERSION,
    INDICATORS,
    THRESHOLDS,
    validateConfig,
    levelFor,
    scoreTarget,
  });

  global.STARRYLINK_MATRIX_SCORE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
