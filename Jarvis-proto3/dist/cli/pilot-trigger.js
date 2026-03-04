"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const router_1 = require("../router/router");
const loadPolicy_1 = require("../policy/loadPolicy");
const runner_1 = require("../runner/runner");
const utils_1 = require("../utils");
const triggerCore_1 = require("./triggerCore");
async function main() {
    const options = (0, triggerCore_1.parseTriggerArgs)(process.argv.slice(2), process.cwd());
    const policy = (0, loadPolicy_1.loadPolicy)(process.cwd());
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
async function runIntervalTrigger(options, policy) {
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
    const executeQueued = async (reason) => {
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
    await new Promise((resolve) => {
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
async function runWatchTrigger(options, policy) {
    const watchRoot = node_path_1.default.normalize(options.watchPath);
    if (!node_fs_1.default.existsSync(watchRoot)) {
        throw new Error(`Watch path does not exist: ${watchRoot}`);
    }
    if (!(0, loadPolicy_1.isPathAllowed)(watchRoot, policy)) {
        throw new Error(`Watch path is outside policy allowlist: ${watchRoot}`);
    }
    let runCount = 0;
    let stopped = false;
    let pendingRequest = null;
    let running = false;
    let debounceTimer = null;
    let lastEventType = "change";
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
    const drainQueue = async () => {
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
    const queueFromLastEvent = () => {
        const request = (0, triggerCore_1.interpolateRequestTemplate)(options.request, {
            eventPath: lastEventPath,
            eventName: node_path_1.default.basename(lastEventPath),
            eventType: lastEventType
        });
        pendingRequest = request;
        void drainQueue();
    };
    const watcher = node_fs_1.default.watch(watchRoot, {
        recursive: options.recursiveWatch
    }, (eventType, filename) => {
        if (stopped) {
            return;
        }
        lastEventType = eventType;
        const normalizedFilename = filename ? String(filename) : "";
        lastEventPath = normalizedFilename ? node_path_1.default.join(watchRoot, normalizedFilename) : watchRoot;
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            queueFromLastEvent();
        }, options.debounceMs);
    });
    await new Promise((resolve, reject) => {
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
async function runSingleRequest(request, execute, policy, reason) {
    const dryRun = !execute;
    const plan = (0, router_1.buildPlan)(request, policy, { dryRun });
    log(`run started (${reason}) run_id=${plan.run_id} dry_run=${dryRun}`);
    const runLog = await (0, runner_1.runPlan)(plan, policy, {
        dryRun,
        autoApproveHighRisk: true
    });
    log(`run completed run_id=${runLog.run_id} status=${runLog.final_result.status} summary="${runLog.final_result.summary}"`);
}
async function installTask(options) {
    if (process.platform !== "win32") {
        throw new Error("install-task mode is only supported on Windows.");
    }
    const pilotEntry = node_path_1.default.resolve(process.cwd(), "dist", "cli", "pilot.js");
    if (!node_fs_1.default.existsSync(pilotEntry)) {
        throw new Error(`Built CLI not found at ${pilotEntry}. Run "npm run build" before install-task.`);
    }
    const spec = (0, triggerCore_1.buildTaskInstallSpec)({
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
async function runCommand(command, args) {
    const child = (0, node_child_process_1.spawn)(command, args, {
        windowsHide: true,
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    await new Promise((resolve, reject) => {
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
function log(message) {
    process.stdout.write(`[${(0, utils_1.nowUtcIso)()}] ${message}\n`);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`pilot-trigger error: ${message}`);
    process.exit(1);
});
