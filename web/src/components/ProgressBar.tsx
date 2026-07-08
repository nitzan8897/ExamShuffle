interface Props {
  percent: number;
  stage: string;
}

export function ProgressBar({ percent, stage }: Props) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-stage">
        <span>{stage}</span>
        <span className="progress-percent">{percent}%</span>
      </div>
    </div>
  );
}
