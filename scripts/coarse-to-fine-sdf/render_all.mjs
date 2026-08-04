// Render the three figures to PNG with headless Chrome.
//   node render_all.mjs [--install]     --install copies the PNGs into img/coarse-to-fine-sdf
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(os.homedir(), ".cache", "coarse-to-fine-sdf");
const REPO = path.resolve(HERE, "..", "..");
const PORT = 8931;

// playwright lives in the cache folder, so no node_modules ends up in the repo:
//   cd ~/.cache/coarse-to-fine-sdf && npm init -y && npm i playwright
const { chromium } = await import(
  path.join(os.homedir(), ".cache", "coarse-to-fine-sdf", "node_modules", "playwright", "index.mjs")
).catch(() => import("playwright"));
const JOBS = [["fig_sdf.html", "out_sdf.png", "coarse-to-fine-sdf-0.png"],
              ["fig_mc.html", "out_mc.png", "coarse-to-fine-sdf-1.png"],
              ["fig_ladder.html", "out_ladder.png", "coarse-to-fine-sdf-2.png"]];

// three.js is a build input, not part of the post -- keep it out of git
const three = path.join(HERE, "three.module.js");
copyFileSync(path.join(CACHE, "three.module.js"), three);

const server = spawn("python3", ["-m", "http.server", String(PORT), "--directory", HERE],
                     { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
try {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const [page_, out, installed] of JOBS) {
    const page = await browser.newPage({ viewport: { width: 2500, height: 900 } });
    page.on("pageerror", (e) => console.log(`[${page_}]`, e.message));
    await page.goto(`http://127.0.0.1:${PORT}/${page_}`);
    await page.waitForFunction(() => window.__rendered === true, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    await page.locator("#wrap").screenshot({ path: path.join(HERE, out) });
    console.log("wrote", out);
    if (process.argv.includes("--install")) {
      copyFileSync(path.join(HERE, out), path.join(REPO, "img", "coarse-to-fine-sdf", installed));
      console.log("  installed as", installed);
    }
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
  if (existsSync(three)) unlinkSync(three);
}
