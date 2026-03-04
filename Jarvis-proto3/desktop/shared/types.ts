export type RiskLevel = "low" | "medium" | "high";

export type ActionType =
  | "fs.list"
  | "fs.search"
  | "fs.move"
  | "fs.rename"
  | "process.start"
  | "process.stop"
  | "window.focus"
  | "window.screenshot"
  | "browser.open"
  | "browser.click"
  | "browser.type"
  | "browser.download"
  | "shell.run"
  | "extract.text"
  | "extract.table";

export interface Action {
  action_id: string;
  type: ActionType;
  args: Record<string, unknown>;
  risk: RiskLevel;
  requires_approval: boolean;
  expected_output: string;
  rollback: { type: string; args: Record<string, unknown> } | null;
  timeout_ms?: number;
  retries?: number;
  on_failure?: "halt" | "skip" | "retry_alternate";
}

export interface Plan {
  plan_id: string;
  run_id: string;
  goal: string;
  created_at_utc: string;
  dry_run: boolean;
  actions: Action[];
  policy_snapshot: {
    allowed_paths: string[];
    allowed_apps: string[];
    allowed_shell_commands: string[];
  };
}

export interface RunEvent {
  ts: string;
  action_id: string;
  status:
    | "planned"
    | "awaiting_approval"
    | "in_progress"
    | "ok"
    | "fail"
    | "retrying"
    | "skipped"
    | "rolled_back";
  attempt?: number;
  stdout?: string;
  stderr?: string;
  error_code?: string | null;
  redacted?: boolean;
}

export interface RunLog {
  run_id: string;
  goal: string;
  plan: Action[];
  events: RunEvent[];
  artifacts: Array<{
    path: string;
    description: string;
    sha256?: string | null;
  }>;
  repair_history?: Array<{
    ts: string;
    action_id: string;
    failure_signature: string;
    patch: string;
    outcome: "resolved" | "unresolved";
  }>;
  final_result: {
    status: "ok" | "partial" | "failed";
    summary: string;
  };
}

export type StreamEventKind =
  | "plan_ready"
  | "action_event"
  | "tool_output"
  | "approval_needed"
  | "run_complete"
  | "run_error";

export type StreamEvent =
  | {
      kind: "plan_ready";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: { plan: Plan };
    }
  | {
      kind: "action_event";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: RunEvent;
    }
  | {
      kind: "tool_output";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: {
        action_id: string;
        stdout?: string;
        stderr?: string;
      };
    }
  | {
      kind: "approval_needed";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: {
        action_id: string;
        risk: RiskLevel;
        reason: string;
      };
    }
  | {
      kind: "run_complete";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: { runlog: RunLog };
    }
  | {
      kind: "run_error";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: { message: string };
    };

export type TriggerMode = "interval" | "watch";
export type TaskSchedule = "MINUTE" | "HOURLY" | "DAILY" | "WEEKLY" | "ONCE" | "ONLOGON" | "ONSTART";

interface TriggerProfileBase {
  id: string;
  name: string;
  request: string;
  execute: boolean;
}

export type TriggerProfile =
  | (TriggerProfileBase & {
      mode: "interval";
      intervalMs: number;
      maxRuns: number;
    })
  | (TriggerProfileBase & {
      mode: "watch";
      watchPath: string;
      debounceMs: number;
      recursiveWatch: boolean;
      maxRuns: number;
    });

export interface TriggerInstallTaskOptions {
  taskName: string;
  request: string;
  execute: boolean;
  schedule: TaskSchedule;
  modifier: number;
  startTime: string;
  days: string[];
  force: boolean;
  dryRun: boolean;
}

export interface TriggerRuntimeInfo {
  profileId: string;
  name: string;
  mode: TriggerMode;
  pid: number | null;
  startedAt: string;
  status: "running" | "stopped" | "error";
  exitCode?: number | null;
}

export interface TriggerRuntimeResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type TriggerRuntimeEvent =
  | {
      kind: "state";
      ts: string;
      profileId: string;
      status: TriggerRuntimeInfo["status"];
      pid: number | null;
      exitCode?: number | null;
      message: string;
    }
  | {
      kind: "line";
      ts: string;
      profileId: string;
      stream: "stdout" | "stderr";
      line: string;
    };

export type RightRailTab = "chat" | "plan" | "actions" | "logs" | "triggers";

export interface UiPreferences {
  rightRailWidth: number;
  rightRailCollapsed: boolean;
  activeTab: RightRailTab;
  crtEnabled: boolean;
  consoleFontSize: number;
}

export interface ApprovalDecision {
  actionId: string;
  decision: "approve_once" | "approve_session" | "deny";
}

export interface ConsoleEntry {
  id: string;
  ts: string;
  type: "USER" | "AGENT" | "PLAN" | "TOOL" | "WARNING" | "ERROR" | "TASK" | "STEP" | "RESULT";
  text: string;
  actionId?: string;
}

export interface ActionTimelineEntry {
  actionId: string;
  label: string;
  actionType: Action["type"];
  status: "planned" | "awaiting_approval" | "in_progress" | "ok" | "fail" | "retrying" | "skipped" | "rolled_back";
  durationMs?: number;
  details?: string;
}

export interface ResourceStats {
  cpu: number;
  ram: number;
  netDown: number;
  netUp: number;
}

export interface UiSessionState {
  request: string;
  runId?: string;
  plan?: Plan;
  runLog?: RunLog;
  queueCount: number;
  mode: "SAFE" | "CAUTION" | "DANGER";
}

export interface ExecuteOptions {
  request: string;
  sessionId: string;
  approveHighRisk: boolean;
}
