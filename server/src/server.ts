import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { createJob, getJob, pruneJobs } from "./jobs.js";
import { runPipeline } from "./pipeline.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(here, "../uploads");
const outputDir = path.resolve(here, "../output");
const webDist = path.resolve(here, "../../web/dist");

await mkdir(uploadsDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

const app = express();

app.post("/api/shuffle", upload.single("exam"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "נדרש קובץ PDF" });
    return;
  }

  pruneJobs();
  const job = createJob();
  const inputPath = req.file.path;
  const baseName = path
    .basename(Buffer.from(req.file.originalname, "latin1").toString("utf8"), ".pdf")
    .trim() || "exam";
  const outputPath = path.join(outputDir, `${job.id}.pdf`);

  void (async () => {
    try {
      await runPipeline(inputPath, outputPath, (stage, percent) => {
        job.stage = stage;
        job.percent = percent;
      });
      job.status = "done";
      job.outputPath = outputPath;
      job.downloadName = `${baseName}.shuffled.pdf`;
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      await unlink(inputPath).catch(() => {});
    }
  })();

  res.json({ jobId: job.id });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "משימה לא נמצאה" });
    return;
  }
  res.json({ status: job.status, stage: job.stage, percent: job.percent, error: job.error });
});

app.get("/api/jobs/:id/download", (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== "done" || !job.outputPath) {
    res.status(404).json({ error: "הקובץ אינו זמין" });
    return;
  }
  res.download(job.outputPath, job.downloadName ?? "exam.shuffled.pdf");
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
