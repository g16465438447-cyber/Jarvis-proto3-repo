# SOP: Runner Execution

Last updated: 2026-03-03

## Goal
Execute Plan JSON deterministically with policy enforcement and complete run logging.

## Inputs
- Plan JSON
- policy config
- execution options (`dry_run`, `auto_approve_high_risk`)

## Rules
- Runner is the only layer allowed to execute tools.
- Validate Plan JSON against schema before first action.
- Enforce allowlists and approval gates before each action.
- Emit timeline events for each state transition.
- Persist run log for every run, including failures.

## Action Lifecycle
1. `planned`
2. `awaiting_approval` (if required)
3. `in_progress`
4. `ok | fail | retrying | skipped | rolled_back`

## Retry and Repair
- Use bounded retries from action config.
- Log each retry attempt.
- If rollback is defined and action path requires rollback, execute deterministic rollback action.

## Outputs
- Run log JSON that matches run log schema in `gemini.md`.
- Artifact list and final summary status.

## Failure Policy
- Plan validation failure: halt before execution.
- Policy violation: fail action and halt unless action policy explicitly allows skip.
- Tool crash: record error, retry if configured, otherwise fail run with diagnostics.

