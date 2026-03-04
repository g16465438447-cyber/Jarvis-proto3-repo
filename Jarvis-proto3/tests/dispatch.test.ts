import { describe, expect, test } from "vitest";
import { executeAction } from "../src/tools";
import { Action } from "../src/types";
import { makePolicy, makeToolContext } from "./helpers";

describe("tool dispatcher", () => {
  test("throws for not-implemented action types", async () => {
    const policy = makePolicy();
    const ctx = makeToolContext(policy);
    const action: Action = {
      action_id: "11111111-1111-1111-1111-111111111111",
      type: "process.stop",
      args: { pid: 1234 },
      risk: "medium",
      requires_approval: false,
      expected_output: "Stop process.",
      rollback: null,
      retries: 0,
      timeout_ms: 1000,
      on_failure: "halt"
    };

    await expect(executeAction(action, ctx)).rejects.toThrow("not implemented");
  });
});

