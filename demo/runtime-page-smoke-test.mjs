import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
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
    if (existsSync(npxRoot)) {
      const candidates = readdirSync(npxRoot)
        .map((entry) => {
          const packagePath = join(npxRoot, entry, "node_modules", "playwright", "package.json");
          if (!existsSync(packagePath)) return null;
          const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
          return { packagePath, version: manifest.version || "0.0.0" };
        })
        .filter(Boolean)
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: "base" }));
      if (candidates.length) return createRequire(candidates[0].packagePath)("playwright");
    }
    throw new Error("Playwright package not found. Run `npx --yes --package playwright playwright --version` once, then retry.");
  }
}

const { chromium } = loadPlaywright();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.argv[2] || "http://127.0.0.1:8765").replace(/\/$/, "");
const outputRoot = resolve(scriptDirectory, "output", "playwright");
const afterDirectory = join(outputRoot, "after");
const videoDirectory = join(outputRoot, "video");
mkdirSync(afterDirectory, { recursive: true });
mkdirSync(videoDirectory, { recursive: true });

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

function collectConsoleErrors(page, label, errors) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
}

async function closeContext(context) {
  await Promise.race([
    context.close().catch(() => {}),
    new Promise((resolveClose) => setTimeout(resolveClose, 2500)),
  ]);
}

async function waitForRuntime(page) {
  await page.waitForFunction(() => window.XY_RUNTIME_PAGE?.getViewModel?.(), null, { timeout: 12000 });
  await page.waitForFunction(
    () => document.querySelector('[data-page="runtime"]')?.dataset.runtimeStep === "settled",
    null,
    { timeout: 12000 }
  );
}

async function runtimeSnapshot(page) {
  return page.evaluate(() => {
    const model = window.XY_RUNTIME_PAGE.getViewModel();
    const panel = document.querySelector('[data-page="runtime"]');
    const main = document.querySelector(".runtime-main");
    const result = document.querySelector(".runtime-result");
    const selectedChannels = Array.from(document.querySelectorAll('.runtime-channel-card[data-selected="true"]'));
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const panelRect = panel.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const resultRect = result.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth,
      horizontalOverflow: Math.max(0, documentWidth - innerWidth),
      panelOverflow: Math.max(0, panel.scrollWidth - panel.clientWidth),
      panelRect: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom },
      mainRect: { top: mainRect.top, bottom: mainRect.bottom },
      resultRect: { top: resultRect.top, bottom: resultRect.bottom },
      selectedCount: selectedChannels.length,
      selectedId: selectedChannels[0]?.dataset.channelId,
      selectedScore: selectedChannels[0]?.querySelector("header strong")?.textContent.trim(),
      modelSelectedId: model.selected.id,
      modelSelectedScore: String(Number.isInteger(model.selected.score) ? model.selected.score : model.selected.score.toFixed(1)),
      packetSeqDom: document.querySelector("#runtimeResultSeq")?.textContent.trim(),
      packetSeqState: model.packet.seq,
      ackResult: document.querySelector("#runtimeResultAck")?.textContent.trim(),
      ackSummary: document.querySelector("#runtimeAckSummary")?.textContent.trim(),
      ackState: model.ackLabel,
      riskDom: document.querySelector("#runtimeResultRisk")?.textContent.trim(),
      riskState: model.displayRisk,
      pathDom: document.querySelector("#runtimeResultPath")?.textContent.trim(),
      pathState: model.path,
      reasonDom: document.querySelector("#runtimeResultReason")?.textContent.trim(),
      reasonState: model.selectedReason,
      codeDrawerOpen: document.querySelector(".runtime-code-drawer")?.open,
      evidenceOpen: document.querySelector("#runtimeEvidence")?.open,
      repeatedLogs: (panel.textContent.match(/network accepted/gi) || []).length,
      runtimeStep: panel.dataset.runtimeStep,
    };
  });
}

function assertStateConsistency(snapshot, label) {
  assert(snapshot.horizontalOverflow <= 1, `${label}: horizontal overflow ${snapshot.horizontalOverflow}px`);
  assert(snapshot.panelOverflow <= 1, `${label}: runtime panel overflow ${snapshot.panelOverflow}px`);
  assert(snapshot.panelRect.left >= -1 && snapshot.panelRect.right <= snapshot.viewport.width + 1, `${label}: runtime panel clipped horizontally`);
  assert(snapshot.selectedCount === 1, `${label}: expected exactly one selected channel, got ${snapshot.selectedCount}`);
  assert(snapshot.selectedId === snapshot.modelSelectedId, `${label}: selected route DOM/state mismatch`);
  assert(snapshot.selectedScore === snapshot.modelSelectedScore, `${label}: selected score DOM/state mismatch`);
  assert(snapshot.packetSeqDom === (snapshot.packetSeqState ? `#${snapshot.packetSeqState}` : "—"), `${label}: packetSeq mismatch`);
  assert(snapshot.ackResult === snapshot.ackState && snapshot.ackSummary === snapshot.ackState, `${label}: ACK values contradict state`);
  assert(snapshot.riskDom.startsWith(String(snapshot.riskState)), `${label}: riskScore mismatch`);
  assert(snapshot.pathDom === snapshot.pathState, `${label}: selected path mismatch`);
  assert(snapshot.reasonDom === snapshot.reasonState, `${label}: path reason mismatch`);
  assert(snapshot.codeDrawerOpen === false, `${label}: pseudo code drawer should be closed by default`);
  assert(snapshot.repeatedLogs === 0, `${label}: repeated network accepted logs are still visible`);
  assert(snapshot.runtimeStep === "settled", `${label}: animation did not settle`);
  assert(snapshot.evidenceOpen === false, `${label}: technical evidence should be collapsed by default`);
  if (snapshot.viewport.width >= 1280) {
    assert(snapshot.mainRect.bottom <= snapshot.viewport.height, `${label}: core flow is below viewport`);
    assert(snapshot.resultRect.bottom <= snapshot.viewport.height, `${label}: result panel is below viewport`);
  }
}

async function assertKeyboardControls(page) {
  const evidence = page.locator("#runtimeEvidence");
  await evidence.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  assert(await evidence.evaluate((element) => element.open), "technical evidence did not open from keyboard");
  const decision = page.locator("#runtimeTabDecision");
  await decision.focus();
  await page.keyboard.press("ArrowRight");
  assert(await page.locator("#runtimeTabTimeline").getAttribute("aria-selected") === "true", "ArrowRight did not select timeline tab");
  await page.keyboard.press("End");
  assert(await page.locator("#runtimeTabAlgorithm").getAttribute("aria-selected") === "true", "End did not select algorithm tab");
  const drawer = page.locator(".runtime-code-drawer");
  assert(!(await drawer.evaluate((element) => element.open)), "algorithm drawer should start closed");
  await drawer.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert(await drawer.evaluate((element) => element.open), "Enter did not open algorithm drawer");
  await page.keyboard.press("Enter");
  assert(!(await drawer.evaluate((element) => element.open)), "Enter did not close algorithm drawer");
  await page.locator("#runtimeReplay").click();
  assert(await page.locator("#runtimeReplay").isDisabled(), "replay button should be disabled during playback");
  await page.waitForFunction(() => document.querySelector('[data-page="runtime"]')?.dataset.runtimeStep === "settled", null, { timeout: 9000 });
  assert(!(await page.locator("#runtimeReplay").isDisabled()), "replay button should re-enable after playback");
}

async function captureViewport(browser, viewport, label, errors) {
  console.log(`checking ${label}`);
  const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
  const page = await context.newPage();
  collectConsoleErrors(page, label, errors);
  await page.goto(`${baseUrl}/?page=runtime&boot=skip`, { waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  const snapshot = await runtimeSnapshot(page);
  assertStateConsistency(snapshot, label);
  await page.screenshot({ path: join(afterDirectory, `runtime-${label}.png`), fullPage: false });
  if (viewport.width === 390) {
    await page.screenshot({ path: join(afterDirectory, `runtime-${label}-full.png`), fullPage: true });
  }
  if (viewport.width === 1440) await assertKeyboardControls(page);
  if (viewport.width === 390) {
    const evidence = page.locator("#runtimeEvidence");
    await evidence.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    assert(await evidence.evaluate((element) => element.open), "mobile evidence drawer is not keyboard operable");
  }
  await closeContext(context);
  return snapshot;
}

async function assertReducedMotion(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  collectConsoleErrors(page, "reduced-motion", errors);
  const startedAt = Date.now();
  await page.goto(`${baseUrl}/?page=runtime&boot=skip`, { waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  const elapsed = Date.now() - startedAt;
  const snapshot = await runtimeSnapshot(page);
  assertStateConsistency(snapshot, "reduced-motion");
  assert(elapsed < 4000, `reduced-motion should settle immediately, took ${elapsed}ms`);
  const statuses = await page.locator("[data-runtime-node]").evaluateAll((nodes) => nodes.map((node) => ({ name: node.dataset.runtimeNode, status: node.dataset.status, text: node.textContent })));
  assert(statuses.every((item) => item.status !== "waiting"), "reduced-motion left waiting nodes without final state");
  await closeContext(context);
  return { elapsed, statuses };
}

async function captureVideo(browser, errors) {
  console.log("recording complete flow");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    recordVideo: { dir: videoDirectory, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  collectConsoleErrors(page, "video", errors);
  const video = page.video();
  await page.goto(`${baseUrl}/?page=runtime&boot=skip`, { waitUntil: "domcontentloaded" });
  await waitForRuntime(page);
  await page.waitForTimeout(450);
  await page.close();
  const generatedPath = await video.path();
  await closeContext(context);
  const finalPath = join(videoDirectory, "runtime-complete-flow.webm");
  if (generatedPath !== finalPath) renameSync(generatedPath, finalPath);
  return finalPath;
}

async function main() {
  const errors = [];
  const browser = await launchBrowser();
  try {
    const results = {};
    results["1440x900"] = await captureViewport(browser, { width: 1440, height: 900 }, "1440x900", errors);
    results["1280x720"] = await captureViewport(browser, { width: 1280, height: 720 }, "1280x720", errors);
    results["390x844"] = await captureViewport(browser, { width: 390, height: 844 }, "390x844", errors);
    results.reducedMotion = await assertReducedMotion(browser, errors);
    results.video = await captureVideo(browser, errors);
    assert(errors.length === 0, `browser errors found:\n${errors.join("\n")}`);
    console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
