import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PolicyConfig, ToolContext } from "../src/types";

export function makePolicy(overrides?: Partial<PolicyConfig>): PolicyConfig {
  const base: PolicyConfig = {
    allowed_paths: [process.cwd(), path.resolve(process.cwd(), ".tmp")],
    allowed_apps: ["pwsh.exe", "notepad.exe", "code.exe"],
    allowed_shell_commands: ["Get-Date", "Get-ChildItem", "Test-Path", "Write-Output"],
    high_risk_actions: ["shell.run:Remove-Item", "fs.delete"]
  };
  return { ...base, ...(overrides ?? {}) };
}

export async function makeSandbox(prefix = "pilot-tests-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return root;
}

export async function cleanupSandbox(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
}

export function makeToolContext(policy: PolicyConfig, tempRoot?: string): ToolContext {
  return {
    policy,
    projectRoot: process.cwd(),
    tempRoot: tempRoot ?? path.resolve(process.cwd(), ".tmp")
  };
}

export function id(): string {
  return randomUUID();
}

