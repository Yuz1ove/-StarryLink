import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

function loadPlaywright() {
  const localRequire = createRequire(import.meta.url);
  try {
    return localRequire("playwright");
  } catch (error) {
    const npxRoot = join(homedir(), ".npm", "_npx");
    if (existsSync(npxRoot)) {
      const candidates = readdirSync(npxRoot)
        .map((entry) => {
          const packagePath = join(npxRoot, entry, "node_modules", "playwright", "package.json");
          if (!existsSync(packagePath)) return null;
          const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
          return { packagePath, version: manifest.version || "0.0.0" };
        })
        .filter(Boolean)
        .filter((item) => !item.version.includes("alpha") && !item.version.includes("beta"))
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: "base" }))
        .map((item) => item.packagePath);
      if (candidates.length) return createRequire(candidates[0])("playwright");
    }
    throw new Error("Playwright package not found. Run `npx --yes --package playwright playwright --version` once, then retry.");
  }
}

const { chromium } = loadPlaywright();
const baseUrl = (process.argv[2] || "http://127.0.0.1:8765").replace(/\/$/, "");
const errors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectConsole(page) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
}

async function waitForRuntime(page) {
  await page.waitForFunction(
    () => window.XY_DEMO_STORE?.getState && window.XY_SYNC_SERVICE?.getSnapshot && window.XY_NETWORK_SIMULATION?.getState,
    null,
    { timeout: 10000 }
  );
}

async function syncSnapshot(page) {
  return page.evaluate(() => window.XY_SYNC_SERVICE.getSnapshot());
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  collectConsole(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  await page.locator('[data-nav-page="demo"]').click();
  await page.waitForSelector("#resilienceSyncPanel");

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  collectConsole(mobile);
  await page.evaluate(async () => {
    window.XY_DEMO_STORE.actions.resetDemo();
    await window.XY_SYNC_SERVICE.clearDemoData();
    window.XY_NETWORK_SIMULATION.setMode("normal");
  });
  await page.waitForTimeout(1000);
  await mobile.goto(`${baseUrl}/?view=mobile&target=U-DEMO`, { waitUntil: "domcontentloaded" });
  await waitForRuntime(mobile);
  await mobile.locator('[data-reply="INJURED"]').click();
  await page.waitForFunction(
    () => window.XY_DEMO_STORE.getState().targets.find((item) => item.id === "U-DEMO")?.selectedSymptoms?.includes("INJURED"),
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(1500);
  await page.waitForFunction(
    () => window.XY_SYNC_SERVICE.getSnapshot().reports.some((report) => report.userId === "U-DEMO" && report.name.includes("受傷")),
    null,
    { timeout: 7000 }
  );
  let snapshot = await syncSnapshot(page);
  assert(snapshot.reports.some((report) => report.userId === "U-DEMO" && report.syncStatus === "synced"), "desktop should persist mobile-origin report from remote packetLog");

  await page.evaluate(async () => {
    window.XY_DEMO_STORE.actions.resetDemo();
    await window.XY_SYNC_SERVICE.clearDemoData();
    window.XY_NETWORK_SIMULATION.setMode("normal");
    await window.XY_SYNC_SERVICE.seedDefaultData(window.XY_DEMO_STORE.getState(), { force: true });
  });
  await page.waitForFunction(() => window.XY_SYNC_SERVICE.getSnapshot().reports.length >= 5, null, { timeout: 5000 });
  snapshot = await syncSnapshot(page);
  assert(snapshot.reports.length >= 5, "seed records were not imported");
  assert(snapshot.summary.pending >= 1, "seed should include at least one pending offline record");
  assert(await page.locator("#syncEventRows").innerText().then((text) => text.includes("本地暫存")), "event table should show pending badge");

  await page.evaluate(async () => {
    await window.XY_SYNC_SERVICE.clearDemoData();
    window.XY_NETWORK_SIMULATION.setMode("offline");
    window.XY_DEMO_STORE.actions.restoreGroundNetwork?.();
  });
  await page.locator("#syncOfflineMode").click();
  await page.locator("#syncTestReport").click();
  await page.waitForTimeout(80);
  await page.locator("#syncTestReport").click();
  await page.waitForFunction(() => window.XY_SYNC_SERVICE.getSnapshot().summary.pending >= 2, null, { timeout: 5000 });
  snapshot = await syncSnapshot(page);
  assert(snapshot.summary.pending >= 2, "two offline reports should be pending");
  assert(snapshot.reports.filter((report) => report.syncStatus === "pending").length >= 2, "offline reports should not be marked synced");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  await page.locator('[data-nav-page="demo"]').click();
  await page.waitForFunction(() => window.XY_SYNC_SERVICE.getSnapshot().summary.pending >= 2, null, { timeout: 5000 });
  snapshot = await syncSnapshot(page);
  assert(snapshot.summary.pending >= 2, "pending queue should persist after refresh");

  await page.locator("#syncRestoreNetwork").click();
  await page.waitForFunction(() => window.XY_SYNC_SERVICE.getSnapshot().queue.length === 0, null, { timeout: 7000 });
  snapshot = await syncSnapshot(page);
  assert(snapshot.queue.length === 0, "queue should drain after restore");
  assert(snapshot.reports.every((report) => report.syncStatus === "synced"), "reports should be synced after restore");
  assert(snapshot.reports.every((report) => report.syncedAt), "syncedAt should be set after restore");
  assert(new Set(snapshot.reports.map((report) => report.id)).size === snapshot.reports.length, "history should not contain duplicate report ids");

  await page.evaluate(() => {
    window.XY_DEMO_STORE.actions.setLocation("unknown", { source: "GPS_DENIED", updateReply: false });
  });
  await page.waitForFunction(() => window.XY_SYNC_SERVICE.getSnapshot().reports.some((report) => report.locationSource === "GPS_DENIED"), null, { timeout: 5000 });
  snapshot = await syncSnapshot(page);
  const denied = snapshot.reports.find((report) => report.locationSource === "GPS_DENIED");
  assert(denied.latitude === null && denied.longitude === null, "GPS denied report should keep null coordinates");

  await browser.close();
  assert(errors.length === 0, `console errors found:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ ok: true, url: baseUrl, reports: snapshot.reports.length, pending: snapshot.summary.pending }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
