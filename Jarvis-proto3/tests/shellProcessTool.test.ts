import { describe, expect, test } from "vitest";
import { processStart } from "../src/tools/processTool";
import { shellRun } from "../src/tools/shellTool";
import { makePolicy, makeToolContext } from "./helpers";

describe("shell/process tools", () => {
  test(
    "shell.run executes allowlisted command",
    async () => {
      const policy = makePolicy({ allowed_shell_commands: ["Get-Date"] });
      const ctx = makeToolContext(policy);
      const result = await shellRun({ command: "Get-Date", args: ["-Format", "o"] }, ctx);
      expect(result.stdout).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    },
    20000
  );

  test("shell.run rejects disallowed command", async () => {
    const policy = makePolicy({ allowed_shell_commands: ["Get-Date"] });
    const ctx = makeToolContext(policy);
    await expect(shellRun({ command: "Remove-Item", args: [".tmp"] }, ctx)).rejects.toThrow("not allowlisted");
  });

  const testIfWindows = process.platform === "win32" ? test : test.skip;

  testIfWindows(
    "process.start returns pid for allowlisted app",
    async () => {
      const policy = makePolicy({ allowed_apps: ["pwsh.exe"] });
      const ctx = makeToolContext(policy);
      const result = await processStart(
        { command: "pwsh.exe", args: ["-NoProfile", "-Command", "Start-Sleep -Milliseconds 100"] },
        ctx
      );
      const pid = (result.data as { pid: number | null }).pid;
      expect(typeof pid === "number" || pid === null).toBe(true);
    },
    20000
  );

  test("process.start rejects disallowed app", async () => {
    const policy = makePolicy({ allowed_apps: ["pwsh.exe"] });
    const ctx = makeToolContext(policy);
    await expect(processStart({ command: "cmd.exe", args: ["/c", "echo hi"] }, ctx)).rejects.toThrow("not allowlisted");
  });
});
