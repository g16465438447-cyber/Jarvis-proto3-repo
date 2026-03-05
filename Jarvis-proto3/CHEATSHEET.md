# System Pilot Cheat Sheet

Last updated: 2026-03-04

## Quick Start (Windows / PowerShell)

If your folder path contains spaces, wrap it in quotes.

```powershell
# 1) Go to project folder (example with spaces)
cd "D:\Jarvis proto3 repo\Jarvis-proto3"

# 2) (One-time) install dependencies
npm install

# 3) Build desktop + CLI
npm run desktop:build

# 4) Launch Electron app
npm run desktop:start
```

### One-command launch
`desktop:start` already builds before opening Electron, so this also works:

```powershell
cd "D:\Jarvis proto3 repo\Jarvis-proto3"
npm run desktop:start
```

## If app does not open

```powershell
# Rebuild from clean TS output
npm run build
npm run desktop:build:main
npm run desktop:build:renderer
npm run desktop:start
```

If needed, verify desktop tests:

```powershell
npx vitest run desktop/tests/streamParser.test.ts desktop/tests/uiLogic.test.ts --maxWorkers=1
```


## If `App.tsx` is missing (common Git-first-time issue)

Symptom:
```text
Could not resolve "./App" from "desktop/renderer/src/main.tsx"
```

Check:
```powershell
Test-Path .\desktop\renderer\src\App.tsx
```

If `False`, try restoring from your remote branch first:
```powershell
git fetch --all --prune
git checkout origin/work -- .\desktop\renderer\src\App.tsx
```

If `origin/work` does not exist, list branches and replace with yours (for example `origin/main`):
```powershell
git branch -a
git checkout origin/main -- .\desktop\renderer\src\App.tsx
```

Then run:
```powershell
npm run desktop:start
```

If you still cannot restore from git history, create a temporary file so the app can boot:
```powershell
@'
export default function App() {
  return <div style={{ padding: 20, color: "#ddd" }}>System Pilot UI boot placeholder</div>;
}
'@ | Set-Content -Path .\desktop\renderer\src\App.tsx -Encoding UTF8

npm run desktop:start
```

## Command Grammar
System Pilot router supports these templates:

1. `list <path>`
2. `search <path> <pattern>`
3. `move <src> <dest>`
4. `rename <path> <new_name>`
5. `start <command> [args...]`
6. `shell <command> [args...]`
7. `browser open <url>`

Step chaining delimiters:
- `then`
- `and then`
- `;`

Quoted arguments are supported:
```text
search .tmp "annual report"
```

## Desktop UI Hotkeys
1. `Ctrl+\`` toggle right rail
2. `Ctrl+Shift+Enter` preview
3. `Ctrl+Enter` execute
4. `Alt+1` Chat tab
5. `Alt+2` Plan tab
6. `Alt+3` Actions tab
7. `Alt+4` Logs tab
8. `Alt+5` Triggers tab

## Trigger Recipes

### Interval trigger
```powershell
npm run pilot:trigger -- interval --request "list .tmp" --interval-ms 60000 --execute
```

### Watch trigger
```powershell
npm run pilot:trigger -- watch --path ".tmp" --request "search .tmp {{event_name}}" --execute
```

### Task Scheduler (dry run)
```powershell
npm run pilot:trigger -- install-task --task-name "SystemPilotDaily" --schedule DAILY --start-time 09:00 --request "list .tmp" --execute --dry-run
```

Watch-mode placeholders:
1. `{{event_path}}`
2. `{{event_name}}`
3. `{{event_type}}`

## Troubleshooting
1. If UI seems unresponsive, relaunch:
```powershell
npm run desktop:start
```
2. If execute fails, inspect:
- Right rail `Logs` tab
- `.tmp/runs/<run_id>.json`
