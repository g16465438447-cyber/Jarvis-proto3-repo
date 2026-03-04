# SOP: Operator Console UI (Phase 4 Stylize)

Last updated: 2026-03-03

## Goal
Provide a Windows-first desktop "Operator Console" UI that is text-first, status-rich, and safety-gated while integrating with deterministic runtime execution.

## Scope
- Electron + React desktop shell.
- Boot screen, top bar, console pane, right rail tabs, and bottom telemetry bar.
- Plan preview, approval queue, live execution stream, and run artifact inspection.
- Trigger management UI (profile save/edit, start/stop, task scheduler setup, runtime logs).
- Persisted UI preferences (rail width/collapse/tab, CRT toggle, console size).

## Runtime Integration Contract
1. UI requests plan preview from runtime.
2. Runtime returns schema-valid Plan JSON.
3. UI enforces approval decisions for risky actions.
4. UI starts execution with stream mode enabled.
5. Runtime emits line-delimited JSON events during execution.
6. UI reads final run log from `.tmp/runs/<run_id>.json`.

## Trigger UI Contract
1. UI stores trigger profiles through secure IPC.
2. Main process starts/stops trigger runtimes by spawning `pilot-trigger` with deterministic arguments.
3. Trigger stdout/stderr/state is streamed to renderer as `trigger:event`.
4. Task Scheduler setup is invoked from UI through deterministic `install-task` options.

## Stream Event Types
- `plan_ready`
- `action_event`
- `tool_output`
- `approval_needed`
- `run_complete`
- `run_error`

## Safety Rules
- High-risk actions must not execute without approval.
- Denied actions block execution for that request.
- Console/log views must preserve redaction behavior from runner output.

## UI Rules
- Monospace-first typography.
- Minimal chrome, low-radius corners, subtle accent glow only.
- Progress and status chips should prioritize clarity over decoration.

## Failure Policy
- If stream mode fails, UI falls back to polling `.tmp/runs` for completion artifacts.
- Any runtime process crash yields `run_error` entry and visible actionable error state.
