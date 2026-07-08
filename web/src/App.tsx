import { useEffect, useRef, useState } from "react";
import { downloadUrl, fetchJob, uploadExams, type ShuffleSettings } from "./api";
import { FileDrop } from "./components/FileDrop";
import { JobRow, type TrackedJob } from "./components/JobRow";
import { SettingsPanel } from "./components/SettingsPanel";

const POLL_MS = 800;

const DEFAULT_SETTINGS: ShuffleSettings = {
  model: "",
  apiKey: "",
  contextUrl: "",
  contextFile: null,
  openMode: "",
};

export function App() {
  const [settings, setSettings] = useState<ShuffleSettings>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const downloaded = useRef(new Set<string>());

  const busy = uploading || jobs.some((j) => j.state.status === "processing");
  const allSettled = jobs.length > 0 && !busy;

  const startDownload = (jobId: string) => {
    const link = document.createElement("a");
    link.href = downloadUrl(jobId);
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  useEffect(() => {
    if (!jobs.some((j) => j.state.status === "processing")) return;
    const timer = setInterval(async () => {
      const updates = await Promise.all(
        jobs.map(async (job) => {
          if (job.state.status !== "processing") return job;
          try {
            const state = await fetchJob(job.jobId);
            if (state.status === "done" && !downloaded.current.has(job.jobId)) {
              downloaded.current.add(job.jobId);
              startDownload(job.jobId);
            }
            return { ...job, state };
          } catch {
            return {
              ...job,
              state: { ...job.state, status: "error" as const, error: "המשימה אבדה בשרת" },
            };
          }
        })
      );
      setJobs(updates);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobs]);

  const onFiles = async (files: File[]) => {
    setUploadError("");
    setUploading(true);
    try {
      const refs = await uploadExams(files, settings);
      setJobs(
        refs.map((ref) => ({
          ...ref,
          state: { status: "processing" as const, stage: "ממתין בתור...", percent: 3, warnings: [] },
        }))
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setJobs([]);
    setUploadError("");
    downloaded.current.clear();
  };

  return (
    <div className="page">
      <main className="card">
        <header className="app-header">
          <img className="logo" src="/ExamShuffle.png" alt="ExamShuffle" />
          <h1 className="title">ExamShuffle</h1>
        </header>
        <p className="subtitle">
          מעלים מבחן אמריקאי (טופס 0), מקבלים גרסה עם תשובות מעורבלות, מפתח תשובות והסברים — מוכן
          ל-iPad
        </p>

        {jobs.length === 0 && (
          <>
            <SettingsPanel settings={settings} onChange={setSettings} disabled={busy} />
            <FileDrop disabled={busy} onFiles={onFiles} />
            {uploading && <div className="job-stage center">מעלה קבצים...</div>}
            {uploadError && <div className="error-text">{uploadError}</div>}
          </>
        )}

        {jobs.length > 0 && (
          <div className="jobs">
            {jobs.map((job) => (
              <JobRow key={job.jobId} job={job} />
            ))}
            {allSettled && (
              <button className="button ghost" onClick={reset}>
                עיבוד מבחנים נוספים
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="credits">
        נוצר על ידי <strong>ניצן אברג'יל</strong> · פותח יחד עם <strong>קלוד קוד המלך 👑</strong>
      </footer>
    </div>
  );
}
