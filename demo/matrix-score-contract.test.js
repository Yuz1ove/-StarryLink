"use strict";

const assert = require("node:assert/strict");
const contract = require("./matrix-score-contract.js");

const maxTotal = contract.INDICATORS.reduce((sum, item) => sum + item.maxPoints, 0);
assert.equal(maxTotal, 100, "indicator maxima must total exactly 100");
assert.deepEqual(contract.INDICATORS.map((item) => item.order), [1, 2, 3, 4, 5, 6]);
assert.equal(new Set(contract.INDICATORS.map((item) => item.id)).size, 6);
assert.equal(contract.validateConfig(), true);

assert.deepEqual(
  contract.THRESHOLDS.map(({ level, min, max }) => [level, min, max]),
  [
    ["GREEN", 0, 24],
    ["YELLOW", 25, 54],
    ["ORANGE", 55, 79],
    ["RED", 80, 100],
  ]
);
for (let score = 0; score <= 100; score += 1) {
  assert.ok(contract.levelFor(score), `threshold missing at ${score}`);
}

const nowMs = Date.UTC(2026, 6, 23, 9, 0, 0);
const severe = {
  selectedSymptoms: ["NEED_HELP", "TRAPPED", "CANNOT_TALK"],
  latestReply: { code: "NEED_HELP", timestamp: nowMs - 20 * 60000 },
  signalQuality: 18,
  battery: 72,
  location: { confirmed: true, accuracy: "high", staticMinutes: 0, source: "GPS" },
  medical: { heartRate: 118, spo2: 92, breathingDifficulty: true, trapped: true },
  communication: { ackStatus: "failed", retryCount: 4, lastAckAt: new Date(nowMs - 20 * 60000).toISOString() },
  lastUpdatedAt: new Date(nowMs - 20 * 60000).toISOString(),
};
const severeResult = contract.scoreTarget(severe, { nowMs });
assert.equal(severeResult.score, 80, "severe demo fixture should reach RED without back-solving to 100");
assert.equal(severeResult.level, "RED");
assert.equal(severeResult.indicators.reduce((sum, item) => sum + item.earnedPoints, 0), severeResult.score);
severeResult.indicators.forEach((item) => {
  assert.ok(item.earnedPoints >= 0 && item.earnedPoints <= item.maxPoints, `${item.id} escaped its configured bound`);
  assert.equal(typeof item.rawSignal, "string");
  assert.equal(typeof item.rawStatus, "string");
  assert.equal(typeof item.rationale, "string");
});

const safe = {
  selectedSymptoms: ["SAFE"],
  latestReply: { code: "SAFE", timestamp: nowMs - 60000 },
  signalQuality: 82,
  battery: 83,
  location: { confirmed: true, accuracy: "high", staticMinutes: 0, source: "GPS" },
  medical: { heartRate: 78, spo2: 98 },
  communication: { ackStatus: "received", retryCount: 0, lastAckAt: new Date(nowMs - 60000).toISOString() },
  lastUpdatedAt: new Date(nowMs - 60000).toISOString(),
};
const safeResult = contract.scoreTarget(safe, { nowMs });
assert.equal(safeResult.score, 0);
assert.equal(safeResult.level, "GREEN");

assert.throws(
  () => contract.validateConfig(contract.INDICATORS.map((item, index) => ({ ...item, maxPoints: index === 0 ? 29 : item.maxPoints }))),
  /total 100/
);
assert.throws(
  () => contract.validateConfig(contract.INDICATORS.map((item, index) => ({ ...item, order: index === 5 ? 5 : item.order }))),
  /unique order/
);

console.log("StarryLink Matrix 100-point score contract passed.");
