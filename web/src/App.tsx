import { useEffect, useRef, useState } from "react";
import {
  downloadUrl,
  fetchConfig,
  fetchJob,
  JobNotFoundError,
  uploadExams,
  type ServerConfig,
  type ShuffleSettings,
} from "./api";
import { FileDrop } from "./components/FileDrop";
import { JobRow, type TrackedJob } from "./components/JobRow";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toast } from "./components/Toast";
import { loadJobs, saveJobs } from "./persist";

const POLL_MS = 800;
// A restarting server answers polls with 502s for a while — keep the job
// alive through ~40s of failed polls and only give up after that (or on a
// definitive 404).
const MAX_POLL_MISSES = 50;

const DEFAULT_SETTINGS: ShuffleSettings = {
  model: "",
  apiKey: "",
  contextUrl: "",
  contextFile: null,
  openMode: "",
};

export function App() {
  const [settings, setSettings] = useState<ShuffleSettings>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<TrackedJob[]>(() => loadJobs());
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const downloaded = useRef(new Set<string>(loadJobs().filter((j) => j.state.status === "done").map((j) => j.jobId)));
  const pollMisses = useRef(new Map<string, number>());

  const busy = uploading || jobs.some((j) => j.state.status === "processing");
  const allSettled = jobs.length > 0 && !busy;

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => setConfig({ hasKey: false, hasModel: false }));
  }, []);

  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

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
            pollMisses.current.delete(job.jobId);
            if (state.status === "done" && !downloaded.current.has(job.jobId)) {
              downloaded.current.add(job.jobId);
              startDownload(job.jobId);
            }
            return { ...job, state };
          } catch (err) {
            if (!(err instanceof JobNotFoundError)) {
              const misses = (pollMisses.current.get(job.jobId) ?? 0) + 1;
              pollMisses.current.set(job.jobId, misses);
              if (misses < MAX_POLL_MISSES) return job;
            }
            return {
              ...job,
              state: {
                ...job.state,
                status: "error" as const,
                error:
                  err instanceof JobNotFoundError
                    ? "המשימה אבדה בשרת (ייתכן שפג תוקפה)"
                    : "החיבור לשרת אבד — נסו להעלות את הקובץ שוב",
              },
            };
          }
        })
      );
      setJobs(updates);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobs]);

  const missingConfig = (): boolean => {
    const hasKey = Boolean(settings.apiKey.trim()) || Boolean(config?.hasKey);
    const hasModel = Boolean(settings.model.trim()) || Boolean(config?.hasModel);
    return !hasKey || !hasModel;
  };

  const onFiles = async (files: File[]) => {
    if (missingConfig()) {
      setToast("יש למלא מפתח ומודל Gemini בהגדרות המתקדמות");
      return;
    }
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
      setToast(err instanceof Error ? err.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setJobs([]);
    downloaded.current.clear();
    saveJobs([]);
  };

  return (
    <div className="page">
      <header className="brand">
        <img className="brand-logo" src="/assets/ExamShuffle.png" alt="ExamShuffle" />
      </header>

      <main className="card">
        <h1 className="title">ExamShuffle</h1>
        <p className="subtitle">
          מעלים מבחן אמריקאי (טופס 0), מקבלים גרסה עם תשובות מעורבלות, מפתח תשובות והסברים — מוכן
          ל-iPad
        </p>

        {jobs.length === 0 && (
          <>
            <SettingsPanel settings={settings} onChange={setSettings} disabled={busy} />
            <FileDrop disabled={busy} onFiles={onFiles} />
            {uploading && <div className="job-stage center">מעלה קבצים...</div>}
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

      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
