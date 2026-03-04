"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
const stream_1 = require("../shared/stream");
const PROJECT_ROOT = node_path_1.default.resolve(__dirname, "..", "..", "..");
const CLI_ENTRY = node_path_1.default.resolve(PROJECT_ROOT, "dist", "cli", "pilot.js");
const TRIGGER_CLI_ENTRY = node_path_1.default.resolve(PROJECT_ROOT, "dist", "cli", "pilot-trigger.js");
const RUN_DIR = node_path_1.default.resolve(PROJECT_ROOT, ".tmp", "runs");
const RENDERER_INDEX = node_path_1.default.resolve(__dirname, "..", "renderer", "index.html");
const PREVIEW_TIMEOUT_MS = 15_000;
const DEFAULT_PREFS = {
    rightRailWidth: 420,
    rightRailCollapsed: false,
    activeTab: "plan",
    crtEnabled: false,
    consoleFontSize: 14
};
let mainWindow = null;
const sessions = new Map();
const runToSession = new Map();
const triggerSessions = new Map();
let cpuSnapshot = readCpuSnapshot();
let netDownKbps = 0;
let netUpKbps = 0;
function readCpuSnapshot() {
    const cpus = node_os_1.default.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
        idle += cpu.times.idle;
        total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }
    return { idle, total };
}
function sampleCpuPercent() {
    const next = readCpuSnapshot();
    const totalDiff = next.total - cpuSnapshot.total;
    const idleDiff = next.idle - cpuSnapshot.idle;
    cpuSnapshot = next;
    if (totalDiff <= 0) {
        return 0;
    }
    const usedRatio = 1 - idleDiff / totalDiff;
    return Math.max(0, Math.min(100, usedRatio * 100));
}
async function getPreferencesPath() {
    const dir = electron_1.app.getPath("userData");
    await promises_1.default.mkdir(dir, { recursive: true });
    return node_path_1.default.resolve(dir, "operator-console-preferences.json");
}
async function getPreferences() {
    const file = await getPreferencesPath();
    try {
        const raw = await promises_1.default.readFile(file, "utf-8");
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_PREFS,
            ...parsed
        };
    }
    catch {
        return DEFAULT_PREFS;
    }
}
async function setPreferences(next) {
    const file = await getPreferencesPath();
    const current = await getPreferences();
    const merged = { ...current, ...next };
    await promises_1.default.writeFile(file, JSON.stringify(merged, null, 2), "utf-8");
    return merged;
}
async function getTriggerProfilesPath() {
    const dir = electron_1.app.getPath("userData");
    await promises_1.default.mkdir(dir, { recursive: true });
    return node_path_1.default.resolve(dir, "operator-console-triggers.json");
}
async function getTriggerProfiles() {
    const file = await getTriggerProfilesPath();
    try {
        const raw = await promises_1.default.readFile(file, "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
async function saveTriggerProfiles(next) {
    const file = await getTriggerProfilesPath();
    await promises_1.default.writeFile(file, JSON.stringify(next, null, 2), "utf-8");
    return next;
}
function broadcastStreamEvent(event) {
    mainWindow?.webContents.send("pilot:event", event);
}
function broadcastTriggerEvent(event) {
    mainWindow?.webContents.send("trigger:event", event);
}
function buildCliEnv() {
    const env = { ...process.env };
    // When main process is Electron, child CLIs must run as pure Node for deterministic behavior.
    if (process.versions.electron) {
        env.ELECTRON_RUN_AS_NODE = "1";
    }
    return env;
}
function ensureCliBuilt() {
    if (!node_fs_1.default.existsSync(CLI_ENTRY)) {
        throw new Error(`CLI build not found at ${CLI_ENTRY}. Run "npm run build" (or "npm run desktop:build") before starting desktop UI.`);
    }
}
function ensureTriggerCliBuilt() {
    if (!node_fs_1.default.existsSync(TRIGGER_CLI_ENTRY)) {
        throw new Error(`Trigger CLI build not found at ${TRIGGER_CLI_ENTRY}. Run "npm run build" (or "npm run desktop:build") before using triggers.`);
    }
}
function trackNetworkDown(bytes) {
    const kbps = (bytes / 1024) * 2;
    netDownKbps = Math.max(0, Math.min(999, netDownKbps * 0.6 + kbps * 0.4));
}
function trackNetworkUp(bytes) {
    const kbps = (bytes / 1024) * 2;
    netUpKbps = Math.max(0, Math.min(999, netUpKbps * 0.6 + kbps * 0.4));
}
async function runPilotPreview(request, sessionId) {
    ensureCliBuilt();
    const args = [CLI_ENTRY, request, "--json"];
    if (sessionId) {
        args.push("--session-id", sessionId);
    }
    const child = (0, node_child_process_1.spawn)(process.execPath, args, {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        env: buildCliEnv(),
        stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    await new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn) => {
            if (settled) {
                return;
            }
            settled = true;
            fn();
        };
        const timer = setTimeout(() => {
            child.kill();
            settle(() => reject(new Error(`Preview command timed out after ${PREVIEW_TIMEOUT_MS}ms.`)));
        }, PREVIEW_TIMEOUT_MS);
        child.stdout.on("data", (chunk) => {
            trackNetworkDown(Buffer.byteLength(chunk));
            stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            settle(() => reject(error));
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                settle(resolve);
            }
            else {
                settle(() => reject(new Error(`Preview command failed (${code}): ${stderr || stdout}`)));
            }
        });
    });
    try {
        return JSON.parse(stdout);
    }
    catch {
        throw new Error(`Preview JSON parse failed: ${stdout}`);
    }
}
function startPilotExecution(options) {
    ensureCliBuilt();
    const args = [CLI_ENTRY, options.request, "--execute", "--stream-json", "--json", "--session-id", options.sessionId];
    if (options.approveHighRisk) {
        args.push("--approve-high-risk");
    }
    const child = (0, node_child_process_1.spawn)(process.execPath, args, {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        env: buildCliEnv(),
        stdio: ["ignore", "pipe", "pipe"]
    });
    trackNetworkUp(Buffer.byteLength(args.join(" ")));
    const session = {
        sessionId: options.sessionId,
        request: options.request,
        child,
        stdoutRemainder: "",
        completed: false
    };
    sessions.set(options.sessionId, session);
    child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        trackNetworkDown(Buffer.byteLength(chunk));
        const parsed = (0, stream_1.parseJsonLinesChunk)(session.stdoutRemainder, text);
        session.stdoutRemainder = parsed.remainder;
        for (const error of parsed.errors) {
            broadcastStreamEvent({
                kind: "run_error",
                run_id: session.runId ?? "unknown",
                ts: new Date().toISOString(),
                session_id: session.sessionId,
                payload: { message: error }
            });
        }
        for (const event of parsed.events) {
            if (event.kind === "plan_ready") {
                session.runId = event.run_id;
                runToSession.set(event.run_id, session.sessionId);
            }
            if (event.kind === "run_complete" || event.kind === "run_error") {
                session.completed = true;
            }
            broadcastStreamEvent(event);
        }
    });
    child.stderr.on("data", (chunk) => {
        const message = String(chunk).trim();
        if (!message) {
            return;
        }
        broadcastStreamEvent({
            kind: "run_error",
            run_id: session.runId ?? "unknown",
            ts: new Date().toISOString(),
            session_id: session.sessionId,
            payload: { message }
        });
    });
    child.on("close", (code) => {
        if (!session.completed && code !== 0) {
            broadcastStreamEvent({
                kind: "run_error",
                run_id: session.runId ?? "unknown",
                ts: new Date().toISOString(),
                session_id: session.sessionId,
                payload: { message: `Execution process exited with code ${code}` }
            });
        }
        if (session.runId) {
            runToSession.delete(session.runId);
        }
        sessions.delete(session.sessionId);
    });
    return { sessionId: options.sessionId };
}
function abortExecution(runIdOrSessionId) {
    const sessionId = sessions.has(runIdOrSessionId) ? runIdOrSessionId : runToSession.get(runIdOrSessionId);
    if (!sessionId) {
        return false;
    }
    const session = sessions.get(sessionId);
    if (!session) {
        return false;
    }
    session.child.kill();
    if (session.runId) {
        runToSession.delete(session.runId);
    }
    sessions.delete(session.sessionId);
    return true;
}
async function readRunLog(runId) {
    const file = node_path_1.default.resolve(RUN_DIR, `${runId}.json`);
    try {
        const raw = await promises_1.default.readFile(file, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function getResourceStats() {
    const total = node_os_1.default.totalmem();
    const free = node_os_1.default.freemem();
    const ram = ((total - free) / total) * 100;
    const cpu = sampleCpuPercent();
    netDownKbps = netDownKbps * 0.8;
    netUpKbps = netUpKbps * 0.8;
    return {
        cpu: Math.round(cpu * 10) / 10,
        ram: Math.round(ram * 10) / 10,
        netDown: Math.round(netDownKbps * 10) / 10,
        netUp: Math.round(netUpKbps * 10) / 10
    };
}
function splitStreamLines(remainder, chunk) {
    const buffer = `${remainder}${chunk}`;
    const rawLines = buffer.split(/\r?\n/);
    const nextRemainder = rawLines.pop() ?? "";
    const lines = rawLines.map((line) => line.trim()).filter(Boolean);
    return { lines, remainder: nextRemainder };
}
function normalizeTriggerProfile(input) {
    const base = {
        ...input,
        id: input.id || node_crypto_1.default.randomUUID(),
        name: input.name.trim() || "Unnamed Trigger",
        request: input.request.trim()
    };
    if (!base.request) {
        throw new Error("Trigger request cannot be empty.");
    }
    if (base.mode === "interval") {
        if (!Number.isFinite(base.intervalMs) || base.intervalMs < 1000) {
            throw new Error("Interval trigger requires intervalMs >= 1000.");
        }
        if (!Number.isFinite(base.maxRuns) || base.maxRuns < 0) {
            throw new Error("Interval trigger maxRuns must be >= 0.");
        }
        return base;
    }
    if (!base.watchPath.trim()) {
        throw new Error("Watch trigger requires a watchPath.");
    }
    const normalizedWatchPath = node_path_1.default.isAbsolute(base.watchPath)
        ? node_path_1.default.normalize(base.watchPath)
        : node_path_1.default.normalize(node_path_1.default.resolve(PROJECT_ROOT, base.watchPath));
    if (!node_fs_1.default.existsSync(normalizedWatchPath)) {
        throw new Error(`Watch path does not exist: ${normalizedWatchPath}`);
    }
    if (!Number.isFinite(base.debounceMs) || base.debounceMs < 100) {
        throw new Error("Watch trigger debounceMs must be >= 100.");
    }
    if (!Number.isFinite(base.maxRuns) || base.maxRuns < 0) {
        throw new Error("Watch trigger maxRuns must be >= 0.");
    }
    return {
        ...base,
        watchPath: normalizedWatchPath
    };
}
function buildTriggerArgs(profile) {
    const args = [TRIGGER_CLI_ENTRY, profile.mode, "--request", profile.request];
    if (profile.execute) {
        args.push("--execute");
    }
    if (profile.mode === "interval") {
        args.push("--interval-ms", String(Math.round(profile.intervalMs)));
        if (profile.maxRuns > 0) {
            args.push("--max-runs", String(Math.round(profile.maxRuns)));
        }
        return args;
    }
    args.push("--path", profile.watchPath, "--debounce-ms", String(Math.round(profile.debounceMs)));
    if (!profile.recursiveWatch) {
        args.push("--non-recursive");
    }
    if (profile.maxRuns > 0) {
        args.push("--max-runs", String(Math.round(profile.maxRuns)));
    }
    return args;
}
async function upsertTriggerProfile(profile) {
    const normalized = normalizeTriggerProfile(profile);
    const existing = await getTriggerProfiles();
    const index = existing.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
        existing[index] = normalized;
    }
    else {
        existing.push(normalized);
    }
    return saveTriggerProfiles(existing);
}
async function removeTriggerProfile(profileId) {
    const existing = await getTriggerProfiles();
    const next = existing.filter((item) => item.id !== profileId);
    if (triggerSessions.has(profileId)) {
        stopTrigger(profileId);
    }
    return saveTriggerProfiles(next);
}
function listRunningTriggers() {
    return [...triggerSessions.values()].map((session) => session.runtime);
}
async function startTrigger(profileId) {
    if (triggerSessions.has(profileId)) {
        return triggerSessions.get(profileId).runtime;
    }
    ensureTriggerCliBuilt();
    const profiles = await getTriggerProfiles();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
        throw new Error(`Trigger profile not found: ${profileId}`);
    }
    const args = buildTriggerArgs(profile);
    const child = (0, node_child_process_1.spawn)(process.execPath, args, {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        env: buildCliEnv(),
        stdio: ["ignore", "pipe", "pipe"]
    });
    const runtime = {
        profileId: profile.id,
        name: profile.name,
        mode: profile.mode,
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        status: "running"
    };
    const session = {
        runtime,
        child,
        stdoutRemainder: "",
        stderrRemainder: ""
    };
    triggerSessions.set(profile.id, session);
    broadcastTriggerEvent({
        kind: "state",
        ts: new Date().toISOString(),
        profileId: profile.id,
        status: "running",
        pid: runtime.pid,
        message: `Trigger started (${profile.mode})`
    });
    child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        trackNetworkDown(Buffer.byteLength(chunk));
        const parsed = splitStreamLines(session.stdoutRemainder, text);
        session.stdoutRemainder = parsed.remainder;
        for (const line of parsed.lines) {
            broadcastTriggerEvent({
                kind: "line",
                ts: new Date().toISOString(),
                profileId: profile.id,
                stream: "stdout",
                line
            });
        }
    });
    child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        const parsed = splitStreamLines(session.stderrRemainder, text);
        session.stderrRemainder = parsed.remainder;
        for (const line of parsed.lines) {
            broadcastTriggerEvent({
                kind: "line",
                ts: new Date().toISOString(),
                profileId: profile.id,
                stream: "stderr",
                line
            });
        }
    });
    child.on("close", (code) => {
        const exitCode = code ?? null;
        session.runtime = {
            ...session.runtime,
            status: exitCode === 0 ? "stopped" : "error",
            exitCode,
            pid: null
        };
        broadcastTriggerEvent({
            kind: "state",
            ts: new Date().toISOString(),
            profileId: profile.id,
            status: session.runtime.status,
            pid: null,
            exitCode,
            message: `Trigger exited with code ${exitCode}`
        });
        triggerSessions.delete(profile.id);
    });
    return runtime;
}
function stopTrigger(profileId) {
    const running = triggerSessions.get(profileId);
    if (!running) {
        return false;
    }
    running.child.kill();
    return true;
}
async function installScheduledTask(options) {
    ensureTriggerCliBuilt();
    const args = [
        TRIGGER_CLI_ENTRY,
        "install-task",
        "--task-name",
        options.taskName,
        "--schedule",
        options.schedule,
        "--request",
        options.request,
        "--modifier",
        String(options.modifier),
        "--start-time",
        options.startTime
    ];
    if (options.days.length > 0) {
        args.push("--days", options.days.join(","));
    }
    if (options.execute) {
        args.push("--execute");
    }
    if (options.force) {
        args.push("--force");
    }
    if (options.dryRun) {
        args.push("--dry-run");
    }
    const child = (0, node_child_process_1.spawn)(process.execPath, args, {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        env: buildCliEnv(),
        stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const exitCode = await new Promise((resolve, reject) => {
        child.stdout.on("data", (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", reject);
        child.on("close", (code) => {
            resolve(code ?? 1);
        });
    });
    return {
        ok: exitCode === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode
    };
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1480,
        height: 920,
        minWidth: 1200,
        minHeight: 720,
        backgroundColor: "#050907",
        autoHideMenuBar: true,
        webPreferences: {
            preload: node_path_1.default.resolve(__dirname, "..", "preload", "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    void mainWindow.loadFile(RENDERER_INDEX);
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
function shutdownTriggerSessions() {
    for (const session of triggerSessions.values()) {
        session.child.kill();
    }
    triggerSessions.clear();
}
function registerIpc() {
    electron_1.ipcMain.handle("pilot:preview", async (_event, request, options) => {
        return runPilotPreview(request, options?.sessionId);
    });
    electron_1.ipcMain.handle("pilot:execute", async (_event, options) => {
        return startPilotExecution(options);
    });
    electron_1.ipcMain.handle("pilot:abort", async (_event, runIdOrSessionId) => {
        return abortExecution(runIdOrSessionId);
    });
    electron_1.ipcMain.handle("pilot:getRun", async (_event, runId) => {
        return readRunLog(runId);
    });
    electron_1.ipcMain.handle("ui:getPreferences", async () => getPreferences());
    electron_1.ipcMain.handle("ui:setPreferences", async (_event, next) => setPreferences(next));
    electron_1.ipcMain.handle("ui:getResourceStats", async () => getResourceStats());
    electron_1.ipcMain.handle("trigger:listProfiles", async () => getTriggerProfiles());
    electron_1.ipcMain.handle("trigger:saveProfile", async (_event, profile) => upsertTriggerProfile(profile));
    electron_1.ipcMain.handle("trigger:deleteProfile", async (_event, profileId) => removeTriggerProfile(profileId));
    electron_1.ipcMain.handle("trigger:start", async (_event, profileId) => startTrigger(profileId));
    electron_1.ipcMain.handle("trigger:stop", async (_event, profileId) => stopTrigger(profileId));
    electron_1.ipcMain.handle("trigger:listRunning", async () => listRunningTriggers());
    electron_1.ipcMain.handle("trigger:installTask", async (_event, options) => installScheduledTask(options));
}
electron_1.app.whenReady().then(() => {
    registerIpc();
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    shutdownTriggerSessions();
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
