# AI Agent Onboarding: Jarvis Proto3

This document is a quick-start map for future AI agents working on this repository.

## 1) What this project is

Jarvis Proto3 is a **local, deterministic automation scaffold** called "System Pilot." It is structured as:

- **Router**: turns constrained natural-language-like requests into a typed, schema-validated action plan.
- **Runner**: executes the plan with policy checks, approvals, retries, rollback hooks, and run logging.
- **Tools**: deterministic action handlers (`fs.*`, `process.start`, `shell.run`, `browser.*`).
- **Desktop app**: Electron + React operator console that previews/executes plans and streams events.
- **Trigger runtime**: interval / filesystem watch / Windows Task Scheduler integration.

The root implementation is TypeScript-first (`src/`), with compiled output in `dist/`.

## 2) High-level architecture

Core flow:

1. CLI receives request (`src/cli/pilot.ts`).
2. Policy is loaded (`src/policy/loadPolicy.ts`, `config/policy.json`).
3. Router builds a `Plan` (`src/router/router.ts`) and validates against schema.
4. Runner executes plan (`src/runner/runner.ts`) via tool dispatch (`src/tools/index.ts`).
5. Run log is validated and persisted to `.tmp/runs/<run_id>.json`.
6. Optional JSON stream events are emitted for desktop UI consumption.

Reference docs:

- `architecture/` = SOP-level design documents.
- `router/README.md`, `runner/README.md`, `tools/README.md` = layer notes.

## 3) Repository layout (practical map)

- `src/` — source of truth
  - `cli/` — `pilot` and `pilot-trigger` entrypoints + trigger arg/parser helpers
  - `router/` — goal-to-action planning
  - `runner/` — execution loop, retry, approval gating, logging
  - `tools/` — tool handlers and dispatcher
  - `policy/` — allowlist checks and policy loading
  - `validation/` — AJV schema validators
  - `types.ts` — shared plan/run/stream types
- `schemas/` — JSON schemas for plan and runlog
- `tests/` — unit/integration tests for router/runner/tools/trigger/stream
- `desktop/` — Electron main/preload + React renderer + UI tests
- `config/` — policy and link-handshake profile
- `architecture/`, `initial_sops/` — SOP docs and planning materials
- `tools/` (repo root) — Python `link_handshake.py` helper script
- `.tmp/` — generated runtime artifacts (run logs, reports, smoke outputs)

## 4) Commands you will use most

From `Jarvis-proto3/`:

- `npm run build` — compile TS (`src` -> `dist`)
- `npm run typecheck` — strict no-emit check
- `npm run test` — typecheck + unit tests
- `npm run test:unit` — vitest suite only
- `npm run pilot -- "list .tmp" --json` — preview plan + run log JSON in dry-run mode
- `npm run pilot -- "list .tmp" --execute --json` — execute real run
- `npm run pilot:trigger -- interval --request "list .tmp" --interval-ms 60000`
- `npm run desktop:start` — build and launch Electron operator console
- `python tools/link_handshake.py` — deterministic environment/link smoke checks

## 5) Important behavioral rules in code

- Router accepts **constrained templates**, not arbitrary agentic planning.
- Every produced plan is schema-validated.
- Runner enforces approval semantics for `requires_approval` actions.
- Dry-run mode is default unless `--execute` is set.
- Runner emits stream events (`plan_ready`, `action_event`, `tool_output`, `approval_needed`, `run_complete`, `run_error`).
- Secrets are redacted from runner output when detected.
- Tool coverage is partial; some action types are intentionally scaffold-only and throw `not implemented`.

## 6) Current caveats you should know

- Repository currently includes heavy generated/installed artifacts (`node_modules/`, `dist/`, desktop release outputs).
- `config/policy.json` is permissive (`*`) right now; this is useful for prototyping but not production-safe.
- `loadPolicy` currently reads from process cwd config path; keep cwd assumptions in mind during tooling changes.
- Some docs describe phased architecture; code may be intentionally MVP-scaffolded in parts.

## 7) Suggested workflow for future AI agents

1. Read this file, then skim:
   - `package.json`
   - `src/types.ts`
   - `src/cli/pilot.ts`
   - `src/router/router.ts`
   - `src/runner/runner.ts`
2. Run `npm run typecheck` before touching behavior.
3. Change source under `src/` (and `desktop/` only when needed), not `dist/` by hand.
4. Add/update tests under `tests/` or `desktop/tests/` for behavior changes.
5. Re-run relevant tests, then full `npm run test` when feasible.
6. Keep deterministic and policy-bounded behavior; avoid introducing unconstrained autonomous logic.

## 8) Fast orientation checklist

- [ ] I understand request template routing and its limits.
- [ ] I know whether my change affects CLI, router, runner, tools, or desktop.
- [ ] I updated tests for changed behavior.
- [ ] I did not edit generated outputs manually.
- [ ] I validated with at least typecheck + target tests.
