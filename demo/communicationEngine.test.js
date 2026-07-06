const assert = require("node:assert/strict");

const engine = require("./communicationEngine.js");

function target(overrides = {}) {
  return {
    id: "U-T",
    signalQuality: 82,
    battery: 80,
    location: { confirmed: true, accuracy: "high", source: "GPS" },
    communication: {},
    ...overrides,
  };
}

function network(overrides = {}) {
  return {
    disasterMode: false,
    seaCableStatus: "normal",
    groundBackboneStatus: "normal",
    backboneLatencyMs: 180,
    backbonePacketLossPercent: 2,
    groundCongestion: 20,
    mobileAvailable: true,
    satelliteAvailable: true,
    ...overrides,
  };
}

function run() {
  const normal = engine.decisionForTarget(target(), { level: "GREEN" }, network());
  assert.ok(["WIFI", "LTE"].includes(normal.primary.id), "正常網路 + 低風險應優先 Wi-Fi 或 5G");
  assert.notEqual(normal.primary.id, "SATELLITE", "Satellite 不應在 GREEN 狀態無條件勝出");

  const weakMedium = engine.decisionForTarget(
    target({ signalQuality: 32 }),
    { level: "ORANGE" },
    network({ disasterMode: true, seaCableStatus: "degraded", backboneLatencyMs: 1450, backbonePacketLossPercent: 30, groundCongestion: 86 })
  );
  assert.ok(["SMS", "BLE_RELAY", "SATELLITE"].includes(weakMedium.primary.id), "弱訊號 + 中高風險應提高 SMS / BLE Relay");
  assert.equal(weakMedium.lowDataMode, true, "弱網 + ORANGE 應啟用 lowDataMode");

  const groundDownRed = engine.decisionForTarget(
    target({ signalQuality: 18, battery: 72 }),
    { level: "RED" },
    network({ disasterMode: true, groundBackboneStatus: "down", mobileAvailable: false, backboneLatencyMs: 2600, backbonePacketLossPercent: 64 })
  );
  assert.ok(["SATELLITE", "BLE_RELAY", "SMS"].includes(groundDownRed.primary.id), "地面網路失效 + RED 應提高高優先備援");
  assert.equal(groundDownRed.satelliteRecommended, true, "RED + ground down 應保留 Satellite Backup");

  const highBattery = engine.buildChannelStates(target({ battery: 80 }), network()).find((channel) => channel.id === "SATELLITE");
  const lowBattery = engine.buildChannelStates(target({ battery: 9 }), network()).find((channel) => channel.id === "SATELLITE");
  assert.ok(lowBattery.batteryImpact < highBattery.batteryImpact, "電量低時高耗電通道 batteryImpact 應下降");

  const gpsUnknown = engine.decisionForTarget(target({ location: { confirmed: false, accuracy: "unknown", source: "GPS_DENIED" } }), { level: "YELLOW" }, network());
  assert.ok(gpsUnknown.scores.some((channel) => channel.gpsAvailability < 80), "GPS 未確認應反映在 channel gpsAvailability");
  assert.ok(gpsUnknown.reason, "決策應輸出為什麼選這條通道");
  assert.ok(gpsUnknown.primary.scoreBreakdown.components.packetSuccessRate > 0, "每個 channel 應有 score breakdown");
}

run();
console.log("communicationEngine tests passed");
