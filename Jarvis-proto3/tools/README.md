# Tools Layer

This folder contains deterministic operational scripts.

Execution tool adapters for Architect phase live in `src/tools/` (TypeScript).

## Available Scripts
- `link_handshake.py`
  - Runs Phase-2 Link checks:
    - `.env` contract verification
    - filesystem move/rollback smoke
    - allowlisted PowerShell probe
    - Playwright open/click/download smoke
    - run-log write/read smoke
  - Writes reports to `.tmp/link/link_report.{json,md}`.

## Execution Adapters (TypeScript)
- `src/tools/fsTool.ts`
- `src/tools/processTool.ts`
- `src/tools/shellTool.ts`
- `src/tools/browserTool.ts`

## Usage
```powershell
python tools/link_handshake.py
```
