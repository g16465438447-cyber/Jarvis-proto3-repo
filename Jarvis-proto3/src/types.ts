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

export interface Artifact {
  path: string;
  description: string;
  sha256?: string | null;
}

export interface RepairEntry {
  ts: string;
  action_id: string;
  failure_signature: string;
  patch: string;
  outcome: "resolved" | "unresolved";
}

export interface RunLog {
  run_id: string;
  goal: string;
  plan: Action[];
  events: RunEvent[];
  artifacts: Artifact[];
  repair_history?: RepairEntry[];
  final_result: {
    status: "ok" | "partial" | "failed";
    summary: string;
  };
}

export interface PolicyConfig {
  allowed_paths: string[];
  allowed_apps: string[];
  allowed_shell_commands: string[];
  high_risk_actions: string[];
}

export interface ToolResult {
  stdout?: string;
  stderr?: string;
  artifacts?: Artifact[];
  data?: unknown;
}

export interface ToolContext {
  policy: PolicyConfig;
  projectRoot: string;
  tempRoot: string;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

export type RuntimeStreamEvent =
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
        artifacts?: Artifact[];
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
      payload: {
        runlog: RunLog;
      };
    }
  | {
      kind: "run_error";
      run_id: string;
      ts: string;
      session_id?: string;
      payload: {
        message: string;
      };
    };

export type RunnerEvent =
  | {
      kind: "action_event";
      payload: RunEvent;
    }
  | {
      kind: "tool_output";
      payload: {
        action_id: string;
        stdout?: string;
        stderr?: string;
        artifacts?: Artifact[];
      };
    }
  | {
      kind: "approval_needed";
      payload: {
        action_id: string;
        risk: RiskLevel;
        reason: string;
      };
    };
