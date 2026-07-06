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
        .map((item) => item.packagePath)
        .filter((path) => existsSync(path))
        ;
      if (candidates.length) {
        return createRequire(candidates[0])("playwright");
      }
    }
    throw new Error("Playwright package not found. Run `npx --yes playwright --version` once, then retry this script.");
  }
}

const { chromium, request } = loadPlaywright();

const baseUrl = (process.argv[2] || "http://127.0.0.1:8765").replace(/\/$/, "");
const desktopUrl = `${baseUrl}/`;
const mobileUrl = `${baseUrl}/?view=mobile&target=U-DEMO`;
const errors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectConsole(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
}

async function waitForStore(page) {
  await page.waitForFunction(() => window.XY_DEMO_STORE?.getState, null, { timeout: 10000 });
}

async function targetSnapshot(page) {
  return page.evaluate(() => {
    const state = window.XY_DEMO_STORE.getState();
    const target = state.targets.find((item) => item.id === "U-DEMO");
    return {
      revision: state.revision,
      symptoms: target.selectedSymptoms || [],
      rawRiskScore: Number(target.risk.rawRiskScore || 0),
      displayRiskScore: Number(target.risk.displayRiskScore ?? target.risk.score ?? 0),
      packetSeq: Number(target.communication.packetSeq || 0),
      packetBytes: Number(target.communication.packetBytes || 0),
      primaryRoute: target.communication.primaryRoute,
      fallbackRoute: target.communication.fallbackRoute,
      packetLoss: Number(state.event.network.backbonePacketLossPercent || 0),
      groundBackboneStatus: state.event.network.groundBackboneStatus,
      location: target.location,
      packetLogText: JSON.stringify(state.packetLog.slice(0, 12)),
    };
  });
}

async function main() {
  const api = await request.newContext();
  const health = await api.get(`${baseUrl}/api/health`);
  assert(health.ok(), `/api/health failed: ${health.status()}`);
  const state = await api.get(`${baseUrl}/api/state`);
  assert(state.ok(), `/api/state failed: ${state.status()}`);

  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  collectConsole(desktop, "desktop");
  collectConsole(mobile, "mobile");

  await desktop.goto(desktopUrl, { waitUntil: "domcontentloaded" });
  await mobile.goto(mobileUrl, { waitUntil: "domcontentloaded" });
  await waitForStore(desktop);
  await waitForStore(mobile);
  await desktop.locator('[data-nav-page="demo"]').click();
  await desktop.waitForFunction(
    () =>
      document.querySelector("#deployFrontend")?.textContent.includes("OK") &&
      document.querySelector("#deployApiHealth")?.textContent.includes("OK") &&
      document.querySelector("#deployApiState")?.textContent.match(/OK|WARN/) &&
      document.querySelector("#deployApiAction")?.textContent.includes("OK"),
    null,
    { timeout: 6000 }
  );

  await desktop.evaluate(() => window.XY_DEMO_STORE.actions.resetDemo());
  await desktop.waitForTimeout(1000);
  await mobile.reload({ waitUntil: "domcontentloaded" });
  await waitForStore(mobile);

  const beforeInjured = await targetSnapshot(desktop);
  await mobile.locator('[data-reply="INJURED"]').click();
  await desktop.waitForFunction(
    () => window.XY_DEMO_STORE.getState().targets.find((item) => item.id === "U-DEMO")?.selectedSymptoms?.includes("INJURED"),
    null,
    { timeout: 1500 }
  );
  const afterInjured = await targetSnapshot(desktop);
  assert(afterInjured.symptoms.includes("INJURED"), "U-DEMO did not sync INJURED to desktop");
  assert(afterInjured.rawRiskScore > beforeInjured.rawRiskScore, "rawRiskScore did not increase after INJURED");
  assert(afterInjured.displayRiskScore > beforeInjured.displayRiskScore, "displayRiskScore did not increase after INJURED");
  assert(afterInjured.packetSeq > beforeInjured.packetSeq, "packetSeq did not increment after INJURED");
  assert(afterInjured.packetBytes > 0, "packetBytes did not update after INJURED");
  assert(/accepted|serverAck/i.test(afterInjured.packetLogText), "packetLog did not include accepted/serverAck");

  const riskBeforeDuplicate = afterInjured.rawRiskScore;
  for (let index = 0; index < 3; index += 1) {
    await mobile.locator('[data-reply="INJURED"]').click();
  }
  await desktop.waitForTimeout(1200);
  const afterDuplicate = await targetSnapshot(desktop);
  assert(afterDuplicate.rawRiskScore === riskBeforeDuplicate, "duplicate INJURED clicks changed rawRiskScore");
  assert(/duplicate ignored|duplicate/i.test(afterDuplicate.packetLogText), "packetLog did not show duplicate ignored");

  await mobile.locator('[data-reply="SAFE"]').click();
  await desktop.waitForFunction(() => {
    const target = window.XY_DEMO_STORE.getState().targets.find((item) => item.id === "U-DEMO");
    return JSON.stringify(target.selectedSymptoms || []) === JSON.stringify(["SAFE"]);
  }, null, { timeout: 1500 });
  const afterSafe = await targetSnapshot(desktop);
  assert(afterSafe.symptoms.length === 1 && afterSafe.symptoms[0] === "SAFE", "SAFE is not the only selected state");
  assert(afterSafe.rawRiskScore < afterDuplicate.rawRiskScore, "risk did not decrease after SAFE");

  const beforeNetwork = await targetSnapshot(desktop);
  await desktop.locator("#simulateGroundDown").click();
  await desktop.waitForFunction(
    () => window.XY_DEMO_STORE.getState().event.network.groundBackboneStatus === "down",
    null,
    { timeout: 1500 }
  );
  const afterNetwork = await targetSnapshot(desktop);
  assert(afterNetwork.groundBackboneStatus === "down", "groundBackboneStatus did not become down");
  assert(afterNetwork.packetLoss > beforeNetwork.packetLoss, "packetLoss did not increase");
  assert(
    afterNetwork.primaryRoute !== beforeNetwork.primaryRoute || afterNetwork.fallbackRoute !== beforeNetwork.fallbackRoute,
    "selected/fallback channel did not change after ground network failure"
  );

  const gpsContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await gpsContext.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(_success, error) {
          error({ code: 1, PERMISSION_DENIED: 1, message: "Permission denied by smoke test" });
        },
      },
    });
  });
  const gpsPage = await gpsContext.newPage();
  collectConsole(gpsPage, "gps");
  await gpsPage.goto(mobileUrl, { waitUntil: "domcontentloaded" });
  await waitForStore(gpsPage);
  await gpsPage.locator("#refreshLocation").click();
  await gpsPage.waitForFunction(
    () => window.XY_DEMO_STORE.getState().targets.find((item) => item.id === "U-DEMO")?.location?.source === "GPS_DENIED",
    null,
    { timeout: 1500 }
  );
  const gpsSnapshot = await targetSnapshot(gpsPage);
  assert(gpsSnapshot.location.source === "GPS_DENIED", "GPS denied fallback did not set GPS_DENIED");
  assert(gpsSnapshot.location.lat === null && gpsSnapshot.location.lng === null, "GPS denied fallback showed fake coordinates");
  assert(/gps.status=denied|GPS_DENIED/i.test(gpsSnapshot.packetLogText), "GPS denied event/packet log missing denied status");

  await browser.close();
  assert(errors.length === 0, `console errors found:\n${errors.join("\n")}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        url: baseUrl,
        checks: [
          "assets and API reachable",
          "deployment status card reports API health",
          "mobile INJURED synced to desktop",
          "duplicate INJURED ignored",
          "SAFE clears high-risk states",
          "ground network failure changes routing",
          "GPS_DENIED fallback has no fake coordinates",
          "console errors: 0",
        ],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
