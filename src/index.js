import "dotenv/config";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { extractExam } from "./extract.js";
import { shuffleExam } from "./shuffle.js";
import { buildHtml } from "./template.js";
import { renderPdf } from "./render.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith("-"));
  const oIdx = args.indexOf("-o");
  const output = oIdx !== -1 ? args[oIdx + 1] : null;
  return { input, output };
}

async function main() {
  const { input, output } = parseArgs(process.argv);
  if (!input) {
    console.error("Usage: npm start -- <exam.pdf> [-o output.pdf]");
    process.exit(1);
  }
  await access(input).catch(() => {
    console.error(`Input file not found: ${input}`);
    process.exit(1);
  });

  const base = path.basename(input, path.extname(input));
  const outDir = path.resolve("output");
  await mkdir(outDir, { recursive: true });
  const outPdf = output ?? path.join(outDir, `${base}.shuffled.pdf`);
  const outJson = path.join(outDir, `${base}.data.json`);

  console.log(`[1/4] Extracting exam via Gemini (${process.env.GEMINI_MODEL || "gemini-2.5-flash"})...`);
  const extracted = await extractExam(input);
  console.log(`      ${extracted.questions.length} questions extracted (${extracted.language}).`);

  console.log("[2/4] Shuffling options locally...");
  const shuffled = shuffleExam(extracted);
  await writeFile(outJson, JSON.stringify(shuffled, null, 2), "utf8");
  console.log(`      Intermediate data saved: ${outJson}`);

  console.log("[3/4] Building HTML...");
  const html = await buildHtml(shuffled);

  console.log("[4/4] Rendering PDF via Puppeteer...");
  await renderPdf(html, outPdf);
  console.log(`Done. Output: ${outPdf}`);
}

main().catch((err) => {
  console.error(`Pipeline failed: ${err.message}`);
  process.exit(1);
});
