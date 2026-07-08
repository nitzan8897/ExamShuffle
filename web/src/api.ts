export type JobStatus = "processing" | "done" | "error";

export interface JobState {
  status: JobStatus;
  stage: string;
  percent: number;
  error?: string;
}

export async function uploadExam(file: File): Promise<string> {
  const form = new FormData();
  form.append("exam", file);
  const res = await fetch("/api/shuffle", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "ההעלאה נכשלה");
  }
  const { jobId } = (await res.json()) as { jobId: string };
  return jobId;
}

export async function fetchJob(jobId: string): Promise<JobState> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("המשימה לא נמצאה");
  return (await res.json()) as JobState;
}

export const downloadUrl = (jobId: string): string => `/api/jobs/${jobId}/download`;
