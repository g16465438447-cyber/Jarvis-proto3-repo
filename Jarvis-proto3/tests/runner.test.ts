import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { runPlan, RunnerError } from "../src/runner/runner";
import { Action, Plan } from "../src/types";
import { cleanupSandbox, makePolicy, makeSandbox } from "./helpers";

function makePlan(action: Action, dryRun = false): Plan {
  return {
    plan_id: randomUUID(),
    run_id: randomUUID(),
    goal: "test plan",
    created_at_utc: new Date().toISOString(),
    dry_run: dryRun,
    actions: [action],
    policy_snapshot: {
      allowed_paths: [process.cwd(), path.resolve(process.cwd(), ".tmp")],
      allowed_apps: ["pwsh.exe"],
      allowed_shell_commands: ["Get-Date"]
    }
  };
}

describe("runner", () => {
  test("dry-run skips execution and reports ok", async () => {
    const action: Action = {
      action_id: randomUUID(),
      type: "fs.list",
      args: { path: path.resolve(process.cwd(), ".tmp"), recursive: false },
      risk: "low",
      requires_approval: false,
      expected_output: "List files.",
      rollback: null,
      retries: 0,
      timeout_ms: 1000,
      on_failure: "halt"
    };
    const plan = makePlan(action, true);
    const policy = makePolicy();
    const runlog = await runPlan(plan, policy, { dryRun: false, autoApproveHighRisk: false });
    expect(runlog.final_result.status).toBe("ok");
    expect(runlog.events.some((event) => event.status === "skipped")).toBe(true);
  });

  test("halts on approval gate when high-risk action is not approved", async () => {
    const action: Action = {
      action_id: randomUUID(),
      type: "shell.run",
      args: { command: "Get-Date", args: ["-Format", "o"] },
      risk: "high",
      requires_approval: true,
      expected_output: "date",
      rollback: null,
      retries: 0,
      timeout_ms: 1000,
      on_failure: "halt"
    };
    const plan = makePlan(action, false);
    const policy = makePolicy();
    const runlog = await runPlan(plan, policy, { dryRun: false, autoApproveHighRisk: false });
    expect(runlog.final_result.status).toBe("partial");
    expect(runlog.events.some((event) => event.status === "awaiting_approval")).toBe(true);
  });

  test("throws when high-risk action does not require approval", async () => {
    const action: Action = {
      action_id: randomUUID(),
      type: "shell.run",
      args: { command: "Get-Date", args: ["-Format", "o"] },
      risk: "high",
      requires_approval: false,
      expected_output: "date",
      rollback: null,
      retries: 0,
      timeout_ms: 1000,
      on_failure: "halt"
    };
    const plan = makePlan(action, false);
    const policy = makePolicy();
    await expect(runPlan(plan, policy, { dryRun: false, autoApproveHighRisk: true })).rejects.toThrow(RunnerError);
  });

  test("records failure and repair history when action execution fails", async () => {
    const sandbox = await makeSandbox();
    try {
      const missingSource = path.join(sandbox, "missing.txt");
      const destination = path.join(sandbox, "dest.txt");
      const action: Action = {
        action_id: randomUUID(),
        type: "fs.move",
        args: { source: missingSource, destination },
        risk: "low",
        requires_approval: false,
        expected_output: "move",
        rollback: { type: "fs.move", args: { source: destination, destination: missingSource } },
        retries: 0,
        timeout_ms: 1000,
        on_failure: "halt"
      };
      const plan = makePlan(action, false);
      const policy = makePolicy({ allowed_paths: [sandbox] });
      const runlog = await runPlan(plan, policy, { dryRun: false, autoApproveHighRisk: true });
      expect(runlog.final_result.status).toBe("failed");
      expect(runlog.events.some((event) => event.status === "fail")).toBe(true);
      expect((runlog.repair_history ?? []).length).toBe(1);

      const persisted = path.resolve(process.cwd(), ".tmp", "runs", `${runlog.run_id}.json`);
      await expect(fs.access(persisted)).resolves.toBeUndefined();
    } finally {
      await cleanupSandbox(sandbox);
    }
  });
});

