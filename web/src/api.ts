export type JobStatus = "processing" | "done" | "error";

export interface JobState {
  status: JobStatus;
  stage: string;
  percent: number;
  warnings: string[];
  error?: string;
}

export interface JobRef {
  jobId: string;
  fileName: string;
}

export interface ShuffleSettings {
  model: string;
  apiKey: string;
  contextUrl: string;
  contextFile: File | null;
  openMode: "" | "convert" | "keep" | "remove";
}

export interface ServerConfig {
  hasKey: boolean;
  hasModel: boolean;
}

export async function fetchConfig(): Promise<ServerConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("שגיאת שרת");
  return (await res.json()) as ServerConfig;
}

export async function uploadExams(files: File[], settings: ShuffleSettings): Promise<JobRef[]> {
  const form = new FormData();
  for (const file of files) form.append("exams", file);
  if (settings.model) form.append("model", settings.model);
  if (settings.apiKey) form.append("apiKey", settings.apiKey);
  if (settings.contextUrl) form.append("contextUrl", settings.contextUrl);
  if (settings.contextFile) form.append("context", settings.contextFile);
  if (settings.openMode) form.append("openMode", settings.openMode);

  const res = await fetch("/api/shuffle", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "ההעלאה נכשלה");
  }
  const { jobs } = (await res.json()) as { jobs: JobRef[] };
  return jobs;
}

/** The server responded but no longer knows this job. */
export class JobNotFoundError extends Error {}

export async function fetchJob(jobId: string): Promise<JobState> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (res.status === 404) throw new JobNotFoundError("המשימה לא נמצאה");
  if (!res.ok) throw new Error("שגיאת שרת");
  return (await res.json()) as JobState;
}

export const downloadUrl = (jobId: string): string => `/api/jobs/${jobId}/download`;
