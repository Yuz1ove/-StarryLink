(function (global) {
  const lowData = global.XY_LOW_DATA;

  function estimateBytes(value) {
    if (lowData?.estimateBytes) return lowData.estimateBytes(value);
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function countFields(value) {
    if (!value || typeof value !== "object") return 0;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + countFields(item), 0);
    return Object.entries(value).reduce((sum, [, item]) => sum + 1 + countFields(item), 0);
  }

  function estimatePacketMetrics(payload, options = {}) {
    const rawSizeBytes = estimateBytes(payload);
    const observedPacketBytes = Number(options.observedPacketBytes || 0);
    const estimatedCompactBytes = Math.max(96, Math.round(rawSizeBytes * 0.34));
    const compressedSizeBytes = observedPacketBytes > 0 ? observedPacketBytes : estimatedCompactBytes;
    const reductionRate = rawSizeBytes > 0 ? Math.max(0, Math.round((1 - compressedSizeBytes / rawSizeBytes) * 1000) / 10) : 0;
    return {
      rawSizeBytes,
      compressedSizeBytes,
      packetSizeBytes: compressedSizeBytes,
      fieldCount: countFields(payload),
      reductionRate,
      label: "Demo 封包序列化估算",
    };
  }

  global.XY_PACKET_METRICS = {
    estimateBytes,
    countFields,
    estimatePacketMetrics,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_PACKET_METRICS;
}
