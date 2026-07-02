const assert = require("node:assert/strict");

const data = require("./data.js");
const engine = require("./routeDecisionEngine.js");
require("./scenarioTemplates.js");
const severityEngine = require("./severityEngine.js");
const decisionEngine = require("./decisionEngine.js");
const randomEventGenerator = require("./randomEventGenerator.js");

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

  const actionBase = {
    disasterMode: true,
    network: {
      bandwidthKbps: 48,
      latencyMs: 950,
      packetLossRate: 12,
      baseStationCongestion: 78,
      sseConnected: true,
    },
    recipient: {
      id: "r-elder",
      type: "elder",
      canUseVoice: true,
      canUseText: true,
      elderFriendly: true,
      riskProfile: "elder",
    },
    channels: {
      appPush: false,
      sms: true,
      voiceIvr: true,
      line: false,
      email: true,
      satelliteRelay: true,
      manualCall: true,
    },
    ack: {
      required: true,
      received: false,
      retryCount: 0,
      lastStatus: "waiting_ack",
    },
    location: {
      simulated: true,
      sameLan: true,
      confidence: 0.72,
      distanceToHelperKm: 1.2,
      nearestHelper: "社區守望者",
      etaMinutes: 6,
    },
  };

  const medicalDecision = engine.routeActionDecision({ ...actionBase, eventSeverity: 5, action: "NEED_MEDICAL" });
  assert.equal(medicalDecision.primaryChannel, "SMS", "NEED_MEDICAL + 弱網 + 災害模式應以 SMS 為主通道");
  assert.ok(medicalDecision.backupChannels.includes("Manual Call"), "NEED_MEDICAL 應建議 Manual Call");
  assert.ok(medicalDecision.dispatchSuggestion.includes("最高優先級"), "NEED_MEDICAL 應是最高優先級");
  assert.ok(Array.isArray(medicalDecision.scoringMatrix), "route decision 應輸出 scoringMatrix");
  assert.ok(medicalDecision.scoringMatrix.some((row) => row.factor === "事件類型"), "scoringMatrix 應包含事件類型");
  [
    "事件類型",
    "事件嚴重度",
    "災害模式",
    "網路頻寬",
    "延遲",
    "封包遺失率",
    "ACK 狀態",
    "retry 次數",
    "是否可通話",
    "是否可文字",
    "長者最近回答",
    "是否獨自一人",
    "位置來源",
    "GPS 精準度",
    "位置是否異常",
    "通訊資料完整度",
    "最近協助者距離",
    "未回覆時間",
  ].forEach((factor) => {
    assert.ok(medicalDecision.scoringMatrix.some((row) => row.factor === factor && row.reason), `scoringMatrix 應包含 ${factor} 與 reason`);
  });

  const medicalGpsOk = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    ack: { ...actionBase.ack, received: true, lastStatus: "acknowledged", status: "acknowledged" },
    location: { source: "GPS", lat: 25.0123, lng: 121.4621, accuracy: 38, sameLan: true, confidence: 0.92, distanceToHelperKm: 1.2 },
    recipient: { ...actionBase.recipient, phoneMasked: "09xx-xxx-186", guardianPhoneMasked: "09xx-xxx-203", preferredChannels: ["sms"], communicationProfileComplete: true },
  });
  assert.ok(medicalGpsOk.riskScore >= 60, "NEED_MEDICAL + GPS OK + ACK OK 仍應維持高風險");
  assert.ok(medicalGpsOk.scoringMatrix.find((row) => row.factor === "位置來源").scoreDelta < 0, "GPS 成功應降低位置不確定風險");

  const medicalGpsDeniedAlone = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    location: { source: "GPS_DENIED", gpsDenied: true, sameLan: true, simulated: true, confidence: 0.72, distanceToHelperKm: 1.2 },
    triage: { elderResponded: true, alone: true, unableToRespond: false, safetyConfirmed: false, unansweredCount: 0, lastAnswerCode: "MED_ALONE" },
  });
  assert.ok(medicalGpsDeniedAlone.riskTier === "緊急優先", "NEED_MEDICAL + GPS denied + alone 應為緊急優先");
  assert.ok(medicalGpsDeniedAlone.locationWarnings.some((warning) => warning.includes("未授權 GPS")), "GPS denied 應建議人工確認位置");

  const medicalNoReply = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    conversation: {
      hasActiveThread: true,
      elderResponded: false,
      unansweredOperatorMessages: 1,
      unansweredMinutes: 6,
      safetyConfirmed: false,
    },
  });
  assert.ok(medicalNoReply.riskScore >= medicalDecision.riskScore, "NEED_MEDICAL 且長者尚未回覆時風險應提高");
  assert.ok(medicalNoReply.nextActions.some((item) => item.includes("升級")), "未回覆的後台訊息應建議升級處理");

  const medicalAlone = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    conversation: {
      hasActiveThread: true,
      elderResponded: true,
      lastQuickReply: "我一個人",
      unansweredOperatorMessages: 0,
      safetyConfirmed: false,
    },
  });
  assert.ok(medicalAlone.dispatchSuggestion.includes("我一個人"), "quick reply 我一個人應進入派遣建議");
  assert.ok(medicalAlone.nextActions.some((item) => item.includes("指定守護者")), "我一個人應建議通知指定守護者");

  const medicalConfirmed = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    conversation: {
      hasActiveThread: true,
      elderResponded: true,
      lastQuickReply: "我安全",
      safetyConfirmed: true,
      unansweredOperatorMessages: 0,
    },
  });
  assert.ok(medicalConfirmed.riskScore < medicalNoReply.riskScore, "safetyConfirmed 應降低但不清除醫療風險");
  assert.ok(medicalConfirmed.riskScore >= 55, "NEED_MEDICAL 已確認安全後仍需保留最低風險");

  const noTalkDecision = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 4,
    action: "CANNOT_TALK",
    recipient: { ...actionBase.recipient, canUseVoice: false },
  });
  assert.equal(noTalkDecision.primaryChannel, "SMS", "CANNOT_TALK 不應把 Voice IVR 當主要回覆方式");
  assert.notEqual(noTalkDecision.primaryChannel, "Voice IVR", "CANNOT_TALK 主通道不可為 Voice IVR");
  const voiceScore = noTalkDecision.routeScoreTable.find((item) => item.channel === "voiceIvr").score;
  const smsScore = noTalkDecision.routeScoreTable.find((item) => item.channel === "sms").score;
  assert.ok(voiceScore < smsScore, "CANNOT_TALK 應明顯降低 Voice IVR 分數");
  assert.equal(noTalkDecision.routeScoreTable.find((item) => item.channel === "voiceIvr").available, false, "canUseVoice=false 時 Voice IVR 不可用");

  const lowAccuracyLocation = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 4,
    action: "LOCATION_ANOMALY",
    location: { source: "GPS", lat: 25.0123, lng: 121.4621, accuracy: 280, isAnomaly: true, confidence: 0.42, distanceToHelperKm: 2.5 },
  });
  assert.ok(lowAccuracyLocation.scoringMatrix.find((row) => row.factor === "GPS 精準度").scoreDelta > 0, "LOCATION_ANOMALY + GPS low accuracy 應提高位置確認風險");

  const missingGuardian = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    recipient: { ...actionBase.recipient, phoneMasked: "09xx-xxx-186", guardianPhoneMasked: "", preferredChannels: ["sms"], communicationProfileComplete: false },
  });
  assert.ok(missingGuardian.communicationWarnings.some((warning) => warning.includes("守護者")), "缺 guardian contact 應出現 communicationWarnings");

  const weakDisaster = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 4,
    action: "NEED_HELP",
    disasterMode: true,
    network: { ...actionBase.network, bandwidthKbps: 18, packetLossRate: 32, latencyMs: 1200 },
  });
  assert.equal(weakDisaster.primaryChannel, "SMS", "bandwidth 低 + packetLoss 高 + disasterMode 應偏向 SMS / LOW_DATA_TEXT");

  const retryEscalation = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 3,
    action: "NEED_HELP",
    ack: { required: true, received: false, retryCount: 3, status: "retrying", lastStatus: "retrying" },
  });
  assert.equal(retryEscalation.escalationRequired, true, "retryCount 增加應觸發 escalationRequired");

  const safeDecision = engine.routeActionDecision({
    ...actionBase,
    disasterMode: false,
    eventSeverity: 1,
    action: "SAFE_OK",
    network: { ...actionBase.network, bandwidthKbps: 512, latencyMs: 220, packetLossRate: 1, baseStationCongestion: 20 },
    channels: { ...actionBase.channels, appPush: true, line: true },
    ack: { ...actionBase.ack, received: true, lastStatus: "acknowledged" },
  });
  assert.ok(safeDecision.riskScore < 45, "SAFE_OK 應是低風險");
  assert.equal(safeDecision.escalationRequired, false, "SAFE_OK 不應進入高優先待處理");

  const safeGpsDenied = engine.routeActionDecision({
    ...actionBase,
    disasterMode: false,
    eventSeverity: 1,
    action: "SAFE_OK",
    network: { ...actionBase.network, bandwidthKbps: 512, latencyMs: 220, packetLossRate: 1, baseStationCongestion: 20 },
    ack: { ...actionBase.ack, received: true, lastStatus: "acknowledged", status: "acknowledged" },
    location: { source: "GPS_DENIED", gpsDenied: true, sameLan: false, simulated: true, confidence: 0.25 },
  });
  assert.ok(safeGpsDenied.riskScore < 60, "SAFE_OK + GPS denied 不應升成高風險");
  assert.ok(safeGpsDenied.locationWarnings.some((warning) => warning.includes("未授權 GPS")), "SAFE_OK + GPS denied 仍需顯示位置未授權");

  const helpDecision = engine.routeActionDecision({ ...actionBase, eventSeverity: 3, action: "NEED_HELP" });
  assert.ok(helpDecision.escalationRequired, "NEED_HELP 若無 ACK 應可升級");
  assert.ok(helpDecision.ackPlan.required, "NEED_HELP 需要 ACK");

  const locationDecision = engine.routeActionDecision({ ...actionBase, eventSeverity: 4, action: "LOCATION_ANOMALY" });
  assert.ok(locationDecision.nextActions.some((item) => item.includes("非真實 GPS")), "LOCATION_ANOMALY 應標示非真實 GPS");
  assert.ok(locationDecision.dispatchSuggestion.includes("位置"), "LOCATION_ANOMALY 應包含位置確認建議");

  const locationNoReply = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 4,
    action: "LOCATION_ANOMALY",
    conversation: { hasActiveThread: true, elderResponded: false, safetyConfirmed: false },
  });
  assert.ok(locationNoReply.escalationRequired, "LOCATION_ANOMALY + 無長者回覆應建議人工確認");

  const severity = severityEngine.calculateSeverity({
    eventImpact: "major_disaster",
    networkMode: "disaster",
    userStatus: "NO_RESPONSE",
    gpsConfidence: "low",
    ackState: "failed",
    responseDelayMinutes: 7,
  });
  assert.equal(severity.severityScore, 100, "重大災害 + 失敗 ACK 應 clamp 到 100");
  assert.equal(severity.severityLevel, "SEV-5", "85-100 應映射為 SEV-5");
  assert.ok(severity.factors.some((factor) => factor.key === "ackFailureScore"), "severity factors 應包含 ACK 狀態");

  const dispatch = decisionEngine.evaluateDecision({
    severityLevel: "SEV-5",
    networkMode: "disaster",
    userStatus: "IMMOBILE",
    ackState: "failed",
    gpsConfidence: "low",
    batteryLevel: 12,
    slaMinutes: 5,
  });
  assert.equal(dispatch.watchTeamPriority, "critical", "SEV-5 + IMMOBILE 應提升守望隊 critical");
  assert.ok(dispatch.fallbackChannel.includes("Satellite Relay"), "災害模式應保留 Satellite Relay");
  assert.ok(dispatch.dispatchActions.includes("send_short_packet"), "低電量應優先短封包");

  const generated = randomEventGenerator.generateRandomEvent();
  [
    "eventTitle",
    "eventType",
    "eventDescription",
    "severityScore",
    "severityLevel",
    "networkMode",
    "userStatus",
    "gpsConfidence",
    "ackState",
    "decisionSummary",
    "dispatchActions",
  ].forEach((key) => {
    assert.ok(generated[key] !== undefined, `random event 應包含 ${key}`);
  });
  assert.ok(Array.isArray(generated.dispatchActions), "random event dispatchActions 應是陣列");

  const medicalAloneTriage = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    triageFlow: {
      flowId: "NEED_MEDICAL",
      currentQuestionId: "MED_Q3",
      completedQuestionIds: ["MED_Q1", "MED_Q2"],
      answers: [
        { questionId: "MED_Q1", answerCode: "MED_CAN_REPLY" },
        { questionId: "MED_Q2", answerCode: "MED_ALONE" },
      ],
    },
  });
  assert.ok(medicalAloneTriage.riskScore >= 85, "NEED_MEDICAL + MED_ALONE 應提高風險");
  assert.ok(medicalAloneTriage.recommendedOperatorAction.includes("人工聯繫") || medicalAloneTriage.dispatchSuggestion.includes("人工聯繫"), "MED_ALONE 應建議人工聯繫");

  const medicalHardReply = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 5,
    action: "NEED_MEDICAL",
    triageFlow: {
      flowId: "NEED_MEDICAL",
      currentQuestionId: "MED_Q2",
      completedQuestionIds: ["MED_Q1"],
      answers: [{ questionId: "MED_Q1", answerCode: "MED_REPLY_HARD" }],
    },
  });
  assert.ok(medicalHardReply.riskScore >= 85, "NEED_MEDICAL + MED_REPLY_HARD 應提高風險");
  assert.ok(medicalHardReply.recommendedOperatorAction.includes("守護者確認") || medicalHardReply.dispatchSuggestion.includes("守護者確認"), "MED_REPLY_HARD 應建議守護者確認");

  const cannotTalkTriage = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 4,
    action: "CANNOT_TALK",
    triageFlow: {
      flowId: "CANNOT_TALK",
      currentQuestionId: "TALK_Q2",
      completedQuestionIds: ["TALK_Q1"],
      answers: [{ questionId: "TALK_Q1", answerCode: "TALK_TEXT_OK" }],
    },
  });
  assert.notEqual(cannotTalkTriage.primaryChannel, "Voice IVR", "CANNOT_TALK 不以 Voice IVR 作唯一主要方式");
  assert.ok(cannotTalkTriage.backupChannels.length > 0, "CANNOT_TALK 應保留備援通道");

  const locUnknown = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 4,
    action: "LOCATION_ANOMALY",
    triageFlow: {
      flowId: "LOCATION_ANOMALY",
      currentQuestionId: "LOC_Q2",
      completedQuestionIds: ["LOC_Q1"],
      answers: [{ questionId: "LOC_Q1", answerCode: "LOC_UNKNOWN" }],
    },
  });
  assert.ok(locUnknown.riskScore >= locationDecision.riskScore, "LOCATION_ANOMALY + LOC_UNKNOWN 應提高位置風險");
  assert.ok(locUnknown.recommendedOperatorAction.includes("位置") || locUnknown.dispatchSuggestion.includes("位置"), "LOC_UNKNOWN 應建議位置確認");

  const safeDone = engine.routeActionDecision({
    ...actionBase,
    disasterMode: false,
    eventSeverity: 1,
    action: "SAFE_OK",
    network: { ...actionBase.network, bandwidthKbps: 512, latencyMs: 220, packetLossRate: 1, baseStationCongestion: 20 },
    ack: { ...actionBase.ack, received: true, lastStatus: "acknowledged" },
    triageFlow: {
      flowId: "SAFE_OK",
      currentQuestionId: null,
      completedQuestionIds: ["SAFE_Q1"],
      flowComplete: true,
      answers: [{ questionId: "SAFE_Q1", answerCode: "SAFE_DONE" }],
    },
  });
  assert.ok(safeDone.riskScore <= 29, "SAFE_OK + SAFE_DONE 應維持低風險");
  assert.equal(safeDone.escalationRequired, false, "SAFE_OK + SAFE_DONE 不進高優先待處理");

  const safeToHelp = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 1,
    action: "SAFE_OK",
    triageFlow: {
      flowId: "SAFE_OK",
      currentQuestionId: null,
      completedQuestionIds: ["SAFE_Q1"],
      flowComplete: true,
      answers: [{ questionId: "SAFE_Q1", answerCode: "SAFE_TO_HELP" }],
    },
  });
  assert.equal(safeToHelp.action, "NEED_HELP", "SAFE_TO_HELP 應升級成 NEED_HELP");
  assert.ok(safeToHelp.escalationRequired, "SAFE_TO_HELP 不可被 SAFE_OK dedupe 掉");

  const seen = {};
  const packetA = { r: "r-elder", a: "NEED_MEDICAL", q: "MED_Q1", ans: "MED_REPLY_HARD", seq: 12, d: "dedupe-med-12" };
  const firstDedupe = engine.triageDedupeStatus(seen, packetA, 100000);
  const duplicateDedupe = engine.triageDedupeStatus(seen, packetA, 101000);
  const differentAnswer = engine.triageDedupeStatus(seen, { ...packetA, ans: "MED_CAN_REPLY", d: "dedupe-med-12-b" }, 101200);
  const differentAction = engine.triageDedupeStatus(seen, { ...packetA, a: "NEED_HELP", d: "dedupe-help-12" }, 101300);
  assert.equal(firstDedupe.status, 200, "first answer should be accepted");
  assert.equal(duplicateDedupe.status, 202, "duplicate same answer should return 202");
  assert.equal(differentAnswer.status, 200, "different answerCode should not dedupe");
  assert.equal(differentAction.status, 200, "different action should not dedupe even with same seq");

  const disasterTriage = engine.routeActionDecision({
    ...actionBase,
    disasterMode: true,
    eventSeverity: 3,
    action: "NEED_HELP",
    triageFlow: {
      flowId: "NEED_HELP",
      currentQuestionId: "HELP_Q1",
      completedQuestionIds: [],
      answers: [],
    },
  });
  assert.ok(["SMS", "LOW_DATA_TEXT"].includes(disasterTriage.primaryChannel) || disasterTriage.ackPlan.mode.includes("LOW"), "disasterMode=true 應偏向 SMS / LOW_DATA_TEXT / ACK tracking");

  const noAckEscalation = engine.routeActionDecision({
    ...actionBase,
    eventSeverity: 3,
    action: "NEED_HELP",
    ack: { ...actionBase.ack, received: false, lastStatus: "timeout" },
    triageFlow: {
      flowId: "NEED_HELP",
      currentQuestionId: "HELP_Q1",
      completedQuestionIds: [],
      answers: [],
      unansweredCount: 1,
    },
  });
  assert.equal(noAckEscalation.escalationRequired, true, "no ACK / unansweredCount 增加應升級");

  console.log("routeDecisionEngine tests passed");
}

run();
