(function (global) {
  const replyLabels = {
    SAFE: "我安全",
    STATUS_CLEAR: "清除按鍵選擇",
    SOS_BUTTON: "大型求救按鈕",
    NEED_HELP: "需要救援",
    INJURED: "我受傷",
    TRAPPED: "我被困住",
    NEED_MEDICAL: "我需要醫療",
    CANNOT_TALK: "無法說話",
    CANNOT_MOVE: "我被困住",
    DISCOMFORT: "我受傷",
    LOCATION_UPDATE: "GPS 更新",
    LOCATION_UNKNOWN: "我不知道位置",
    NO_RESPONSE: "無法回覆",
  };

  const routeLabels = {
    WIFI: "Wi-Fi",
    LTE: "5G / LTE",
    SMS: "SMS",
    BLE_RELAY: "BLE Relay",
    SATELLITE: "Satellite Backup",
    APP_PUSH: "App",
    LOW_DATA_TEXT: "低資料",
    SMS_SIMULATED: "SMS",
    VOICE_IVR_SIMULATED: "Voice IVR 模擬",
    NONE: "無",
  };

  function estimateBytes(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function compactAccuracy(accuracy) {
    if (accuracy === "high") return "H";
    if (accuracy === "medium") return "M";
    if (accuracy === "low") return "L";
    const meters = Number(String(accuracy || "").match(/[\d.]+/)?.[0]);
    if (Number.isFinite(meters)) {
      if (meters <= 50) return "H";
      if (meters <= 150) return "M";
      return "L";
    }
    return "U";
  }

  function statusCodeFor(replyCode) {
    const map = {
      SAFE: "OK",
      STATUS_CLEAR: "CLEAR",
      SOS_BUTTON: "NEED_HELP",
      NEED_HELP: "NEED_HELP",
      INJURED: "INJURED",
      DISCOMFORT: "INJURED",
      NEED_MEDICAL: "INJURED",
      TRAPPED: "TRAPPED",
      CANNOT_MOVE: "TRAPPED",
      CANNOT_TALK: "NEED_HELP",
      LOCATION_UPDATE: "LOCATION_UPDATE",
      LOCATION_UNKNOWN: "NEED_HELP",
      NO_RESPONSE: "NO_RESPONSE",
    };
    return map[replyCode] || "NEED_HELP";
  }

  function checksumFor(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash + text.charCodeAt(index) * (index + 1)) % 65535;
    }
    return hash.toString(16).padStart(4, "0");
  }

  function routeForSignal(signalQuality) {
    const signal = Number(signalQuality || 0);
    if (signal >= 70) {
      return { primaryRoute: "WIFI", fallbackRoute: "LTE" };
    }
    if (signal >= 40) {
      return { primaryRoute: "LTE", fallbackRoute: "SMS" };
    }
    return { primaryRoute: "SMS", fallbackRoute: "BLE_RELAY" };
  }

  function encodeLowDataPacket(target, replyCode, seq, nowMs = Date.now()) {
    const payload = {
      userId: target.id,
      timestamp: nowMs,
      gps: {
        lat: target.location.lat,
        lng: target.location.lng,
        accuracy: target.location.confirmed ? target.location.accuracy : "unknown",
      },
      statusCode: statusCodeFor(replyCode),
      batteryLevel: Math.round(Number(target.battery || 0)),
      riskLevel: String(target.risk?.level || "GREEN").toUpperCase(),
      packetSeq: seq,
      retryCount: Number(target.communication?.retryCount || 0),
    };

    if (payload.gps.lat !== null && payload.gps.lng !== null && payload.gps.lat !== undefined && payload.gps.lng !== undefined) {
      payload.gps.lat = Number(payload.gps.lat.toFixed(5));
      payload.gps.lng = Number(payload.gps.lng.toFixed(5));
    } else {
      payload.gps.lat = null;
      payload.gps.lng = null;
    }
    payload.checksum = checksumFor({ ...payload, checksum: undefined });
    return payload;
  }

  function makePacket(target, replyCode, seq, nowMs = Date.now()) {
    const payload = encodeLowDataPacket(target, replyCode, seq, nowMs);
    const compactPayload = {
      u: payload.userId,
      ts: Math.floor(payload.timestamp / 1000),
      gps: payload.gps.lat === null ? "U" : `${payload.gps.lat},${payload.gps.lng},${compactAccuracy(payload.gps.accuracy)}`,
      s: payload.statusCode,
      b: payload.batteryLevel,
      risk: payload.riskLevel,
      seq: payload.packetSeq,
      r: payload.retryCount,
      c: payload.checksum,
    };

    const body = JSON.stringify(compactPayload);
    return {
      payload,
      compactPayload,
      body,
      bytes: estimateBytes(body),
      preview: JSON.stringify(payload, null, 2),
    };
  }

  function makeAck(targetId, seq, nowMs = Date.now()) {
    return {
      ack: true,
      u: targetId,
      seq,
      serverTime: Math.floor(nowMs / 1000),
    };
  }

  function routeLabel(route) {
    return routeLabels[route] || route || "-";
  }

  global.XY_LOW_DATA = {
    replyLabels,
    routeLabels,
    estimateBytes,
    compactAccuracy,
    statusCodeFor,
    checksumFor,
    encodeLowDataPacket,
    routeForSignal,
    makePacket,
    makeAck,
    routeLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
