import fs from "node:fs/promises";
import path from "node:path";
import { ToolContext, ToolResult } from "../types";
import { isPathAllowed } from "../policy/loadPolicy";

async function collectEntries(targetPath: string, recursive: boolean): Promise<string[]> {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    output.push(fullPath);
    if (recursive && entry.isDirectory()) {
      output.push(...(await collectEntries(fullPath, true)));
    }
  }
  return output;
}

function assertPathAllowed(targetPath: string, ctx: ToolContext): void {
  if (!isPathAllowed(targetPath, ctx.policy)) {
    throw new Error(`Path is outside allowlist: ${targetPath}`);
  }
}

export async function fsList(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const targetPath = String(args.path ?? "");
  const recursive = Boolean(args.recursive ?? false);
  if (!targetPath) {
    throw new Error("fs.list requires args.path");
  }
  assertPathAllowed(targetPath, ctx);
  const entries = await collectEntries(targetPath, recursive);
  return {
    stdout: entries.join("\n"),
    data: { count: entries.length, entries }
  };
}

export async function fsSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const targetPath = String(args.path ?? "");
  const pattern = String(args.pattern ?? "");
  const recursive = Boolean(args.recursive ?? true);
  if (!targetPath || !pattern) {
    throw new Error("fs.search requires args.path and args.pattern");
  }
  assertPathAllowed(targetPath, ctx);
  const entries = await collectEntries(targetPath, recursive);
  const normalizedPattern = pattern.toLowerCase();
  const matches = entries.filter((item) => path.basename(item).toLowerCase().includes(normalizedPattern));
  return {
    stdout: matches.join("\n"),
    data: { count: matches.length, matches }
  };
}

export async function fsMove(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const source = String(args.source ?? "");
  const destination = String(args.destination ?? "");
  if (!source || !destination) {
    throw new Error("fs.move requires args.source and args.destination");
  }
  assertPathAllowed(source, ctx);
  assertPathAllowed(destination, ctx);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(source, destination);
  return {
    stdout: `Moved ${source} -> ${destination}`,
    artifacts: [{ path: destination, description: "Moved file/folder", sha256: null }]
  };
}

export async function fsRename(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const targetPath = String(args.path ?? "");
  const newName = String(args.new_name ?? "");
  if (!targetPath || !newName) {
    throw new Error("fs.rename requires args.path and args.new_name");
  }
  assertPathAllowed(targetPath, ctx);
  const destination = path.join(path.dirname(targetPath), newName);
  assertPathAllowed(destination, ctx);
  await fs.rename(targetPath, destination);
  return {
    stdout: `Renamed ${targetPath} -> ${destination}`,
    artifacts: [{ path: destination, description: "Renamed file/folder", sha256: null }]
  };
}

