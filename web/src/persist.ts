import type { TrackedJob } from "./components/JobRow";

const KEY = "examshuffle.jobs";

export function loadJobs(): TrackedJob[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const jobs = JSON.parse(raw) as TrackedJob[];
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

export function saveJobs(jobs: TrackedJob[]): void {
  try {
    if (jobs.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}
