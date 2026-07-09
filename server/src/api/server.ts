import { existsSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { runPipeline } from "../exam/pipeline.js";
import type { OpenMode, PipelineOptions } from "../shared/types.js";
import {
  createJob,
  getJob,
  initJobStore,
  loadOutput,
  persistJobs,
  pruneJobs,
  saveOutput,
  type Job,
} from "./jobs.js";
import { createBackend, FileBackend } from "./jobStore.js";

// Surface fatal errors in the host's logs (Railway) instead of dying silently.
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  process.exit(1);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(here, "../../uploads");
const outputDir = path.resolve(here, "../../output");
const webDist = path.resolve(here, "../../../web/dist");

await mkdir(uploadsDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const outputPathFor = (id: string): string => path.join(outputDir, `${id}.pdf`);
const fileBackend = new FileBackend(path.join(outputDir, "jobs.json"), outputPathFor);
const backend = await createBackend(fileBackend, {
  uri: process.env.MONGODB_URI,
  dbName: process.env.MONGODB_DB,
});
await initJobStore(backend);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024, files: 12 },
});

const app = express();

const decodeName = (raw: string): string => Buffer.from(raw, "latin1").toString("utf8");

const OPEN_MODES: readonly OpenMode[] = ["convert", "keep", "remove"];

app.get("/api/config", (_req, res) => {
  res.json({
    hasKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    hasModel: Boolean(process.env.GEMINI_MODEL?.trim()),
  });
});

let queue: Promise<unknown> = Promise.resolve();
const enqueue = (task: () => Promise<void>): void => {
  queue = queue.then(task, task);
};

interface ContextResult {
  text?: string;
  pdf?: Buffer;
  warning?: string;
}

async function loadContext(url: string, file?: Express.Multer.File): Promise<ContextResult> {
  if (file) {
    const buffer = await readFile(file.path);
    await unlink(file.path).catch(() => {});
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      return { pdf: buffer };
    }
    return { text: buffer.toString("utf8") };
  }

  if (!url) return {};
  if (/notebooklm\.google\.com/i.test(url)) {
    return {
      warning:
        "קישורי NotebookLM דורשים התחברות ואינם נגישים לשרת — ייצאו את הסיכום מהמחברת והעלו אותו כקובץ.",
    };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("pdf")) return { pdf: Buffer.from(await res.arrayBuffer()) };
    const html = await res.text();
    const text = html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text ? { text } : { warning: "לא נמצא תוכן טקסטואלי בקישור חומר העזר." };
  } catch {
    return { warning: "טעינת קישור חומר העזר נכשלה — ממשיכים בלעדיו." };
  }
}

app.post(
  "/api/shuffle",
  upload.fields([
    { name: "exams", maxCount: 10 },
    { name: "context", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const exams = (files?.exams ?? []).filter(
      (f) => f.mimetype === "application/pdf" || f.originalname.toLowerCase().endsWith(".pdf")
    );
    if (exams.length === 0) {
      res.status(400).json({ error: "נדרש לפחות קובץ PDF אחד" });
      return;
    }

    pruneJobs();

    const body = req.body as Record<string, string | undefined>;
    const openModeRaw = body.openMode ?? "";
    const context = await loadContext(body.contextUrl?.trim() ?? "", files?.context?.[0]);

    const options: PipelineOptions = {
      apiKey: body.apiKey?.trim() || undefined,
      model: body.model?.trim() || undefined,
      contextText: context.text,
      contextPdf: context.pdf,
      openMode: OPEN_MODES.includes(openModeRaw as OpenMode) ? (openModeRaw as OpenMode) : undefined,
    };

    const jobs: Job[] = exams.map((file) => {
      const fileName = decodeName(file.originalname);
      const job = createJob(fileName);
      if (context.warning) job.warnings.push(context.warning);
      const baseName = path.basename(fileName, path.extname(fileName)).trim() || "exam";
      const outputPath = outputPathFor(job.id);

      enqueue(async () => {
        try {
          await runPipeline(file.path, outputPath, options, (stage, percent) => {
            job.stage = stage;
            job.percent = percent;
          });
          // Push the PDF to the durable store so it survives a restart/redeploy
          // that wipes the ephemeral disk. A store hiccup must not fail the job.
          await saveOutput(job.id, await readFile(outputPath)).catch((err) =>
            console.error(`job ${job.id}: failed to persist output pdf:`, err)
          );
          job.status = "done";
          job.outputPath = outputPath;
          job.downloadName = `${baseName}.shuffled.pdf`;
        } catch (err) {
          console.error(`job ${job.id} (${job.fileName}) failed:`, err);
          job.status = "error";
          job.error = err instanceof Error ? err.message : String(err);
        } finally {
          persistJobs();
          await unlink(file.path).catch(() => {});
        }
      });
      return job;
    });

    res.json({ jobs: jobs.map((j) => ({ jobId: j.id, fileName: j.fileName })) });
  }
);

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "משימה לא נמצאה" });
    return;
  }
  res.json({
    status: job.status,
    stage: job.stage,
    percent: job.percent,
    warnings: job.warnings,
    error: job.error,
  });
});

app.get("/api/jobs/:id/download", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== "done") {
    res.status(404).json({ error: "הקובץ אינו זמין" });
    return;
  }
  const downloadName = job.downloadName ?? "exam.shuffled.pdf";

  // Serve the local file when present; after a restart the ephemeral disk is
  // gone, so fall back to the durable store.
  if (job.outputPath && existsSync(job.outputPath)) {
    res.download(job.outputPath, downloadName);
    return;
  }
  const pdf = await loadOutput(job.id);
  if (!pdf) {
    res.status(404).json({ error: "הקובץ אינו זמין" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
  res.send(pdf);
});

if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "לא נמצא" });
      return;
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`ExamShuffle server: http://localhost:${port}`));
