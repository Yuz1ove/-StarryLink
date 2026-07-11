(function (global) {
  const STORAGE_PREFIX = "starrylink-resilience-sync";
  const STORAGE_KEYS = {
    incidents: `${STORAGE_PREFIX}:incidents:v1`,
    statusReports: `${STORAGE_PREFIX}:status-reports:v1`,
    communicationLogs: `${STORAGE_PREFIX}:communication-logs:v1`,
    syncQueue: `${STORAGE_PREFIX}:sync-queue:v1`,
    riskChanges: `${STORAGE_PREFIX}:risk-changes:v1`,
    metadata: `${STORAGE_PREFIX}:metadata:v1`,
  };

  const memoryStorage = new Map();

  function getStorage() {
    if (global.localStorage) return global.localStorage;
    return {
      getItem: (key) => (memoryStorage.has(key) ? memoryStorage.get(key) : null),
      setItem: (key, value) => memoryStorage.set(key, String(value)),
      removeItem: (key) => memoryStorage.delete(key),
    };
  }

  function parseJson(value, fallback) {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  class LocalJsonRepository {
    constructor(key, options = {}) {
      this.key = key;
      this.sortBy = options.sortBy || "createdAt";
    }

    async list() {
      const items = parseJson(getStorage().getItem(this.key), []);
      const safeItems = Array.isArray(items) ? items : [];
      return clone(safeItems).sort((a, b) => String(b[this.sortBy] || "").localeCompare(String(a[this.sortBy] || "")));
    }

    async get(id) {
      const items = await this.list();
      return items.find((item) => item.id === id) || null;
    }

    async save(item) {
      if (!item || !item.id) throw new Error(`Cannot save item without id to ${this.key}`);
      const items = parseJson(getStorage().getItem(this.key), []);
      const safeItems = Array.isArray(items) ? items : [];
      const index = safeItems.findIndex((entry) => entry.id === item.id);
      const now = nowIso();
      const next = {
        ...clone(item),
        createdAt: item.createdAt || now,
        updatedAt: now,
      };
      if (index >= 0) safeItems[index] = { ...safeItems[index], ...next };
      else safeItems.unshift(next);
      getStorage().setItem(this.key, JSON.stringify(safeItems));
      return clone(next);
    }

    async saveMany(items = []) {
      const saved = [];
      for (const item of items) {
        saved.push(await this.save(item));
      }
      return saved;
    }

    async update(id, updater) {
      const current = await this.get(id);
      if (!current) return null;
      const next = typeof updater === "function" ? updater(clone(current)) : { ...current, ...updater };
      return this.save({ ...current, ...next, id });
    }

    async delete(id) {
      const items = parseJson(getStorage().getItem(this.key), []);
      const next = (Array.isArray(items) ? items : []).filter((item) => item.id !== id);
      getStorage().setItem(this.key, JSON.stringify(next));
      return true;
    }

    async clear() {
      getStorage().setItem(this.key, JSON.stringify([]));
      return true;
    }

    async count(predicate = null) {
      const items = await this.list();
      return predicate ? items.filter(predicate).length : items.length;
    }
  }

  const repositories = {
    incidentRepository: new LocalJsonRepository(STORAGE_KEYS.incidents),
    statusReportRepository: new LocalJsonRepository(STORAGE_KEYS.statusReports),
    communicationLogRepository: new LocalJsonRepository(STORAGE_KEYS.communicationLogs),
    syncQueueRepository: new LocalJsonRepository(STORAGE_KEYS.syncQueue),
    riskChangeRepository: new LocalJsonRepository(STORAGE_KEYS.riskChanges),
  };

  async function clearAllDemoData() {
    await Promise.all(Object.values(repositories).map((repository) => repository.clear()));
  }

  function readMetadata() {
    return parseJson(getStorage().getItem(STORAGE_KEYS.metadata), {});
  }

  function writeMetadata(next) {
    const value = { ...readMetadata(), ...next, updatedAt: nowIso() };
    getStorage().setItem(STORAGE_KEYS.metadata, JSON.stringify(value));
    return clone(value);
  }

  global.XY_PERSISTENCE_REPOS = {
    STORAGE_KEYS,
    LocalJsonRepository,
    clearAllDemoData,
    readMetadata,
    writeMetadata,
    ...repositories,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined") {
  module.exports = globalThis.XY_PERSISTENCE_REPOS;
}
