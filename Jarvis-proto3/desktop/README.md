# Desktop Operator Console

Electron + React desktop UI for System Pilot.

## Build and Run

```powershell
npm run desktop:build
npm run desktop:start
```

## Build Installer (Windows)

```powershell
npm run desktop:dist
```

Installer artifacts are written to `desktop/release/`.

## Keyboard Shortcuts

- `Ctrl+\``: Toggle right rail
- `Ctrl+Shift+Enter`: Preview plan
- `Ctrl+Enter`: Execute plan
- `Alt+1..4`: Switch right rail tabs

## Data Flow

- Plan preview: `pilot --json`
- Execute stream: `pilot --execute --stream-json --json`
- Run artifacts: `.tmp/runs/<run_id>.json`

## Trigger UI (Desktop)

- Open the `Triggers` tab in the right rail.
- Create/save trigger profiles (`interval` or `watch`).
- Start/stop saved triggers directly from UI.
- Configure Windows Task Scheduler entries from the same tab.

## Trigger Modes (Phase 5)

```powershell
# Run every 60 seconds (preview mode by default)
npm run pilot:trigger -- interval --request "list .tmp" --interval-ms 60000

# Watch folder and execute when files change
npm run pilot:trigger -- watch --path ".tmp" --request "search .tmp {{event_name}}" --execute

# Register Windows Task Scheduler task (dry-run prints command only)
npm run pilot:trigger -- install-task --task-name "SystemPilotDaily" --schedule DAILY --start-time 09:00 --request "list .tmp" --execute --dry-run
```

Template placeholders in watch mode:
- `{{event_path}}`
- `{{event_name}}`
- `{{event_type}}`
