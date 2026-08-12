import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function loadPlaywright() {
  const localRequire = createRequire(import.meta.url);
  try {
    return localRequire("playwright");
  } catch {
    const npxRoot = join(homedir(), ".npm", "_npx");
    const candidates = existsSync(npxRoot)
      ? readdirSync(npxRoot)
          .map((entry) => {
            const packagePath = join(npxRoot, entry, "node_modules", "playwright", "package.json");
            if (!existsSync(packagePath)) return null;
            const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
            return { packagePath, version: manifest.version || "0.0.0" };
          })
          .filter(Boolean)
          .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
      : [];
    if (!candidates.length) throw new Error("Playwright package not found.");
    return createRequire(candidates[0].packagePath)("playwright");
  }
}

const { chromium } = loadPlaywright();
const baseUrl = (process.argv[2] || "http://127.0.0.1:8765").replace(/\/$/, "");
const mode = process.argv[3] || "reference";
const outputDirectory = resolve("output", "playwright", "design-language", mode);
mkdirSync(outputDirectory, { recursive: true });

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ headless: true, channel: "chrome" });
  }
}

const pages = [
  ["intro", "01-intro"],
  ["architecture", "02-architecture"],
  ["demo", "03-demo"],
  ["matrix", "04-matrix"],
  ["runtime", mode === "reference" ? "05-runtime-before" : "05-runtime-after"],
];

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));

const captures = [];
for (const [pageName, fileName] of pages) {
  await page.goto(`${baseUrl}/?page=${pageName}&boot=skip`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-page="${pageName}"].active`, { timeout: 12000 });
  if (pageName === "runtime") {
    await page.waitForFunction(
      () => document.querySelector('[data-page="runtime"]')?.dataset.runtimeStep === "settled",
      null,
      { timeout: 12000 }
    );
  } else {
    await page.waitForTimeout(900);
  }
  const outputPath = join(outputDirectory, `${fileName}-1440x900.png`);
  await page.screenshot({ path: outputPath, fullPage: false });
  captures.push({ page: pageName, outputPath });
}

await context.close();
await browser.close();

if (browserErrors.length) {
  throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
}

console.log(JSON.stringify({ ok: true, mode, captures }, null, 2));
