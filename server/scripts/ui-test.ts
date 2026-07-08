import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePdf = path.resolve(here, "../../samples/sample-exam.pdf");
const outDir = path.resolve(here, "../output");

const browser = await puppeteer.launch({ headless: "shell" });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.screenshot({ path: path.join(outDir, "ui-idle.png") });

await page.click(".settings summary");
await page.screenshot({ path: path.join(outDir, "ui-settings.png") });
await page.click(".settings summary");

const input = await page.$("input[type=file][multiple]");
if (!input) throw new Error("file input not found");
await input.uploadFile(samplePdf, samplePdf);

await page.waitForSelector(".job-row", { timeout: 15_000 });
await page.screenshot({ path: path.join(outDir, "ui-progress.png") });

await page.waitForFunction(
  () => document.querySelectorAll(".job-row a[download]").length === 2,
  { timeout: 480_000 }
);
await page.screenshot({ path: path.join(outDir, "ui-done.png") });

await browser.close();
console.log("UI test passed: two parallel jobs completed, screenshots in server/output/");
