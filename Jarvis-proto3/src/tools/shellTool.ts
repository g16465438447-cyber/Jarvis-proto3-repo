import { spawn } from "node:child_process";
import { ToolContext, ToolResult } from "../types";
import { isCommandAllowed } from "../policy/loadPolicy";

function quoteArg(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

function renderArg(value: string): string {
  if (/^-[a-z0-9]/i.test(value)) {
    // Keep parameter switches unquoted so PowerShell binds named parameters correctly.
    return value;
  }
  return quoteArg(value);
}

export async function shellRun(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const command = String(args.command ?? "");
  const commandArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)) : [];
  if (!command) {
    throw new Error("shell.run requires args.command");
  }
  if (!isCommandAllowed(command, ctx.policy)) {
    throw new Error(`Shell command is not allowlisted: ${command}`);
  }

  const expression = `& ${command} ${commandArgs.map(renderArg).join(" ")}`.trim();
  const child = spawn("pwsh", ["-NoProfile", "-Command", expression], {
    cwd: ctx.projectRoot,
    windowsHide: true
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
      } else {
        reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
      }
    });
  });

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim()
  };
}
