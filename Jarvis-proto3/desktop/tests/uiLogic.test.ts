import { describe, expect, test } from "vitest";
import {
  canExecutePlan,
  deriveRiskMeter,
  formatDeterminateBar,
  formatIndeterminateBar,
  mapStreamEventToConsoleEntries,
  statusChipState
} from "../shared/uiLogic";
import { Plan } from "../shared/types";

const samplePlan: Plan = {
  plan_id: "p1",
  run_id: "r1",
  goal: "sample",
  created_at_utc: "2026-01-01T00:00:00Z",
  dry_run: false,
  actions: [
    {
      action_id: "a1",
      type: "fs.list",
      args: { path: "C:\\tmp" },
      risk: "low",
      requires_approval: false,
      expected_output: "list",
      rollback: null
    },
    {
      action_id: "a2",
      type: "shell.run",
      args: { command: "Get-Date" },
      risk: "high",
      requires_approval: true,
      expected_output: "date",
      rollback: null
    }
  ],
  policy_snapshot: {
    allowed_paths: ["C:\\tmp"],
    allowed_apps: ["pwsh.exe"],
    allowed_shell_commands: ["Get-Date"]
  }
};

describe("desktop ui logic", () => {
  test("maps stream events to console entries", () => {
    const entries = mapStreamEventToConsoleEntries({
      kind: "run_error",
      run_id: "r1",
      ts: "2026-01-01T00:00:00Z",
      payload: { message: "boom" }
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("ERROR");
  });

  test("formats determinate and indeterminate bars", () => {
    expect(formatDeterminateBar(63, "2/3 steps")).toContain("63%");
    expect(formatIndeterminateBar(2)).toContain("scanning");
  });

  test("derives chip/risk states", () => {
    expect(statusChipState(10, 50, 80)).toBe("OK");
    expect(statusChipState(60, 50, 80)).toBe("WARN");
    expect(statusChipState(90, 50, 80)).toBe("FAIL");
    expect(deriveRiskMeter(samplePlan)).toBe("DANGER");
  });

  test("blocks execution until approval decisions exist", () => {
    expect(canExecutePlan(samplePlan, {})).toBe(false);
    expect(canExecutePlan(samplePlan, { a2: "approve_once" })).toBe(true);
    expect(canExecutePlan(samplePlan, { a2: "deny" })).toBe(false);
  });
});

