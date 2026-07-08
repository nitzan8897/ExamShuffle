import { downloadUrl, type JobState } from "../api";

export interface TrackedJob {
  jobId: string;
  fileName: string;
  state: JobState;
}

interface Props {
  job: TrackedJob;
}

export function JobRow({ job }: Props) {
  const { state } = job;
  return (
    <div className="job-row">
      <div className="job-head">
        <span className="job-name">{job.fileName}</span>
        {state.status === "done" && (
          <a className="button primary small" href={downloadUrl(job.jobId)} download>
            הורדה
          </a>
        )}
        {state.status === "processing" && <span className="job-percent">{state.percent}%</span>}
        {state.status === "error" && <span className="job-error-badge">שגיאה</span>}
      </div>

      {state.status === "processing" && (
        <>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${state.percent}%` }} />
          </div>
          <div className="job-stage">{state.stage}</div>
        </>
      )}

      {state.status === "error" && <div className="error-text small">{state.error}</div>}

      {state.warnings.map((w) => (
        <div key={w} className="warning-text">
          {w}
        </div>
      ))}
    </div>
  );
}
