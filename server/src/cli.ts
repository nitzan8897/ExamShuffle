import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "./pipeline.js";

function parseArgs(argv: string[]): { input?: string; output?: string } {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith("-"));
  const oIdx = args.indexOf("-o");
  return { input, output: oIdx !== -1 ? args[oIdx + 1] : undefined };
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv);
  if (!input) {
    console.error("Usage: npm run cli -- <exam.pdf> [-o output.pdf]");
    process.exit(1);
  }
  try {
    await access(input);
  } catch {
    console.error(`Input file not found: ${input}`);
    process.exit(1);
  }

  const base = path.basename(input, path.extname(input));
  const outDir = path.resolve("output");
  await mkdir(outDir, { recursive: true });
  const outPdf = output ?? path.join(outDir, `${base}.shuffled.pdf`);

  const exam = await runPipeline(input, outPdf, (stage, percent) =>
    console.log(`[${String(percent).padStart(3)}%] ${stage}`)
  );

  const debugJson = path.join(outDir, `${base}.data.json`);
  await writeFile(
    debugJson,
    JSON.stringify(
      {
        ...exam,
        questions: exam.questions.map((q) => ({
          ...q,
          stemImageDataUri: `<png ${q.stemImageDataUri.length}b>`,
          options: q.options.map((o) => ({ ...o, imageDataUri: `<png ${o.imageDataUri.length}b>` })),
        })),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Questions: ${exam.questions.length}`);
  console.log(`Output: ${outPdf}`);
  console.log(`Debug data: ${debugJson}`);
}

main().catch((err) => {
  console.error(`Pipeline failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
