import { readFile } from "node:fs/promises";
import { LoadedPdf } from "../src/pdf/pdf.js";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("Usage: tsx scripts/dump-lines.ts <file.pdf>");
  process.exit(1);
}

const pdf = await LoadedPdf.open(await readFile(input));
console.log(`pages: ${pdf.numPages}`);
for (let n = 1; n <= pdf.numPages; n++) {
  const lines = await pdf.textLines(n);
  console.log(`\n===== page ${n} (${lines.length} lines) =====`);
  for (const line of lines) {
    const spans = line.spans.map((s) => JSON.stringify(s.str)).join(" | ");
    console.log(`y=${line.top.toFixed(0)}-${line.bottom.toFixed(0)} x=${line.minX.toFixed(0)}-${line.maxX.toFixed(0)} :: ${spans}`);
  }
}
await pdf.close();
