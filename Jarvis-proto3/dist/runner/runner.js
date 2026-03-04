"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnerError = void 0;
exports.runPlan = runPlan;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const tools_1 = require("../tools");
const utils_1 = require("../utils");
const schemas_1 = require("../validation/schemas");
class RunnerError extends Error {
    constructor(message) {
        super(message);
        this.name = "RunnerError";
    }
}
exports.RunnerError = RunnerError;
async function runPlan(plan, policy, options) {
    const planValidation = (0, schemas_1.validatePlan)(plan);
    if (!planValidation.ok) {
        throw new RunnerError(`Plan validation failed: ${planValidation.errors.join("; ")}`);
    }
    const events = [];
    const artifacts = [];
    const repairHistory = [];
    const tempRoot = node_path_1.default.resolve(process.cwd(), ".tmp");
    const ctx = {
        policy,
        projectRoot: process.cwd(),
        tempRoot
    };
    let halted = false;
    const emit = (event) => {
        options.onEvent?.(event);
    };
    const pushRunEvent = (event) => {
        events.push(event);
        emit({ kind: "action_event", payload: event });
    };
    try {
        for (const action of plan.actions) {
            pushRunEvent({ ts: (0, utils_1.nowUtcIso)(), action_id: action.action_id, status: "planned" });
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
                    ts: (0, utils_1.nowUtcIso)(),
                    action_id: action.action_id,
                    status: "awaiting_approval",
                    stderr: "Action requires explicit approval and auto-approve is disabled."
                });
                halted = true;
                break;
            }
            if (options.dryRun || plan.dry_run) {
                pushRunEvent({
                    ts: (0, utils_1.nowUtcIso)(),
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
                pushRunEvent({ ts: (0, utils_1.nowUtcIso)(), action_id: action.action_id, status: "in_progress", attempt });
                try {
                    const result = await (0, tools_1.executeAction)(action, ctx);
                    const stdoutRaw = result.stdout ?? "";
                    const stderrRaw = result.stderr ?? "";
                    const shouldRedact = (0, utils_1.includesSecret)(stdoutRaw) || (0, utils_1.includesSecret)(stderrRaw);
                    const stdout = shouldRedact ? (0, utils_1.redactSecrets)(stdoutRaw) : stdoutRaw;
                    const stderr = shouldRedact ? (0, utils_1.redactSecrets)(stderrRaw) : stderrRaw;
                    pushRunEvent({
                        ts: (0, utils_1.nowUtcIso)(),
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
                }
                catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                    const shouldRetry = attempt <= retries;
                    pushRunEvent({
                        ts: (0, utils_1.nowUtcIso)(),
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
                        ts: (0, utils_1.nowUtcIso)(),
                        action_id: action.action_id,
                        failure_signature: lastError,
                        patch: "No alternate patch configured in scaffold runner.",
                        outcome: "unresolved"
                    });
                    if (action.rollback) {
                        try {
                            pushRunEvent({
                                ts: (0, utils_1.nowUtcIso)(),
                                action_id: action.action_id,
                                status: "in_progress",
                                stdout: "Attempting rollback."
                            });
                            await (0, tools_1.executeAction)({
                                ...action,
                                type: action.rollback.type,
                                args: action.rollback.args
                            }, ctx);
                            pushRunEvent({ ts: (0, utils_1.nowUtcIso)(), action_id: action.action_id, status: "rolled_back" });
                        }
                        catch (rollbackError) {
                            pushRunEvent({
                                ts: (0, utils_1.nowUtcIso)(),
                                action_id: action.action_id,
                                status: "fail",
                                stderr: `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
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
                        ts: (0, utils_1.nowUtcIso)(),
                        action_id: action.action_id,
                        status: "skipped",
                        stderr: `Action skipped after failure: ${lastError}`
                    });
                    continue;
                }
                break;
            }
        }
    }
    finally {
        await (0, tools_1.shutdownTools)();
    }
    const anyFailed = events.some((event) => event.status === "fail");
    const status = anyFailed ? "failed" : halted ? "partial" : "ok";
    const runlog = {
        run_id: plan.run_id,
        goal: plan.goal,
        plan: plan.actions,
        events,
        artifacts,
        repair_history: repairHistory,
        final_result: {
            status,
            summary: status === "ok"
                ? "Run completed successfully."
                : status === "partial"
                    ? "Run halted pending approval or skip policy."
                    : "Run failed due to action errors."
        }
    };
    const runlogValidation = (0, schemas_1.validateRunLog)(runlog);
    if (!runlogValidation.ok) {
        throw new RunnerError(`Run log validation failed: ${runlogValidation.errors.join("; ")}`);
    }
    await persistRunLog(runlog);
    return runlog;
}
async function persistRunLog(runlog) {
    const runDir = node_path_1.default.resolve(process.cwd(), ".tmp", "runs");
    await promises_1.default.mkdir(runDir, { recursive: true });
    const runPath = node_path_1.default.resolve(runDir, `${runlog.run_id}.json`);
    await promises_1.default.writeFile(runPath, JSON.stringify(runlog, null, 2), "utf-8");
}
