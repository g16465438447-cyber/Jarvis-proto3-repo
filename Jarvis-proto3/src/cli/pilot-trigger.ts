import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildPlan } from "../router/router";
import { loadPolicy, isPathAllowed } from "../policy/loadPolicy";
import { runPlan } from "../runner/runner";
import { nowUtcIso } from "../utils";
import { buildTaskInstallSpec, interpolateRequestTemplate, parseTriggerArgs, TriggerCliOptions } from "./triggerCore";

async function main(): Promise<void> {
  const options = parseTriggerArgs(process.argv.slice(2), process.cwd());
  const policy = loadPolicy(process.cwd());

  if (options.mode === "install-task") {
    await installTask(options);
    return;
  }

  if (options.mode === "interval") {
    await runIntervalTrigger(options, policy);
    return;
  }

  await runWatchTrigger(options, policy);
}

async function runIntervalTrigger(options: TriggerCliOptions, policy: ReturnType<typeof loadPolicy>): Promise<void> {
  let runCount = 0;
  let isRunning = false;
  let pending = false;
  let stopped = false;

  log(`interval trigger started (every ${options.intervalMs}ms, execute=${options.execute})`);

  const stopRequested = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    log("stop requested, waiting for in-flight run to finish...");
  };
  process.on("SIGINT", stopRequested);
  process.on("SIGTERM", stopRequested);

  const executeQueued = async (reason: string): Promise<void> => {
    if (isRunning) {
      pending = true;
      return;
    }
    isRunning = true;
    do {
      pending = false;
      runCount += 1;
      await runSingleRequest(options.request, options.execute, policy, `interval:${reason}#${runCount}`);
      if (options.maxRuns > 0 && runCount >= options.maxRuns) {
        stopped = true;
      }
    } while (!stopped && pending);
    isRunning = false;
  };

  await executeQueued("startup");

  if (stopped) {
    log("interval trigger completed.");
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (stopped) {
        clearInterval(timer);
        resolve();
        return;
      }
      void executeQueued("tick");
    }, options.intervalMs);
  });

  log("interval trigger exited.");
}

async function runWatchTrigger(options: TriggerCliOptions, policy: ReturnType<typeof loadPolicy>): Promise<void> {
  const watchRoot = path.normalize(options.watchPath);
  if (!fs.existsSync(watchRoot)) {
    throw new Error(`Watch path does not exist: ${watchRoot}`);
  }
  if (!isPathAllowed(watchRoot, policy)) {
    throw new Error(`Watch path is outside policy allowlist: ${watchRoot}`);
  }

  let runCount = 0;
  let stopped = false;
  let pendingRequest: string | null = null;
  let running = false;
  let debounceTimer: NodeJS.Timeout | null = null;
  let lastEventType: "rename" | "change" = "change";
  let lastEventPath = watchRoot;

  log(`watch trigger started (${watchRoot}, recursive=${options.recursiveWatch}, execute=${options.execute})`);

  const stopRequested = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    watcher.close();
    log("watch trigger stop requested.");
  };
  process.on("SIGINT", stopRequested);
  process.on("SIGTERM", stopRequested);

  const drainQueue = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    while (!stopped && pendingRequest) {
      const request = pendingRequest;
      pendingRequest = null;
      runCount += 1;
      await runSingleRequest(request, options.execute, policy, `watch#${runCount}`);
      if (options.maxRuns > 0 && runCount >= options.maxRuns) {
        stopRequested();
        break;
      }
    }
    running = false;
  };

  const queueFromLastEvent = (): void => {
    const request = interpolateRequestTemplate(options.request, {
      eventPath: lastEventPath,
      eventName: path.basename(lastEventPath),
      eventType: lastEventType
    });
    pendingRequest = request;
    void drainQueue();
  };

  const watcher = fs.watch(
    watchRoot,
    {
      recursive: options.recursiveWatch
    },
    (eventType, filename) => {
      if (stopped) {
        return;
      }
      lastEventType = eventType;
      const normalizedFilename = filename ? String(filename) : "";
      lastEventPath = normalizedFilename ? path.join(watchRoot, normalizedFilename) : watchRoot;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        queueFromLastEvent();
      }, options.debounceMs);
    }
  );

  await new Promise<void>((resolve, reject) => {
    watcher.on("error", (error) => {
      stopRequested();
      reject(error);
    });

    const timer = setInterval(() => {
      if (!stopped) {
        return;
      }
      clearInterval(timer);
      resolve();
    }, 200);
  });

  log("watch trigger exited.");
}

async function runSingleRequest(
  request: string,
  execute: boolean,
  policy: ReturnType<typeof loadPolicy>,
  reason: string
): Promise<void> {
  const dryRun = !execute;
  const plan = buildPlan(request, policy, { dryRun });
  log(`run started (${reason}) run_id=${plan.run_id} dry_run=${dryRun}`);
  const runLog = await runPlan(plan, policy, {
    dryRun,
    autoApproveHighRisk: true
  });
  log(`run completed run_id=${runLog.run_id} status=${runLog.final_result.status} summary="${runLog.final_result.summary}"`);
}

async function installTask(options: TriggerCliOptions): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("install-task mode is only supported on Windows.");
  }

  const pilotEntry = path.resolve(process.cwd(), "dist", "cli", "pilot.js");
  if (!fs.existsSync(pilotEntry)) {
    throw new Error(`Built CLI not found at ${pilotEntry}. Run "npm run build" before install-task.`);
  }

  const spec = buildTaskInstallSpec({
    taskName: options.taskName,
    schedule: options.schedule,
    request: options.request,
    execute: options.execute,
    projectRoot: process.cwd(),
    nodeExecutable: process.execPath,
    pilotEntry,
    modifier: options.modifier,
    startTime: options.startTime,
    days: options.days,
    force: options.force
  });

  if (options.dryRun) {
    log(`dry-run: schtasks ${spec.args.join(" ")}`);
    return;
  }

  const result = await runCommand(spec.executable, spec.args);
  log(`task installed: ${options.taskName}`);
  if (result.stdout) {
    log(result.stdout);
  }
}

async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(command, args, {
    windowsHide: true,
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
    });
  });

  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function log(message: string): void {
  process.stdout.write(`[${nowUtcIso()}] ${message}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pilot-trigger error: ${message}`);
  process.exit(1);
});
