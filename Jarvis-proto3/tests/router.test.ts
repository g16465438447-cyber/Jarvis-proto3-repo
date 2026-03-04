import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildPlan, RouterError } from "../src/router/router";
import { makePolicy } from "./helpers";

describe("router", () => {
  test("builds fs.list plan with normalized absolute path", () => {
    const policy = makePolicy();
    const plan = buildPlan("list .tmp", policy, { dryRun: true });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe("fs.list");
    expect(plan.actions[0].risk).toBe("low");
    expect(plan.actions[0].requires_approval).toBe(false);
    expect(plan.actions[0].args.path).toBe(path.resolve(process.cwd(), ".tmp"));
  });

  test("builds ordered multi-step actions with 'then' delimiter", () => {
    const policy = makePolicy();
    const plan = buildPlan("list .tmp then search .tmp report", policy, { dryRun: true });
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].type).toBe("fs.list");
    expect(plan.actions[1].type).toBe("fs.search");
    expect(plan.actions[1].args.pattern).toBe("report");
  });

  test("builds ordered multi-step actions with ';' delimiter", () => {
    const policy = makePolicy();
    const plan = buildPlan("list .tmp; shell Get-Date -Format o", policy, { dryRun: true });
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].type).toBe("fs.list");
    expect(plan.actions[1].type).toBe("shell.run");
  });

  test("preserves quoted tokens during multi-step parsing", () => {
    const policy = makePolicy();
    const plan = buildPlan('search .tmp "annual report" then list .tmp', policy, { dryRun: true });
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].type).toBe("fs.search");
    expect(plan.actions[0].args.pattern).toBe("annual report");
  });

  test("marks configured high-risk shell command as approval-required", () => {
    const policy = makePolicy({
      high_risk_actions: ["shell.run:Get-Date"]
    });
    const plan = buildPlan("shell Get-Date -Format o", policy, { dryRun: false });
    expect(plan.actions[0].type).toBe("shell.run");
    expect(plan.actions[0].risk).toBe("high");
    expect(plan.actions[0].requires_approval).toBe(true);
  });

  test("throws on unsupported request template", () => {
    const policy = makePolicy();
    expect(() => buildPlan("do everything automatically", policy, { dryRun: true })).toThrow(RouterError);
  });

  test("throws when any step in multi-step request is unsupported", () => {
    const policy = makePolicy();
    expect(() => buildPlan("list .tmp then teleport now", policy, { dryRun: true })).toThrow(RouterError);
  });

  test("creates rollback for fs.move actions", () => {
    const policy = makePolicy();
    const plan = buildPlan("move .tmp\\a.txt .tmp\\b.txt", policy, { dryRun: true });
    expect(plan.actions[0].rollback).toEqual({
      type: "fs.move",
      args: {
        source: path.resolve(process.cwd(), ".tmp\\b.txt"),
        destination: path.resolve(process.cwd(), ".tmp\\a.txt")
      }
    });
  });
});
