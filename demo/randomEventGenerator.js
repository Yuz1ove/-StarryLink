(function (global) {
  const templates = global.XY_SCENARIO_TEMPLATES?.templates || [];
  const severityEngine = global.XY_SEVERITY;
  const decisionEngine = global.XY_DECISION;

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function networkProfile(mode) {
    const map = {
      normal: {
        bandwidthKbps: 512,
        latencyMs: 260,
        packetLossPercent: 2,
        congestionLevel: 24,
        mobileAvailable: true,
        fixedLineAvailable: true,
        satelliteAvailable: true,
        powerRisk: false,
        disasterMode: false,
      },
      weak: {
        bandwidthKbps: 48,
        latencyMs: 950,
        packetLossPercent: 12,
        congestionLevel: 78,
        mobileAvailable: true,
        fixedLineAvailable: false,
        satelliteAvailable: true,
        powerRisk: true,
        disasterMode: false,
      },
      disaster: {
        bandwidthKbps: 24,
        latencyMs: 1320,
        packetLossPercent: 34,
        congestionLevel: 88,
        mobileAvailable: true,
        fixedLineAvailable: false,
        satelliteAvailable: true,
        powerRisk: true,
        disasterMode: true,
      },
      offlineQueue: {
        bandwidthKbps: 8,
        latencyMs: 2200,
        packetLossPercent: 58,
        congestionLevel: 95,
        mobileAvailable: false,
        fixedLineAvailable: false,
        satelliteAvailable: true,
        powerRisk: true,
        disasterMode: true,
      },
    };
    return { ...(map[mode] || map.normal) };
  }

  function generateRandomEvent(options = {}) {
    if (!templates.length || !severityEngine || !decisionEngine) {
      throw new Error("randomEventGenerator requires scenarioTemplates, severityEngine, and decisionEngine");
    }
    const template = options.template || pick(templates);
    const networkMode = pick(template.networkModes);
    const userStatus = pick(template.userStatuses);
    const gpsConfidence = pick(template.gpsConfidences);
    const ackState = pick(template.ackStates);
    const batteryLevel = randomInt(template.batteryRange[0], template.batteryRange[1]);
    const responseDelayMinutes = randomInt(template.responseDelayRange[0], template.responseDelayRange[1]);
    const input = {
      eventImpact: template.eventImpact,
      networkMode,
      userStatus,
      gpsConfidence,
      ackState,
      responseDelayMinutes,
      batteryLevel,
      slaMinutes: userStatus === "SAFE" ? 8 : 5,
    };
    const severity = severityEngine.calculateSeverity(input);
    const decision = decisionEngine.evaluateDecision({
      ...input,
      severityLevel: severity.severityLevel,
      severityScore: severity.severityScore,
    });
    const event = {
      id: `random-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      eventTitle: template.eventTitle,
      eventType: template.eventType,
      eventDescription: template.eventDescription,
      severityScore: severity.severityScore,
      severityLevel: severity.severityLevel,
      severityTitle: severity.severityTitle,
      networkMode,
      userStatus,
      gpsConfidence,
      ackState,
      batteryLevel,
      responseDelayMinutes,
      eventImpact: template.eventImpact,
      slaMinutes: input.slaMinutes,
      decisionSummary: decision.decisionSummary,
      dispatchActions: decision.dispatchActions,
      dispatchActionLabels: decision.dispatchActionLabels,
      severityBreakdown: severity,
      decision,
      networkProfile: networkProfile(networkMode),
      candidateLevels: template.severityCandidates,
    };
    return event;
  }

  global.XY_RANDOM_EVENTS = {
    generateRandomEvent,
    networkProfile,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_RANDOM_EVENTS;
}
