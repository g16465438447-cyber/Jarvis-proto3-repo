import { useEffect, useMemo, useState } from "react";
import { BootScreen } from "./components/BootScreen";
import { BottomTelemetryBar } from "./components/BottomTelemetryBar";
import { ProgressStrip } from "./components/ProgressStrip";
import { TopStatusBar } from "./components/TopStatusBar";
import {
  Plan,
  ResourceStats,
  RightRailTab,
  RunLog,
  StreamEvent,
  TriggerProfile,
  TriggerRuntimeInfo,
  UiPreferences
} from "../../shared/types";
import { deriveRiskMeter, estimateProgress, mapStreamEventToConsoleEntries } from "../../shared/uiLogic";

const DEFAULT_PREFS: UiPreferences = {
  rightRailWidth: 420,
  rightRailCollapsed: false,
  activeTab: "plan",
  crtEnabled: false,
  consoleFontSize: 14
};

const DEFAULT_STATS: ResourceStats = { cpu: 0, ram: 0, netDown: 0, netUp: 0 };

export default function App() {
  const [booted, setBooted] = useState(false);
  const [request, setRequest] = useState("list .tmp");
  const [plan, setPlan] = useState<Plan | undefined>();
  const [runLog, setRunLog] = useState<RunLog | undefined>();
  const [streamLines, setStreamLines] = useState<string[]>(["SYSTEM: Operator console ready."]);
  const [running, setRunning] = useState(false);
  const [prefs, setPrefs] = useState<UiPreferences>(DEFAULT_PREFS);
  const [stats, setStats] = useState<ResourceStats>(DEFAULT_STATS);
  const [profiles, setProfiles] = useState<TriggerProfile[]>([]);
  const [runningTriggers, setRunningTriggers] = useState<Record<string, TriggerRuntimeInfo>>({});

  const mode = useMemo(() => deriveRiskMeter(plan), [plan]);
  const progress = useMemo(() => {
    const statuses: Record<string, string> = {};
    for (const event of runLog?.events ?? []) {
      statuses[event.action_id] = event.status;
    }
    return estimateProgress(plan, statuses);
  }, [plan, runLog]);

  async function savePrefs(next: Partial<UiPreferences>): Promise<void> {
    const merged = await window.ui.setPreferences(next);
    setPrefs(merged);
  }

  async function refreshTriggerState(): Promise<void> {
    const [allProfiles, active] = await Promise.all([window.trigger.listProfiles(), window.trigger.listRunning()]);
    const map: Record<string, TriggerRuntimeInfo> = {};
    for (const item of active) {
      map[item.profileId] = item;
    }
    setProfiles(allProfiles);
    setRunningTriggers(map);
  }

  async function runPreview(): Promise<void> {
    if (!request.trim()) {
      return;
    }
    const payload = (await window.pilot.preview(request.trim())) as { plan?: Plan; runLog?: RunLog };
    if (payload.plan) {
      setPlan(payload.plan);
    }
    if (payload.runLog) {
      setRunLog(payload.runLog);
    }
    setStreamLines((prev) => [...prev, `PREVIEW: ${request.trim()}`]);
  }

  async function runExecute(): Promise<void> {
    if (!request.trim() || running) {
      return;
    }
    setRunning(true);
    const sessionId = crypto.randomUUID();
    await window.pilot.execute({ request: request.trim(), sessionId, approveHighRisk: true });
    setStreamLines((prev) => [...prev, `EXECUTE: ${request.trim()}`]);
  }

  useEffect(() => {
    void window.ui.getPreferences().then(setPrefs).catch(() => undefined);
    void refreshTriggerState();

    const stopPilot = window.pilot.onEvent((event: StreamEvent) => {
      const entries = mapStreamEventToConsoleEntries(event).map((entry) => `${entry.type}: ${entry.text}`);
      setStreamLines((prev) => [...prev, ...entries]);

      if (event.kind === "plan_ready") {
        setPlan(event.payload.plan);
      }
      if (event.kind === "run_complete") {
        setRunLog(event.payload.runlog);
        setRunning(false);
      }
      if (event.kind === "run_error") {
        setRunning(false);
      }
    });

    const stopTrigger = window.trigger.onEvent((event) => {
      const detail = event.kind === "line" ? event.line : event.message;
      setStreamLines((prev) => [...prev, `TRIGGER ${event.profileId}: ${detail}`]);
      void refreshTriggerState();
    });

    const timer = setInterval(() => {
      void window.ui.getResourceStats().then(setStats).catch(() => undefined);
    }, 1500);

    const onKey = (ev: KeyboardEvent) => {
      if (!booted) {
        setBooted(true);
        return;
      }
      if (ev.ctrlKey && ev.key === "`") {
        ev.preventDefault();
        void savePrefs({ rightRailCollapsed: !prefs.rightRailCollapsed });
      } else if (ev.ctrlKey && ev.shiftKey && ev.key === "Enter") {
        ev.preventDefault();
        void runPreview();
      } else if (ev.ctrlKey && ev.key === "Enter") {
        ev.preventDefault();
        void runExecute();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      stopPilot();
      stopTrigger();
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [booted, prefs.rightRailCollapsed]);

  if (!booted) {
    return <div onClick={() => setBooted(true)}><BootScreen /></div>;
  }

  return (
    <div className="v2-root" style={{ ["--drawer-width" as string]: `${prefs.rightRailWidth}px` }}>
      <TopStatusBar
        agentOnline={true}
        networkOk={true}
        modelLabel="local"
        hostLabel="desktop"
        recording={running}
        onToggleRail={() => void savePrefs({ rightRailCollapsed: !prefs.rightRailCollapsed })}
        onToggleCrt={() => void savePrefs({ crtEnabled: !prefs.crtEnabled })}
      />

      <main className="surface">
        <div className="console-shell">
          <ProgressStrip
            executing={running}
            percent={progress.percent}
            metric={progress.metric}
            scanFrame={Math.floor(Date.now() / 300)}
            activeTaskLabel={running ? "Executing request" : "Idle"}
          />

          <div className={`console-stream${prefs.crtEnabled ? " crt" : ""}`} style={{ fontSize: `${prefs.consoleFontSize}px` }}>
            {streamLines.slice(-300).map((line, index) => (
              <div key={`${index}-${line}`} className="console-line system">
                {line}
              </div>
            ))}
          </div>

          <div className="command-bar">
            <span className="command-prompt">pilot&gt;</span>
            <input className="command-input" value={request} onChange={(event) => setRequest(event.target.value)} />
            <button className="header-btn" onClick={() => void runPreview()}>Preview</button>
            <button className="run-btn" onClick={() => void runExecute()} disabled={running}>Run</button>
          </div>
        </div>

        <aside className={`details-drawer${prefs.rightRailCollapsed ? "" : " open"}`}>
          <div className="drawer-tabs">
            {(["chat", "plan", "actions", "logs", "triggers"] as RightRailTab[]).map((tab) => (
              <button
                key={tab}
                className={prefs.activeTab === tab ? "active" : ""}
                onClick={() => void savePrefs({ activeTab: tab, rightRailCollapsed: false })}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="drawer-content">
            {prefs.activeTab === "plan" && <pre className="json-block">{plan ? JSON.stringify(plan, null, 2) : "No plan yet"}</pre>}
            {prefs.activeTab === "actions" && (
              <div className="drawer-section">
                {(plan?.actions ?? []).map((action) => (
                  <div key={action.action_id} className="list-row">
                    <div className="row-title">{action.action_id}</div>
                    <div className="row-sub">{action.type}</div>
                  </div>
                ))}
              </div>
            )}
            {prefs.activeTab === "logs" && <pre className="json-block">{runLog ? JSON.stringify(runLog, null, 2) : "No run log yet"}</pre>}
            {prefs.activeTab === "triggers" && (
              <div className="drawer-section">
                <button className="secondary-btn" onClick={() => void refreshTriggerState()}>Refresh Triggers</button>
                {profiles.map((profile) => {
                  const active = runningTriggers[profile.id];
                  return (
                    <div key={profile.id} className="list-row">
                      <div className="row-title">{profile.name}</div>
                      <div className="row-sub">{profile.mode} · {active?.status ?? "stopped"}</div>
                      <div className="action-row">
                        <button className="secondary-btn" onClick={() => void window.trigger.start(profile.id).then(refreshTriggerState)}>Start</button>
                        <button className="secondary-btn" onClick={() => void window.trigger.stop(profile.id).then(refreshTriggerState)}>Stop</button>
                      </div>
                    </div>
                  );
                })}
                {!profiles.length && <div className="muted">No trigger profiles saved yet.</div>}
              </div>
            )}
            {prefs.activeTab === "chat" && <div className="muted">Use the command bar to issue a request.</div>}
          </div>
        </aside>
      </main>

      <BottomTelemetryBar cwd="." mode={mode} queueCount={running ? 1 : 0} stats={stats} />
    </div>
  );
}
