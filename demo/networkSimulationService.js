(function (global) {
  const STORAGE_KEY = "starrylink-resilience-sync:network-simulation:v1";
  const listeners = new Set();

  const MODE_PRESETS = {
    normal: {
      mode: "normal",
      label: "正常",
      groundNetwork: "normal",
      currentLink: "wifi",
      networkQuality: 92,
      latencyMs: 180,
      packetLossRate: 2,
      canRemoteSync: true,
      cloudStatus: "可同步",
    },
    weak: {
      mode: "weak",
      label: "弱網",
      groundNetwork: "unstable",
      currentLink: "cellular",
      networkQuality: 42,
      latencyMs: 980,
      packetLossRate: 18,
      canRemoteSync: true,
      cloudStatus: "慢速同步",
    },
    offline: {
      mode: "offline",
      label: "完全離線",
      groundNetwork: "down",
      currentLink: "offline",
      networkQuality: 0,
      latencyMs: 0,
      packetLossRate: 100,
      canRemoteSync: false,
      cloudStatus: "等待恢復",
    },
    fallback: {
      mode: "fallback",
      label: "備援鏈路",
      groundNetwork: "down",
      currentLink: "lora",
      networkQuality: 28,
      latencyMs: 1680,
      packetLossRate: 36,
      canRemoteSync: false,
      cloudStatus: "本地佇列保留",
    },
  };

  const LINK_LABELS = {
    wifi: "Wi-Fi",
    cellular: "5G / LTE",
    lora: "LoRa 模擬",
    satellite: "衛星備援模擬",
    mesh: "Mesh 模擬",
    offline: "離線佇列",
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readStoredState() {
    try {
      const stored = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null");
      return stored && MODE_PRESETS[stored.mode] ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredState(next) {
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // The service remains usable in memory when storage is unavailable.
    }
  }

  let state = {
    ...MODE_PRESETS.normal,
    demoMode: true,
    lastChangedAt: nowIso(),
    lastReason: "initial",
  };

  state = { ...state, ...readStoredState() };

  function emit(previous = null) {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot, previous ? clone(previous) : null));
    if (global.dispatchEvent && typeof global.CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("starry-network-simulation-change", { detail: snapshot }));
    }
  }

  function setMode(mode, options = {}) {
    const preset = MODE_PRESETS[mode] || MODE_PRESETS.normal;
    const previous = state;
    state = {
      ...preset,
      demoMode: true,
      currentLink: options.currentLink || preset.currentLink,
      lastChangedAt: nowIso(),
      lastReason: options.reason || preset.label,
    };
    writeStoredState(state);
    emit(previous);
    return getState();
  }

  function getState() {
    return clone(state);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function linkLabel(link) {
    return LINK_LABELS[link] || link || "-";
  }

  function linkFromRoute(route) {
    const normalized = String(route || "").toUpperCase();
    if (normalized === "WIFI") return "wifi";
    if (normalized === "LTE" || normalized === "APP_PUSH") return "cellular";
    if (normalized === "SMS") return "lora";
    if (normalized === "BLE_RELAY") return "mesh";
    if (normalized === "SATELLITE") return "satellite";
    return state.currentLink || "cellular";
  }

  function selectLink(target = {}, appState = {}) {
    const current = getState();
    if (current.mode === "offline") return "offline";
    if (current.mode === "fallback") {
      const riskLevel = String(target.risk?.level || "").toUpperCase();
      if (riskLevel === "RED" || target.communication?.satelliteRecommended) return "satellite";
      if (riskLevel === "ORANGE" || Number(target.communication?.retryCount || 0) >= 2) return "mesh";
      return "lora";
    }
    const network = appState.event?.network || {};
    if (network.groundBackboneStatus === "down" || network.mobileAvailable === false) {
      return target.communication?.satelliteRecommended ? "satellite" : "mesh";
    }
    return linkFromRoute(target.communication?.primaryRoute);
  }

  function applyBrowserNetworkListeners() {
    if (!global.addEventListener) return;
    global.addEventListener("offline", () => {
      setMode("offline", { reason: "browser offline event" });
    });
    global.addEventListener("online", () => {
      setMode("normal", { reason: "browser online event" });
    });
  }

  applyBrowserNetworkListeners();

  global.XY_NETWORK_SIMULATION = {
    MODE_PRESETS,
    LINK_LABELS,
    getState,
    setMode,
    subscribe,
    selectLink,
    linkLabel,
    linkFromRoute,
    restore: () => setMode("normal", { reason: "manual restore" }),
    simulateWeak: () => setMode("weak", { reason: "manual weak network" }),
    simulateOffline: () => setMode("offline", { reason: "manual offline" }),
    simulateFallback: (link = "lora") => setMode("fallback", { currentLink: link, reason: "manual fallback link" }),
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_NETWORK_SIMULATION;
}
