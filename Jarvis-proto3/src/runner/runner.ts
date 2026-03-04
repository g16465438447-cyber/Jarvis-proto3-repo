import fs from "node:fs/promises";
import path from "node:path";
import { executeAction, shutdownTools } from "../tools";
import { Plan, PolicyConfig, RunEvent, RunLog, RunnerEvent, ToolContext } from "../types";
import { includesSecret, nowUtcIso, redactSecrets } from "../utils";
import { validatePlan, validateRunLog } from "../validation/schemas";

export interface RunnerOptions {
  dryRun: boolean;
  autoApproveHighRisk: boolean;
  onEvent?: (event: RunnerEvent) => void;
}

export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerError";
  }
}

export async function runPlan(plan: Plan, policy: PolicyConfig, options: RunnerOptions): Promise<RunLog> {
  const planValidation = validatePlan(plan);
  if (!planValidation.ok) {
    throw new RunnerError(`Plan validation failed: ${planValidation.errors.join("; ")}`);
  }

  const events: RunEvent[] = [];
  const artifacts: RunLog["artifacts"] = [];
  const repairHistory: NonNullable<RunLog["repair_history"]> = [];
  const tempRoot = path.resolve(process.cwd(), ".tmp");
  const ctx: ToolContext = {
    policy,
    projectRoot: process.cwd(),
    tempRoot
  };

  let halted = false;
  const emit = (event: RunnerEvent): void => {
    options.onEvent?.(event);
  };

  const pushRunEvent = (event: RunEvent): void => {
    events.push(event);
    emit({ kind: "action_event", payload: event });
  };

  try {
    for (const action of plan.actions) {
      pushRunEvent({ ts: nowUtcIso(), action_id: action.action_id, status: "planned" });

      if (action.risk === "high" && !action.requires_approval) {
        throw new RunnerError(`Invalid plan: high-risk action ${action.action_id} must require approval.`);
      }

      if (action.requires_approval && !options.autoApproveHighRisk) {
        emit({
          kind: "approval_needed",
          payload: {
            action_id: action.action_id,
            risk: action.risk,
            reason: "Action requires explicit approval and auto-approve is disabled."
          }
        });
        pushRunEvent({
          ts: nowUtcIso(),
          action_id: action.action_id,
          status: "awaiting_approval",
          stderr: "Action requires explicit approval and auto-approve is disabled."
        });
        halted = true;
        break;
      }

      if (options.dryRun || plan.dry_run) {
        pushRunEvent({
          ts: nowUtcIso(),
          action_id: action.action_id,
          status: "skipped",
          stdout: "Dry run mode: action not executed."
        });
        continue;
      }

      const retries = action.retries ?? 1;
      let attempt = 0;
      let succeeded = false;
      let lastError = "";
      while (attempt <= retries) {
        attempt += 1;
        pushRunEvent({ ts: nowUtcIso(), action_id: action.action_id, status: "in_progress", attempt });
        try {
          const result = await executeAction(action, ctx);
          const stdoutRaw = result.stdout ?? "";
          const stderrRaw = result.stderr ?? "";
          const shouldRedact = includesSecret(stdoutRaw) || includesSecret(stderrRaw);
          const stdout = shouldRedact ? redactSecrets(stdoutRaw) : stdoutRaw;
          const stderr = shouldRedact ? redactSecrets(stderrRaw) : stderrRaw;
          pushRunEvent({
            ts: nowUtcIso(),
            action_id: action.action_id,
            status: "ok",
            attempt,
            stdout,
            stderr,
            redacted: shouldRedact
          });
          emit({
            kind: "tool_output",
            payload: {
              action_id: action.action_id,
              stdout,
              stderr,
              artifacts: result.artifacts
            }
          });
          for (const artifact of result.artifacts ?? []) {
            artifacts.push(artifact);
          }
          succeeded = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          const shouldRetry = attempt <= retries;
          pushRunEvent({
            ts: nowUtcIso(),
            action_id: action.action_id,
            status: shouldRetry ? "retrying" : "fail",
            attempt,
            stderr: lastError,
            error_code: "TOOL_EXECUTION_FAILED"
          });
          if (shouldRetry) {
            continue;
          }

          repairHistory.push({
            ts: nowUtcIso(),
            action_id: action.action_id,
            failure_signature: lastError,
            patch: "No alternate patch configured in scaffold runner.",
            outcome: "unresolved"
          });

          if (action.rollback) {
            try {
              pushRunEvent({
                ts: nowUtcIso(),
                action_id: action.action_id,
                status: "in_progress",
                stdout: "Attempting rollback."
              });
              await executeAction(
                {
                  ...action,
                  type: action.rollback.type as Plan["actions"][number]["type"],
                  args: action.rollback.args
                },
                ctx
              );
              pushRunEvent({ ts: nowUtcIso(), action_id: action.action_id, status: "rolled_back" });
            } catch (rollbackError) {
              pushRunEvent({
                ts: nowUtcIso(),
                action_id: action.action_id,
                status: "fail",
                stderr: `Rollback failed: ${
                  rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                }`,
                error_code: "ROLLBACK_FAILED"
              });
            }
          }
        }
      }

      if (!succeeded) {
        halted = true;
        if (action.on_failure === "skip") {
          halted = false;
          events.push({
            ts: nowUtcIso(),
            action_id: action.action_id,
            status: "skipped",
            stderr: `Action skipped after failure: ${lastError}`
          });
          continue;
        }
        break;
      }
    }
  } finally {
    await shutdownTools();
  }

  const anyFailed = events.some((event) => event.status === "fail");
  const status: RunLog["final_result"]["status"] = anyFailed ? "failed" : halted ? "partial" : "ok";
  const runlog: RunLog = {
    run_id: plan.run_id,
    goal: plan.goal,
    plan: plan.actions,
    events,
    artifacts,
    repair_history: repairHistory,
    final_result: {
      status,
      summary:
        status === "ok"
          ? "Run completed successfully."
          : status === "partial"
            ? "Run halted pending approval or skip policy."
            : "Run failed due to action errors."
    }
  };

  const runlogValidation = validateRunLog(runlog);
  if (!runlogValidation.ok) {
    throw new RunnerError(`Run log validation failed: ${runlogValidation.errors.join("; ")}`);
  }

  await persistRunLog(runlog);
  return runlog;
}

async function persistRunLog(runlog: RunLog): Promise<void> {
  const runDir = path.resolve(process.cwd(), ".tmp", "runs");
  await fs.mkdir(runDir, { recursive: true });
  const runPath = path.resolve(runDir, `${runlog.run_id}.json`);
  await fs.writeFile(runPath, JSON.stringify(runlog, null, 2), "utf-8");
}
