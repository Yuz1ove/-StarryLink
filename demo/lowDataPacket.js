(function (global) {
  const replyLabels = {
    SAFE: "我安全",
    NEED_HELP: "我需要協助",
    CANNOT_MOVE: "我無法移動",
    DISCOMFORT: "我身體不適",
    LOCATION_UNKNOWN: "我不知道位置",
    NO_RESPONSE: "無法回覆",
  };

  const routeLabels = {
    APP_PUSH: "App",
    LOW_DATA_TEXT: "低資料",
    SMS_SIMULATED: "簡訊模擬",
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
    return "U";
  }

  function routeForSignal(signalQuality) {
    const signal = Number(signalQuality || 0);
    if (signal >= 70) {
      return { primaryRoute: "APP_PUSH", fallbackRoute: "LOW_DATA_TEXT" };
    }
    if (signal >= 40) {
      return { primaryRoute: "LOW_DATA_TEXT", fallbackRoute: "SMS_SIMULATED" };
    }
    return { primaryRoute: "LOW_DATA_TEXT", fallbackRoute: "SMS_SIMULATED" };
  }

  function makePacket(target, replyCode, seq, nowMs = Date.now()) {
    const payload = {
      u: target.id,
      seq,
      r: replyCode,
      acc: compactAccuracy(target.location.accuracy),
      hr: target.medical.heartRate,
      spo2: target.medical.spo2,
      sig: Math.round(target.signalQuality),
      bat: Math.round(target.battery),
      t: Math.floor(nowMs / 1000),
    };

    if (target.location.lat !== null && target.location.lng !== null) {
      payload.lat = Number(target.location.lat.toFixed(3));
      payload.lng = Number(target.location.lng.toFixed(3));
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === null || payload[key] === undefined || payload[key] === "") {
        delete payload[key];
      }
    });

    const body = JSON.stringify(payload);
    return {
      payload,
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
    routeForSignal,
    makePacket,
    makeAck,
    routeLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
