"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTriggerArgs = parseTriggerArgs;
exports.interpolateRequestTemplate = interpolateRequestTemplate;
exports.buildTaskInstallSpec = buildTaskInstallSpec;
const node_path_1 = __importDefault(require("node:path"));
const utils_1 = require("../utils");
const DEFAULTS = {
    request: "",
    execute: false,
    intervalMs: 60_000,
    maxRuns: 0,
    watchPath: "",
    debounceMs: 1200,
    recursiveWatch: true,
    taskName: "",
    schedule: "DAILY",
    modifier: 1,
    startTime: "09:00",
    days: ["MON"],
    force: false,
    dryRun: false
};
const SUPPORTED_SCHEDULES = ["MINUTE", "HOURLY", "DAILY", "WEEKLY", "ONCE", "ONLOGON", "ONSTART"];
const ALLOWED_WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
function parseTriggerArgs(argv, projectRoot) {
    const modeToken = argv[0]?.toLowerCase();
    if (!modeToken || !["interval", "watch", "install-task"].includes(modeToken)) {
        throw new Error("Usage: npm run pilot:trigger -- <interval|watch|install-task> --request \"...\" [--execute] [mode flags]");
    }
    const mode = modeToken;
    const parsed = {
        ...DEFAULTS,
        mode
    };
    for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith("--")) {
            throw new Error(`Unexpected argument: ${token}`);
        }
        const nextValue = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith("--")) {
                throw new Error(`Missing value for ${token}`);
            }
            i += 1;
            return value;
        };
        switch (token) {
            case "--request":
                parsed.request = nextValue();
                break;
            case "--execute":
                parsed.execute = true;
                break;
            case "--interval-ms":
                parsed.intervalMs = parsePositiveInt(nextValue(), "--interval-ms");
                break;
            case "--max-runs":
                parsed.maxRuns = parseNonNegativeInt(nextValue(), "--max-runs");
                break;
            case "--path":
                parsed.watchPath = (0, utils_1.toAbsolutePath)(nextValue(), projectRoot);
                break;
            case "--debounce-ms":
                parsed.debounceMs = parsePositiveInt(nextValue(), "--debounce-ms");
                break;
            case "--non-recursive":
                parsed.recursiveWatch = false;
                break;
            case "--task-name":
                parsed.taskName = nextValue();
                break;
            case "--schedule":
                parsed.schedule = normalizeSchedule(nextValue());
                break;
            case "--modifier":
                parsed.modifier = parsePositiveInt(nextValue(), "--modifier");
                break;
            case "--start-time":
                parsed.startTime = validateTime(nextValue());
                break;
            case "--days":
                parsed.days = parseDays(nextValue());
                break;
            case "--force":
                parsed.force = true;
                break;
            case "--dry-run":
                parsed.dryRun = true;
                break;
            default:
                throw new Error(`Unknown option: ${token}`);
        }
    }
    validateModeOptions(parsed);
    return parsed;
}
function interpolateRequestTemplate(template, event) {
    return template
        .replaceAll("{{event_path}}", event.eventPath)
        .replaceAll("{{event_name}}", event.eventName)
        .replaceAll("{{event_type}}", event.eventType);
}
function buildTaskInstallSpec(input) {
    const taskRunCommand = buildTaskRunCommand(input);
    const normalizedTaskName = input.taskName.startsWith("\\") ? input.taskName : `\\${input.taskName}`;
    const args = ["/Create", "/TN", normalizedTaskName, "/SC", input.schedule, "/TR", taskRunCommand];
    if (input.schedule === "MINUTE" || input.schedule === "HOURLY") {
        args.push("/MO", String(input.modifier));
    }
    if (input.schedule === "DAILY" || input.schedule === "WEEKLY" || input.schedule === "ONCE") {
        args.push("/ST", input.startTime);
    }
    if (input.schedule === "WEEKLY") {
        args.push("/D", input.days.join(","));
    }
    if (input.force) {
        args.push("/F");
    }
    return {
        executable: "schtasks",
        args,
        taskRunCommand
    };
}
function buildTaskRunCommand(input) {
    const projectRoot = escapePowerShellSingleQuoted(input.projectRoot);
    const nodeExecutable = escapePowerShellSingleQuoted(node_path_1.default.normalize(input.nodeExecutable));
    const pilotEntry = escapePowerShellSingleQuoted(node_path_1.default.normalize(input.pilotEntry));
    const request = escapePowerShellSingleQuoted(input.request);
    const executeFlag = input.execute ? " --execute" : "";
    const script = `& { Set-Location -LiteralPath '${projectRoot}'; & '${nodeExecutable}' '${pilotEntry}' '${request}'${executeFlag} }`;
    return `pwsh.exe -NoProfile -Command "${script}"`;
}
function escapePowerShellSingleQuoted(value) {
    return value.replace(/'/g, "''");
}
function validateModeOptions(options) {
    if (!options.request) {
        throw new Error("Missing required --request value.");
    }
    if (options.mode === "interval") {
        if (options.intervalMs < 1000) {
            throw new Error("--interval-ms must be >= 1000.");
        }
        return;
    }
    if (options.mode === "watch") {
        if (!options.watchPath) {
            throw new Error("Watch mode requires --path.");
        }
        return;
    }
    if (options.mode === "install-task") {
        if (!options.taskName) {
            throw new Error("install-task mode requires --task-name.");
        }
        if (!SUPPORTED_SCHEDULES.includes(options.schedule)) {
            throw new Error(`Unsupported schedule: ${options.schedule}`);
        }
        if (options.schedule === "WEEKLY" && options.days.length === 0) {
            throw new Error("WEEKLY schedule requires --days.");
        }
    }
}
function parsePositiveInt(raw, flag) {
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${flag} must be a positive integer.`);
    }
    return value;
}
function parseNonNegativeInt(raw, flag) {
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${flag} must be a non-negative integer.`);
    }
    return value;
}
function normalizeSchedule(raw) {
    const normalized = raw.toUpperCase();
    if (!SUPPORTED_SCHEDULES.includes(normalized)) {
        throw new Error(`Unsupported --schedule value: ${raw}`);
    }
    return normalized;
}
function validateTime(raw) {
    if (!/^\d{2}:\d{2}$/.test(raw)) {
        throw new Error("--start-time must use HH:mm format.");
    }
    const [hoursRaw, minutesRaw] = raw.split(":");
    const hours = Number.parseInt(hoursRaw, 10);
    const minutes = Number.parseInt(minutesRaw, 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error("--start-time is outside valid time range.");
    }
    return raw;
}
function parseDays(raw) {
    const parts = raw
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean);
    if (parts.length === 0) {
        return [];
    }
    for (const part of parts) {
        if (!ALLOWED_WEEKDAYS.includes(part)) {
            throw new Error(`Invalid weekday in --days: ${part}`);
        }
    }
    return parts;
}
