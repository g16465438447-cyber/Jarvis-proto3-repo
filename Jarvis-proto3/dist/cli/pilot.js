"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const router_1 = require("../router/router");
const runner_1 = require("../runner/runner");
const loadPolicy_1 = require("../policy/loadPolicy");
const utils_1 = require("../utils");
function parseArgs(argv) {
    const requestParts = [];
    const options = {
        execute: false,
        approveHighRisk: false,
        printJson: false,
        streamJson: false
    };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === "--execute") {
            options.execute = true;
            continue;
        }
        if (token === "--approve-high-risk") {
            options.approveHighRisk = true;
            continue;
        }
        if (token === "--json") {
            options.printJson = true;
            continue;
        }
        if (token === "--stream-json") {
            options.streamJson = true;
            continue;
        }
        if (token === "--session-id") {
            const value = argv[i + 1];
            if (!value) {
                throw new Error("Missing value for --session-id");
            }
            options.sessionId = value;
            i += 1;
            continue;
        }
        requestParts.push(token);
    }
    const request = requestParts.join(" ").trim();
    return { request, options };
}
async function main() {
    const { request, options } = parseArgs(process.argv.slice(2));
    if (!request) {
        throw new Error("Usage: npm run pilot -- <request> [--execute] [--approve-high-risk] [--json] [--stream-json] [--session-id <id>]");
    }
    const policy = (0, loadPolicy_1.loadPolicy)(process.cwd());
    const dryRun = !options.execute;
    const plan = (0, router_1.buildPlan)(request, policy, { dryRun });
    if (options.streamJson) {
        writeStreamEvent({
            kind: "plan_ready",
            run_id: plan.run_id,
            ts: (0, utils_1.nowUtcIso)(),
            session_id: options.sessionId,
            payload: { plan }
        });
    }
    try {
        const runLog = await (0, runner_1.runPlan)(plan, policy, {
            dryRun,
            autoApproveHighRisk: options.approveHighRisk,
            onEvent: options.streamJson
                ? (runnerEvent) => {
                    writeStreamEvent({
                        kind: runnerEvent.kind,
                        run_id: plan.run_id,
                        ts: (0, utils_1.nowUtcIso)(),
                        session_id: options.sessionId,
                        payload: runnerEvent.payload
                    });
                }
                : undefined
        });
        if (options.streamJson) {
            writeStreamEvent({
                kind: "run_complete",
                run_id: runLog.run_id,
                ts: (0, utils_1.nowUtcIso)(),
                session_id: options.sessionId,
                payload: { runlog: runLog }
            });
            return;
        }
        if (options.printJson) {
            // Deterministic machine output mode for automation.
            console.log(JSON.stringify({ plan, runLog }, null, 2));
            return;
        }
        console.log("Plan:");
        console.log(JSON.stringify(plan, null, 2));
        console.log("");
        console.log("Run Result:");
        console.log(`${runLog.final_result.status}: ${runLog.final_result.summary}`);
        console.log(`Events: ${runLog.events.length}`);
        console.log(`Artifacts: ${runLog.artifacts.length}`);
        console.log(`Run ID: ${runLog.run_id}`);
    }
    catch (error) {
        if (options.streamJson) {
            const message = error instanceof Error ? error.message : String(error);
            writeStreamEvent({
                kind: "run_error",
                run_id: plan.run_id,
                ts: (0, utils_1.nowUtcIso)(),
                session_id: options.sessionId,
                payload: { message }
            });
            return;
        }
        throw error;
    }
}
function writeStreamEvent(event) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`pilot error: ${message}`);
    process.exit(1);
});
