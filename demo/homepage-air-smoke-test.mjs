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
let activeBrowser = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectConsole(page) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(`[${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
}

async function waitForRuntime(page) {
  await page.waitForFunction(
    () => window.XY_DEMO_STORE?.getStarryState && window.XY_DEMO_STORE?.actions && window.STARRYLINK_HOME_HERO?.getState,
    null,
    { timeout: 10000 }
  );
}

async function installLifecycleProbe(page) {
  await page.addInitScript(() => {
    const counters = {
      listeners: 0,
      observers: { MutationObserver: 0, ResizeObserver: 0, IntersectionObserver: 0 },
    };
    const registrations = new WeakMap();
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;

    const captureFrom = (options) => (typeof options === "boolean" ? options : Boolean(options?.capture));
    const recordFor = (target, type, listener, capture) => {
      const byType = registrations.get(target);
      return byType?.get(type)?.get(listener)?.get(capture) || null;
    };
    const storeRecord = (target, type, listener, capture, record) => {
      let byType = registrations.get(target);
      if (!byType) {
        byType = new Map();
        registrations.set(target, byType);
      }
      let byListener = byType.get(type);
      if (!byListener) {
        byListener = new Map();
        byType.set(type, byListener);
      }
      let byCapture = byListener.get(listener);
      if (!byCapture) {
        byCapture = new Map();
        byListener.set(listener, byCapture);
      }
      byCapture.set(capture, record);
    };
    const deactivate = (record) => {
      if (!record.active) return;
      record.active = false;
      counters.listeners -= 1;
    };

    EventTarget.prototype.addEventListener = function addProbedListener(type, listener, options) {
      if (!listener || options?.signal?.aborted) return nativeAdd.call(this, type, listener, options);
      const capture = captureFrom(options);
      const existing = recordFor(this, type, listener, capture);
      if (existing?.active) return nativeAdd.call(this, type, existing.wrapped, options);

      const record = { active: true, wrapped: listener };
      if (options && typeof options === "object" && options.once) {
        record.wrapped = function probedOnceListener(event) {
          deactivate(record);
          if (typeof listener === "function") return listener.call(this, event);
          return listener.handleEvent?.call(listener, event);
        };
      }
      storeRecord(this, type, listener, capture, record);
      counters.listeners += 1;
      try {
        const result = nativeAdd.call(this, type, record.wrapped, options);
        if (options && typeof options === "object" && options.signal) {
          nativeAdd.call(options.signal, "abort", () => deactivate(record), { once: true });
        }
        return result;
      } catch (error) {
        deactivate(record);
        throw error;
      }
    };

    EventTarget.prototype.removeEventListener = function removeProbedListener(type, listener, options) {
      const capture = captureFrom(options);
      const record = listener ? recordFor(this, type, listener, capture) : null;
      if (record?.active) deactivate(record);
      return nativeRemove.call(this, type, record?.wrapped || listener, options);
    };

    const wrapObserver = (name, canUnobserve) => {
      const NativeObserver = globalThis[name];
      if (typeof NativeObserver !== "function") return;
      class ProbedObserver extends NativeObserver {
        constructor(...args) {
          super(...args);
          this.__probeTargets = new Set();
        }

        observe(target, ...args) {
          if (this.__probeTargets.size === 0) counters.observers[name] += 1;
          this.__probeTargets.add(target);
          return super.observe(target, ...args);
        }

        disconnect() {
          if (this.__probeTargets.size > 0) counters.observers[name] -= 1;
          this.__probeTargets.clear();
          return super.disconnect();
        }
      }
      if (canUnobserve) {
        ProbedObserver.prototype.unobserve = function unobserve(target) {
          this.__probeTargets.delete(target);
          if (this.__probeTargets.size === 0) counters.observers[name] -= 1;
          return NativeObserver.prototype.unobserve.call(this, target);
        };
      }
      Object.defineProperty(ProbedObserver, "name", { value: name });
      globalThis[name] = ProbedObserver;
    };

    wrapObserver("MutationObserver", false);
    wrapObserver("ResizeObserver", true);
    wrapObserver("IntersectionObserver", true);
    Object.defineProperty(window, "__HERO_LIFECYCLE_PROBE", {
      configurable: true,
      value: {
        snapshot: () => ({
          listeners: counters.listeners,
          observers: { ...counters.observers },
        }),
      },
    });
  });
}

async function lifecycleSnapshot(page) {
  return page.evaluate(() => ({
    ...window.__HERO_LIFECYCLE_PROBE.snapshot(),
    domNodes: document.getElementsByTagName("*").length,
    svgNodes: document.querySelectorAll("svg, svg *").length,
    canvases: document.querySelectorAll("canvas").length,
    relayPaths: document.querySelectorAll(".relay-direct, .relay-segment, .relay-ack-path").length,
  }));
}

async function assertThreeLoopStability(page) {
  await page.waitForTimeout(80);
  const before = await lifecycleSnapshot(page);
  await page.waitForFunction(
    () => {
      const state = window.STARRYLINK_HOME_HERO.getState();
      return state.loopCount >= 2 && state.phase === "ack-complete";
    },
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(80);
  const after = await lifecycleSnapshot(page);
  assert(JSON.stringify(after) === JSON.stringify(before), `three-cycle lifecycle counts changed: ${JSON.stringify({ before, after })}`);
  const routeState = await page.evaluate(() => window.STARRYLINK_HOME_HERO.getState());
  assert(routeState.routeScene === "horizon", `route composition should remain fixed at horizon, got ${routeState.routeScene}`);
}

async function assertHeroCore(page, expectedStarCount = 182) {
  await page.waitForFunction(() => document.querySelector("[data-home-hero]")?.dataset.brandState === "ready", null, { timeout: 5000 });
  const result = await page.evaluate(() => {
    const hero = document.querySelector("[data-home-hero]");
    const wordmark = document.querySelector(".home-hero-wordmark");
    const primary = document.querySelector(".home-hero-cta");
    const secondary = document.querySelector(".home-hero-text-link");
    const copy = document.querySelector("[data-hero-copy]");
    const heroRect = hero?.getBoundingClientRect();
    const wordmarkRect = wordmark?.getBoundingClientRect();
    return {
      bodyClass: document.body.classList.contains("home-hero-active"),
      canvases: document.querySelectorAll("[data-hero-starfield]").length,
      relays: document.querySelectorAll("[data-hero-relay]").length,
      meteorHeads: document.querySelectorAll("[data-signal-head] .relay-meteor-tail-primary").length,
      breakMarkers: document.querySelectorAll("[data-relay-break]").length,
      relayNodeShells: document.querySelectorAll(".relay-node-shell").length,
      relayNodeShellAssetReady: Array.from(document.querySelectorAll(".relay-node-shell")).every(
        (shell) => shell.getAttribute("href") === "./assets/relay/starrylink-relay-node-shell.png" && shell.getAttribute("width") === "44"
      ),
      introIds: document.querySelectorAll("#introTitle").length,
      wordmarkLabel: wordmark?.getAttribute("aria-label"),
      wordmarkText: wordmark?.textContent.replace(/\s+/g, ""),
      wordmarkFaces: document.querySelectorAll(".home-hero-wordmark-face").length,
      legacyWordmarkParts: document.querySelectorAll(".home-hero-initial, .home-hero-link-word").length,
      wordmarkArtwork: document.querySelectorAll(".home-hero-wordmark-stage img").length,
      wordmarkSlices: document.querySelectorAll(".home-hero-wordmark-slice").length,
      wordmarkAssetReady: Array.from(document.querySelectorAll(".home-hero-wordmark-stage img")).every(
        (image) => image.complete && image.naturalWidth === 1871 && image.naturalHeight === 453
      ),
      signatureText: document.querySelector(".home-hero-signature")?.textContent.trim(),
      wordmarkWidth: wordmarkRect?.width || 0,
      heroHeight: heroRect?.height || 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      primaryTarget: primary?.dataset.pageTarget,
      secondaryTarget: secondary?.dataset.pageTarget,
      copyDisplay: getComputedStyle(copy).display,
      statementDisplay: getComputedStyle(document.querySelector(".home-hero-statement")).display,
      supportDisplay: getComputedStyle(document.querySelector(".home-hero-support")).display,
      actionsDisplay: getComputedStyle(document.querySelector(".home-hero-actions")).display,
      hydratedPathCount: Array.from(
        document.querySelectorAll("[data-relay-map] path[data-segment], [data-relay-map] path[data-ack], [data-route-path]")
      ).filter((path) => Boolean(path.getAttribute("d"))).length,
      dataFrozen: Object.isFrozen(window.STARRYLINK_HOME_HERO_DATA) && Object.isFrozen(window.STARRYLINK_HOME_HERO_DATA.routes),
      nodeLabels: window.STARRYLINK_HOME_HERO_DATA.content.relay.nodes.desktop,
      state: window.STARRYLINK_HOME_HERO.getState(),
    };
  });

  assert(result.bodyClass, "homepage should apply the isolated home-hero-active scope");
  assert(result.canvases === 1, `expected one Hero canvas, got ${result.canvases}`);
  assert(result.relays === 1, `expected one responsive relay SVG, got ${result.relays}`);
  assert(result.meteorHeads === 2, `expected two responsive meteor heads, got ${result.meteorHeads}`);
  assert(result.breakMarkers === 0, `unnamed break markers should be removed, got ${result.breakMarkers}`);
  assert(result.relayNodeShells === 10, `expected ten responsive orbital node shells, got ${result.relayNodeShells}`);
  assert(result.relayNodeShellAssetReady, "all relay nodes should reuse the approved orbital-monolith shell asset");
  assert(result.introIds === 1, `introTitle id should be unique, got ${result.introIds}`);
  assert(result.wordmarkLabel === "StarryLink" && result.wordmarkText === "StarryLink", "wordmark should stay real, accessibly named DOM text");
  assert(result.wordmarkFaces === 1 && result.legacyWordmarkParts === 0, "wordmark should use the clean orbital-monolith structure");
  assert(result.wordmarkArtwork === 5 && result.wordmarkSlices === 3, "wordmark should use one real generated asset split into three assembly plates and one orbital stroke");
  assert(result.wordmarkAssetReady, "wordmark artwork layers should load at their intended source dimensions");
  assert(result.signatureText === "星夜 急難救助分節系統", `unexpected moved signature ${result.signatureText}`);
  assert(
    result.wordmarkWidth > 0 && result.wordmarkWidth <= result.viewportWidth * 0.92 + 1 && result.copyDisplay === "flex",
    "route study should keep the designed primary title visible"
  );
  assert(
    result.statementDisplay === "none" && result.supportDisplay === "none" && result.actionsDisplay === "none",
    "route study should isolate only the secondary Hero copy"
  );
  assert(Math.abs(result.heroHeight - result.viewportHeight) <= 1, `Hero should fill the first viewport: ${result.heroHeight} vs ${result.viewportHeight}`);
  assert(result.primaryTarget === "demo", `primary CTA should retain the existing demo route, got ${result.primaryTarget}`);
  assert(result.secondaryTarget === "architecture", `secondary CTA should retain the architecture route, got ${result.secondaryTarget}`);
  assert(result.state.starCount === expectedStarCount, `expected ${expectedStarCount} effective stars, got ${result.state.starCount}`);
  assert(result.state.animation === "running", `Hero animation should be running in view, got ${result.state.animation}`);
  assert(result.state.studyMode === "routes", `expected route-study mode, got ${result.state.studyMode}`);
  assert(result.state.contentMounted && result.state.routeDataMounted, "Hero content and geometry should mount from independent data");
  assert(result.state.dataVersion === "route-study-12", `unexpected Hero data version ${result.state.dataVersion}`);
  assert(
    result.nodeLabels.origin === "基地台中繼" && result.nodeLabels.ground === "海纜節點" && result.nodeLabels.center === "應變中心",
    `unexpected infrastructure labels ${JSON.stringify(result.nodeLabels)}`
  );
  assert(result.hydratedPathCount === 20 && result.dataFrozen, "all route paths should hydrate from immutable data");
}

async function assertRelayNarrative(page) {
  const story = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const hero = document.querySelector("[data-home-hero]");
        const mapName = matchMedia("(max-width: 820px)").matches ? "mobile" : "desktop";
        const map = document.querySelector(`[data-relay-map="${mapName}"]`);
        const seen = [];
        let started = false;
        let maxActivePaths = 0;
        let copyDisplay = "";
        let handoffOverlapsEmission = false;
        let meteorNodeOffset = Number.POSITIVE_INFINITY;
        let originAlertIsRed = false;
        let originAlertHasNoActivePath = false;
        let sampleTimer = 0;
        const sampleActivePaths = () => {
          maxActivePaths = Math.max(
            maxActivePaths,
            map.querySelectorAll(".relay-direct.is-active, .relay-segment.is-active, .relay-ack-path.is-active").length
          );
        };
        const timeout = setTimeout(() => {
          clearInterval(sampleTimer);
          observer.disconnect();
          reject(new Error(`relay narrative timed out at ${hero?.dataset.relayPhase}; seen ${seen.join(",")}`));
        }, 36000);
        const recordPhase = () => {
          const phase = hero.dataset.relayPhase;
          if (phase === "origin-alert") {
            seen.length = 0;
            started = true;
            handoffOverlapsEmission = false;
          }
          if (!started) return;
          if (seen.at(-1) !== phase) seen.push(phase);
          sampleActivePaths();
          if (phase === "origin-alert") {
            originAlertIsRed = map.querySelector('[data-node="origin"]')?.classList.contains("is-unavailable") === true;
            originAlertHasNoActivePath = map.querySelectorAll(".relay-segment.is-active").length === 0;
          }
          if (phase === "ground-unavailable") {
            const meteorMatrix = map.querySelector(".relay-meteor-core")?.getScreenCTM();
            const nodeMatrix = map.querySelector('[data-node="ground"] .relay-node-core')?.getScreenCTM();
            if (meteorMatrix && nodeMatrix) meteorNodeOffset = Math.hypot(meteorMatrix.e - nodeMatrix.e, meteorMatrix.f - nodeMatrix.f);
          }
          if (phase === "ground-handoff") {
            handoffOverlapsEmission =
              map.querySelector('[data-node="ground"]')?.classList.contains("is-handoff") === true &&
              map.querySelectorAll(".relay-segment.is-active").length === 1;
          }
          if (phase === "ack-complete") {
            copyDisplay = getComputedStyle(document.querySelector("[data-hero-copy]")).display;
            clearTimeout(timeout);
            clearInterval(sampleTimer);
            observer.disconnect();
            resolve({ seen, maxActivePaths, copyDisplay, handoffOverlapsEmission, meteorNodeOffset, originAlertIsRed, originAlertHasNoActivePath });
          }
        };
        const observer = new MutationObserver(recordPhase);
        observer.observe(hero, { attributes: true, attributeFilter: ["data-relay-phase"] });
        sampleTimer = setInterval(sampleActivePaths, 40);
        recordPhase();
      })
  );

  const expected = [
    "origin-alert",
    "origin-handoff",
    "ground-receive",
    "ground-unavailable",
    "ground-handoff",
    "drone-receive",
    "drone-unavailable",
    "drone-handoff",
    "satellite-receive",
    "satellite-unavailable",
    "satellite-handoff",
    "center-receive",
    "center-hold",
    "delivered",
    "ack-return",
    "ack-complete",
  ];
  let cursor = -1;
  expected.forEach((phase) => {
    const next = story.seen.indexOf(phase, cursor + 1);
    assert(next > cursor, `relay phase ${phase} missing or out of order: ${story.seen.join(" -> ")}`);
    cursor = next;
  });
  assert(story.maxActivePaths <= 1, `only one relay path may be brightest at once, got ${story.maxActivePaths}`);
  assert(story.originAlertIsRed, "base-station relay should turn red before the first handoff");
  assert(story.originAlertHasNoActivePath, "base-station alert should complete before the sea-cable segment activates");
  assert(story.copyDisplay === "flex", "route study should compose the primary title with the path choreography");
  assert(story.meteorNodeOffset <= 0.75, `meteor core should hit the exact node center, offset ${story.meteorNodeOffset}px`);
  assert(story.handoffOverlapsEmission, "ground handoff should overlap the next segment emission");
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
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForRuntime(page);
  await assertHeroCore(page, 88);
  await assertRelayNarrative(page);
  const result = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll("[data-home-module]")).map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.homeModule, left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) };
    });
    return {
      viewport: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      boxes,
      heroState: window.STARRYLINK_HOME_HERO.getState(),
      copyDisplay: getComputedStyle(document.querySelector("[data-hero-copy]")).display,
      wordmark: document.querySelector(".home-hero-wordmark")?.getBoundingClientRect().toJSON(),
    };
  });
  assert(result.scrollWidth <= result.viewport + 1, `mobile page overflows horizontally: ${result.scrollWidth} > ${result.viewport}`);
  assert(result.heroState.starCount === 88, `mobile Hero should render 88 stars, got ${result.heroState.starCount}`);
  assert(result.copyDisplay === "flex", "mobile route study should retain the primary title");
  assert(result.wordmark.left >= 0 && result.wordmark.right <= result.viewport, "mobile primary title should not be clipped");
  const lefts = new Set(result.boxes.map((box) => box.left));
  assert(lefts.size === 1, "mobile module cards should stack in one column");
  assert(result.boxes.every((box) => box.width <= result.viewport), "mobile module card should fit viewport");
  await context.close();
}

async function assertReducedMotion(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  collectConsole(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForRuntime(page);
  await page.waitForFunction(() => window.STARRYLINK_HOME_HERO.getState().brandState === "ready");
  const result = await page.evaluate(async () => {
    const initial = window.STARRYLINK_HOME_HERO.getState();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const segments = Array.from(document.querySelectorAll('[data-relay-map="desktop"] .relay-segment'));
    return {
      state: window.STARRYLINK_HOME_HERO.getState(),
      stableLoopCount: initial.loopCount === window.STARRYLINK_HOME_HERO.getState().loopCount,
      segmentCount: segments.length,
      completedSegments: segments.every((path) => Number(getComputedStyle(path).opacity) >= 0.25),
      status: document.querySelector("[data-hero-status]")?.textContent.trim(),
      copyDisplay: getComputedStyle(document.querySelector("[data-hero-copy]")).display,
      actionsDisplay: getComputedStyle(document.querySelector(".home-hero-actions")).display,
      relayTransition: getComputedStyle(segments[0]).transitionProperty,
    };
  });
  assert(result.state.animation === "reduced", `reduced-motion state expected, got ${result.state.animation}`);
  assert(result.state.phase === "delivered", `reduced-motion should preserve the delivered story, got ${result.state.phase}`);
  assert(result.stableLoopCount && result.state.loopCount === 0, "reduced-motion should not run the relay loop");
  assert(result.segmentCount === 4, `reduced-motion should expose four relay segments, got ${result.segmentCount}`);
  assert(result.completedSegments, "reduced-motion should show the complete static relay path");
  assert(result.status.includes("ACK 已返回"), "reduced-motion should preserve the accessible delivered status");
  assert(result.copyDisplay === "flex" && result.actionsDisplay === "none", "reduced-motion should retain the primary-title study composition");
  assert(result.relayTransition === "opacity", "reduced-motion should retain opacity-only relay transitions");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(120);
  const resumedBrand = await page.evaluate(() =>
    [".home-hero-starfield", ".home-hero-signature", ".home-hero-wordmark", ".home-hero-statement", ".home-hero-support", ".home-hero-actions"].map(
      (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return { selector, opacity: Number(style.opacity), animationName: style.animationName };
      }
    )
  );
  const entranceAnimations = new Set(["homeHeroStarsIn", "homeHeroSignatureIn", "homeHeroWordmarkIn", "homeHeroCopyIn"]);
  assert(
    resumedBrand.every(
      (item) => item.opacity === 1 && item.animationName.split(",").every((name) => !entranceAnimations.has(name.trim()))
    ),
    `reduced→full must not replay the brand entrance: ${JSON.stringify(resumedBrand)}`
  );
  await context.close();
}

async function assertPartialInitFallback(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(() => {
    window.IntersectionObserver = class BrokenIntersectionObserver {
      constructor() {
        throw new Error("forced IntersectionObserver init failure");
      }
    };
  });
  const page = await context.newPage();
  collectConsole(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("[data-home-hero]")?.dataset.routeDataMounted === "true", null, { timeout: 5000 });
  const fallback = await page.evaluate(() => ({
    enhanced: document.querySelector("[data-home-hero]").hasAttribute("data-enhanced"),
    helper: Boolean(window.STARRYLINK_HOME_HERO),
    segmentOpacity: Number(getComputedStyle(document.querySelector('[data-relay-map="desktop"] .relay-segment')).opacity),
    deliveredOpacity: Number(getComputedStyle(document.querySelector('[data-relay-map="desktop"] .relay-delivery-note')).opacity),
    disclaimerDisplay: getComputedStyle(document.querySelector(".demo-disclaimer")).display,
    controlsDisplay: getComputedStyle(document.querySelector(".page-controls")).display,
    sharedStarfieldRunning: window.XY_STARFIELD?.running,
  }));
  assert(!fallback.enhanced && !fallback.helper, "partial init failure should fall back to static, unenhanced Hero state");
  assert(fallback.segmentOpacity >= 0.25 && fallback.deliveredOpacity > 0.8, "partial init fallback should preserve the completed relay story");
  assert(fallback.disclaimerDisplay === "grid" && fallback.controlsDisplay === "flex", "partial fallback should retain homepage utilities below Hero");
  assert(fallback.sharedStarfieldRunning === false, "partial fallback should stop the shared starfield after it mounts");
  await page.locator('[data-nav-page="architecture"]').click();
  await page.waitForFunction(() => document.querySelector('[data-page="architecture"]')?.classList.contains("active"));
  assert(await page.evaluate(() => window.XY_STARFIELD?.running === true), "partial fallback should restart the shared starfield away from home");
  await page.locator("#nextPage").click();
  await page.waitForFunction(() => document.querySelector('.page-panel.active')?.dataset.page === "demo");
  await page.locator("button.brand").click();
  await page.waitForFunction(
    () => document.body.classList.contains("home-hero-active") && document.activeElement?.matches("button.brand")
  );
  assert(await page.evaluate(() => window.XY_STARFIELD?.running === false), "partial fallback should stop the shared starfield on home");
  await page.goto(`${baseUrl}/?view=mobile`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector(".page-panel.active")?.dataset.page === "demo" && !document.body.classList.contains("home-hero-active")
  );
  await context.close();
}

async function assertHomepageScope(page) {
  await page.locator("#nextPage").click();
  await page.waitForFunction(() => document.querySelector(".page-panel.active")?.dataset.page === "architecture");
  assert((await page.evaluate(() => document.activeElement?.id)) === "nextPage", "moving homepage controls must preserve Next-page focus");
  await page.locator("#prevPage").click();
  await page.waitForFunction(() => document.querySelector(".page-panel.active")?.dataset.page === "intro");
  await page.waitForFunction(() => document.activeElement?.id === "nextPage");
  assert(
    (await page.evaluate(() => document.activeElement?.id)) === "nextPage",
    "when Previous becomes disabled on home, focus should remain in page controls on Next"
  );
  await page.evaluate(() => {
    document.querySelector(".intro-panel").scrollTop = 0;
  });
  await page.waitForFunction(() => window.STARRYLINK_HOME_HERO.getState().animation === "running");

  assert(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("[data-hero-copy]")).display === "flex" &&
        getComputedStyle(document.querySelector(".home-hero-actions")).display === "none"
    ),
    "route-study navigation should retain the title while keeping secondary Hero actions out of the visual stage"
  );

  for (const pageName of ["architecture", "demo", "matrix", "runtime"]) {
    await page.locator(`[data-nav-page="${pageName}"]`).click();
    await page.waitForFunction((expected) => document.querySelector(".page-panel.active")?.dataset.page === expected, pageName);
    const away = await page.evaluate(() => ({
      homeClass: document.body.classList.contains("home-hero-active"),
      globalStarfield: document.querySelector(".starfield-background")?.dataset.animation,
      heroAnimation: window.STARRYLINK_HOME_HERO.getState().animation,
    }));
    assert(!away.homeClass, `${pageName} should not inherit the homepage visual scope`);
    assert(away.globalStarfield === "running", `shared starfield should run on ${pageName}, got ${away.globalStarfield}`);
    assert(away.heroAnimation === "paused", `Hero animation should pause on ${pageName}, got ${away.heroAnimation}`);
  }

  await page.locator('[data-nav-page="intro"]').click();
  await page.waitForFunction(() => document.body.classList.contains("home-hero-active"));
  await page.waitForFunction(() => window.STARRYLINK_HOME_HERO.getState().animation === "running");
  const returned = await page.evaluate(() => window.STARRYLINK_HOME_HERO.getState());
  assert(returned.animation === "running", `Hero should safely resume on return, got ${returned.animation}`);
  assert(returned.brandState === "ready", `brand entrance should not replay after route return, got ${returned.brandState}`);
}

async function assertPageTitleIdentities(page) {
  const expected = {
    intro: { style: "stellar", className: "page-title-home", animation: null },
    architecture: { style: "orbit", className: "page-title-architecture", animation: "architectureTitleOrbit" },
    demo: { style: "signal", className: "page-title-demo", animation: "demoTitleScan" },
    matrix: { style: "decision", className: "page-title-matrix", animation: "matrixTitleAssemble" },
    runtime: { style: "runtime", className: "page-title-runtime", animation: "runtimeTitleResolve" },
  };
  const identities = [];

  for (const pageName of Object.keys(expected)) {
    if (pageName !== "intro") await page.locator(`[data-nav-page="${pageName}"]`).click();
    await page.waitForFunction((name) => document.querySelector(".page-panel.active")?.dataset.page === name, pageName);
    await page.waitForFunction(() => !document.documentElement.classList.contains("is-page-transitioning"));
    const identity = await page.evaluate(() => {
      const panel = document.querySelector(".page-panel.active");
      const title = panel?.querySelector("[data-page-title]");
      const style = getComputedStyle(title);
      const bounds = title?.getBoundingClientRect();
      return {
        page: panel?.dataset.page,
        style: panel?.dataset.titleStyle,
        className: Array.from(title?.classList || []).find((name) => name.startsWith("page-title-") && name !== "page-title"),
        animation: style.animationName,
        viewTransitionName: style.viewTransitionName,
        supportsViewTransition: CSS.supports("view-transition-name", "starrylink-title"),
        fontSize: Number.parseFloat(style.fontSize),
        width: bounds?.width || 0,
        height: bounds?.height || 0,
      };
    });
    const contract = expected[pageName];
    assert(identity.style === contract.style, `${pageName} should use ${contract.style} title language, got ${identity.style}`);
    assert(identity.className === contract.className, `${pageName} title identity class mismatch: ${identity.className}`);
    if (contract.animation) assert(identity.animation.includes(contract.animation), `${pageName} title animation mismatch: ${identity.animation}`);
    assert(identity.width > 0 && identity.height > 0, `${pageName} primary title should remain visible`);
    assert(identity.fontSize >= 28, `${pageName} primary title should retain display scale, got ${identity.fontSize}px`);
    if (identity.supportsViewTransition) {
      assert(identity.viewTransitionName === "starrylink-title", `${pageName} title should join the shared smooth transition`);
    }
    identities.push(identity.style);
  }

  assert(new Set(identities).size === 5, `each page should have a distinct title language: ${identities.join(", ")}`);
  await page.locator('[data-nav-page="intro"]').click();
  await page.waitForFunction(() => document.querySelector(".page-panel.active")?.dataset.page === "intro");
  await page.waitForFunction(() => !document.documentElement.classList.contains("is-page-transitioning"));
}

async function assertScrollPauseAndKeyboard(page) {
  await page.evaluate(() => {
    const panel = document.querySelector(".intro-panel");
    panel.scrollTop = window.innerHeight + 120;
  });
  await page.waitForFunction(() => window.STARRYLINK_HOME_HERO.getState().animation === "paused");
  await page.evaluate(() => {
    document.querySelector(".intro-panel").scrollTop = 0;
  });
  await page.waitForFunction(() => window.STARRYLINK_HOME_HERO.getState().animation === "running");

  await page.evaluate(() => document.activeElement?.blur());
  let reachedNavigation = false;
  let reachedHiddenCopy = false;
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => ({
      navigation: document.activeElement?.closest(".topbar") !== null,
      hiddenCopy: document.activeElement?.closest("[data-hero-copy]") !== null,
    }));
    reachedNavigation ||= focus.navigation;
    reachedHiddenCopy ||= focus.hiddenCopy;
  }
  assert(reachedNavigation, "route-study navigation should remain keyboard reachable");
  assert(!reachedHiddenCopy, "hidden Hero copy must not enter the keyboard order");
}

async function assertSpecifiedViewports(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  collectConsole(page);
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.STARRYLINK_HOME_HERO?.getState, null, { timeout: 10000 });
    const result = await page.evaluate(() => {
      const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        hero: bounds(".home-hero"),
        copyDisplay: getComputedStyle(document.querySelector("[data-hero-copy]")).display,
        wordmark: bounds(".home-hero-wordmark"),
        nav: bounds(".topbar"),
        touchTargets: Array.from(document.querySelectorAll(".topbar button:not([data-nav-page=\"intro\"])")).map((node) => ({
          name: node.textContent.trim(),
          ...node.getBoundingClientRect().toJSON(),
        })),
        nodeBounds: Array.from(document.querySelectorAll(`${innerWidth <= 820 ? '[data-relay-map="mobile"]' : '[data-relay-map="desktop"]'} .relay-node`)).map(
          (node) => node.getBoundingClientRect().toJSON()
        ),
        starCount: window.STARRYLINK_HOME_HERO.getState().starCount,
      };
    });
    assert(result.scrollWidth <= width + 1, `${width}x${height} overflows horizontally: ${result.scrollWidth}`);
    assert(Math.abs(result.hero.height - height) <= 1, `${width}x${height} Hero height mismatch: ${result.hero.height}`);
    assert(result.copyDisplay === "flex", `route-study primary title should stay visible at ${width}x${height}`);
    for (const [name, rect] of [
      ["primary title", result.wordmark],
      ["navigation", result.nav],
    ]) {
      assert(rect.left >= -1 && rect.right <= width + 1, `${name} is clipped at ${width}x${height}`);
      assert(rect.top >= -1 && rect.bottom <= height + 1, `${name} is vertically clipped at ${width}x${height}`);
    }
    const expectedStars = width <= 820 ? 88 : 182;
    assert(result.starCount === expectedStars, `${width}x${height} expected ${expectedStars} stars, got ${result.starCount}`);
    if (width <= 820) {
      assert(result.touchTargets.every((target) => target.width >= 44 && target.height >= 44), `touch target below 44px at ${width}x${height}`);
    }
    const visibleNodeCount = result.nodeBounds.filter(
      (node) => node.right >= 0 && node.left <= width && node.bottom >= 0 && node.top <= height
    ).length;
    assert(visibleNodeCount >= 3, `cross-screen route should retain at least three visible relay nodes at ${width}x${height}`);
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(
    () => window.STARRYLINK_HOME_HERO.getState().starCount === 182 && getComputedStyle(document.querySelector('[data-relay-map="desktop"]')).display !== "none"
  );
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  collectConsole(page);
  await installLifecycleProbe(page);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForRuntime(page);
  await assertHeroCore(page);
  await assertRelayNarrative(page);
  await assertThreeLoopStability(page);
  await assertScrollPauseAndKeyboard(page);
  await assertPageTitleIdentities(page);
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

  await assertHomepageScope(page);
  await assertMobileNoOverflow(browser);
  await assertReducedMotion(browser);
  await assertPartialInitFallback(browser);
  await assertSpecifiedViewports(browser);
  await browser.close();
  activeBrowser = null;
  assert(errors.length === 0, `console errors found:\n${errors.join("\n")}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        url: baseUrl,
        hero: { desktopStars: 182, mobileStars: 88, reducedMotion: "delivered-static" },
        desktopModules: 4,
        checkedPages: ["intro", "architecture", "demo", "matrix", "runtime"],
        checkedNetworkStates: ["ground", "air", "satellite"],
        lifecycle: "three-cycles-stable",
        mobile: "complete-narrative-no-overflow",
      },
      null,
      2
    )
  );
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await activeBrowser?.close().catch(() => {});
  process.exitCode = 1;
});
