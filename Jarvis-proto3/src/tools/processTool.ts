import path from "node:path";
import { spawn } from "node:child_process";
import { ToolContext, ToolResult } from "../types";
import { isAppAllowed } from "../policy/loadPolicy";

export async function processStart(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const command = String(args.command ?? "");
  const rawArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)) : [];
  const cwd = typeof args.cwd === "string" ? args.cwd : ctx.projectRoot;

  if (!command) {
    throw new Error("process.start requires args.command");
  }
  if (!isAppAllowed(path.basename(command), ctx.policy)) {
    throw new Error(`Application is not allowlisted: ${command}`);
  }

  const child = spawn(command, rawArgs, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  child.unref();

  return {
    stdout: `Started process ${command} (pid=${child.pid ?? "unknown"})`,
    data: { pid: child.pid ?? null }
  };
}

