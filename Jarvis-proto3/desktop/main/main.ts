import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { parseJsonLinesChunk } from "../shared/stream";
import {
  ExecuteOptions,
  ResourceStats,
  StreamEvent,
  TriggerInstallTaskOptions,
  TriggerProfile,
  TriggerRuntimeEvent,
  TriggerRuntimeInfo,
  TriggerRuntimeResult,
  UiPreferences
} from "../shared/types";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const CLI_ENTRY = path.resolve(PROJECT_ROOT, "dist", "cli", "pilot.js");
const TRIGGER_CLI_ENTRY = path.resolve(PROJECT_ROOT, "dist", "cli", "pilot-trigger.js");
const RUN_DIR = path.resolve(PROJECT_ROOT, ".tmp", "runs");
const RENDERER_INDEX = path.resolve(__dirname, "..", "renderer", "index.html");
const PREVIEW_TIMEOUT_MS = 15_000;

const DEFAULT_PREFS: UiPreferences = {
  rightRailWidth: 420,
  rightRailCollapsed: false,
  activeTab: "plan",
  crtEnabled: false,
  consoleFontSize: 14
};

interface RunningSession {
  sessionId: string;
  request: string;
  child: ChildProcess;
  stdoutRemainder: string;
  runId?: string;
  completed: boolean;
}

interface RunningTriggerSession {
  runtime: TriggerRuntimeInfo;
  child: ChildProcess;
  stdoutRemainder: string;
  stderrRemainder: string;
}

let mainWindow: BrowserWindow | null = null;
const sessions = new Map<string, RunningSession>();
const runToSession = new Map<string, string>();
const triggerSessions = new Map<string, RunningTriggerSession>();

let cpuSnapshot = readCpuSnapshot();
let netDownKbps = 0;
let netUpKbps = 0;

function readCpuSnapshot(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

function sampleCpuPercent(): number {
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

async function getPreferencesPath(): Promise<string> {
  const dir = app.getPath("userData");
  await fs.mkdir(dir, { recursive: true });
  return path.resolve(dir, "operator-console-preferences.json");
}

async function getPreferences(): Promise<UiPreferences> {
  const file = await getPreferencesPath();
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

async function setPreferences(next: Partial<UiPreferences>): Promise<UiPreferences> {
  const file = await getPreferencesPath();
  const current = await getPreferences();
  const merged = { ...current, ...next };
  await fs.writeFile(file, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

async function getTriggerProfilesPath(): Promise<string> {
  const dir = app.getPath("userData");
  await fs.mkdir(dir, { recursive: true });
  return path.resolve(dir, "operator-console-triggers.json");
}

async function getTriggerProfiles(): Promise<TriggerProfile[]> {
  const file = await getTriggerProfilesPath();
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as TriggerProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveTriggerProfiles(next: TriggerProfile[]): Promise<TriggerProfile[]> {
  const file = await getTriggerProfilesPath();
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function broadcastStreamEvent(event: StreamEvent): void {
  mainWindow?.webContents.send("pilot:event", event);
}

function broadcastTriggerEvent(event: TriggerRuntimeEvent): void {
  mainWindow?.webContents.send("trigger:event", event);
}

function buildCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // When main process is Electron, child CLIs must run as pure Node for deterministic behavior.
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }
  return env;
}

function ensureCliBuilt(): void {
  if (!fssync.existsSync(CLI_ENTRY)) {
    throw new Error(
      `CLI build not found at ${CLI_ENTRY}. Run "npm run build" (or "npm run desktop:build") before starting desktop UI.`
    );
  }
}

function ensureTriggerCliBuilt(): void {
  if (!fssync.existsSync(TRIGGER_CLI_ENTRY)) {
    throw new Error(
      `Trigger CLI build not found at ${TRIGGER_CLI_ENTRY}. Run "npm run build" (or "npm run desktop:build") before using triggers.`
    );
  }
}

function trackNetworkDown(bytes: number): void {
  const kbps = (bytes / 1024) * 2;
  netDownKbps = Math.max(0, Math.min(999, netDownKbps * 0.6 + kbps * 0.4));
}

function trackNetworkUp(bytes: number): void {
  const kbps = (bytes / 1024) * 2;
  netUpKbps = Math.max(0, Math.min(999, netUpKbps * 0.6 + kbps * 0.4));
}

async function runPilotPreview(request: string, sessionId?: string): Promise<unknown> {
  ensureCliBuilt();
  const args = [CLI_ENTRY, request, "--json"];
  if (sessionId) {
    args.push("--session-id", sessionId);
  }
  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    env: buildCliEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
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
      } else {
        settle(() => reject(new Error(`Preview command failed (${code}): ${stderr || stdout}`)));
      }
    });
  });

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Preview JSON parse failed: ${stdout}`);
  }
}

function startPilotExecution(options: ExecuteOptions): { sessionId: string } {
  ensureCliBuilt();
  const args = [CLI_ENTRY, options.request, "--execute", "--stream-json", "--json", "--session-id", options.sessionId];
  if (options.approveHighRisk) {
    args.push("--approve-high-risk");
  }

  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    env: buildCliEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  trackNetworkUp(Buffer.byteLength(args.join(" ")));

  const session: RunningSession = {
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
    const parsed = parseJsonLinesChunk(session.stdoutRemainder, text);
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

function abortExecution(runIdOrSessionId: string): boolean {
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

async function readRunLog(runId: string): Promise<unknown | null> {
  const file = path.resolve(RUN_DIR, `${runId}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getResourceStats(): ResourceStats {
  const total = os.totalmem();
  const free = os.freemem();
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

function splitStreamLines(remainder: string, chunk: string): { lines: string[]; remainder: string } {
  const buffer = `${remainder}${chunk}`;
  const rawLines = buffer.split(/\r?\n/);
  const nextRemainder = rawLines.pop() ?? "";
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  return { lines, remainder: nextRemainder };
}

function normalizeTriggerProfile(input: TriggerProfile): TriggerProfile {
  const base = {
    ...input,
    id: input.id || crypto.randomUUID(),
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
  const normalizedWatchPath = path.isAbsolute(base.watchPath)
    ? path.normalize(base.watchPath)
    : path.normalize(path.resolve(PROJECT_ROOT, base.watchPath));
  if (!fssync.existsSync(normalizedWatchPath)) {
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

function buildTriggerArgs(profile: TriggerProfile): string[] {
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

async function upsertTriggerProfile(profile: TriggerProfile): Promise<TriggerProfile[]> {
  const normalized = normalizeTriggerProfile(profile);
  const existing = await getTriggerProfiles();
  const index = existing.findIndex((item) => item.id === normalized.id);
  if (index >= 0) {
    existing[index] = normalized;
  } else {
    existing.push(normalized);
  }
  return saveTriggerProfiles(existing);
}

async function removeTriggerProfile(profileId: string): Promise<TriggerProfile[]> {
  const existing = await getTriggerProfiles();
  const next = existing.filter((item) => item.id !== profileId);
  if (triggerSessions.has(profileId)) {
    stopTrigger(profileId);
  }
  return saveTriggerProfiles(next);
}

function listRunningTriggers(): TriggerRuntimeInfo[] {
  return [...triggerSessions.values()].map((session) => session.runtime);
}

async function startTrigger(profileId: string): Promise<TriggerRuntimeInfo> {
  if (triggerSessions.has(profileId)) {
    return triggerSessions.get(profileId)!.runtime;
  }
  ensureTriggerCliBuilt();
  const profiles = await getTriggerProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Trigger profile not found: ${profileId}`);
  }

  const args = buildTriggerArgs(profile);
  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    env: buildCliEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  const runtime: TriggerRuntimeInfo = {
    profileId: profile.id,
    name: profile.name,
    mode: profile.mode,
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    status: "running"
  };
  const session: RunningTriggerSession = {
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

function stopTrigger(profileId: string): boolean {
  const running = triggerSessions.get(profileId);
  if (!running) {
    return false;
  }
  running.child.kill();
  return true;
}

async function installScheduledTask(options: TriggerInstallTaskOptions): Promise<TriggerRuntimeResult> {
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

  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    env: buildCliEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  const exitCode = await new Promise<number>((resolve, reject) => {
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: "#050907",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  void mainWindow.loadFile(RENDERER_INDEX);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function shutdownTriggerSessions(): void {
  for (const session of triggerSessions.values()) {
    session.child.kill();
  }
  triggerSessions.clear();
}

function registerIpc(): void {
  ipcMain.handle("pilot:preview", async (_event, request: string, options?: { sessionId?: string }) => {
    return runPilotPreview(request, options?.sessionId);
  });
  ipcMain.handle("pilot:execute", async (_event, options: ExecuteOptions) => {
    return startPilotExecution(options);
  });
  ipcMain.handle("pilot:abort", async (_event, runIdOrSessionId: string) => {
    return abortExecution(runIdOrSessionId);
  });
  ipcMain.handle("pilot:getRun", async (_event, runId: string) => {
    return readRunLog(runId);
  });
  ipcMain.handle("ui:getPreferences", async () => getPreferences());
  ipcMain.handle("ui:setPreferences", async (_event, next: Partial<UiPreferences>) => setPreferences(next));
  ipcMain.handle("ui:getResourceStats", async () => getResourceStats());
  ipcMain.handle("trigger:listProfiles", async () => getTriggerProfiles());
  ipcMain.handle("trigger:saveProfile", async (_event, profile: TriggerProfile) => upsertTriggerProfile(profile));
  ipcMain.handle("trigger:deleteProfile", async (_event, profileId: string) => removeTriggerProfile(profileId));
  ipcMain.handle("trigger:start", async (_event, profileId: string) => startTrigger(profileId));
  ipcMain.handle("trigger:stop", async (_event, profileId: string) => stopTrigger(profileId));
  ipcMain.handle("trigger:listRunning", async () => listRunningTriggers());
  ipcMain.handle("trigger:installTask", async (_event, options: TriggerInstallTaskOptions) => installScheduledTask(options));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => {
  shutdownTriggerSessions();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
