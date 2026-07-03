(function (global) {
  const statusCodes = {
    safe: "SAFE",
    help: "HELP",
    cannotMove: "STOP",
    medical: "SICK",
    locationUnknown: "LOC?",
    noResponse: "NORES",
    unknown: "PING",
  };

  function estimateBytes(payload) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return text.length;
  }

  function compactGps(gps) {
    return {
      lat: Number(gps.latitude).toFixed(3),
      lng: Number(gps.longitude).toFixed(3),
      acc: Math.round(Number(gps.accuracyMeters || 0)),
    };
  }

  function compactPayload(simulationState) {
    const user = simulationState.user;
    const gps = compactGps(user.gps);
    return {
      uid: user.id,
      lat: Number(gps.lat),
      lng: Number(gps.lng),
      acc: gps.acc,
      s: statusCodes[user.responseStatus] || statusCodes.unknown,
      b: Math.round(user.battery),
      sig: Math.round(user.signalStrength),
      t: Math.floor(Date.now() / 1000),
    };
  }

  function createPacket(simulationState, options = {}) {
    const payload = compactPayload(simulationState);
    const retry = Number(options.retryCount || simulationState.communication?.retryCount || 0);
    if (retry) payload.r = retry;
    const body = JSON.stringify(payload);
    return {
      id: `pkt-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      label: options.label || payload.s || "STATUS",
      kind: options.kind || "STATUS",
      payload,
      body,
      bytes: estimateBytes(body),
      retryCount: retry,
      status: options.status || "sending",
      createdAt: new Date().toISOString(),
    };
  }

  function statusLabel(packetStatus) {
    const map = {
      ready: "待命",
      sending: "封包已送出",
      retrying: "等待確認 / 重送",
      queued: "離線佇列",
      acked: "已被守望隊接收",
    };
    return map[packetStatus] || packetStatus || "待命";
  }

  global.XY_PACKET = {
    compactPayload,
    createPacket,
    estimateBytes,
    statusLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_PACKET;
}
