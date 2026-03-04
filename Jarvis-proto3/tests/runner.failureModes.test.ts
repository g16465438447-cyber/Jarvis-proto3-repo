import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Action, Plan, PolicyConfig, ToolResult } from "../src/types";

const { executeActionMock, shutdownToolsMock } = vi.hoisted(() => {
  return {
    executeActionMock: vi.fn(),
    shutdownToolsMock: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("../src/tools", () => {
  return {
    executeAction: executeActionMock,
    shutdownTools: shutdownToolsMock
  };
});

import { runPlan } from "../src/runner/runner";

function makePolicy(): PolicyConfig {
  return {
    allowed_paths: [process.cwd(), `${process.cwd()}\\.tmp`],
    allowed_apps: ["pwsh.exe"],
    allowed_shell_commands: ["Get-Date"],
    high_risk_actions: []
  };
}

function makePlan(actions: Action[]): Plan {
  return {
    plan_id: randomUUID(),
    run_id: randomUUID(),
    goal: "failure-mode-test",
    created_at_utc: new Date().toISOString(),
    dry_run: false,
    actions,
    policy_snapshot: {
      allowed_paths: [process.cwd(), `${process.cwd()}\\.tmp`],
      allowed_apps: ["pwsh.exe"],
      allowed_shell_commands: ["Get-Date"]
    }
  };
}

function makeBaseAction(overrides?: Partial<Action>): Action {
  return {
    action_id: randomUUID(),
    type: "fs.list",
    args: { path: `${process.cwd()}\\.tmp`, recursive: false },
    risk: "low",
    requires_approval: false,
    expected_output: "list output",
    rollback: null,
    retries: 1,
    timeout_ms: 1000,
    on_failure: "halt",
    ...(overrides ?? {})
  };
}

describe("runner failure-mode behavior (mocked tools)", () => {
  beforeEach(() => {
    executeActionMock.mockReset();
    shutdownToolsMock.mockClear();
    shutdownToolsMock.mockResolvedValue(undefined);
  });

  test("retries once and succeeds after transient failure", async () => {
    executeActionMock
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce({ stdout: "recovered" } satisfies ToolResult);

    const plan = makePlan([makeBaseAction({ retries: 1 })]);
    const runlog = await runPlan(plan, makePolicy(), { dryRun: false, autoApproveHighRisk: true });

    expect(executeActionMock).toHaveBeenCalledTimes(2);
    expect(runlog.events.some((event) => event.status === "retrying")).toBe(true);
    expect(runlog.events.some((event) => event.status === "ok")).toBe(true);
    expect((runlog.repair_history ?? []).length).toBe(0);
    expect(runlog.final_result.status).toBe("ok");
    expect(shutdownToolsMock).toHaveBeenCalledTimes(1);
  });

  test("records rollback success path after terminal action failure", async () => {
    executeActionMock
      .mockRejectedValueOnce(new Error("terminal failure"))
      .mockResolvedValueOnce({ stdout: "rollback ok" } satisfies ToolResult);

    const failingAction = makeBaseAction({
      type: "fs.move",
      args: { source: `${process.cwd()}\\.tmp\\a.txt`, destination: `${process.cwd()}\\.tmp\\b.txt` },
      retries: 0,
      rollback: {
        type: "fs.move",
        args: { source: `${process.cwd()}\\.tmp\\b.txt`, destination: `${process.cwd()}\\.tmp\\a.txt` }
      }
    });
    const plan = makePlan([failingAction]);
    const runlog = await runPlan(plan, makePolicy(), { dryRun: false, autoApproveHighRisk: true });

    expect(executeActionMock).toHaveBeenCalledTimes(2);
    expect(runlog.events.some((event) => event.status === "fail")).toBe(true);
    expect(runlog.events.some((event) => event.status === "rolled_back")).toBe(true);
    expect((runlog.repair_history ?? []).length).toBe(1);
    expect(runlog.final_result.status).toBe("failed");
    expect(shutdownToolsMock).toHaveBeenCalledTimes(1);
  });
});

