# SOP: Trigger Local Runtime

Last updated: 2026-03-03

## Goal
Provide deterministic local trigger modes for System Pilot execution and predictable Windows-first deployment packaging.

## Inputs
- Trigger mode (`interval` | `watch` | `install-task`)
- Request template string (maps to router-supported deterministic grammar)
- Trigger options:
  - `interval_ms`, `max_runs`
  - `watch_path`, `debounce_ms`
  - Windows task fields (`task_name`, `schedule`, `time`, `days`, `interval_minutes`)
- Execution mode (`preview` or `execute`)

## Rules
- Trigger runtime must call existing Router + Runner flow; no alternate execution path.
- Only one run executes at a time per trigger process (serialized queue).
- Watch mode must debounce duplicate filesystem events.
- Trigger runs must always emit run IDs and final status to stdout.
- Windows task registration must use explicit `schtasks` command arguments (no shell string guessing).
- If task registration command fails, return non-zero and print exact stderr.

## Interval Mode
1. Validate interval settings.
2. Start timer loop.
3. On each tick:
   - Skip if a run is already in progress.
   - Execute request via shared run path.
4. Stop when `max_runs` reached (if provided).

## Watch Mode
1. Validate watch path exists.
2. Start filesystem watcher.
3. On event:
   - Normalize event payload.
   - Debounce burst events.
   - Materialize request template placeholders:
     - `{{event_path}}`, `{{event_name}}`, `{{event_type}}`
4. Execute materialized request via shared run path.

## Windows Task Scheduler Mode
1. Build deterministic `schtasks /Create` argument array.
2. Register task targeting `npm run pilot -- "<request>" [--execute]`.
3. Optionally support update/overwrite with `/F`.
4. Return registered task name and command preview.

## Outputs
- Trigger console events with timestamps and run IDs.
- Standard run logs in `.tmp/runs/*.json`.
- For `install-task`: confirmation payload with task name and generated command.

## Failure Policy
- Invalid trigger args: fail fast before watcher/timer startup.
- Run failure: continue trigger process unless fatal mode initialization failed.
- Watcher errors: log and continue if recoverable; otherwise exit non-zero.
- Scheduler registration failure: fail immediately with actionable message.
