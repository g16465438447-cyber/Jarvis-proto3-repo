import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildTaskInstallSpec, interpolateRequestTemplate, parseTriggerArgs } from "../src/cli/triggerCore";

describe("triggerCore", () => {
  test("parses interval mode options", () => {
    const parsed = parseTriggerArgs(
      ["interval", "--request", "list .tmp", "--interval-ms", "1500", "--max-runs", "2", "--execute"],
      process.cwd()
    );
    expect(parsed.mode).toBe("interval");
    expect(parsed.request).toBe("list .tmp");
    expect(parsed.intervalMs).toBe(1500);
    expect(parsed.maxRuns).toBe(2);
    expect(parsed.execute).toBe(true);
  });

  test("parses watch mode path as absolute", () => {
    const parsed = parseTriggerArgs(["watch", "--request", "list {{event_path}}", "--path", ".tmp"], process.cwd());
    expect(parsed.mode).toBe("watch");
    expect(path.isAbsolute(parsed.watchPath)).toBe(true);
  });

  test("interpolates watch event template placeholders", () => {
    const request = interpolateRequestTemplate("search .tmp {{event_name}} then list {{event_path}}", {
      eventPath: "D:\\Jarvis-proto3\\.tmp\\note.txt",
      eventName: "note.txt",
      eventType: "rename"
    });
    expect(request).toContain("note.txt");
    expect(request).toContain("D:\\Jarvis-proto3\\.tmp\\note.txt");
  });

  test("builds deterministic schtasks command args", () => {
    const spec = buildTaskInstallSpec({
      taskName: "SystemPilotDaily",
      schedule: "DAILY",
      request: "list .tmp",
      execute: true,
      projectRoot: "D:\\Jarvis-proto3",
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      pilotEntry: "D:\\Jarvis-proto3\\dist\\cli\\pilot.js",
      modifier: 1,
      startTime: "09:00",
      days: ["MON"],
      force: true
    });
    expect(spec.executable).toBe("schtasks");
    expect(spec.args).toContain("/TN");
    expect(spec.args).toContain("\\SystemPilotDaily");
    expect(spec.args).toContain("/SC");
    expect(spec.args).toContain("DAILY");
    expect(spec.args).toContain("/TR");
    expect(spec.args).toContain("/F");
    expect(spec.taskRunCommand).toContain("pilot.js");
    expect(spec.taskRunCommand).toContain("--execute");
  });
});
