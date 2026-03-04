# SOP: Deterministic Tool Contracts

Last updated: 2026-03-03

## Goal
Define deterministic, atomic tool behavior and argument contracts.

## Tool Namespaces (MVP)
- `fs.*`: list/search/move/rename
- `process.*`: start
- `shell.*`: run (allowlisted only)
- `browser.*`: open/click/type/download

## Shared Rules
- All tool arguments must be explicit and schema-validated by runner/tool adapter.
- Tools must be side-effect scoped:
  - filesystem: only allowlisted paths
  - process/shell: only allowlisted executables/commands
  - browser: deterministic selectors and explicit download paths
- Tools return structured results:
  - `stdout`
  - `stderr`
  - `artifacts[]`
  - optional `data`

## Error Contract
- Return explicit error messages with stable codes where possible.
- Never silently ignore failures.
- Include enough detail for repair-loop logging without exposing secrets.

## Logging Contract
- Every tool call must map to run-log event entries.
- Redact detected secrets before log persistence.

