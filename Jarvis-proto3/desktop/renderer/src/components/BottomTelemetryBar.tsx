import { ResourceStats } from "../../../shared/types";

interface BottomTelemetryBarProps {
  cwd: string;
  mode: "SAFE" | "CAUTION" | "DANGER";
  queueCount: number;
  stats: ResourceStats;
}

export function BottomTelemetryBar(props: BottomTelemetryBarProps) {
  return (
    <div className="bottom-bar">
      <span>cwd:{props.cwd}</span>
      <span>
        mode:
        <strong className={props.mode === "SAFE" ? "risk-safe" : props.mode === "CAUTION" ? "risk-caution" : "risk-danger"}>
          {props.mode}
        </strong>
      </span>
      <span>queue:{props.queueCount}</span>
      <span>cpu:{props.stats.cpu.toFixed(1)}%</span>
      <span>ram:{props.stats.ram.toFixed(1)}%</span>
      <span>
        net:↓{props.stats.netDown.toFixed(1)} ↑{props.stats.netUp.toFixed(1)}
      </span>
    </div>
  );
}
