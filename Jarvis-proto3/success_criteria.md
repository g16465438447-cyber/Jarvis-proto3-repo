# Success Criteria

## Functional
- System executes tasks only through deterministic approved tool actions.
- Router produces Plan JSON only; no direct execution path from reasoning layer.
- Runner enforces allowlists and approval gates before every risky action.
- Activity timeline is complete: plan, action events, outputs, errors, repair attempts, final result.

## Safety
- High-risk actions require explicit user approval.
- No execution outside approved apps, paths, and shell commands.
- Logs redact secrets/tokens.

## Reliability
- On failure, runner attempts bounded safe repair loops (retry, alternate method, re-locate target).
- Each repair attempt is logged with cause, patch, and outcome.
- Final summary includes status (`ok|partial|failed`) and artifact links.

## Environment
- Windows-first local execution.
- Offline-capable for local tasks; online use only for tasks requiring internet/API access.

