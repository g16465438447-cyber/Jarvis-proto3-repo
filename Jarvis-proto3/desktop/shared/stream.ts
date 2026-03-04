import { StreamEvent } from "./types";

export interface StreamParseResult {
  events: StreamEvent[];
  remainder: string;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStreamEvent(value: unknown): value is StreamEvent {
  if (!isObject(value)) {
    return false;
  }
  const kind = value.kind;
  const runId = value.run_id;
  const ts = value.ts;
  return (
    typeof kind === "string" &&
    typeof runId === "string" &&
    typeof ts === "string" &&
    ["plan_ready", "action_event", "tool_output", "approval_needed", "run_complete", "run_error"].includes(kind)
  );
}

export function parseJsonLinesChunk(previousRemainder: string, chunk: string): StreamParseResult {
  const buffer = `${previousRemainder}${chunk}`;
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  const events: StreamEvent[] = [];
  const errors: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!isStreamEvent(parsed)) {
        errors.push(`Invalid stream event shape: ${line}`);
        continue;
      }
      events.push(parsed);
    } catch {
      errors.push(`Invalid JSON line: ${line}`);
    }
  }

  return { events, remainder, errors };
}

