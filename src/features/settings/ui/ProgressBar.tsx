interface ProgressBarProps {
  value: number;
  label?: string;
}

export default function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="cipher-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      {label && <span className="cipher-progress-label">{label}</span>}
      <div className="cipher-progress-track">
        <div className="cipher-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
