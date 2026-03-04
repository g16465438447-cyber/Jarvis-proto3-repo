import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const TSX_CLI = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const PILOT_ENTRY = path.resolve(process.cwd(), "src", "cli", "pilot.ts");

describe("pilot CLI stream mode regression", () => {
  test(
    "non-stream --json mode returns a single JSON object",
    async () => {
      const { stdout } = await execFileAsync(process.execPath, [TSX_CLI, PILOT_ENTRY, "list .tmp", "--json"], {
        cwd: process.cwd()
      });
      const parsed = JSON.parse(stdout);
      expect(parsed.plan).toBeDefined();
      expect(parsed.runLog).toBeDefined();
      expect(parsed.plan.actions.length).toBeGreaterThan(0);
    },
    30000
  );

  test(
    "stream mode emits JSONL events including plan_ready and run_complete",
    async () => {
      const { stdout } = await execFileAsync(
        process.execPath,
        [TSX_CLI, PILOT_ENTRY, "list .tmp", "--stream-json", "--json", "--session-id", "test-session"],
        {
          cwd: process.cwd()
        }
      );
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const events = lines.map((line) => JSON.parse(line) as { kind: string });
      expect(events.some((event) => event.kind === "plan_ready")).toBe(true);
      expect(events.some((event) => event.kind === "run_complete")).toBe(true);
    },
    30000
  );
});

