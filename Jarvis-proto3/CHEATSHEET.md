# System Pilot Cheat Sheet

Last updated: 2026-03-03

## Quick Start
1. Launch desktop app:
```powershell
npm run desktop:start
```
2. In the command box:
- `Enter` = Preview
- `Ctrl+Enter` = Execute
3. First safe test:
```text
list .tmp then shell Get-Date -Format o
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

## 25 Practical Examples
1. `list .tmp`
2. `search .tmp invoice`
3. `search C:\Users\User\Downloads report`
4. `move C:\Users\User\Downloads\a.txt C:\Users\User\Documents\a.txt`
5. `rename C:\Users\User\Documents\old.txt new.txt`
6. `start notepad.exe`
7. `start code.exe D:\Jarvis-proto3`
8. `shell Get-Date -Format o`
9. `shell Get-ChildItem -Path C:\Users\User\Downloads -File`
10. `shell Test-Path C:\Users\User\Documents`
11. `browser open https://example.com`
12. `list .tmp then shell Get-Date -Format o`
13. `search .tmp todo then shell Get-Date -Format o`
14. `list C:\Users\User\Downloads then search C:\Users\User\Downloads pdf`
15. `browser open https://news.ycombinator.com then shell Get-Date -Format o`
16. `start chrome.exe https://example.com`
17. `search C:\Users\User\Documents "Q4"`
18. `move D:\Jarvis-proto3\.tmp\report.csv D:\Jarvis-proto3\.tmp\archive\report.csv`
19. `rename D:\Jarvis-proto3\.tmp\draft.md final.md`
20. `list C:\ then search C:\Windows System32`
21. `search D:\Jarvis-proto3 src then list D:\Jarvis-proto3\src`
22. `shell Get-Content D:\Jarvis-proto3\README.md`
23. `shell Set-Content D:\Jarvis-proto3\.tmp\note.txt "hello world"`
24. `shell Copy-Item D:\Jarvis-proto3\.tmp\note.txt D:\Jarvis-proto3\.tmp\note-copy.txt`
25. `shell Rename-Item D:\Jarvis-proto3\.tmp\note-copy.txt note-final.txt`

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

Limit runs:
```powershell
npm run pilot:trigger -- interval --request "shell Get-Date -Format o" --interval-ms 5000 --max-runs 5
```

### Watch trigger
```powershell
npm run pilot:trigger -- watch --path ".tmp" --request "search .tmp {{event_name}}" --execute
```

Debounced one-shot:
```powershell
npm run pilot:trigger -- watch --path ".tmp" --request "list {{event_path}}" --debounce-ms 400 --max-runs 1
```

### Task Scheduler
Preview task command only:
```powershell
npm run pilot:trigger -- install-task --task-name "SystemPilotDaily" --schedule DAILY --start-time 09:00 --request "list .tmp" --execute --dry-run
```

Create task for real:
```powershell
npm run pilot:trigger -- install-task --task-name "SystemPilotDaily" --schedule DAILY --start-time 09:00 --request "list .tmp" --execute --force
```

Weekly:
```powershell
npm run pilot:trigger -- install-task --task-name "SystemPilotWeekly" --schedule WEEKLY --days MON,WED,FRI --start-time 08:30 --request "shell Get-Date -Format o" --execute --force
```

Watch-mode placeholders:
1. `{{event_path}}`
2. `{{event_name}}`
3. `{{event_type}}`

## Build and Packaging
1. `npm run build`
2. `npm run test`
3. `npm run desktop:build`
4. `npm run desktop:start`
5. `npm run desktop:dist`

Installer output:
- `desktop/release/SystemPilot-Setup-1.0.0.exe`

## Important Safety Notes
Your current policy is fully open:
- `allowed_paths = ["*"]`
- `allowed_apps = ["*"]`
- `allowed_shell_commands = ["*"]`

This means the agent can attempt actions anywhere on your machine and run any app/cmdlet through supported command templates.

Recommended safeguards:
1. Use Preview first for unfamiliar commands.
2. Keep backups for important folders.
3. Prefer one action at a time for destructive operations.
4. Consider re-introducing allowlists once your workflows stabilize.

## Troubleshooting
1. If UI seems unresponsive, relaunch:
```powershell
npm run desktop:start
```
2. If execute fails, inspect:
- Right rail `Logs` tab
- `.tmp/runs/<run_id>.json`
3. Validate environment:
```powershell
npm test
```
