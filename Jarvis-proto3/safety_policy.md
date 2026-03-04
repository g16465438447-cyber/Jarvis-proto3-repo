# Safety Policy

Last updated: 2026-03-03

## Allowlists

### Filesystem
- Execution and artifact paths must be within configured allowed roots.
- Any path traversal outside allowlist is rejected.

### Applications
- Only configured app identifiers/executables may be launched or controlled.

### Shell
- Only allowed PowerShell cmdlets/commands and validated argument shapes may execute.
- Free-form arbitrary command strings are denied.

## Risk Classes
- `low`: read/list/search, non-destructive operations.
- `medium`: non-destructive external interactions, state-changing app actions.
- `high`: delete/overwrite, sending messages/emails, payment/subscription actions, credential entry.

## Approval Gates
- `high` risk actions require explicit user approval before execution.
- `medium` risk actions may require approval based on policy profile.
- Approval records are persisted in run logs.

## Redaction
- Secrets/tokens/credentials must be masked before writing logs or rendering event streams.
- Redaction applies to stdout/stderr, screenshots, and extracted text artifacts.

## Enforcement
- Runner validates plan schema and policy constraints before action execution.
- Policy violation results in immediate halt for the violating action and logged failure event.

