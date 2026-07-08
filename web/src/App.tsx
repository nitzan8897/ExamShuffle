import { useCallback, useEffect, useRef, useState } from "react";
import { downloadUrl, fetchJob, uploadExam, type JobState } from "./api";
import { FileDrop } from "./components/FileDrop";
import { ProgressBar } from "./components/ProgressBar";

type Phase = "idle" | "working" | "done" | "error";

const POLL_MS = 800;

export function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const autoDownloaded = useRef(false);

  const startDownload = useCallback((id: string) => {
    const link = document.createElement("a");
    link.href = downloadUrl(id);
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  useEffect(() => {
    if (phase !== "working" || !jobId) return;
    const timer = setInterval(async () => {
      try {
        const state = await fetchJob(jobId);
        setJob(state);
        if (state.status === "done") {
          setPhase("done");
          if (!autoDownloaded.current) {
            autoDownloaded.current = true;
            startDownload(jobId);
          }
        } else if (state.status === "error") {
          setError(state.error ?? "אירעה שגיאה בעיבוד המבחן");
          setPhase("error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "אירעה שגיאה");
        setPhase("error");
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, jobId, startDownload]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setError("");
    setJob({ status: "processing", stage: "מעלה את הקובץ...", percent: 5 });
    setPhase("working");
    autoDownloaded.current = false;
    try {
      setJobId(await uploadExam(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה");
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setJobId(null);
    setJob(null);
    setError("");
    setFileName("");
  };

  return (
    <div className="page">
      <main className="card">
        <h1 className="title">ExamShuffle</h1>
        <p className="subtitle">
          מעלים מבחן אמריקאי (טופס 0), מקבלים גרסה עם תשובות מעורבלות, מפתח
          תשובות והסברים — מוכן ל-iPad
        </p>

        {phase === "idle" && <FileDrop disabled={false} onFile={onFile} />}

        {phase === "working" && job && (
          <div className="status-block">
            <div className="file-name">{fileName}</div>
            <ProgressBar percent={job.percent} stage={job.stage} />
          </div>
        )}

        {phase === "done" && jobId && (
          <div className="status-block">
            <div className="done-check">✓</div>
            <div className="done-text">
              המבחן המעורבל מוכן! ההורדה החלה אוטומטית.
            </div>
            <button
              className="button primary"
              onClick={() => startDownload(jobId)}
            >
              הורדת המבחן המעורבל
            </button>
            <button className="button ghost" onClick={reset}>
              עיבוד מבחן נוסף
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="status-block">
            <div className="error-text">{error}</div>
            <button className="button primary" onClick={reset}>
              ניסיון נוסף
            </button>
          </div>
        )}
      </main>

      <footer className="credits">
        נוצר על ידי{" "}
        <strong
          style={{ cursor: "pointer" }}
          onClick={() => window.open("https://github.com/nitzan8897", "_blank")}
        >
          ניצן אברג'יל
        </strong>{" "}
        · פותח יחד עם <strong>קלוד קוד המלך 👑</strong>
      </footer>
    </div>
  );
}
