import fs from "node:fs";
import path from "node:path";
import { PolicyConfig } from "../types";
import { expandPathTemplate } from "../utils";

const POLICY_PATH = path.resolve(process.cwd(), "config", "policy.json");

export function loadPolicy(projectRoot: string): PolicyConfig {
  const raw = fs.readFileSync(POLICY_PATH, "utf-8");
  const parsed = JSON.parse(raw) as PolicyConfig;
  return {
    ...parsed,
    allowed_paths: parsed.allowed_paths.map((value) => path.normalize(expandPathTemplate(value, projectRoot)))
  };
}

export function isPathAllowed(targetPath: string, policy: PolicyConfig): boolean {
  if (policy.allowed_paths.includes("*")) {
    return true;
  }
  const normalizedTarget = path.normalize(targetPath).toLowerCase();
  return policy.allowed_paths.some((allowed) => {
    const normalizedAllowed = path.normalize(allowed).toLowerCase();
    return normalizedTarget === normalizedAllowed || normalizedTarget.startsWith(`${normalizedAllowed}${path.sep}`);
  });
}

export function isCommandAllowed(command: string, policy: PolicyConfig): boolean {
  if (policy.allowed_shell_commands.includes("*")) {
    return true;
  }
  return policy.allowed_shell_commands.some((allowed) => allowed.toLowerCase() === command.toLowerCase());
}

export function isAppAllowed(command: string, policy: PolicyConfig): boolean {
  if (policy.allowed_apps.includes("*")) {
    return true;
  }
  const normalized = path.basename(command).toLowerCase();
  return policy.allowed_apps.some((allowed) => allowed.toLowerCase() === normalized);
}
