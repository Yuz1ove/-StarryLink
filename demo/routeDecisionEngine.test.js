const assert = require("node:assert/strict");

const data = require("./data.js");
const engine = require("./routeDecisionEngine.js");

function scenario(id) {
  return JSON.parse(JSON.stringify(data.scenarios.find((item) => item.id === id)));
}

function run() {
  const family = scenario("family_checkin");
  const familyPlan = engine.routeScenario(family, family.recipients, family.network);
  assert.ok(["SMS", "Voice IVR"].includes(familyPlan.primaryChannel), "弱網家庭情境應優先 SMS 或 IVR");
  assert.ok(familyPlan.fallbackChannels.includes("Voice IVR") || familyPlan.fallbackChannels.includes("Satellite Relay"), "高嚴重度應提供語音或衛星備援");

  const elderDecision = familyPlan.decisions.find((decision) => decision.recipientId === "r-elder");
  assert.notEqual(elderDecision.selectedChannel, "App Push", "長者不應只依賴 App Push");
  assert.ok(elderDecision.fallbackChannels.includes("Voice IVR") || elderDecision.selectedChannel === "Voice IVR", "長者應包含語音 IVR");

  const noMobile = scenario("family_checkin");
  noMobile.network.mobileAvailable = false;
  noMobile.network.fixedLineAvailable = true;
  const noMobilePlan = engine.routeScenario(noMobile, noMobile.recipients, noMobile.network);
  assert.ok(!["App Push", "SMS"].includes(noMobilePlan.primaryChannel), "行動網路不可用時不應選 Push 或 SMS");

  const enterprise = scenario("enterprise_continuity");
  const enterprisePlan = engine.routeScenario(enterprise, enterprise.recipients, enterprise.network);
  assert.equal(enterprisePlan.primaryChannel, "App Push", "企業網路正常時應優先 App Push");

  console.log("routeDecisionEngine tests passed");
}

run();
