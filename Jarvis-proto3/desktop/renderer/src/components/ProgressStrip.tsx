import { formatDeterminateBar, formatIndeterminateBar } from "../../../shared/uiLogic";

interface ProgressStripProps {
  executing: boolean;
  percent: number;
  metric: string;
  scanFrame: number;
  activeTaskLabel: string;
}

export function ProgressStrip(props: ProgressStripProps) {
  const bar = props.executing ? formatDeterminateBar(props.percent, props.metric) : formatIndeterminateBar(props.scanFrame);
  return (
    <div className="progress-strip">
      <div>── TASK: {props.activeTaskLabel}</div>
      <div>{bar}</div>
    </div>
  );
}
