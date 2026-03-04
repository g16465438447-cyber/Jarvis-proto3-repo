# Schema and Maintenance Law (`gemini.md`)

Last updated: 2026-03-03

## Status
- Schema state: `APPROVED_BLUEPRINT_V1`
- Coding state: `TOOLS_ALLOWED_AFTER_LINK_HANDSHAKE`

## Data Contract

### Plan Schema (Router Output)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "pilot.plan.schema.v1",
  "type": "object",
  "required": ["plan_id", "run_id", "goal", "created_at_utc", "dry_run", "actions"],
  "properties": {
    "plan_id": { "type": "string", "format": "uuid" },
    "run_id": { "type": "string", "format": "uuid" },
    "goal": { "type": "string", "minLength": 1 },
    "created_at_utc": { "type": "string", "format": "date-time" },
    "dry_run": { "type": "boolean" },
    "actions": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/action" }
    },
    "policy_snapshot": {
      "type": "object",
      "required": ["allowed_paths", "allowed_apps", "allowed_shell_commands"],
      "properties": {
        "allowed_paths": { "type": "array", "items": { "type": "string" } },
        "allowed_apps": { "type": "array", "items": { "type": "string" } },
        "allowed_shell_commands": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    }
  },
  "$defs": {
    "action": {
      "type": "object",
      "required": [
        "action_id",
        "type",
        "args",
        "risk",
        "requires_approval",
        "expected_output",
        "rollback"
      ],
      "properties": {
        "action_id": { "type": "string", "format": "uuid" },
        "type": {
          "type": "string",
          "enum": [
            "fs.list",
            "fs.search",
            "fs.move",
            "fs.rename",
            "process.start",
            "process.stop",
            "window.focus",
            "window.screenshot",
            "browser.open",
            "browser.click",
            "browser.type",
            "browser.download",
            "shell.run",
            "extract.text",
            "extract.table"
          ]
        },
        "args": { "type": "object" },
        "risk": { "type": "string", "enum": ["low", "medium", "high"] },
        "requires_approval": { "type": "boolean" },
        "expected_output": { "type": "string" },
        "rollback": {
          "type": ["object", "null"],
          "required": ["type", "args"],
          "properties": {
            "type": { "type": "string" },
            "args": { "type": "object" }
          },
          "additionalProperties": false
        },
        "timeout_ms": { "type": "integer", "minimum": 100, "maximum": 600000, "default": 120000 },
        "retries": { "type": "integer", "minimum": 0, "maximum": 3, "default": 1 },
        "on_failure": {
          "type": "string",
          "enum": ["halt", "skip", "retry_alternate"],
          "default": "halt"
        }
      },
      "additionalProperties": false
    }
  }
}
```

### Run Log Schema (Runner Output)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "pilot.runlog.schema.v1",
  "type": "object",
  "required": ["run_id", "goal", "plan", "events", "artifacts", "final_result"],
  "properties": {
    "run_id": { "type": "string", "format": "uuid" },
    "goal": { "type": "string", "minLength": 1 },
    "plan": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "pilot.plan.schema.v1#/$defs/action" }
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ts", "action_id", "status"],
        "properties": {
          "ts": { "type": "string", "format": "date-time" },
          "action_id": { "type": "string", "format": "uuid" },
          "status": {
            "type": "string",
            "enum": [
              "planned",
              "awaiting_approval",
              "in_progress",
              "ok",
              "fail",
              "retrying",
              "skipped",
              "rolled_back"
            ]
          },
          "attempt": { "type": "integer", "minimum": 1 },
          "stdout": { "type": "string" },
          "stderr": { "type": "string" },
          "error_code": { "type": ["string", "null"] },
          "redacted": { "type": "boolean", "default": false }
        },
        "additionalProperties": false
      }
    },
    "artifacts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "description"],
        "properties": {
          "path": { "type": "string" },
          "description": { "type": "string" },
          "sha256": { "type": ["string", "null"] }
        },
        "additionalProperties": false
      }
    },
    "repair_history": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ts", "action_id", "failure_signature", "patch", "outcome"],
        "properties": {
          "ts": { "type": "string", "format": "date-time" },
          "action_id": { "type": "string", "format": "uuid" },
          "failure_signature": { "type": "string" },
          "patch": { "type": "string" },
          "outcome": { "type": "string", "enum": ["resolved", "unresolved"] }
        },
        "additionalProperties": false
      }
    },
    "final_result": {
      "type": "object",
      "required": ["status", "summary"],
      "properties": {
        "status": { "type": "string", "enum": ["ok", "partial", "failed"] },
        "summary": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### Approval Request Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "pilot.approval.schema.v1",
  "type": "object",
  "required": ["run_id", "action_id", "risk", "reason", "requested_at_utc"],
  "properties": {
    "run_id": { "type": "string", "format": "uuid" },
    "action_id": { "type": "string", "format": "uuid" },
    "risk": { "type": "string", "enum": ["medium", "high"] },
    "reason": { "type": "string" },
    "requested_at_utc": { "type": "string", "format": "date-time" },
    "approved": { "type": ["boolean", "null"] },
    "approved_by": { "type": ["string", "null"] },
    "approved_at_utc": { "type": ["string", "null"], "format": "date-time" }
  },
  "additionalProperties": false
}
```

## Payload Delivery Contract
- Primary destination: local desktop UI activity timeline.
- Secondary destination: CLI structured output summary.
- Artifact destination: local filesystem paths under approved workspace roots.

## Deterministic Rules Bound to Schema
- Router may only emit actions from the approved `type` enum.
- Runner must reject plans that fail schema validation.
- Any `risk=high` action must have `requires_approval=true`.
- Redaction must be applied before persisting `stdout`/`stderr` when secrets are detected.

## Maintenance Log
- 2026-03-03: File initialized with draft schema placeholders. Awaiting Blueprint answers.
- 2026-03-03: Blueprint answers ingested; schema upgraded to `APPROVED_BLUEPRINT_V1`.
- 2026-03-03: Link architecture established with deterministic handshake SOP + connection matrix; schema unchanged.
- 2026-03-03: Architect scaffolding added (router/runner/tool adapters + runtime schema validation); schema files mirrored under `schemas/`.
- 2026-03-03: Router architecture extended to deterministic multi-step plan generation (`then`/`and then`/`;`) with quote-aware decomposition; schema unchanged.
- 2026-03-03: Stylize phase implementation added Electron + React Operator Console and runtime stream event transport; schema unchanged.
- 2026-03-03: Trigger phase implementation added deterministic local trigger modes (`interval`, `watch`, `install-task`) and Windows installer packaging pipeline (`electron-builder`); schema unchanged.
- 2026-03-03: Operator Console trigger-management UI added (profile lifecycle, start/stop runtimes, task scheduler setup, trigger event stream over secure IPC); schema unchanged.
