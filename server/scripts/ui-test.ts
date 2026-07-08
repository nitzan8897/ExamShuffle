import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePdf = path.resolve(here, "../../samples/sample-exam.pdf");
const outDir = path.resolve(here, "../output");

const browser = await puppeteer.launch({ headless: "shell" });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 800 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.screenshot({ path: path.join(outDir, "ui-idle.png") });

const input = await page.$("input[type=file]");
if (!input) throw new Error("file input not found");
await input.uploadFile(samplePdf);

await page.waitForSelector(".progress", { timeout: 10_000 });
await page.screenshot({ path: path.join(outDir, "ui-progress.png") });

await page.waitForSelector(".done-check", { timeout: 240_000 });
await page.screenshot({ path: path.join(outDir, "ui-done.png") });

await browser.close();
console.log("UI test passed: idle -> progress -> done screenshots in server/output/");
