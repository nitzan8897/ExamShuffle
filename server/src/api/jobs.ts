import { randomUUID } from "node:crypto";
import type { JobBackend } from "./jobStore.js";

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

let backend: JobBackend | undefined;

/**
 * Load persisted jobs into memory. Any job still "processing" was interrupted
 * by the restart (no worker survives an OOM/redeploy to resume it), so surface
 * it as an error instead of leaving clients polling forever.
 */
export async function initJobStore(store: JobBackend): Promise<void> {
  backend = store;
  const restored = await store.loadAll();
  for (const job of restored) {
    if (job.status === "processing") {
      job.status = "error";
      job.error = "השרת הופעל מחדש במהלך העיבוד — נסו להעלות את הקובץ שוב";
    }
    jobs.set(job.id, job);
  }
  pruneJobs();
}

/** Write-through the full job set; fire-and-forget so routes stay responsive. */
export function persistJobs(): void {
  if (!backend) return;
  backend.sync([...jobs.values()]).catch((err) => console.error("failed to persist jobs:", err));
}

export function saveOutput(id: string, data: Buffer): Promise<void> {
  return backend?.savePdf(id, data) ?? Promise.resolve();
}

export function loadOutput(id: string): Promise<Buffer | null> {
  return backend?.loadPdf(id) ?? Promise.resolve(null);
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
    }
  }
  if (changed) persistJobs();
}
