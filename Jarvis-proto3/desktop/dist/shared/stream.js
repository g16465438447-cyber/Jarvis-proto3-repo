"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonLinesChunk = parseJsonLinesChunk;
function isObject(value) {
    return typeof value === "object" && value !== null;
}
function isStreamEvent(value) {
    if (!isObject(value)) {
        return false;
    }
    const kind = value.kind;
    const runId = value.run_id;
    const ts = value.ts;
    return (typeof kind === "string" &&
        typeof runId === "string" &&
        typeof ts === "string" &&
        ["plan_ready", "action_event", "tool_output", "approval_needed", "run_complete", "run_error"].includes(kind));
}
function parseJsonLinesChunk(previousRemainder, chunk) {
    const buffer = `${previousRemainder}${chunk}`;
    const lines = buffer.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    const events = [];
    const errors = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        try {
            const parsed = JSON.parse(line);
            if (!isStreamEvent(parsed)) {
                errors.push(`Invalid stream event shape: ${line}`);
                continue;
            }
            events.push(parsed);
        }
        catch {
            errors.push(`Invalid JSON line: ${line}`);
        }
    }
    return { events, remainder, errors };
}
