import "dotenv/config";
import { buildPlan } from "../router/router";
import { runPlan } from "../runner/runner";
import { loadPolicy } from "../policy/loadPolicy";
import { RuntimeStreamEvent } from "../types";
import { nowUtcIso } from "../utils";

interface CliOptions {
  execute: boolean;
  approveHighRisk: boolean;
  printJson: boolean;
  streamJson: boolean;
  sessionId?: string;
}

function parseArgs(argv: string[]): { request: string; options: CliOptions } {
  const requestParts: string[] = [];
  const options: CliOptions = {
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

async function main(): Promise<void> {
  const { request, options } = parseArgs(process.argv.slice(2));
  if (!request) {
    throw new Error(
      "Usage: npm run pilot -- <request> [--execute] [--approve-high-risk] [--json] [--stream-json] [--session-id <id>]"
    );
  }

  const policy = loadPolicy(process.cwd());
  const dryRun = !options.execute;
  const plan = buildPlan(request, policy, { dryRun });

  if (options.streamJson) {
    writeStreamEvent({
      kind: "plan_ready",
      run_id: plan.run_id,
      ts: nowUtcIso(),
      session_id: options.sessionId,
      payload: { plan }
    });
  }

  try {
    const runLog = await runPlan(plan, policy, {
      dryRun,
      autoApproveHighRisk: options.approveHighRisk,
      onEvent: options.streamJson
        ? (runnerEvent) => {
            writeStreamEvent({
              kind: runnerEvent.kind,
              run_id: plan.run_id,
              ts: nowUtcIso(),
              session_id: options.sessionId,
              payload: runnerEvent.payload as RuntimeStreamEvent["payload"]
            } as RuntimeStreamEvent);
          }
        : undefined
    });

    if (options.streamJson) {
      writeStreamEvent({
        kind: "run_complete",
        run_id: runLog.run_id,
        ts: nowUtcIso(),
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
  } catch (error) {
    if (options.streamJson) {
      const message = error instanceof Error ? error.message : String(error);
      writeStreamEvent({
        kind: "run_error",
        run_id: plan.run_id,
        ts: nowUtcIso(),
        session_id: options.sessionId,
        payload: { message }
      });
      return;
    }
    throw error;
  }
}

function writeStreamEvent(event: RuntimeStreamEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pilot error: ${message}`);
  process.exit(1);
});
