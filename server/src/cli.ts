import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "./exam/pipeline.js";
import type { OpenMode } from "./shared/types.js";

interface CliArgs {
  input?: string;
  output?: string;
  openMode?: OpenMode;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith("-"));
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const openModeRaw = valueOf("--open-mode");
  const openMode = ["convert", "keep", "remove"].includes(openModeRaw ?? "")
    ? (openModeRaw as OpenMode)
    : undefined;
  return { input, output: valueOf("-o"), openMode };
}

async function main(): Promise<void> {
  const { input, output, openMode } = parseArgs(process.argv);
  if (!input) {
    console.error("Usage: npm run cli -- <exam.pdf> [-o output.pdf] [--open-mode convert|keep|remove]");
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

  const exam = await runPipeline(input, outPdf, { openMode }, (stage, percent) =>
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
          options: q.options.map((o) => ({
            ...o,
            content:
              o.content.type === "image"
                ? { ...o.content, dataUri: `<png ${o.content.dataUri.length}b>` }
                : o.content,
          })),
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
