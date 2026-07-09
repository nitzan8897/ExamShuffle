import { readFile, writeFile } from "node:fs/promises";
import { LoadedPdf, RENDER_SCALE, type RenderedPage } from "../src/pdf/pdf.js";
import { locateQuestions } from "../src/exam/layout.js";
import { cropOptionRow } from "../src/exam/crop.js";
import { analyzeExam } from "../src/ai/analyze.js";
import type { Segment } from "../src/shared/types.js";

const [input, wantPage = "1"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: tsx scripts/debug-layout.ts <file.pdf> [page]");
  process.exit(1);
}

const buffer = await readFile(input);
const analyzed = await analyzeExam(buffer);
const pdf = await LoadedPdf.open(buffer);
const layouts = await locateQuestions(pdf, analyzed.questions);

const target = Number(wantPage);
const page = await pdf.renderPage(target);
const ctx = page.canvas.getContext("2d");
ctx.lineWidth = 2;

const drawSeg = (seg: Segment, color: string) => {
  if (seg.page !== target) return;
  ctx.strokeStyle = color;
  ctx.strokeRect(
    seg.rect.x * RENDER_SCALE,
    seg.rect.y * RENDER_SCALE,
    seg.rect.w * RENDER_SCALE,
    seg.rect.h * RENDER_SCALE
  );
};

for (const layout of layouts) {
  for (const seg of layout.stem) drawSeg(seg, "#e00");
  for (const opt of layout.options) for (const seg of opt.segments) drawSeg(seg, "#08f");
}

await writeFile(`output/debug-page-${target}.png`, page.canvas.toBuffer("image/png"));

const pageCache = new Map<number, RenderedPage>();
const getPage = async (n: number): Promise<RenderedPage> => {
  let p = pageCache.get(n);
  if (!p) {
    p = await pdf.renderPage(n);
    pageCache.set(n, p);
  }
  return p;
};
const q1 = layouts[0]!;
for (const [i, opt] of q1.options.entries()) {
  const crop = await cropOptionRow(getPage, opt, true);
  const b64 = crop.dataUri.split(",")[1]!;
  await writeFile(`output/debug-q1-opt${i}.png`, Buffer.from(b64, "base64"));
  console.log(`q1 opt${i} widthPx=${crop.widthPx}`);
}

await pdf.close();
console.log(`output/debug-page-${target}.png`);
for (const l of layouts) {
  console.log(
    `Q${l.number} p${l.page} stem=[${l.stem.map((s) => `p${s.page} x${s.rect.x.toFixed(0)} w${s.rect.w.toFixed(0)} h${s.rect.h.toFixed(0)}`).join(" | ")}]`
  );
  l.options.forEach((o, i) =>
    console.log(`  opt${i} ${o.segments.map((s) => `p${s.page} x${s.rect.x.toFixed(0)} w${s.rect.w.toFixed(0)} h${s.rect.h.toFixed(0)}`).join(" | ")}`)
  );
}
