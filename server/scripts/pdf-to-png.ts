import { readFile, writeFile } from "node:fs/promises";
import "../src/pdfjs-polyfill.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const [input, outPrefix = "page"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: tsx scripts/pdf-to-png.ts <file.pdf> [outPrefix]");
  process.exit(1);
}

const doc = await getDocument({ data: new Uint8Array(await readFile(input)) }).promise;
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
  await writeFile(`${outPrefix}-${n}.png`, canvas.toBuffer("image/png"));
  console.log(`${outPrefix}-${n}.png`);
}
await doc.destroy();
