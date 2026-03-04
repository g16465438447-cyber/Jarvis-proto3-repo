import path from "node:path";
import { Action, ActionType, Plan, PolicyConfig, RiskLevel } from "../types";
import { newId, nowUtcIso, toAbsolutePath } from "../utils";
import { validatePlan } from "../validation/schemas";

export interface RouterOptions {
  dryRun: boolean;
}

const SUPPORTED_TEMPLATES = [
  "list <path>",
  "search <path> <pattern>",
  "move <src> <dest>",
  "rename <path> <new_name>",
  "start <command> [args...]",
  "shell <command> [args...]",
  "browser open <url>"
];

export class RouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterError";
  }
}

export function buildPlan(goal: string, policy: PolicyConfig, options: RouterOptions): Plan {
  const normalizedGoal = goal.trim();
  if (!normalizedGoal) {
    throw new RouterError("Request is empty. Provide one supported command template.");
  }

  const actions = routeGoalToActions(normalizedGoal, policy);
  const plan: Plan = {
    plan_id: newId(),
    run_id: newId(),
    goal: normalizedGoal,
    created_at_utc: nowUtcIso(),
    dry_run: options.dryRun,
    actions,
    policy_snapshot: {
      allowed_paths: policy.allowed_paths,
      allowed_apps: policy.allowed_apps,
      allowed_shell_commands: policy.allowed_shell_commands
    }
  };

  const validation = validatePlan(plan);
  if (!validation.ok) {
    throw new RouterError(`Generated plan failed schema validation: ${validation.errors.join("; ")}`);
  }
  return plan;
}

function routeGoalToActions(goal: string, policy: PolicyConfig): Action[] {
  const steps = splitGoalIntoTokenSteps(goal);
  if (steps.length === 0) {
    throw unsupportedIntentError();
  }
  return steps.map((tokens, index) => routeStepToAction(tokens, policy, index));
}

function routeStepToAction(tokens: string[], policy: PolicyConfig, index: number): Action {
  if (tokens.length === 0) {
    throw unsupportedIntentError(`step ${index + 1}`);
  }

  const head = tokens[0].toLowerCase();
  if (head === "list" && tokens.length >= 2) {
    const targetPath = tokens.slice(1).join(" ");
    return buildAction("fs.list", { path: targetPath, recursive: false }, policy, "List files in target path.");
  }

  if (head === "search" && tokens.length >= 3) {
    const targetPath = tokens[1];
    const pattern = tokens.slice(2).join(" ");
    return buildAction("fs.search", { path: targetPath, pattern, recursive: true }, policy, "Search files by name pattern.");
  }

  if (head === "move" && tokens.length === 3) {
    const source = tokens[1];
    const destination = tokens[2];
    return buildAction("fs.move", { source, destination }, policy, "Move file or folder to destination.");
  }

  if (head === "rename" && tokens.length === 3) {
    const targetPath = tokens[1];
    const newName = tokens[2];
    return buildAction("fs.rename", { path: targetPath, new_name: newName }, policy, "Rename file or folder.");
  }

  if (head === "start" && tokens.length >= 2) {
    const command = tokens[1];
    const args = tokens.slice(2);
    return buildAction("process.start", { command, args }, policy, "Start process.");
  }

  if (head === "shell" && tokens.length >= 2) {
    const command = tokens[1];
    const args = tokens.slice(2);
    return buildAction("shell.run", { command, args }, policy, "Execute allowlisted PowerShell command.");
  }

  if (head === "browser" && tokens.length >= 3 && tokens[1].toLowerCase() === "open") {
    const url = tokens[2];
    return buildAction(
      "browser.open",
      {
        session_id: "default",
        url
      },
      policy,
      "Open browser session at target URL."
    );
  }

  throw unsupportedIntentError(`step ${index + 1}: "${tokens.join(" ")}"`);
}

function unsupportedIntentError(context?: string): RouterError {
  const prefix = context ? `Unsupported request template in ${context}.` : "Unsupported request template.";
  return new RouterError(`${prefix} Supported templates: ${SUPPORTED_TEMPLATES.map((item) => `"${item}"`).join(", ")}`);
}

interface ParsedToken {
  value: string;
  quoted: boolean;
}

function splitGoalIntoTokenSteps(goal: string): string[][] {
  const tokens = tokenizeWithQuotes(goal);
  const steps: string[][] = [];
  let current: string[] = [];

  const flushCurrent = () => {
    if (current.length > 0) {
      steps.push(current);
      current = [];
    }
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.value.toLowerCase();
    const next = tokens[i + 1];

    const isSemicolon = !token.quoted && token.value === ";";
    const isThen = !token.quoted && lower === "then";
    const isAndThen = !token.quoted && lower === "and" && next && !next.quoted && next.value.toLowerCase() === "then";

    if (isSemicolon || isThen || isAndThen) {
      flushCurrent();
      if (isAndThen) {
        i += 1;
      }
      continue;
    }

    current.push(token.value);
  }
  flushCurrent();
  return steps;
}

function tokenizeWithQuotes(input: string): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  let current = "";
  let inQuotes = false;
  let currentQuoted = false;

  const pushToken = () => {
    if (!current) {
      return;
    }
    tokens.push({ value: current, quoted: currentQuoted });
    current = "";
    currentQuoted = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === "\"") {
      inQuotes = !inQuotes;
      if (inQuotes) {
        currentQuoted = true;
      }
      continue;
    }
    if (!inQuotes && ch === ";") {
      pushToken();
      tokens.push({ value: ";", quoted: false });
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      pushToken();
      continue;
    }
    current += ch;
  }
  pushToken();
  return tokens;
}

function classifyRisk(type: ActionType, args: Record<string, unknown>, policy: PolicyConfig): RiskLevel {
  if (policy.high_risk_actions.includes(type)) {
    return "high";
  }
  if (type === "shell.run") {
    const command = String(args.command ?? "");
    const key = `shell.run:${command}`;
    if (policy.high_risk_actions.some((entry) => entry.toLowerCase() === key.toLowerCase())) {
      return "high";
    }
    return "medium";
  }
  if (type.startsWith("browser.") || type.startsWith("process.")) {
    return "medium";
  }
  return "low";
}

function buildRollback(type: ActionType, args: Record<string, unknown>): { type: string; args: Record<string, unknown> } | null {
  if (type === "fs.move") {
    return {
      type: "fs.move",
      args: {
        source: args.destination,
        destination: args.source
      }
    };
  }
  if (type === "fs.rename") {
    const originalPath = String(args.path ?? "");
    const nextName = String(args.new_name ?? "");
    if (!originalPath || !nextName) {
      return null;
    }
    const parent = path.dirname(originalPath);
    const originalName = path.basename(originalPath);
    const renamedPath = path.join(parent, nextName);
    return {
      type: "fs.rename",
      args: {
        path: renamedPath,
        new_name: originalName
      }
    };
  }
  return null;
}

function buildAction(
  type: ActionType,
  args: Record<string, unknown>,
  policy: PolicyConfig,
  expectedOutput: string
): Action {
  const normalizedArgs = normalizeActionArgs(type, args);
  const risk = classifyRisk(type, normalizedArgs, policy);
  return {
    action_id: newId(),
    type,
    args: normalizedArgs,
    risk,
    requires_approval: risk === "high",
    expected_output: expectedOutput,
    rollback: buildRollback(type, normalizedArgs),
    timeout_ms: 120000,
    retries: 1,
    on_failure: "halt"
  };
}

function normalizeActionArgs(type: ActionType, args: Record<string, unknown>): Record<string, unknown> {
  if (type.startsWith("fs.")) {
    const normalized: Record<string, unknown> = { ...args };
    if (typeof normalized.path === "string") {
      normalized.path = toAbsolutePath(normalized.path, process.cwd());
    }
    if (typeof normalized.source === "string") {
      normalized.source = toAbsolutePath(normalized.source, process.cwd());
    }
    if (typeof normalized.destination === "string") {
      normalized.destination = toAbsolutePath(normalized.destination, process.cwd());
    }
    return normalized;
  }
  return args;
}
