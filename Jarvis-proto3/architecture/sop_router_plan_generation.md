# SOP: Router Plan Generation

Last updated: 2026-03-03

## Goal
Convert a user request into valid Plan JSON without executing any side effects.

## Inputs
- user request text
- policy snapshot (`allowed_paths`, `allowed_apps`, `allowed_shell_commands`)
- router options (`dry_run`)

## Rules
- Router only emits actions from the approved action enum in `gemini.md`.
- Router must not call any execution tools.
- Router must fail closed on ambiguous intent rather than guessing.
- Router output must pass JSON schema validation before handoff to runner.

## Deterministic Routing Strategy (MVP)
1. Normalize and decompose request into ordered step strings.
   - Supported delimiters: `then`, `and then`, `;`
   - Delimiter parsing is deterministic and quote-aware.
2. For each step, match against explicit command templates:
   - `list <path>`
   - `search <path> <pattern>`
   - `move <src> <dest>`
   - `rename <path> <new_name>`
   - `start <command> [args...]`
   - `shell <command> [args...]`
   - `browser open <url>`
3. Build one action per step with:
   - risk classification (`low|medium|high`)
   - approval requirement
   - expected output
   - rollback (if applicable)
4. Return Plan JSON with ordered `actions[]`.

## Outputs
- Valid Plan JSON or deterministic parse error.

## Failure Policy
- If any step has no template match, return explicit unsupported-intent error with accepted templates.
- If generated plan fails schema validation, return validation details and no plan.
