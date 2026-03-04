# SOP: Phase 2 Link Handshake

Last updated: 2026-03-03

## Goal
Validate all required runtime and integration links before building full architecture logic.

## Inputs
- `config/link_profile.json`
- optional `.env`
- local runtime dependencies (Python, Node, PowerShell, Playwright)

## Checks
1. **Environment Contract**
   - Verify `.env` presence.
   - Verify required keys are present and non-empty.
   - Record missing keys and recommended keys.
2. **Filesystem Handshake**
   - Create test file under `.tmp/link/`.
   - Move file to target path.
   - Roll back to original path.
3. **Shell Handshake (Allowlisted)**
   - Execute safe probe command via PowerShell.
   - Command must be listed in allowlist.
4. **Browser Handshake (Playwright)**
   - Launch headless browser.
   - Open page, click deterministic selector, trigger download.
   - Persist downloaded artifact in `.tmp/link/`.
5. **Run-Log Storage**
   - Write and read JSON log artifact.
   - Validate parse and expected top-level fields.

## Execution Rules
- All operations must be local and non-destructive.
- No writes outside project root and configured temp paths.
- Each check emits deterministic status: `pass`, `warn`, or `fail`.

## Outputs
- `.tmp/link/link_report.json`
- `.tmp/link/link_report.md`
- Optional smoke artifacts in `.tmp/link/`.

## Pass Criteria
- Required checks (`filesystem`, `shell`, `runlog`) are `pass`.
- `playwright` is `pass` or explicitly `warn` with remediation.
- `.env` status is not `fail` if no required keys are configured.

## Failure Policy
- Do not proceed to full architecture build if required checks fail.
- Log remediation steps and rerun handshake after fixes.

## Learned Repair Notes
- Use local `node` runtime with project-installed `playwright` package for deterministic smoke execution.
- Do not rely on transient `npx` package context for module imports in scripted checks.
