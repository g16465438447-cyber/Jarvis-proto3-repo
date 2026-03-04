import path from "node:path";
import { describe, expect, test } from "vitest";
import { isAppAllowed, isCommandAllowed, isPathAllowed } from "../src/policy/loadPolicy";
import { makePolicy } from "./helpers";

describe("policy checks", () => {
  test("allows descendants of allowed path and blocks siblings", () => {
    const allowedRoot = path.resolve(process.cwd(), ".tmp");
    const policy = makePolicy({ allowed_paths: [allowedRoot] });
    const child = path.join(allowedRoot, "folder", "file.txt");
    const siblingLike = `${allowedRoot}_other`;

    expect(isPathAllowed(child, policy)).toBe(true);
    expect(isPathAllowed(siblingLike, policy)).toBe(false);
  });

  test("checks shell command allowlist case-insensitively", () => {
    const policy = makePolicy({ allowed_shell_commands: ["Get-Date"] });
    expect(isCommandAllowed("get-date", policy)).toBe(true);
    expect(isCommandAllowed("Remove-Item", policy)).toBe(false);
  });

  test("checks app allowlist by basename", () => {
    const policy = makePolicy({ allowed_apps: ["pwsh.exe"] });
    expect(isAppAllowed("C:\\Program Files\\PowerShell\\7\\pwsh.exe", policy)).toBe(true);
    expect(isAppAllowed("cmd.exe", policy)).toBe(false);
  });

  test("supports wildcard path and app policies", () => {
    const policy = makePolicy({ allowed_paths: ["*"], allowed_apps: ["*"] });
    expect(isPathAllowed("C:\\Windows\\System32\\drivers\\etc\\hosts", policy)).toBe(true);
    expect(isAppAllowed("C:\\Windows\\System32\\cmd.exe", policy)).toBe(true);
  });

  test("supports wildcard shell command policy", () => {
    const policy = makePolicy({ allowed_shell_commands: ["*"] });
    expect(isCommandAllowed("Remove-Item", policy)).toBe(true);
    expect(isCommandAllowed("Invoke-WebRequest", policy)).toBe(true);
  });
});
