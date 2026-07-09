import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";

export type JobStatus = "processing" | "done" | "error";

export interface Job {
  id: string;
  fileName: string;
  status: JobStatus;
  stage: string;
  percent: number;
  warnings: string[];
  error?: string;
  outputPath?: string;
  downloadName?: string;
  createdAt: number;
}

const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map<string, Job>();

let storePath: string | undefined;

/**
 * Jobs live in memory; the store file only makes a process restart
 * (crash/redeploy) survivable: restored "processing" jobs are marked as
 * errors so polling clients get a real message instead of a 404.
 */
export function initJobStore(filePath: string): void {
  storePath = filePath;
  try {
    const restored = JSON.parse(readFileSync(filePath, "utf8")) as Job[];
    for (const job of restored) {
      if (job.status === "processing") {
        job.status = "error";
        job.error = "השרת הופעל מחדש במהלך העיבוד — נסו להעלות את הקובץ שוב";
      }
      jobs.set(job.id, job);
    }
  } catch {
    // No store yet or unreadable — start empty.
  }
  pruneJobs();
}

export function persistJobs(): void {
  if (!storePath) return;
  try {
    writeFileSync(storePath, JSON.stringify([...jobs.values()]));
  } catch (err) {
    console.error("failed to persist jobs:", err);
  }
}

export function createJob(fileName: string): Job {
  const job: Job = {
    id: randomUUID(),
    fileName,
    status: "processing",
    stage: "ממתין בתור...",
    percent: 3,
    warnings: [],
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  persistJobs();
  return job;
}

export const getJob = (id: string): Job | undefined => jobs.get(id);

export function pruneJobs(): void {
  const now = Date.now();
  let changed = false;
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
      changed = true;
      if (job.outputPath) void unlink(job.outputPath).catch(() => {});
    }
  }
  if (changed) persistJobs();
}
