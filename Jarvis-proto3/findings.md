# Findings Log

Last updated: 2026-03-03

## Discovery Answers (Blueprint Locked: 2026-03-03)
- **North Star:** Build a local desktop "System Pilot" app that converts plain-English requests into safe plans and deterministic execution across files, apps, and browser workflows, with live visibility and self-repair for common failures.
- **Integrations:** Local-first stack. Required integration surfaces for MVP are local filesystem, process/window controls, PowerShell, and Playwright browser automation. LLM can be local or API-backed; provider key selection deferred to Link phase.
- **Source of Truth:** Local workspace state + deterministic run artifacts (plan and event logs). SOP docs are human source-of-truth for "how" behavior should run.
- **Delivery Payload:** Activity timeline and final summary with artifact links in the desktop UI and CLI output.
- **Behavioral Rules:** Strict allowlists, approval gates for high-risk actions, redaction in logs, no stealth/covert actions, no out-of-policy execution.

## Constraints
- Reliability is prioritized over speed.
- Business logic must be deterministic; no guessing.
- No scripts in `tools/` until discovery answers, schema confirmation, and blueprint approval are complete.
- SOP changes in `architecture/` must precede corresponding code changes.
- Windows-first execution (PowerShell available), optional future adapters for macOS/Linux.
- Offline-capable for local tasks; internet usage only for web/API-required workflows.

## Confirmed MVP Scope
- Router produces Plan JSON only.
- Runner enforces policy and executes deterministic tools.
- Initial tool surface:
  - `fs.list/search/move/rename`
  - `process.start`
  - `browser.open/click/type/download`
  - `shell.run` with strict allowlist
- Output includes timeline events and final "Done" summary with artifact links.

## Research References (Primary Sources)
- Electron repository: https://github.com/electron/electron
- Electron Security Tutorial: https://www.electronjs.org/docs/latest/tutorial/security
- Playwright repository: https://github.com/microsoft/playwright
- Playwright docs: https://playwright.dev/docs/intro
- Playwright downloads guide: https://playwright.dev/docs/downloads
- PowerShell `Start-Process`: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-7.5
- PowerShell `Stop-Process`: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/stop-process?view=powershell-7.5
- PowerShell `Get-Process`: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-process?view=powershell-7.5
- Ajv JSON Schema validator: https://github.com/ajv-validator/ajv
- `node-cron` scheduler: https://github.com/node-cron/node-cron
- `chokidar` file watcher: https://github.com/paulmillr/chokidar
- SQLite official docs: https://www.sqlite.org/docs.html

## Research Takeaways
- Electron security defaults must be hardened early (context isolation, narrow IPC, least privilege preload APIs).
- Playwright provides reliable deterministic browser automation and download handling for MVP browser actions.
- PowerShell command wrappers should use explicit allowlisted cmdlets/arguments to avoid arbitrary shell execution.
- Plan and run log contracts should be JSON-Schema validated at runtime (Ajv) before execution and before persistence.
- Local trigger modes map cleanly to `node-cron` (scheduled) and `chokidar` (file watcher).

## Phase 2 Link Findings (2026-03-03)
- Implemented deterministic link harness: `tools/link_handshake.py`.
- Connection matrix documented in `architecture/link_connection_matrix.md`.
- Handshake result: overall `pass` with one warning.
  - `env`: warn (`.env` not present; no required keys configured)
  - `filesystem`: pass
  - `shell`: pass
  - `playwright`: pass
  - `runlog`: pass
- Repair-loop learning:
  - Browser smoke was initially failing with command/runtime resolution issues.
  - Stable fix was to install local Playwright dependency + Chromium and run smoke via local `node`.

## Phase 3 Architect Findings (2026-03-03)
- Router/Runner scaffolding implemented with strict separation:
  - Router (`src/router/router.ts`) emits Plan JSON only.
  - Runner (`src/runner/runner.ts`) is sole execution boundary.
- Deterministic tool adapters implemented in `src/tools/`:
  - `fs.list`, `fs.search`, `fs.move`, `fs.rename`
  - `process.start`
  - `shell.run` (allowlisted cmdlets only)
  - `browser.open`, `browser.click`, `browser.type`, `browser.download`
- Policy/validation controls now active:
  - `config/policy.json`
  - `schemas/plan.schema.json`
  - `schemas/runlog.schema.json`
  - Ajv draft-2020 validation in runtime.
- CLI entrypoint established:
  - `npm run pilot -- "<request>" [--execute] [--approve-high-risk] [--json]`
- Router intent coverage expanded to deterministic multi-step parsing:
  - request decomposition supports `then`, `and then`, and `;`
  - decomposition is quote-aware for argument grouping
  - actions are emitted in preserved step order

## Repair Loop Notes (Architect)
- Initial shell tool implementation incorrectly quoted all arguments, causing PowerShell named parameter binding failures.
- Patch applied: preserve switch tokens (e.g., `-Format`) unquoted while quoting value tokens.
- Verified fix with execution smoke command: `shell Get-Date -Format o`.

## Residual Risks
- Router intent parser now supports deterministic multi-step composition, but still only within constrained template grammar.
- PowerShell-backed tests are slower in this environment (~5s per command), so test timeout configuration is required.

## Phase 4 Stylize Findings (2026-03-03)
- Implemented Electron + React Operator Console under `desktop/` with:
  - boot screen
  - top/bottom bars
  - console-first center pane
  - right rail tabs (`Chat`, `Plan`, `Actions`, `Logs`)
  - approval cards and action timeline
  - deterministic progress strip rendering
- Added secure IPC bridge with required contracts:
  - `pilot.preview`
  - `pilot.execute`
  - `pilot.abort`
  - `pilot.onEvent`
  - `pilot.getRun`
  - `ui.getPreferences`
  - `ui.setPreferences`
- Runtime streaming implemented via CLI + runner:
  - `--stream-json`
  - `--session-id`
  - NDJSON event kinds: `plan_ready`, `action_event`, `tool_output`, `approval_needed`, `run_complete`, `run_error`
- Preferences persistence implemented in Electron userData:
  - right rail width/collapse
  - active tab
  - CRT toggle
  - console font size
- Added stylize-focused tests:
  - stream parser (`desktop/tests/streamParser.test.ts`)
  - UI logic mapping/progress/risk/approval guards (`desktop/tests/uiLogic.test.ts`)
  - CLI stream regression (`tests/pilotStreamMode.test.ts`)
- Post-launch fix:
  - Electron renderer initially showed a blank window because Vite emitted absolute `/assets/...` paths.
  - Fixed by setting `base: "./"` in `desktop/renderer/vite.config.ts` for `file://` compatibility.

## Phase 4 UX Clarification Findings (2026-03-03)
- User confusion source: Preview and Execute looked similar when Preview returned a successful dry-run run log without a distinct mode marker.
- UI clarity patch:
  - Added explicit Preview-only console line.
  - Added explicit Execute-start console line.
  - Clear previous dry-run run log before Execute starts.
- Input ergonomics patch:
  - Added `Enter` to run Preview directly from the command input.
  - Kept `Ctrl+Enter` for Execute.

## Phase 4 Execute Stall Findings (2026-03-03)
- User observed repeated Execute attempts adding command entries without advancing to plan/output.
- Hardening applied:
  - Force Electron-spawned CLI children to run in Node mode (`ELECTRON_RUN_AS_NODE=1`).
  - Add preview timeout and explicit failure path (no silent pending state).
  - Add renderer-side preview/execute timeouts and busy lockout to prevent overlapping requests.
- Expected operator-visible behavior after patch:
  - On Execute with no current plan: `EXECUTE: generating plan...`
  - Then either stream starts or explicit timeout/error message appears.

## Phase 5 Trigger Findings (2026-03-03)
- Implemented deterministic local trigger runner (`pilot:trigger`) with three modes:
  - `interval`: periodic request execution loop
  - `watch`: debounced file-system event trigger with serialized run queue
  - `install-task`: Windows Task Scheduler registration for persistent local automation
- Watch-mode request templates support placeholder interpolation:
  - `{{event_path}}`, `{{event_name}}`, `{{event_type}}`
- Trigger safety controls:
  - Watch path must exist and be within policy allowlist.
  - Execution path still routes through Router + Runner + policy validation.

## Phase 5 Packaging Findings (2026-03-03)
- Added `electron-builder` packaging pipeline and Windows installer generation.
- Initial packaging failure cause:
  - `winCodeSign` extraction attempted symlink creation in cache and failed without required privilege.
- Deterministic repair:
  - set `win.signAndEditExecutable=false` in `electron-builder.json`.
  - packaging then succeeded for both unpacked and NSIS installer targets.
- Produced artifacts:
  - `desktop/release/win-unpacked/`
  - `desktop/release/SystemPilot-Setup-1.0.0.exe`

## Phase 5 Trigger UI Findings (2026-03-03)
- Desktop runtime now exposes trigger management through secure IPC and preload bridge.
- New UI capability set in `Triggers` tab:
  - create/edit/delete trigger profiles
  - start/stop interval/watch trigger processes
  - run task scheduler install command from UI
  - inspect live trigger log lines/state transitions
- Reliability notes:
  - trigger manager tracks running child processes by profile ID
  - relative watch paths are normalized to project-root absolute paths before persistence
  - trigger child processes are terminated on app shutdown

## Policy Scope Change Findings (2026-03-03)
- User requested full filesystem and app access scope.
- Implemented wildcard allowlist semantics:
  - `allowed_paths` supports `"*"` => all paths allowed
  - `allowed_apps` supports `"*"` => all executables allowed
- Active policy now set to wildcard scope in `config/policy.json`.
- Shell cmdlet allowlist remains explicit and unchanged.

## Phase 3 Test Findings (2026-03-03)
- Added Vitest suite with deterministic coverage for implemented paths and key edge cases.
- Coverage now includes:
  - policy allowlist checks (`tests/policy.test.ts`)
  - router template routing + unsupported intent + high-risk shell mapping (`tests/router.test.ts`)
  - filesystem tools success + out-of-allowlist rejection (`tests/fsTool.test.ts`)
  - shell/process tools allowlist success/failure paths (`tests/shellProcessTool.test.ts`)
  - browser open/click/type/download success + disallowed output path (`tests/browserTool.test.ts`)
  - tool dispatcher not-implemented action behavior (`tests/dispatch.test.ts`)
  - runner approval gate, dry-run skip, invalid high-risk plan, and repair/failure logging (`tests/runner.test.ts`)
- Added `vitest.config.ts` to scope test discovery and exclude `.tmp/` and build artifacts.
- Added controlled-stub runner failure-mode tests in `tests/runner.failureModes.test.ts`:
  - transient failure -> retry -> success
  - terminal failure -> rollback path executed
- Confirmed deterministic runner invariants with mocks:
  - retries trigger expected status transitions (`retrying` then `ok`)
  - rollback path emits `rolled_back` and shutdown always executes
