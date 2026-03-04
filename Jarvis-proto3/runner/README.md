# Runner Layer

Implementation lives in `src/runner/` and `src/tools/`.

Current modules:
- `src/runner/runner.ts`
  - Validates plans.
  - Enforces approvals/dry-run behavior.
  - Executes deterministic actions via tool handlers.
  - Persists run logs under `.tmp/runs/`.
- `src/tools/`
  - `fs.*`, `process.start`, `shell.run`, `browser.*` handlers.

