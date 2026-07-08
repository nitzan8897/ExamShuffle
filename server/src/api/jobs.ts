import { randomUUID } from "node:crypto";

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
  return job;
}

export const getJob = (id: string): Job | undefined => jobs.get(id);

export function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}
