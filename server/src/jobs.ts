import { randomUUID } from "node:crypto";

export type JobStatus = "processing" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  stage: string;
  percent: number;
  error?: string;
  outputPath?: string;
  downloadName?: string;
  createdAt: number;
}

const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map<string, Job>();

export function createJob(): Job {
  const job: Job = {
    id: randomUUID(),
    status: "processing",
    stage: "מעלה את הקובץ...",
    percent: 5,
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
