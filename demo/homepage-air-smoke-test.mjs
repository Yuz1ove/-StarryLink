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
    () => window.XY_DEMO_STORE?.getStarryState && window.XY_DEMO_STORE?.actions,
    null,
    { timeout: 10000 }
  );
}

async function expectHomeState(page, expected) {
  await page.waitForFunction(
    (route) => window.XY_DEMO_STORE.getStarryState().selectedRoute === route,
    expected.route,
    { timeout: 5000 }
  );
  const snapshot = await page.evaluate(() => {
    const starry = window.XY_DEMO_STORE.getStarryState();
    return {
      selectedRoute: starry.selectedRoute,
      statuses: {
        ground: document.querySelector("#missionGroundStatus")?.textContent.trim(),
        air: document.querySelector("#missionAirStatus")?.textContent.trim(),
        sea: document.querySelector("#missionSeaStatus")?.textContent.trim(),
        space: document.querySelector("#missionSpaceStatus")?.textContent.trim(),
      },
      activeModules: Array.from(document.querySelectorAll("[data-home-module].active")).map((node) => node.dataset.homeModule),
      activeRoutes: Array.from(document.querySelectorAll("[data-home-route].active")).map((node) => node.dataset.homeRoute),
    };
  });

  assert(snapshot.statuses.ground === expected.ground, `ground status expected ${expected.ground}, got ${snapshot.statuses.ground}`);
  assert(snapshot.statuses.air === expected.air, `air status expected ${expected.air}, got ${snapshot.statuses.air}`);
  assert(snapshot.statuses.sea === expected.sea, `sea status expected ${expected.sea}, got ${snapshot.statuses.sea}`);
  assert(snapshot.statuses.space === expected.space, `space status expected ${expected.space}, got ${snapshot.statuses.space}`);
  assert(snapshot.activeModules.includes(expected.activeModule), `expected active module ${expected.activeModule}, got ${snapshot.activeModules.join(",")}`);
  assert(snapshot.activeRoutes.length === 1 && snapshot.activeRoutes[0] === expected.activeRoute, `expected active route ${expected.activeRoute}, got ${snapshot.activeRoutes.join(",")}`);
}

async function desktopLayout(page) {
  return page.$$eval("[data-home-module]", (nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.homeModule,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    })
  );
}

async function assertDesktopModuleGrid(page) {
  const boxes = await desktopLayout(page);
  assert(JSON.stringify(boxes.map((box) => box.id)) === JSON.stringify(["sea", "air", "ground", "space"]), "module DOM order should be Sea, Air, Ground, Space");
  const byId = Object.fromEntries(boxes.map((box) => [box.id, box]));
  assert(Math.abs(byId.sea.top - byId.air.top) <= 4, "Sea and Air should share the first desktop row");
  assert(Math.abs(byId.ground.top - byId.space.top) <= 4, "Ground and Space should share the second desktop row");
  assert(byId.ground.top > byId.sea.top, "Ground row should be below Sea/Air");
  assert(byId.air.left > byId.sea.left && byId.space.left > byId.ground.left, "desktop cards should form two columns");
  assert(Math.abs(byId.sea.width - byId.air.width) <= 4, "desktop module card widths should match");
}

async function assertMobileNoOverflow(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  collectConsole(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  const result = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll("[data-home-module]")).map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.homeModule, left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) };
    });
    return {
      viewport: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      boxes,
    };
  });
  assert(result.scrollWidth <= result.viewport + 1, `mobile page overflows horizontally: ${result.scrollWidth} > ${result.viewport}`);
  const lefts = new Set(result.boxes.map((box) => box.left));
  assert(lefts.size === 1, "mobile module cards should stack in one column");
  assert(result.boxes.every((box) => box.width <= result.viewport), "mobile module card should fit viewport");
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  collectConsole(page);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  assert(await page.locator("h2", { hasText: "星・海・地・空多路徑災害韌性通訊助理" }).count(), "homepage subtitle should mention star-sea-ground-air");
  assert((await page.locator("[data-home-module]").count()) === 4, "homepage should render four module cards");
  assert(await page.locator('[data-home-module="air"]', { hasText: "AIR MODULE" }).count(), "Air module card should exist");
  await assertDesktopModuleGrid(page);

  await page.evaluate(() => {
    window.XY_DEMO_STORE.actions.resetDemo();
  });
  await expectHomeState(page, {
    route: "air",
    activeModule: "air",
    activeRoute: "air",
    ground: "弱網／切換評估",
    air: "空中中繼評估中",
    sea: "持續監測",
    space: "備援待命",
  });

  await page.evaluate(() => {
    window.XY_DEMO_STORE.actions.restoreGroundNetwork();
  });
  await expectHomeState(page, {
    route: "ground",
    activeModule: "ground",
    activeRoute: "ground",
    ground: "可用／主要路徑",
    air: "待命中",
    sea: "監測中",
    space: "備援待命",
  });

  await page.evaluate(() => {
    window.XY_DEMO_STORE.actions.simulateGroundNetworkDown();
  });
  await expectHomeState(page, {
    route: "air",
    activeModule: "air",
    activeRoute: "air",
    ground: "節點不可用",
    air: "空中中繼啟用",
    sea: "持續監測",
    space: "備援待命",
  });

  await page.evaluate(() => {
    window.XY_DEMO_STORE.actions.enableSatelliteFallback();
  });
  await expectHomeState(page, {
    route: "satellite",
    activeModule: "space",
    activeRoute: "satellite",
    ground: "節點不可用",
    air: "節點不可用",
    sea: "骨幹異常或監測中",
    space: "衛星備援模擬",
  });

  await assertMobileNoOverflow(browser);
  await browser.close();
  assert(errors.length === 0, `console errors found:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ ok: true, url: baseUrl, desktopModules: 4, checkedRoutes: ["ground", "air", "satellite"], mobile: "no-overflow" }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
