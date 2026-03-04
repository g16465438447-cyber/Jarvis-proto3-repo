import { Action, ApprovalDecision, ConsoleEntry, Plan, ResourceStats, StreamEvent } from "./types";

export function mapStreamEventToConsoleEntries(event: StreamEvent): ConsoleEntry[] {
  const base = {
    id: `${event.run_id}:${event.ts}:${event.kind}`,
    ts: event.ts
  };
  switch (event.kind) {
    case "plan_ready":
      return [
        {
          ...base,
          type: "PLAN",
          text: `PLAN: ${event.payload.plan.actions.length} action(s) prepared for "${event.payload.plan.goal}".`
        }
      ];
    case "action_event":
      return [
        {
          ...base,
          type: event.payload.status === "fail" ? "ERROR" : "STEP",
          text: `STEP ${event.payload.action_id}: ${event.payload.status}${
            event.payload.stderr ? ` (${event.payload.stderr})` : ""
          }`,
          actionId: event.payload.action_id
        }
      ];
    case "tool_output":
      return [
        {
          ...base,
          type: "TOOL",
          text: `TOOL ${event.payload.action_id}: ${event.payload.stdout ?? event.payload.stderr ?? "no output"}`,
          actionId: event.payload.action_id
        }
      ];
    case "approval_needed":
      return [
        {
          ...base,
          type: "WARNING",
          text: `APPROVAL REQUIRED (${event.payload.risk}): ${event.payload.reason}`,
          actionId: event.payload.action_id
        }
      ];
    case "run_complete":
      return [
        {
          ...base,
          type: "RESULT",
          text: `RESULT: ${event.payload.runlog.final_result.status} - ${event.payload.runlog.final_result.summary}`
        }
      ];
    case "run_error":
      return [
        {
          ...base,
          type: "ERROR",
          text: `ERROR: ${event.payload.message}`
        }
      ];
    default:
      return [];
  }
}

export function statusChipState(value: number, warnThreshold: number, failThreshold: number): "OK" | "WARN" | "FAIL" {
  if (value >= failThreshold) {
    return "FAIL";
  }
  if (value >= warnThreshold) {
    return "WARN";
  }
  return "OK";
}

export function formatDeterminateBar(percent: number, metric: string): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const cells = 16;
  const filled = Math.round((clamped / 100) * cells);
  const bar = `${"█".repeat(filled)}${"░".repeat(cells - filled)}`;
  return `[${bar}] ${clamped}% ${metric}`;
}

export function formatIndeterminateBar(frame: number): string {
  const pattern = ["░░░░▒▒▓▓████▓▓▒▒░░░░", "░░▒▒▓▓████▓▓▒▒░░░░░░", "▒▒▓▓████▓▓▒▒░░░░░░░░"];
  const index = Math.abs(frame) % pattern.length;
  return `[${pattern[index]}] scanning...`;
}

export function deriveRiskMeter(plan?: Plan): "SAFE" | "CAUTION" | "DANGER" {
  if (!plan || plan.actions.length === 0) {
    return "SAFE";
  }
  const hasHigh = plan.actions.some((action) => action.risk === "high");
  if (hasHigh) {
    return "DANGER";
  }
  const hasMedium = plan.actions.some((action) => action.risk === "medium");
  return hasMedium ? "CAUTION" : "SAFE";
}

export function canExecutePlan(plan: Plan | undefined, decisions: Record<string, ApprovalDecision["decision"]>): boolean {
  if (!plan) {
    return false;
  }
  for (const action of plan.actions) {
    if (!action.requires_approval) {
      continue;
    }
    const decision = decisions[action.action_id];
    if (decision === "deny" || !decision) {
      return false;
    }
  }
  return true;
}

export function actionImpactSummary(action: Action): string[] {
  const lines: string[] = [];
  if (action.type.startsWith("fs.")) {
    lines.push("Filesystem operation");
  }
  if (action.type.startsWith("browser.")) {
    lines.push("Network/browser operation");
  }
  if (action.type.startsWith("process.") || action.type === "shell.run") {
    lines.push("Process/command operation");
  }
  if (action.requires_approval) {
    lines.push("Requires approval");
  }
  return lines;
}

export function estimateProgress(plan: Plan | undefined, statuses: Record<string, string>): { percent: number; metric: string } {
  if (!plan || plan.actions.length === 0) {
    return { percent: 0, metric: "idle" };
  }
  const doneStates = new Set(["ok", "skipped", "rolled_back", "fail"]);
  const done = plan.actions.filter((action) => doneStates.has(statuses[action.action_id] ?? "")).length;
  const percent = (done / plan.actions.length) * 100;
  return { percent, metric: `${done}/${plan.actions.length} steps` };
}

export function mergeResourceStats(previous: ResourceStats | undefined, next: ResourceStats): ResourceStats {
  if (!previous) {
    return next;
  }
  return {
    cpu: Math.round(((previous.cpu * 2 + next.cpu) / 3) * 10) / 10,
    ram: Math.round(((previous.ram * 2 + next.ram) / 3) * 10) / 10,
    netDown: Math.round(((previous.netDown * 2 + next.netDown) / 3) * 10) / 10,
    netUp: Math.round(((previous.netUp * 2 + next.netUp) / 3) * 10) / 10
  };
}

