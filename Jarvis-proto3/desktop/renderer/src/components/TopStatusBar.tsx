interface TopStatusBarProps {
  agentOnline: boolean;
  networkOk: boolean;
  modelLabel: string;
  hostLabel: string;
  recording: boolean;
  onToggleRail: () => void;
  onToggleCrt: () => void;
}

export function TopStatusBar(props: TopStatusBarProps) {
  return (
    <div className="top-bar">
      <div className="status-row">
        <span className={`chip ${props.agentOnline ? "ok" : "fail"}`}>AGENT: {props.agentOnline ? "ONLINE" : "OFFLINE"}</span>
        <span className="chip">host:{props.hostLabel}</span>
        <span className="chip">model:{props.modelLabel}</span>
        <span className={`chip ${props.networkOk ? "ok" : "warn"}`}>NET {props.networkOk ? "OK" : "WARN"}</span>
      </div>
      <div className="status-row">
        <span className={`chip ${props.recording ? "warn" : ""}`}>{props.recording ? "REC" : "IDLE"}</span>
        <button className="btn" onClick={props.onToggleCrt}>
          CRT
        </button>
        <button className="btn" onClick={props.onToggleRail}>
          RAIL
        </button>
      </div>
    </div>
  );
}
