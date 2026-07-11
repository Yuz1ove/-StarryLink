(function (global) {
  const repos = global.XY_PERSISTENCE_REPOS;
  const networkSimulation = global.XY_NETWORK_SIMULATION;
  const packetMetrics = global.XY_PACKET_METRICS;
  const lowData = global.XY_LOW_DATA;
  const listeners = new Set();

  const INCIDENT_ID = "incident-starrylink-demo-quake-001";
  const CLEARED_FLAG = "starrylink-resilience-sync:cleared:v1";
  const FIXED_SEED_BASE = "2026-07-10T10:30:00+08:00";

  let notice = {
    message: "韌性資料同步待命",
    tone: "neutral",
    updatedAt: new Date().toISOString(),
  };
  let snapshot = emptySnapshot();
  let syncRunning = false;
  let syncAgain = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function addSeconds(iso, seconds) {
    return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
  }

  function delay(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  function emptySnapshot() {
    return {
      reports: [],
      queue: [],
      communicationLogs: [],
      riskChanges: [],
      summary: {
        pending: 0,
        syncing: 0,
        synced: 0,
        failed: 0,
        lastSyncedAt: null,
      },
      network: networkSimulation?.getState?.() || {},
      notice,
    };
  }

  function setNotice(message, tone = "neutral") {
    notice = { message, tone, updatedAt: nowIso() };
    snapshot = { ...snapshot, notice };
    emit();
  }

  function emit() {
    const current = getSnapshot();
    listeners.forEach((listener) => listener(current));
    if (global.dispatchEvent && typeof global.CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("starry-sync-updated", { detail: current }));
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshot() {
    return clone({ ...snapshot, notice });
  }

  async function refreshSnapshot(options = {}) {
    if (!repos) return getSnapshot();
    const [reports, queue, communicationLogs, riskChanges] = await Promise.all([
      repos.statusReportRepository.list(),
      repos.syncQueueRepository.list(),
      repos.communicationLogRepository.list(),
      repos.riskChangeRepository.list(),
    ]);
    const summary = {
      pending: queue.filter((item) => item.status === "pending").length,
      syncing: queue.filter((item) => item.status === "syncing").length,
      synced: reports.filter((item) => item.syncStatus === "synced").length,
      failed: queue.filter((item) => item.status === "failed").length,
      lastSyncedAt: reports.filter((item) => item.syncedAt).map((item) => item.syncedAt).sort().slice(-1)[0] || null,
    };
    snapshot = {
      reports,
      queue,
      communicationLogs,
      riskChanges,
      summary,
      network: networkSimulation?.getState?.() || {},
      notice,
    };
    if (!options.silent) emit();
    return getSnapshot();
  }

  function riskLevelForReport(target = {}) {
    const map = { GREEN: "low", YELLOW: "medium", ORANGE: "high", RED: "critical" };
    return map[String(target.risk?.level || "GREEN").toUpperCase()] || "low";
  }

  function reportTitle(replyCode, target = {}) {
    const label = lowData?.replyLabels?.[replyCode] || target.latestReply?.label || replyCode || "狀態回報";
    if (replyCode === "LOCATION_UPDATE") return "GPS 更新";
    if (replyCode === "LOCATION_UNKNOWN") return "定位未取得";
    return label || "狀態回報";
  }

  function selectedCommunicationPriority(target = {}) {
    if (target.communication?.satelliteRecommended) return "satellite-priority";
    if (target.communication?.lowDataMode) return "low-data-priority";
    return "standard";
  }

  function syncStatusForNetwork(network = {}) {
    return network.canRemoteSync ? "syncing" : "pending";
  }

  function networkQualityForReport(network = {}, target = {}) {
    const quality = Number(network.networkQuality);
    if (Number.isFinite(quality)) return quality;
    return Math.max(0, Math.min(100, Number(target.signalQuality || 0)));
  }

  function reportIdFor(target = {}, seq, source, replyCode) {
    const safeSource = String(source || "status").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const safeCode = String(replyCode || "status").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    return `report-${target.id || "target"}-${seq || 0}-${safeSource}-${safeCode}`;
  }

  function buildStatusReport(input = {}) {
    const target = input.target || {};
    const state = input.state || {};
    const replyCode = input.replyCode || target.latestReply?.code || "STATUS";
    const packetEntry = input.packetEntry || {};
    const network = input.network || networkSimulation?.getState?.() || {};
    const selectedLink = input.selectedLink || networkSimulation?.selectLink?.(target, state) || "cellular";
    const seq = Number(input.seq ?? packetEntry.seq ?? target.communication?.packetSeq ?? 0);
    const createdAt = input.createdAt || (target.latestReply?.timestamp ? new Date(target.latestReply.timestamp).toISOString() : nowIso());
    const compactPayload = packetEntry.packet || lowData?.makePacket?.(target, replyCode, seq)?.preview || null;
    const basePayload = {
      targetId: target.id,
      replyCode,
      selectedSymptoms: target.selectedSymptoms || [],
      location: target.location || {},
      medical: target.medical || {},
      risk: target.risk || {},
      communication: target.communication || {},
      seq,
    };
    const metrics = packetMetrics?.estimatePacketMetrics?.(basePayload, {
      observedPacketBytes: Number(packetEntry.bytes || target.communication?.packetBytes || 0),
    }) || {
      rawSizeBytes: 0,
      compressedSizeBytes: Number(packetEntry.bytes || target.communication?.packetBytes || 0),
      packetSizeBytes: Number(packetEntry.bytes || target.communication?.packetBytes || 0),
      fieldCount: 0,
      reductionRate: 0,
      label: "Demo 封包序列化估算",
    };
    return {
      id: input.id || reportIdFor(target, seq, input.source, replyCode),
      incidentId: input.incidentId || INCIDENT_ID,
      userId: target.id || "U-DEMO",
      deviceId: `PHONE-${target.id || "DEMO"}`,
      name: reportTitle(replyCode, target),
      disasterType: "earthquake-weak-network-demo",
      severityLevel: Number(target.risk?.displayRiskScore ?? target.risk?.score ?? 0),
      status: "active",
      source: input.source || "mobile-report",
      answers: {
        replyCode,
        replyLabel: lowData?.replyLabels?.[replyCode] || target.latestReply?.label || replyCode,
        selectedSymptoms: target.selectedSymptoms || [],
        riskItems: target.risk?.items || [],
        rawRiskScore: Number(target.risk?.rawRiskScore ?? target.risk?.score ?? 0),
        normalizedRiskScore: Number(target.risk?.displayRiskScore ?? target.risk?.score ?? 0),
        recommendedAction: target.risk?.action || "MONITOR",
        communicationPriority: selectedCommunicationPriority(target),
        gpsSource: target.location?.source || "UNKNOWN",
        packetMetrics: metrics,
      },
      riskScore: Number(target.risk?.displayRiskScore ?? target.risk?.score ?? 0),
      rawRiskScore: Number(target.risk?.rawRiskScore ?? target.risk?.score ?? 0),
      riskLevel: riskLevelForReport(target),
      latitude: target.location?.confirmed ? Number(target.location.lat) : null,
      longitude: target.location?.confirmed ? Number(target.location.lng) : null,
      locationAccuracy: target.location?.confirmed ? target.location.accuracy || null : null,
      locationCapturedAt: target.location?.updatedAt || createdAt,
      locationSource: target.location?.source || "UNKNOWN",
      selectedLink,
      networkQuality: networkQualityForReport(network, target),
      packetSizeBytes: metrics.packetSizeBytes,
      rawSizeBytes: metrics.rawSizeBytes,
      compressedSizeBytes: metrics.compressedSizeBytes,
      fieldCount: metrics.fieldCount,
      reductionRate: metrics.reductionRate,
      packetMetricLabel: metrics.label,
      retryCount: Number(target.communication?.retryCount || 0),
      packetSeq: seq,
      syncStatus: input.syncStatus || syncStatusForNetwork(network),
      createdAt,
      syncedAt: input.syncedAt || null,
      compactPayload,
    };
  }

  function buildQueueItem(report, status = "pending") {
    const now = nowIso();
    return {
      id: `queue-${report.id}`,
      reportId: report.id,
      payload: report,
      status,
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      createdAt: report.createdAt || now,
      updatedAt: now,
    };
  }

  function buildCommunicationLog(report, target = {}, state = {}, network = {}) {
    const fromLink = network.mode === "normal" ? "wifi" : network.mode === "weak" ? "cellular" : "cellular";
    const toLink = report.selectedLink;
    const switched = fromLink !== toLink || network.mode === "fallback" || network.mode === "offline";
    return {
      id: `comm-${report.id}`,
      reportId: report.id,
      deviceId: report.deviceId,
      fromLink,
      toLink,
      switchReason: switched
        ? network.mode === "offline"
          ? "Demo Mode: ground network unavailable, saved to offline queue"
          : "Demo Mode: ground network failure, backup link selected by communication matrix"
        : "Demo Mode: primary ground link available",
      latencyMs: Number(target.communication?.averageLatencyMs || network.latencyMs || 0),
      packetLossRate: Number(target.communication?.packetLossRate ?? state.event?.network?.backbonePacketLossPercent ?? network.packetLossRate ?? 0),
      retryCount: Number(target.communication?.retryCount || 0),
      packetSizeBytes: report.packetSizeBytes,
      success: report.syncStatus === "synced" || network.canRemoteSync,
      createdAt: report.createdAt,
    };
  }

  async function ensureIncident() {
    const existing = await repos.incidentRepository.get(INCIDENT_ID);
    if (existing) return existing;
    return repos.incidentRepository.save({
      id: INCIDENT_ID,
      name: "星夜 Demo：地震後海纜與地面骨幹不穩",
      disasterType: "earthquake-weak-network-demo",
      severityLevel: 4,
      status: "active",
      createdAt: FIXED_SEED_BASE,
    });
  }

  async function latestReportForDevice(deviceId, excludeId = null) {
    const reports = await repos.statusReportRepository.list();
    return reports.find((report) => report.deviceId === deviceId && report.id !== excludeId) || null;
  }

  async function saveRiskChangeIfNeeded(report) {
    const previous = await latestReportForDevice(report.deviceId, report.id);
    if (!previous || Number(previous.riskScore) === Number(report.riskScore)) return null;
    return repos.riskChangeRepository.save({
      id: `risk-${report.id}`,
      reportId: report.id,
      deviceId: report.deviceId,
      fromRiskScore: Number(previous.riskScore || 0),
      toRiskScore: Number(report.riskScore || 0),
      fromRiskLevel: previous.riskLevel,
      toRiskLevel: report.riskLevel,
      reason: "status report persisted after risk engine update",
      createdAt: report.createdAt,
    });
  }

  async function recordStatusReport(input = {}) {
    if (!repos) throw new Error("Persistence repositories are not loaded");
    await ensureIncident();
    const network = input.network || networkSimulation?.getState?.() || {};
    const report = buildStatusReport({ ...input, network });
    const existing = await repos.statusReportRepository.get(report.id);
    if (existing?.syncStatus === "synced") {
      await refreshSnapshot();
      return existing;
    }
    await repos.statusReportRepository.save(report);
    await saveRiskChangeIfNeeded(report);
    await repos.communicationLogRepository.save(buildCommunicationLog(report, input.target, input.state, network));
    await repos.syncQueueRepository.save(buildQueueItem(report, network.canRemoteSync ? "syncing" : "pending"));
    if (!network.canRemoteSync) {
      setNotice(`已本地暫存 1 筆資料，等待恢復連線後自動補傳。`, "warn");
      await refreshSnapshot();
      return report;
    }
    await refreshSnapshot();
    await syncPending();
    return repos.statusReportRepository.get(report.id);
  }

  async function remoteWrite(report) {
    const before = networkSimulation?.getState?.() || {};
    if (!before.canRemoteSync) throw new Error("network unavailable");
    const testDelay = Number(global.__STARRYLINK_SYNC_TEST_DELAY_MS);
    const ms = Number.isFinite(testDelay) ? testDelay : before.mode === "weak" ? 760 : 260;
    await delay(ms);
    const after = networkSimulation?.getState?.() || {};
    if (!after.canRemoteSync) throw new Error("network changed before remote ACK");
    return {
      remoteId: `remote-${report.id}`,
      syncedAt: nowIso(),
    };
  }

  async function syncQueueItem(queueItem) {
    const current = await repos.syncQueueRepository.get(queueItem.id);
    if (!current) return { status: "missing" };
    const report = await repos.statusReportRepository.get(current.reportId);
    if (!report) {
      await repos.syncQueueRepository.delete(current.id);
      return { status: "missing-report" };
    }
    if (report.syncStatus === "synced") {
      await repos.syncQueueRepository.delete(current.id);
      return { status: "already-synced" };
    }
    const attempts = Number(current.attempts || 0) + 1;
    await repos.syncQueueRepository.save({ ...current, status: "syncing", attempts, lastError: null, nextRetryAt: null });
    await repos.statusReportRepository.save({ ...report, syncStatus: "syncing" });
    await refreshSnapshot();
    try {
      const result = await remoteWrite(report);
      await repos.statusReportRepository.save({
        ...report,
        syncStatus: "synced",
        syncedAt: result.syncedAt,
        remoteId: result.remoteId,
        syncAttempts: attempts,
      });
      await repos.syncQueueRepository.delete(current.id);
      return { status: "synced" };
    } catch (error) {
      const retryStatus = attempts >= 3 ? "failed" : "pending";
      await repos.syncQueueRepository.save({
        ...current,
        status: retryStatus,
        attempts,
        lastError: error.message,
        nextRetryAt: retryStatus === "pending" ? addSeconds(nowIso(), 5) : null,
      });
      await repos.statusReportRepository.save({
        ...report,
        syncStatus: retryStatus === "failed" ? "failed" : "pending",
        lastSyncError: error.message,
        syncAttempts: attempts,
      });
      return { status: retryStatus, error };
    }
  }

  async function syncPending() {
    if (syncRunning) {
      syncAgain = true;
      while (syncRunning) {
        await delay(5);
      }
      await refreshSnapshot();
      return { status: "completed-existing-run" };
    }
    syncRunning = true;
    let synced = 0;
    let failed = 0;
    try {
      const network = networkSimulation?.getState?.() || {};
      const queue = await repos.syncQueueRepository.list();
      const pending = queue.filter((item) => item.status === "pending" || item.status === "failed" || item.status === "syncing");
      if (!pending.length) {
        await refreshSnapshot();
        return { status: "empty", synced, failed };
      }
      if (!network.canRemoteSync) {
        await Promise.all(
          pending
            .filter((item) => item.status === "syncing")
            .map((item) => repos.syncQueueRepository.save({ ...item, status: "pending", lastError: "network unavailable" }))
        );
        setNotice(`目前離線，${pending.length} 筆資料保留在本地同步佇列。`, "warn");
        await refreshSnapshot();
        return { status: "offline", synced, failed };
      }
      setNotice(`已恢復連線，正在補傳 ${pending.length} 筆資料。`, "info");
      for (const item of pending) {
        const result = await syncQueueItem(item);
        if (result.status === "synced" || result.status === "already-synced") synced += 1;
        if (result.status === "failed" || result.status === "pending") failed += 1;
      }
      if (synced) setNotice(`${synced} 筆資料同步完成。`, "ok");
      if (failed) setNotice(`${failed} 筆資料仍等待重試；資料未遺失。`, "warn");
      await refreshSnapshot();
      return { status: "done", synced, failed };
    } finally {
      syncRunning = false;
      if (syncAgain) {
        syncAgain = false;
        global.setTimeout(() => {
          syncPending().catch((error) => setNotice(`同步失敗：${error.message}`, "warn"));
        }, 0);
      }
    }
  }

  async function retryFailed() {
    const queue = await repos.syncQueueRepository.list();
    await Promise.all(queue.filter((item) => item.status === "failed").map((item) => repos.syncQueueRepository.save({ ...item, status: "pending", lastError: null })));
    return syncPending();
  }

  async function getPendingCount() {
    return repos.syncQueueRepository.count((item) => item.status === "pending" || item.status === "failed" || item.status === "syncing");
  }

  async function clearDemoData() {
    await repos.clearAllDemoData();
    try {
      global.localStorage?.setItem(CLEARED_FLAG, "true");
    } catch (error) {
      // Ignore storage errors in private browsing.
    }
    setNotice("已清除韌性資料同步 Demo 資料；專案設定未變更。", "ok");
    return refreshSnapshot();
  }

  function targetById(state, id) {
    return state?.targets?.find((target) => target.id === id) || null;
  }

  async function seedDefaultData(appState = {}, options = {}) {
    const reportCount = await repos.statusReportRepository.count();
    if (reportCount > 0 && !options.force) {
      await refreshSnapshot();
      return getSnapshot();
    }
    if (options.force) await repos.clearAllDemoData();
    try {
      global.localStorage?.removeItem(CLEARED_FLAG);
    } catch (error) {
      // Ignore storage errors.
    }
    await ensureIncident();
    const seedTargets = ["U-001", "U-013", "U-021", "U-034", "U-DEMO"]
      .map((id) => targetById(appState, id))
      .filter(Boolean);
    const fallbackLinks = {
      "U-001": "wifi",
      "U-013": "offline",
      "U-021": "satellite",
      "U-034": "cellular",
      "U-DEMO": "mesh",
    };
    const statuses = {
      "U-001": "synced",
      "U-013": "pending",
      "U-021": "synced",
      "U-034": "synced",
      "U-DEMO": "synced",
    };
    for (let index = 0; index < seedTargets.length; index += 1) {
      const target = seedTargets[index];
      const seq = Number(target.communication?.packetSeq || 0) || index + 1;
      const replyCode = target.latestReply?.code || (target.id === "U-DEMO" ? "NEED_HELP" : "SAFE");
      const packet = lowData?.makePacket?.(target, replyCode, seq, new Date(FIXED_SEED_BASE).getTime() + index * 15000);
      const status = statuses[target.id] || "synced";
      const report = buildStatusReport({
        id: `seed-report-${target.id}`,
        source: target.id === "U-DEMO" ? "mobile-seed" : "system-seed",
        state: appState,
        target,
        replyCode,
        seq,
        selectedLink: fallbackLinks[target.id] || "cellular",
        packetEntry: { seq, bytes: packet?.bytes || target.communication?.packetBytes || 128, packet: packet?.preview },
        syncStatus: status,
        createdAt: addSeconds(FIXED_SEED_BASE, index * 15),
        syncedAt: status === "synced" ? addSeconds(FIXED_SEED_BASE, index * 15 + 3) : null,
        network: {
          mode: target.id === "U-013" ? "offline" : target.id === "U-021" ? "fallback" : "normal",
          canRemoteSync: status === "synced",
          networkQuality: target.id === "U-013" ? 0 : target.id === "U-021" ? 28 : 82,
          latencyMs: target.communication?.averageLatencyMs || 260,
          packetLossRate: target.communication?.packetLossRate || 8,
        },
      });
      await repos.statusReportRepository.save(report);
      await repos.communicationLogRepository.save(buildCommunicationLog(report, target, appState, { mode: report.selectedLink === "offline" ? "offline" : report.selectedLink === "satellite" ? "fallback" : "normal", canRemoteSync: report.syncStatus === "synced" }));
      if (status !== "synced") await repos.syncQueueRepository.save(buildQueueItem(report, "pending"));
    }
    repos.writeMetadata({ seededAt: nowIso() });
    setNotice("已匯入 5 筆固定 seed Demo 紀錄。", "ok");
    return refreshSnapshot();
  }

  function autoSeedIfNeeded(appState) {
    try {
      if (global.localStorage?.getItem(CLEARED_FLAG) === "true") return Promise.resolve(getSnapshot());
    } catch (error) {
      // Continue with normal seed check.
    }
    return seedDefaultData(appState, { force: false });
  }

  if (networkSimulation?.subscribe) {
    networkSimulation.subscribe((current, previous) => {
      snapshot = { ...snapshot, network: current };
      emit();
      if (current.canRemoteSync && previous && previous.canRemoteSync === false) {
        setNotice("已恢復連線，準備掃描本地同步佇列。", "info");
        syncPending().catch((error) => setNotice(`同步失敗：${error.message}`, "warn"));
      }
    });
  }

  refreshSnapshot({ silent: true }).catch(() => {});

  global.XY_SYNC_SERVICE = {
    INCIDENT_ID,
    subscribe,
    getSnapshot,
    refreshSnapshot,
    recordStatusReport,
    enqueue: recordStatusReport,
    syncPending,
    retryFailed,
    getPendingCount,
    clearDemoData,
    seedDefaultData,
    autoSeedIfNeeded,
    setNotice,
    buildStatusReport,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_SYNC_SERVICE;
}
