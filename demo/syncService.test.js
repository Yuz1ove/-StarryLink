const assert = require("node:assert/strict");

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

global.localStorage = createMemoryStorage();
global.__STARRYLINK_SYNC_TEST_DELAY_MS = 1;

require("./lowDataPacket.js");
require("./persistenceRepositories.js");
require("./networkSimulationService.js");
require("./packetMetricsService.js");
const service = require("./syncService.js");

function target(seq, overrides = {}) {
  return {
    id: "U-DEMO",
    name: "Demo 使用者",
    signalQuality: 82,
    battery: 74,
    selectedSymptoms: ["INJURED"],
    latestReply: { code: "INJURED", label: "我受傷", timestamp: Date.now() },
    location: {
      lat: 25.035,
      lng: 121.564,
      accuracy: "18m",
      confirmed: true,
      source: "GPS",
      updatedAt: new Date().toISOString(),
    },
    medical: { injury: true, heartRate: 112, spo2: 95 },
    risk: {
      score: 78,
      displayRiskScore: 78,
      rawRiskScore: 78,
      level: "ORANGE",
      action: "SEND_VOLUNTEER",
      items: [{ label: "受困者按鍵區", score: 66, detail: "我受傷 = raw 66" }],
    },
    communication: {
      packetSeq: seq,
      packetBytes: 132,
      primaryRoute: "SMS",
      fallbackRoute: "BLE_RELAY",
      retryCount: 0,
      lowDataMode: true,
      satelliteRecommended: false,
      averageLatencyMs: 980,
      packetLossRate: 18,
    },
    ...overrides,
  };
}

function appState(activeTarget) {
  return {
    activeTargetId: activeTarget.id,
    event: {
      network: {
        groundBackboneStatus: "unstable",
        mobileAvailable: true,
        backbonePacketLossPercent: 18,
      },
    },
    targets: [activeTarget],
  };
}

function packetEntry(activeTarget, replyCode = "INJURED") {
  const packet = global.XY_LOW_DATA.makePacket(activeTarget, replyCode, activeTarget.communication.packetSeq);
  return {
    seq: activeTarget.communication.packetSeq,
    bytes: packet.bytes,
    packet: packet.preview,
  };
}

async function run() {
  await service.clearDemoData();
  global.XY_NETWORK_SIMULATION.setMode("normal");

  const onlineTarget = target(1);
  await service.recordStatusReport({
    state: appState(onlineTarget),
    target: onlineTarget,
    replyCode: "INJURED",
    packetEntry: packetEntry(onlineTarget),
    source: "mobile-reply",
    seq: 1,
  });
  let snapshot = await service.refreshSnapshot({ silent: true });
  assert.equal(snapshot.reports.length, 1, "normal report should persist once");
  assert.equal(snapshot.reports[0].syncStatus, "synced", "normal report should sync");
  assert.equal(snapshot.queue.length, 0, "normal report should leave no pending queue item");

  global.XY_NETWORK_SIMULATION.setMode("offline");
  const offlineA = target(2, { risk: { ...onlineTarget.risk, score: 62, displayRiskScore: 62, rawRiskScore: 62, level: "ORANGE" } });
  const offlineB = target(3, { selectedSymptoms: ["TRAPPED"], risk: { ...onlineTarget.risk, score: 92, displayRiskScore: 92, rawRiskScore: 92, level: "RED" } });
  await service.recordStatusReport({ state: appState(offlineA), target: offlineA, replyCode: "INJURED", packetEntry: packetEntry(offlineA), source: "mobile-reply", seq: 2 });
  await service.recordStatusReport({ state: appState(offlineB), target: offlineB, replyCode: "TRAPPED", packetEntry: packetEntry(offlineB, "TRAPPED"), source: "mobile-reply", seq: 3 });
  snapshot = await service.refreshSnapshot({ silent: true });
  assert.equal(snapshot.summary.pending, 2, "offline reports should enter pending queue");
  assert.equal(snapshot.reports.filter((report) => report.syncStatus === "pending").length, 2, "offline reports should not show synced");

  global.XY_NETWORK_SIMULATION.setMode("normal");
  await service.syncPending();
  snapshot = await service.refreshSnapshot({ silent: true });
  assert.equal(snapshot.summary.pending, 0, "restore should drain pending queue");
  assert.equal(snapshot.queue.length, 0, "restore should remove synced queue items");
  assert.equal(snapshot.reports.filter((report) => report.syncStatus === "synced").length, 3, "all reports should be synced after restore");
  assert.ok(snapshot.reports.every((report) => report.syncedAt), "synced reports should have syncedAt");

  await service.recordStatusReport({ state: appState(offlineB), target: offlineB, replyCode: "TRAPPED", packetEntry: packetEntry(offlineB, "TRAPPED"), source: "mobile-reply", seq: 3 });
  snapshot = await service.refreshSnapshot({ silent: true });
  assert.equal(snapshot.reports.length, 3, "same report id should not duplicate history");

  const gpsDenied = target(4, {
    location: { lat: null, lng: null, accuracy: "unknown", confirmed: false, source: "GPS_DENIED", updatedAt: new Date().toISOString() },
    latestReply: { code: "LOCATION_UNKNOWN", label: "無法確認位置", timestamp: Date.now() },
  });
  await service.recordStatusReport({
    state: appState(gpsDenied),
    target: gpsDenied,
    replyCode: "LOCATION_UNKNOWN",
    packetEntry: packetEntry(gpsDenied, "LOCATION_UNKNOWN"),
    source: "location-update",
    seq: 4,
  });
  snapshot = await service.refreshSnapshot({ silent: true });
  const deniedReport = snapshot.reports.find((report) => report.locationSource === "GPS_DENIED");
  assert.ok(deniedReport, "GPS denied report should be persisted");
  assert.equal(deniedReport.latitude, null, "GPS denied latitude should remain null");
  assert.equal(deniedReport.longitude, null, "GPS denied longitude should remain null");
}

run()
  .then(() => console.log("syncService tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
