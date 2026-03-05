import { useEffect, useMemo, useState } from "react";
import {
  ConsoleEntry,
  Plan,
  ResourceStats,
  RightRailTab,
  RunLog,
  StreamEvent,
  TriggerInstallTaskOptions,
  TriggerProfile,
  TriggerRuntimeEvent,
  TriggerRuntimeInfo,
  UiPreferences
} from "../../shared/types";
import { deriveRiskMeter, mapStreamEventToConsoleEntries } from "../../shared/uiLogic";

const DEFAULT_PREFS: UiPreferences = {
  rightRailWidth: 420,
  rightRailCollapsed: false,
  activeTab: "plan",
  crtEnabled: false,
  consoleFontSize: 14
};

const DEFAULT_STATS: ResourceStats = { cpu: 0, ram: 0, netDown: 0, netUp: 0 };

function nowIso(): string {
  return new Date().toISOString();
}

function addLine(text: string, type: ConsoleEntry["type"] = "AGENT"): ConsoleEntry {
  return {
    id: `${Date.now()}-${Math.random()}`,
    ts: nowIso(),
    type,
    text
  };
}

export default function App() {
  const [request, setRequest] = useState("");
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [runLog, setRunLog] = useState<RunLog | undefined>(undefined);
  const [consoleLines, setConsoleLines] = useState<ConsoleEntry[]>([addLine("System Pilot ready.")]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<ResourceStats>(DEFAULT_STATS);
  const [prefs, setPrefs] = useState<UiPreferences>(DEFAULT_PREFS);
  const [triggers, setTriggers] = useState<TriggerProfile[]>([]);
  const [runningTriggers, setRunningTriggers] = useState<Record<string, TriggerRuntimeInfo>>({});
  const [triggerLog, setTriggerLog] = useState<string[]>([]);
  const [triggerName, setTriggerName] = useState("New Trigger");
  const [triggerMode, setTriggerMode] = useState<"interval" | "watch">("interval");
  const [triggerPath, setTriggerPath] = useState(".tmp");
  const [intervalMs, setIntervalMs] = useState(60000);
  const [debounceMs, setDebounceMs] = useState(800);
  const [maxRuns, setMaxRuns] = useState(0);
  const [taskName, setTaskName] = useState("SystemPilotDaily");

  const mode = useMemo(() => deriveRiskMeter(plan), [plan]);

  async function persistPreferences(next: Partial<UiPreferences>): Promise<void> {
    const merged = await window.ui.setPreferences(next);
    setPrefs(merged);
  }

  async function runPreview(): Promise<void> {
    const trimmed = request.trim();
    if (!trimmed) {
      return;
    }
    setConsoleLines((prev) => [...prev, addLine(`> preview ${trimmed}`, "USER")]);
    try {
      const payload = (await window.pilot.preview(trimmed)) as { plan?: Plan; runLog?: RunLog };
      if (payload.plan) {
        setPlan(payload.plan);
        setRunId(payload.plan.run_id);
      }
      if (payload.runLog) {
        setRunLog(payload.runLog);
      }
      setConsoleLines((prev) => [...prev, addLine("Preview complete.", "RESULT")]);
    } catch (error) {
      setConsoleLines((prev) => [...prev, addLine(`Preview failed: ${String(error)}`, "ERROR")]);
    }
  }

  async function runExecute(): Promise<void> {
    const trimmed = request.trim();
    if (!trimmed || running) {
      return;
    }
    setRunning(true);
    const sessionId = crypto.randomUUID();
    setConsoleLines((prev) => [...prev, addLine(`> execute ${trimmed}`, "USER")]);
    try {
      await window.pilot.execute({
        request: trimmed,
        sessionId,
        approveHighRisk: true
      });
    } catch (error) {
      setRunning(false);
      setConsoleLines((prev) => [...prev, addLine(`Execute failed to start: ${String(error)}`, "ERROR")]);
    }
  }

  function onStreamEvent(event: StreamEvent): void {
    setConsoleLines((prev) => [...prev, ...mapStreamEventToConsoleEntries(event)]);
    if (event.kind === "plan_ready") {
      setPlan(event.payload.plan);
      setRunId(event.run_id);
      return;
    }
    if (event.kind === "run_complete") {
      setRunLog(event.payload.runlog);
      setRunning(false);
      return;
    }
    if (event.kind === "run_error") {
      setRunning(false);
    }
  }

  async function refreshTriggers(): Promise<void> {
    const [profiles, active] = await Promise.all([window.trigger.listProfiles(), window.trigger.listRunning()]);
    const activeMap: Record<string, TriggerRuntimeInfo> = {};
    for (const item of active) {
      activeMap[item.profileId] = item;
    }
    setTriggers(profiles);
    setRunningTriggers(activeMap);
  }

  async function saveTrigger(): Promise<void> {
    const base = {
      id: crypto.randomUUID(),
      name: triggerName,
      request: request.trim() || "list .tmp",
      execute: true,
      maxRuns
    };

    const profile: TriggerProfile =
      triggerMode === "interval"
        ? {
            ...base,
            mode: "interval",
            intervalMs
          }
        : {
            ...base,
            mode: "watch",
            watchPath: triggerPath,
            debounceMs,
            recursiveWatch: true
          };

    await window.trigger.saveProfile(profile);
    await refreshTriggers();
    setConsoleLines((prev) => [...prev, addLine(`Saved trigger profile: ${profile.name}`, "TASK")]);
  }

  async function installTask(): Promise<void> {
    const options: TriggerInstallTaskOptions = {
      taskName,
      request: request.trim() || "list .tmp",
      execute: true,
      schedule: "DAILY",
      modifier: 1,
      startTime: "09:00",
      days: [],
      force: true,
      dryRun: true
    };
    const result = await window.trigger.installTask(options);
    setConsoleLines((prev) => [...prev, addLine(`Task install: ${result.ok ? "ok" : "failed"}`, result.ok ? "RESULT" : "ERROR")]);
    if (result.stdout) {
      setConsoleLines((prev) => [...prev, addLine(result.stdout, "TASK")]);
    }
    if (result.stderr) {
      setConsoleLines((prev) => [...prev, addLine(result.stderr, "WARNING")]);
    }
  }

  useEffect(() => {
    void window.ui.getPreferences().then(setPrefs).catch(() => undefined);
    void refreshTriggers();

    const stopPilot = window.pilot.onEvent(onStreamEvent);
    const stopTrigger = window.trigger.onEvent((event: TriggerRuntimeEvent) => {
      if (event.kind === "state") {
        setRunningTriggers((prev) => ({
          ...prev,
          [event.profileId]: {
            profileId: event.profileId,
            name: prev[event.profileId]?.name ?? event.profileId,
            mode: prev[event.profileId]?.mode ?? "interval",
            pid: event.pid,
            startedAt: prev[event.profileId]?.startedAt ?? event.ts,
            status: event.status,
            exitCode: event.exitCode
          }
        }));
      }
      setTriggerLog((prev) => [...prev.slice(-200), `[${event.ts}] ${event.kind === "line" ? event.line : event.message}`]);
    });

    const timer = setInterval(() => {
      void window.ui.getResourceStats().then(setStats).catch(() => undefined);
    }, 1000);

    return () => {
      stopPilot();
      stopTrigger();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey && ev.key === "`") {
        ev.preventDefault();
        void persistPreferences({ rightRailCollapsed: !prefs.rightRailCollapsed });
      } else if (ev.ctrlKey && ev.shiftKey && ev.key === "Enter") {
        ev.preventDefault();
        void runPreview();
      } else if (ev.ctrlKey && ev.key === "Enter") {
        ev.preventDefault();
        void runExecute();
      } else if (ev.altKey && /^[1-5]$/.test(ev.key)) {
        const order: RightRailTab[] = ["chat", "plan", "actions", "logs", "triggers"];
        const tab = order[Number(ev.key) - 1];
        void persistPreferences({ activeTab: tab, rightRailCollapsed: false });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [prefs.rightRailCollapsed]);

  const activeTab = prefs.activeTab;

  return (
    <div className="v2-root" style={{ ["--drawer-width" as string]: `${prefs.rightRailWidth}px` }}>
      <header className="v2-header">
        <div className="header-left">
          <strong className="app-title">System Pilot Operator Console</strong>
          <span className="workspace-name">local deterministic runtime</span>
        </div>
        <div className="session-tabs">
          <button className="session-tab active">Session</button>
        </div>
        <div className="header-right">
          <span className={`dot ${running ? "running" : "idle"}`} />
          <button className="header-btn" onClick={() => void runPreview()}>
            Preview
          </button>
          <button className="header-btn" onClick={() => void runExecute()}>
            Execute
          </button>
          <button className="header-btn" onClick={() => void persistPreferences({ rightRailCollapsed: !prefs.rightRailCollapsed })}>
            Rail
          </button>
        </div>
      </header>

      <main className="surface">
        <div className="console-shell">
          <div className={`console-stream${prefs.crtEnabled ? " crt" : ""}`} style={{ fontSize: `${prefs.consoleFontSize}px` }}>
            {consoleLines.map((entry) => (
              <div
                key={entry.id}
                className={`console-line ${entry.type === "ERROR" ? "error" : entry.type === "WARNING" ? "warning" : "system"}`}
              >
                [{entry.ts.slice(11, 19)}] {entry.text}
              </div>
            ))}
          </div>
          <div className="command-bar">
            <span className="command-prompt">pilot&gt;</span>
            <input
              className="command-input"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder='Try: list .tmp or search .tmp "run"'
            />
            <span className="approval-badge">Mode: {mode}</span>
            <button className="run-btn" onClick={() => void runExecute()} disabled={running || !request.trim()}>
              {running ? "Running..." : "Run"}
            </button>
          </div>
        </div>

        <aside className={`details-drawer${prefs.rightRailCollapsed ? "" : " open"}`}>
          <div className="drawer-tabs">
            {(["chat", "plan", "actions", "logs", "triggers"] as RightRailTab[]).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => void persistPreferences({ activeTab: tab, rightRailCollapsed: false })}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="drawer-content">
            {activeTab === "chat" && <div className="drawer-section muted">Use the command bar to issue requests.</div>}

            {activeTab === "plan" && (
              <div className="drawer-section">
                <div className="row-title">Plan</div>
                <pre className="json-block">{plan ? JSON.stringify(plan, null, 2) : "No plan generated yet."}</pre>
              </div>
            )}

            {activeTab === "actions" && (
              <div className="drawer-section">
                {(plan?.actions ?? []).map((action) => (
                  <div key={action.action_id} className="list-row">
                    <div className="row-title">{action.action_id}</div>
                    <div className="row-sub">{action.type}</div>
                    <div className="row-sub">risk: {action.risk}</div>
                  </div>
                ))}
                {!plan?.actions.length && <div className="muted">No actions yet.</div>}
              </div>
            )}

            {activeTab === "logs" && (
              <div className="drawer-section">
                <div className="row-sub">run_id: {runId ?? "n/a"}</div>
                <pre className="json-block">{runLog ? JSON.stringify(runLog, null, 2) : "No run log yet."}</pre>
              </div>
            )}

            {activeTab === "triggers" && (
              <div className="drawer-section">
                <div className="panel-row">
                  <div className="row-title">Create Trigger</div>
                  <input className="command-input" value={triggerName} onChange={(e) => setTriggerName(e.target.value)} placeholder="Name" />
                  <select className="command-input" value={triggerMode} onChange={(e) => setTriggerMode(e.target.value as "interval" | "watch")}>
                    <option value="interval">interval</option>
                    <option value="watch">watch</option>
                  </select>
                  {triggerMode === "interval" ? (
                    <input
                      className="command-input"
                      type="number"
                      value={intervalMs}
                      onChange={(e) => setIntervalMs(Number(e.target.value) || 60000)}
                      placeholder="Interval ms"
                    />
                  ) : (
                    <>
                      <input
                        className="command-input"
                        value={triggerPath}
                        onChange={(e) => setTriggerPath(e.target.value)}
                        placeholder="Watch path"
                      />
                      <input
                        className="command-input"
                        type="number"
                        value={debounceMs}
                        onChange={(e) => setDebounceMs(Number(e.target.value) || 800)}
                        placeholder="Debounce ms"
                      />
                    </>
                  )}
                  <input
                    className="command-input"
                    type="number"
                    value={maxRuns}
                    onChange={(e) => setMaxRuns(Number(e.target.value) || 0)}
                    placeholder="Max runs (0=unlimited)"
                  />
                  <div className="action-row">
                    <button className="secondary-btn" onClick={() => void saveTrigger()}>
                      Save Trigger
                    </button>
                    <button className="secondary-btn" onClick={() => void refreshTriggers()}>
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="panel-row">
                  <div className="row-title">Install Scheduled Task (dry run)</div>
                  <input className="command-input" value={taskName} onChange={(e) => setTaskName(e.target.value)} />
                  <button className="secondary-btn" onClick={() => void installTask()}>
                    Install Task
                  </button>
                </div>

                {triggers.map((profile) => {
                  const runtime = runningTriggers[profile.id];
                  return (
                    <div key={profile.id} className="list-row">
                      <div className="row-title">{profile.name}</div>
                      <div className="row-sub">
                        {profile.mode} · {profile.execute ? "execute" : "preview"} · status {runtime?.status ?? "stopped"}
                      </div>
                      <div className="row-sub">{profile.request}</div>
                      <div className="action-row">
                        <button className="secondary-btn" onClick={() => void window.trigger.start(profile.id).then(refreshTriggers)}>
                          Start
                        </button>
                        <button className="secondary-btn" onClick={() => void window.trigger.stop(profile.id).then(refreshTriggers)}>
                          Stop
                        </button>
                        <button
                          className="secondary-btn danger"
                          onClick={() => void window.trigger.deleteProfile(profile.id).then(refreshTriggers)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                <pre className="json-block">{triggerLog.length ? triggerLog.join("\n") : "No trigger events yet."}</pre>
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="bottom-bar" style={{ padding: "4px 10px", borderTop: "1px solid var(--border)", fontSize: 12 }}>
        <span>mode: {mode}</span>
        <span>cpu: {stats.cpu.toFixed(1)}%</span>
        <span>ram: {stats.ram.toFixed(1)}%</span>
        <span>
          net: ↓{stats.netDown.toFixed(1)} ↑{stats.netUp.toFixed(1)}
        </span>
      </footer>
    </div>
  );
}
