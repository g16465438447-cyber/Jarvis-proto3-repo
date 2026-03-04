# Project Constitution (`claude.md`)

Last updated: 2026-03-03

## Mission
Build deterministic, self-healing automation using:
- B.L.A.S.T protocol (Blueprint, Link, Architect, Stylize, Trigger)
- A.N.T 3-layer architecture

## Behavioral Rules
- Prioritize reliability over speed.
- Never guess business logic.
- Treat data schema as contract.
- Record meaningful progress, findings, and failures in memory files.
- Operate local-first and offline-capable where possible.
- Never execute actions outside explicit allowlists.
- Require user approval for high-risk operations.
- Redact secrets/tokens in logs and user-visible traces.

## Architectural Invariants
- Layer 1 (`architecture/`) defines SOPs and must be updated before code when logic changes.
- Layer 2 (navigation/reasoning) routes work between SOPs and tools.
- Layer 3 (`tools/`) contains deterministic, atomic, testable scripts.
- `.env` stores secrets and integration credentials.
- `.tmp/` is the only location for ephemeral intermediates.
- Router outputs **Plan JSON only** and never performs direct execution.
- Runner is the sole execution boundary and must enforce policy before each action.
- Every action must produce timeline events and deterministic status transitions.
- Any repair attempt must be logged with failure signature, patch action, and outcome.
- Desktop UI must interact with runtime only through secure IPC contracts (no Node integration in renderer).

## Security and Safety Invariants
- Allowlist scope:
  - filesystem roots
  - executable app identifiers
  - shell command/cmdlet names and allowed argument patterns
- High-risk actions require explicit approval:
  - delete/overwrite
  - sending external messages
  - payments/subscriptions
  - credential entry unless explicitly consented secure path is used
- No stealth behavior, no bypassing security boundaries, no covert data collection.

## Governance
- `gemini.md` is the schema and maintenance law.
- `task_plan.md`, `findings.md`, and `progress.md` are operational memory.
- No `tools/` script implementation before Blueprint approval and schema confirmation.
