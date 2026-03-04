# Link Connection Matrix (Phase 2)

Last updated: 2026-03-03

## Matrix

| Surface | Check Method | Status | Evidence |
|---|---|---|---|
| `.env` contract | `tools/link_handshake.py` env check | `warn` | `.tmp/link/link_report.json` |
| Filesystem | create/move/rollback smoke | `pass` | `.tmp/link/fs_smoke_source.txt` |
| PowerShell allowlist | `Get-Date -Format o` via `pwsh` | `pass` | `.tmp/link/link_report.json` |
| Playwright browser | headless open + click + download | `pass` | `.tmp/link/playwright_smoke_download.txt` |
| Run-log storage | write/read JSON smoke | `pass` | `.tmp/link/run_log_smoke.json` |

## Notes
- `.env` is not present yet; no required keys are currently configured, so status is warning instead of failure.
- Browser handshake required local installation of `playwright` and Chromium runtime.

## Re-run
```powershell
python tools/link_handshake.py
```

