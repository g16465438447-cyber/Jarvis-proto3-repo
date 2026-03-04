import { describe, expect, test } from "vitest";
import { parseJsonLinesChunk } from "../shared/stream";

describe("desktop stream parser", () => {
  test("parses valid JSONL events across chunk boundaries", () => {
    const first = parseJsonLinesChunk(
      "",
      '{"kind":"plan_ready","run_id":"r1","ts":"2026-01-01T00:00:00Z","payload":{"plan":{"actions":[]}}}\n{"kind":"action'
    );
    expect(first.events).toHaveLength(1);
    expect(first.remainder).toContain('{"kind":"action');

    const second = parseJsonLinesChunk(first.remainder, '_event","run_id":"r1","ts":"2026-01-01T00:00:01Z","payload":{"status":"planned","action_id":"a1"}}\n');
    expect(second.events).toHaveLength(1);
    expect(second.errors).toHaveLength(0);
    expect(second.remainder).toBe("");
  });

  test("captures invalid lines as errors and continues", () => {
    const parsed = parseJsonLinesChunk(
      "",
      '{"kind":"plan_ready","run_id":"r1","ts":"2026-01-01T00:00:00Z","payload":{"plan":{"actions":[]}}}\nnot-json\n{"kind":"unknown","run_id":"r1","ts":"x","payload":{}}\n'
    );
    expect(parsed.events).toHaveLength(1);
    expect(parsed.errors.length).toBeGreaterThanOrEqual(2);
  });
});

