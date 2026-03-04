#!/usr/bin/env python3
"""Deterministic Phase-2 link handshake for System Pilot."""

from __future__ import annotations

import datetime as dt
import json
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "link_profile.json"
ENV_PATH = ROOT / ".env"


@dataclass
class CheckResult:
    name: str
    status: str
    summary: str
    details: dict[str, Any]
    artifacts: list[str]
    duration_ms: int


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load_config() -> dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def parse_env_file(path: Path) -> dict[str, str]:
    env_map: dict[str, str] = {}
    if not path.exists():
        return env_map

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        env_map[key] = value
    return env_map


def run_check(name: str, fn) -> CheckResult:
    start = time.perf_counter()
    try:
        status, summary, details, artifacts = fn()
    except Exception as exc:  # pragma: no cover - deterministic catch-all for report completeness
        status = "fail"
        summary = f"Unhandled exception: {exc}"
        details = {"exception": repr(exc)}
        artifacts = []
    duration_ms = int((time.perf_counter() - start) * 1000)
    return CheckResult(
        name=name,
        status=status,
        summary=summary,
        details=details,
        artifacts=artifacts,
        duration_ms=duration_ms,
    )


def check_env(config: dict[str, Any]) -> tuple[str, str, dict[str, Any], list[str]]:
    required = config.get("required_env_keys", [])
    recommended = config.get("recommended_env_keys", [])
    env_example_exists = (ROOT / ".env.example").exists()

    if not ENV_PATH.exists():
        status = "fail" if required else "warn"
        summary = ".env not found."
        return status, summary, {
            "env_path": str(ENV_PATH),
            "required_keys": required,
            "recommended_keys": recommended,
            "missing_required": required,
            "present_recommended": [],
            "env_example_exists": env_example_exists,
            "remediation": "Copy .env.example to .env and fill values.",
        }, []

    env_map = parse_env_file(ENV_PATH)
    missing_required = [k for k in required if not env_map.get(k)]
    present_recommended = [k for k in recommended if env_map.get(k)]

    if missing_required:
        return "fail", "Required .env keys missing.", {
            "env_path": str(ENV_PATH),
            "required_keys": required,
            "recommended_keys": recommended,
            "missing_required": missing_required,
            "present_recommended": present_recommended,
            "env_example_exists": env_example_exists,
        }, []

    if present_recommended:
        return "pass", ".env loaded with configured keys.", {
            "env_path": str(ENV_PATH),
            "required_keys": required,
            "recommended_keys": recommended,
            "missing_required": [],
            "present_recommended": present_recommended,
            "env_example_exists": env_example_exists,
        }, []

    return "warn", ".env loaded, no recommended provider keys set.", {
        "env_path": str(ENV_PATH),
        "required_keys": required,
        "recommended_keys": recommended,
        "missing_required": [],
        "present_recommended": [],
        "env_example_exists": env_example_exists,
    }, []


def check_filesystem(report_dir: Path) -> tuple[str, str, dict[str, Any], list[str]]:
    report_dir.mkdir(parents=True, exist_ok=True)
    src = report_dir / "fs_smoke_source.txt"
    dst = report_dir / "fs_smoke_dest.txt"
    artifact_paths: list[str] = []

    if src.exists():
        src.unlink()
    if dst.exists():
        dst.unlink()

    src.write_text("phase2-link-fs-smoke\n", encoding="utf-8")
    shutil.move(str(src), str(dst))
    shutil.move(str(dst), str(src))
    artifact_paths.append(str(src))

    return "pass", "Filesystem create/move/rollback succeeded.", {
        "source_path": str(src),
        "dest_path": str(dst),
        "rollback_performed": True,
    }, artifact_paths


def check_shell(config: dict[str, Any]) -> tuple[str, str, dict[str, Any], list[str]]:
    allowlist = config.get("allowlisted_shell_commands", [])
    probe = config.get("shell_probe_command", "").strip()
    if not probe:
        return "fail", "No shell probe command configured.", {"probe": probe}, []

    root_cmd = probe.split()[0]
    if root_cmd not in allowlist:
        return "fail", "Probe command is not allowlisted.", {
            "probe": probe,
            "root_cmd": root_cmd,
            "allowlisted_shell_commands": allowlist,
        }, []

    proc = subprocess.run(
        ["pwsh", "-NoProfile", "-Command", probe],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        return "fail", "PowerShell probe failed.", {
            "probe": probe,
            "returncode": proc.returncode,
            "stdout": proc.stdout[-2000:],
            "stderr": proc.stderr[-2000:],
        }, []

    return "pass", "Allowlisted PowerShell probe succeeded.", {
        "probe": probe,
        "stdout": proc.stdout.strip()[-500:],
    }, []


def check_playwright(config: dict[str, Any], report_dir: Path) -> tuple[str, str, dict[str, Any], list[str]]:
    playwright_cfg = config.get("playwright", {})
    enabled = bool(playwright_cfg.get("enabled", True))
    timeout_ms = int(playwright_cfg.get("timeout_ms", 180000))

    if not enabled:
        return "warn", "Playwright check disabled by config.", {"enabled": False}, []

    report_dir.mkdir(parents=True, exist_ok=True)
    download_path = report_dir / "playwright_smoke_download.txt"
    if download_path.exists():
        download_path.unlink()

    # Deterministic smoke: open an in-memory page, click a known selector, download a data URL.
    node_script = r"""
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const targetPath = process.argv[process.argv.length - 1];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setContent('<a id="download-link" href="data:text/plain;base64,cGxheXdyaWdodC1saW5rLXNtb2tl" download="playwright_smoke_download.txt">download</a>');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-link')
  ]);
  await download.saveAs(targetPath);
  await browser.close();
  process.stdout.write(targetPath);
})().catch((err) => {
  process.stderr.write(String(err));
  process.exit(1);
});
"""
    node_path = shutil.which("node") or shutil.which("node.exe")
    if not node_path:
        return "fail", "Node.js was not found in PATH.", {
            "remediation": "Install Node.js and ensure `node` is available in PATH.",
        }, []

    cmd = [node_path, "-e", node_script, str(download_path)]

    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=max(30, timeout_ms // 1000),
    )

    if proc.returncode != 0:
        return "fail", "Playwright smoke failed.", {
            "returncode": proc.returncode,
            "stdout": proc.stdout[-2000:],
            "stderr": proc.stderr[-2000:],
            "remediation": "Run `npm install --save-dev playwright` then `npx playwright install chromium` and retry.",
        }, []

    if not download_path.exists():
        return "fail", "Playwright reported success but no download file found.", {
            "expected_download_path": str(download_path),
            "stdout": proc.stdout[-2000:],
        }, []

    return "pass", "Playwright open/click/download smoke succeeded.", {
        "download_path": str(download_path),
        "stdout": proc.stdout.strip()[-500:],
    }, [str(download_path)]


def check_runlog_storage(report_dir: Path) -> tuple[str, str, dict[str, Any], list[str]]:
    report_dir.mkdir(parents=True, exist_ok=True)
    runlog_path = report_dir / "run_log_smoke.json"
    payload = {
        "run_id": str(uuid.uuid4()),
        "goal": "phase2-link-runlog-smoke",
        "plan": [],
        "events": [{"ts": now_utc(), "status": "ok", "action_id": str(uuid.uuid4())}],
        "artifacts": [],
        "final_result": {"status": "ok", "summary": "run log storage smoke passed"},
    }
    runlog_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    loaded = json.loads(runlog_path.read_text(encoding="utf-8"))

    required_keys = ["run_id", "goal", "events", "final_result"]
    missing = [k for k in required_keys if k not in loaded]
    if missing:
        return "fail", "Run log storage missing required keys after read.", {
            "path": str(runlog_path),
            "missing_keys": missing,
        }, [str(runlog_path)]

    return "pass", "Run log write/read succeeded.", {
        "path": str(runlog_path),
        "required_keys_checked": required_keys,
    }, [str(runlog_path)]


def render_markdown_report(report: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# Link Handshake Report")
    lines.append("")
    lines.append(f"- started_utc: `{report['started_at_utc']}`")
    lines.append(f"- finished_utc: `{report['finished_at_utc']}`")
    lines.append(f"- overall_status: `{report['overall_status']}`")
    lines.append("")
    lines.append("## Checks")
    for check in report["checks"]:
        lines.append(f"- **{check['name']}**: `{check['status']}` ({check['duration_ms']} ms) - {check['summary']}")
    lines.append("")
    lines.append("## Artifacts")
    for artifact in report["artifacts"]:
        lines.append(f"- `{artifact}`")
    lines.append("")
    lines.append("## Next Actions")
    if report["overall_status"] == "pass":
        lines.append("- Link handshake passed. Safe to proceed with Architect phase scaffolding.")
    else:
        lines.append("- Resolve failing checks and rerun `python tools/link_handshake.py`.")
    return "\n".join(lines) + "\n"


def compute_overall(checks: list[CheckResult]) -> str:
    by_name = {item.name: item for item in checks}
    required = ["filesystem", "shell", "runlog"]
    for name in required:
        if by_name[name].status != "pass":
            return "fail"

    env_state = by_name["env"].status
    browser_state = by_name["playwright"].status
    if env_state == "fail":
        return "fail"
    if browser_state == "fail":
        return "fail"
    return "pass"


def main() -> int:
    started_at = now_utc()
    config = load_config()
    report_dir = ROOT / config.get("report_dir", ".tmp/link")
    report_dir.mkdir(parents=True, exist_ok=True)

    checks = [
        run_check("env", lambda: check_env(config)),
        run_check("filesystem", lambda: check_filesystem(report_dir)),
        run_check("shell", lambda: check_shell(config)),
        run_check("playwright", lambda: check_playwright(config, report_dir)),
        run_check("runlog", lambda: check_runlog_storage(report_dir)),
    ]
    overall = compute_overall(checks)
    finished_at = now_utc()

    artifacts: list[str] = []
    for check in checks:
        artifacts.extend(check.artifacts)
    artifacts = sorted(set(artifacts))

    report = {
        "started_at_utc": started_at,
        "finished_at_utc": finished_at,
        "overall_status": overall,
        "checks": [asdict(c) for c in checks],
        "artifacts": artifacts,
        "config_path": str(CONFIG_PATH),
    }

    json_path = report_dir / "link_report.json"
    md_path = report_dir / "link_report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(render_markdown_report(report), encoding="utf-8")

    print(f"[link] overall_status={overall}")
    print(f"[link] report_json={json_path}")
    print(f"[link] report_md={md_path}")
    return 0 if overall == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
