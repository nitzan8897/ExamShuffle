import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePdf = path.resolve(here, "../../samples/sample-exam.pdf");
const outDir = path.resolve(here, "../output");

const browser = await puppeteer.launch({ headless: "shell" });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 950 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.screenshot({ path: path.join(outDir, "ui-idle.png") });

// Advanced settings: model dropdown present with light models.
await page.click(".settings summary");
const models = await page.$$eval(".settings select option", (opts) => opts.map((o) => o.value));
if (!models.includes("gemini-2.5-flash-lite")) throw new Error("model dropdown missing light models");
await page.screenshot({ path: path.join(outDir, "ui-settings.png") });
await page.click(".settings summary");

const input = await page.$("input[type=file][multiple]");
if (!input) throw new Error("file input not found");
await input.uploadFile(samplePdf);

await page.waitForSelector(".job-row", { timeout: 15_000 });
await page.screenshot({ path: path.join(outDir, "ui-progress.png") });

// Persistence: reload mid-job, the job must still be there.
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".job-row", { timeout: 10_000 });
const afterReload = await page.$$eval(".job-row", (rows) => rows.length);
if (afterReload !== 1) throw new Error(`expected 1 job after reload, got ${afterReload}`);
await page.screenshot({ path: path.join(outDir, "ui-reloaded.png") });

await page.waitForFunction(() => document.querySelectorAll(".job-row a[download]").length === 1, {
  timeout: 300_000,
});
await page.screenshot({ path: path.join(outDir, "ui-done.png") });

await browser.close();
console.log("UI test passed: dropdown + reload persistence + completion");
