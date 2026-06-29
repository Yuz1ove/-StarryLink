(function (global) {
  const data = global.XY_DATA || {};

  global.XY_SCENARIOS = {
    scenarios: data.scenarios || [],
    demoScript: data.demoScript || [],
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_SCENARIOS;
}
