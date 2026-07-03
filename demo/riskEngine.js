(function (global) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function minutesSince(value, nowMs) {
    if (!value) return 999;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.max(0, Math.round((nowMs - time) / 60000));
  }

  function riskLevel(score) {
    if (score >= 80) return "Critical";
    if (score >= 60) return "High";
    if (score >= 30) return "Medium";
    return "Low";
  }

  function responseFactor(status) {
    const map = {
      safe: ["使用者回覆狀態", "我安全", -12, "平安回覆會降低風險，但仍需檢查 GPS、ACK 與網路狀態。"],
      help: ["使用者回覆狀態", "需要協助", 35, "使用者主動求助，需進入守望隊追蹤。"],
      cannotMove: ["使用者回覆狀態", "無法移動", 50, "無法移動代表現場風險高，需人工介入。"],
      medical: ["使用者回覆狀態", "身體不適", 45, "身體不適需提高處理優先序。"],
      locationUnknown: ["使用者回覆狀態", "位置不明", 30, "位置不明會提高定位確認風險。"],
      noResponse: ["使用者回覆狀態", "長時間未回覆", 25, "未回覆時無法確認安全狀態。"],
      unknown: ["使用者回覆狀態", "尚未回覆", 0, "等待使用者第一次低資料回覆。"],
    };
    return map[status] || map.unknown;
  }

  function gpsFactor(gps) {
    if (!gps) return ["GPS 可信度", "無資料", 20, "沒有 GPS 或 fallback 位置時需人工確認。"];
    if (gps.confidence === "high" && Number(gps.accuracyMeters || 999) <= 80) {
      return ["GPS 可信度", `high / +/-${Math.round(gps.accuracyMeters)}m`, 0, "GPS 可用且精準度足夠。"];
    }
    if (gps.confidence === "medium" || Number(gps.accuracyMeters || 0) <= 160) {
      return ["GPS 可信度", `${gps.confidence || "medium"} / +/-${Math.round(gps.accuracyMeters || 160)}m`, 8, "GPS 可用但仍需保留位置確認。"];
    }
    return ["GPS 可信度", `${gps.confidence || "low"} / +/-${Math.round(gps.accuracyMeters || 320)}m`, 16, "GPS 可信度偏低，需守望隊確認位置。"];
  }

  function networkFactor(mode, signalStrength) {
    if (mode === "offlineQueue") return ["訊號品質", "Offline Queue", 22, "離線佇列代表封包需等待重送。"];
    if (mode === "weak" || signalStrength < 40) return ["訊號品質", `Weak / ${signalStrength}%`, 10, "弱網路會提高 ACK 延遲與重送機率。"];
    return ["訊號品質", `Online / ${signalStrength}%`, 0, "訊號足以完成低資料封包傳輸。"];
  }

  function replyTimeFactor(lastReplyAt, nowMs) {
    const minutes = minutesSince(lastReplyAt, nowMs);
    if (minutes >= 20) return ["最後回覆時間", `${minutes} 分鐘前`, 28, "超過 20 分鐘未回覆，需要升級追蹤。"];
    if (minutes >= 10) return ["最後回覆時間", `${minutes} 分鐘前`, 18, "超過 10 分鐘未回覆，風險逐步上升。"];
    if (minutes >= 5) return ["最後回覆時間", `${minutes} 分鐘前`, 10, "已接近 SLA 追蹤門檻。"];
    return ["最後回覆時間", `${minutes} 分鐘前`, 0, "最近仍有回覆紀錄。"];
  }

  function ackFactor(communication) {
    const retryCount = Number(communication?.retryCount || 0);
    if (communication?.ackReceived) return ["ACK 狀態", "已收到 ACK", -4, "ACK 代表資料已送達，但不會讓事件風險歸零。"];
    if (retryCount >= 3) return ["ACK 狀態", `retry ${retryCount} / 未確認`, 20, "多次未 ACK 代表鏈路不穩，需人工確認。"];
    if (retryCount > 0) return ["ACK 狀態", `retry ${retryCount}`, 12, "ACK 延遲時啟用重送策略。"];
    return ["ACK 狀態", "等待確認", 8, "尚未收到守望隊確認。"];
  }

  function batteryFactor(battery) {
    if (battery < 10) return ["電量", `${battery}%`, 24, "電量極低，後續通訊可能中斷。"];
    if (battery < 20) return ["電量", `${battery}%`, 14, "低電量會降低後續追蹤可靠度。"];
    return ["電量", `${battery}%`, 0, "電量足以維持短時間低資料互動。"];
  }

  function watchConfirmFactor(confirmed) {
    return [
      "守望隊確認",
      confirmed ? "confirmed" : "pending",
      0,
      confirmed ? "已確認代表進入處理流程，不代表使用者風險消失。" : "尚未由守望隊人工確認。",
    ];
  }

  function assessRisk(simulationState, options = {}) {
    const nowMs = options.nowMs || Date.now();
    const user = simulationState.user || {};
    const communication = simulationState.communication || {};
    const watchTeam = simulationState.watchTeam || {};
    const base = ["基礎監測", "災害守望模式", 10, "星夜在災害或弱網展示中保留基本監測風險。"];
    const factorTuples = [
      base,
      responseFactor(user.responseStatus || "unknown"),
      replyTimeFactor(user.lastReplyAt, nowMs),
      gpsFactor(user.gps),
      networkFactor(simulationState.networkMode, user.signalStrength || 0),
      ackFactor(communication),
      batteryFactor(Number(user.battery || 0)),
      watchConfirmFactor(Boolean(watchTeam.confirmed)),
    ];
    const factors = factorTuples.map(([label, value, score, reason]) => ({
      label,
      value,
      score,
      reason,
    }));
    const total = clamp(factors.reduce((sum, factor) => sum + Number(factor.score || 0), 0), 0, 100);
    return {
      score: total,
      level: riskLevel(total),
      factors,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  global.XY_RISK = {
    assessRisk,
    riskLevel,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_RISK;
}
