import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

function loadPlaywright() {
  const localRequire = createRequire(import.meta.url);
  try {
    return localRequire("playwright");
  } catch (error) {
    const npxRoot = join(homedir(), ".npm", "_npx");
    const candidates = existsSync(npxRoot)
      ? readdirSync(npxRoot)
          .map((entry) => join(npxRoot, entry, "node_modules", "playwright", "package.json"))
          .filter(existsSync)
          .sort((left, right) => {
            const leftVersion = JSON.parse(readFileSync(left, "utf8")).version || "0";
            const rightVersion = JSON.parse(readFileSync(right, "utf8")).version || "0";
            return rightVersion.localeCompare(leftVersion, undefined, { numeric: true });
          })
      : [];
    if (!candidates.length) throw new Error("Playwright package not found");
    return createRequire(candidates[0])("playwright");
  }
}

const { chromium } = loadPlaywright();
const baseUrl = (process.argv[2] || "http://127.0.0.1:8877").replace(/\/$/, "");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(scriptDirectory, "output", "playwright", "platform-v1");
mkdirSync(outputRoot, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    return chromium.launch({ headless: true, channel: "chrome" });
  }
}

function watchErrors(page, errors, label) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`${label} requestfailed: ${request.url()} ${request.failure()?.errorText}`));
}

async function waitForPlatform(page) {
  await page.waitForFunction(() => window.XY_RESILIENCE_PLATFORM?.inspect?.().status === "ready", null, { timeout: 20000 });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
}

async function overflowReport(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("body *"))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: String(element.className || "").slice(0, 120), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    })
    .filter((item) => item.right > innerWidth + 1 || item.left < -1)
    .slice(0, 16));
}

async function measuredRaf(page) {
  return page.evaluate(() => new Promise((resolveMeasure) => {
    const samples = [];
    let previous = performance.now();
    const step = (now) => {
      samples.push(now - previous);
      previous = now;
      if (samples.length >= 90) {
        const usable = samples.slice(5);
        const averageMs = usable.reduce((sum, value) => sum + value, 0) / usable.length;
        resolveMeasure({ averageMs: Number(averageMs.toFixed(2)), approximateFps: Number((1000 / averageMs).toFixed(1)) });
      } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
}

const browser = await launchBrowser();
const errors = [];
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  watchErrors(desktop, errors, "desktop");
  await desktop.goto(`${baseUrl}/?page=platform`, { waitUntil: "networkidle" });
  await waitForPlatform(desktop);
  const inspection = await desktop.evaluate(() => window.XY_RESILIENCE_PLATFORM.inspect());
  assert(inspection.seed === "STARRYLINK_DEMO_001", `unexpected seed ${inspection.seed}`);
  assert(inspection.runs === 240, `unexpected run count ${inspection.runs}`);
  assert(inspection.candidateCount > 1, "candidate generation did not produce alternatives");
  assert(inspection.verification === "STABLE", `fixed demo should recover, got ${inspection.verification}`);
  assert((await horizontalOverflow(desktop)) <= 1, "desktop has horizontal overflow");
  await desktop.screenshot({ path: join(outputRoot, "01-story-mode-1440x900.png") });
  const raf = await measuredRaf(desktop);

  const initialStoryTitle = await desktop.locator("[data-story-title]").textContent();
  await desktop.locator("[data-story-next]").click();
  assert((await desktop.locator("[data-story-title]").textContent()) !== initialStoryTitle, "Story next control did not advance");

  await desktop.locator('[data-platform-mode="mission"]').click();
  await desktop.locator("[data-platform-panel=mission]").waitFor({ state: "visible" });
  await desktop.locator('[data-page="platform"]').evaluate((element) => { element.scrollTop = 150; });
  assert((await desktop.locator("[data-topology-map] .topology-node").count()) >= 15, "topology nodes missing");
  assert((await desktop.locator("[data-topology-map] .topology-link.selected").count()) > 0, "selected topology route missing");
  await desktop.screenshot({ path: join(outputRoot, "02-mission-control-recovery-1440x900.png") });
  await desktop.locator(".failure-lab").screenshot({ path: join(outputRoot, "04-failure-lab-controls.png") });

  await desktop.locator('[data-platform-mode="analyst"]').click();
  await desktop.locator("[data-platform-panel=analyst]").waitFor({ state: "visible" });
  await desktop.locator('[data-page="platform"]').evaluate((element) => { element.scrollTop = 150; });
  assert((await desktop.locator("[data-candidate-rows] tr").count()) === inspection.candidateCount, "candidate table count mismatch");
  assert((await desktop.locator("[data-packet-bytes]").textContent()).includes("53 bytes"), "measured packet size missing");
  await desktop.screenshot({ path: join(outputRoot, "03-candidate-decision-1440x900.png") });

  await desktop.locator('[data-platform-mode="mission"]').click();
  const form = desktop.locator("[data-failure-form]");
  await form.locator('input[name="rainfall"]').fill("100");
  await form.locator('input[name="demandMultiplier"]').fill("5");
  await form.locator('input[name="packetLoss"]').fill("60");
  await form.locator("[data-failure-submit]").click();
  await desktop.waitForFunction(() => window.XY_RESILIENCE_PLATFORM?.inspect?.().verification === "REPLAN_REQUIRED", null, { timeout: 20000 });
  assert((await desktop.locator("[data-platform-status]").textContent()).includes("REPLAN_REQUIRED"), "failure result was not rendered");
  await desktop.locator('[data-page="platform"]').evaluate((element) => { element.scrollTop = 150; });
  await desktop.screenshot({ path: join(outputRoot, "05-verification-replan-state.png") });

  const resetResponse = await desktop.request.post(`${baseUrl}/api/scenario`, { data: { scenarioId: "mountain-rain", seed: "STARRYLINK_DEMO_001", runs: 240 } });
  assert(resetResponse.ok(), `scenario reset failed ${resetResponse.status()}`);
  await desktop.evaluate(() => window.XY_RESILIENCE_PLATFORM.reload());
  await desktop.waitForFunction(() => window.XY_RESILIENCE_PLATFORM?.inspect?.().verification === "STABLE", null, { timeout: 20000 });
  await desktop.setViewportSize({ width: 390, height: 844 });
  await desktop.emulateMedia({ reducedMotion: "reduce" });
  await desktop.evaluate(() => window.XY_RESILIENCE_PLATFORM.setMode("story"));
  await desktop.locator('[data-story-jump="0"]').click();
  await desktop.locator('[data-page="platform"]').evaluate((element) => { element.scrollTop = 0; });
  await desktop.evaluate(() => window.scrollTo(0, 0));
  assert((await horizontalOverflow(desktop)) <= 1, "mobile has horizontal overflow");
  await desktop.screenshot({ path: join(outputRoot, "06-story-mode-mobile-390x844.png") });
  await desktop.locator('[data-platform-mode="mission"]').click();
  await desktop.locator("[data-platform-panel=mission]").waitFor({ state: "visible" });
  await desktop.locator('[data-page="platform"]').evaluate((element) => { element.scrollTop = 0; });
  await desktop.evaluate(() => window.scrollTo(0, 0));
  const missionMobileOverflow = await horizontalOverflow(desktop);
  assert(missionMobileOverflow <= 1, `mobile Mission Control has ${missionMobileOverflow}px horizontal overflow: ${JSON.stringify(await overflowReport(desktop))}`);
  await desktop.screenshot({ path: join(outputRoot, "07-mission-control-mobile-390x844.png") });

  assert(errors.length === 0, errors.join("\n"));
  console.log(JSON.stringify({
    status: "PASS",
    desktop: "1440x900",
    mobile: "390x844 reduced-motion",
    inspection,
    measuredRaf: raf,
    screenshots: 7,
    consoleErrors: errors.length,
    horizontalOverflow: { desktop: 0, mobile: 0 },
  }, null, 2));
} finally {
  await browser.close();
}
