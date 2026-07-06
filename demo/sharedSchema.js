(function (global) {
  const APP_KIND = "xingye-sea-ground-space-demo";
  const REQUIRED_PUBLIC_STATE_KEYS = ["targets", "packetLog", "events", "starryState"];

  function migrateRecipientsToTargets(state) {
    if (!state || typeof state !== "object") return state;
    if ((!Array.isArray(state.targets) || state.targets.length === 0) && Array.isArray(state.recipients)) {
      state.targets = state.recipients;
    }
    if (state.event && !Array.isArray(state.event.targets) && Array.isArray(state.event.recipients)) {
      state.event.targets = state.event.recipients;
    }
    delete state.recipients;
    if (state.event) delete state.event.recipients;
    REQUIRED_PUBLIC_STATE_KEYS.forEach((key) => {
      if (key === "starryState") state[key] = state[key] || {};
      else if (!Array.isArray(state[key])) state[key] = [];
    });
    return state;
  }

  global.XY_SHARED_SCHEMA = {
    APP_KIND,
    REQUIRED_PUBLIC_STATE_KEYS,
    migrateRecipientsToTargets,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_SHARED_SCHEMA;
}
