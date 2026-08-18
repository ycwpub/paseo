#!/usr/bin/env python3
"""Safe BITS stage adapter for Paseo Workflow Bash nodes."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections.abc import Callable
from typing import Any

CommandRunner = Callable[[list[str]], dict[str, Any]]


def _string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _boolean(value: Any) -> bool:
    return value is True


def _run_command(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.stderr.strip():
        print(completed.stderr.rstrip(), file=sys.stderr)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(
            f"BITS command failed with exit code {completed.returncode}"
            + (f": {detail}" if detail else "")
        )
    try:
        parsed = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"BITS command did not return JSON: {error}") from error
    if not isinstance(parsed, dict):
        raise RuntimeError("BITS command returned a non-object JSON value")
    return parsed


def _bytedcli() -> str:
    return os.environ.get("BYTE_DEVELOPMENT_BYTEDCLI_BIN", "bytedcli")


def _base_command() -> list[str]:
    return [_bytedcli(), "--json", "bits", "develop"]


def _stage_result(
    stage: str,
    status: str,
    *,
    approved: bool,
    command_result: dict[str, Any] | None = None,
    state_check: dict[str, Any] | None = None,
    message: str = "",
) -> dict[str, Any]:
    summary = {
        "stage": stage,
        "status": status,
        "approved": approved,
        "message": message,
        "state_check": state_check,
        "command_result": command_result,
    }
    return {
        "data": summary,
        "modify": {
            "workflow": {
                "var": {
                    f"{stage}_summary": json.dumps(
                        summary, ensure_ascii=False, separators=(",", ":")
                    )
                }
            }
        },
    }


def _dev_task_id(origin: dict[str, Any]) -> str:
    return _string(origin.get("bits_dev_task_id"))


def _deploy(origin: dict[str, Any], runner: CommandRunner) -> dict[str, Any]:
    dev_id = _dev_task_id(origin)
    psm = _string(origin.get("bits_psm"))
    approved = _boolean(origin.get("approve_deploy"))
    if not dev_id or not psm:
        return _stage_result(
            "deploy",
            "skipped",
            approved=approved,
            message="Dev Task ID or project PSM is empty.",
        )
    command = [
        *_base_command(),
        "project",
        "deploy",
        "--dev-id",
        dev_id,
        "--psm",
        psm,
        "--type",
        _string(origin.get("bits_project_type")) or "tce",
        "--phase",
        _string(origin.get("bits_phase")) or "dev",
        "--target-branch",
        _string(origin.get("target_branch")) or "master",
    ]
    control_plane = _string(origin.get("control_plane"))
    if control_plane:
        command.extend(["--control-plane", control_plane])
    command.extend(["--yes", "--wait"] if approved else ["--dry-run"])
    return _stage_result(
        "deploy",
        "completed" if approved else "dry_run",
        approved=approved,
        command_result=runner(command),
    )


def _test(origin: dict[str, Any], runner: CommandRunner) -> dict[str, Any]:
    dev_id = _dev_task_id(origin)
    approved = _boolean(origin.get("approve_test"))
    if not dev_id:
        return _stage_result(
            "test",
            "skipped",
            approved=approved,
            message="Dev Task ID is empty.",
        )
    if not approved:
        return _stage_result(
            "test",
            "awaiting_approval",
            approved=False,
            message="quick-run was not triggered because approve_test is false.",
        )
    command = [*_base_command(), "quick-run", "--dev-id", dev_id, "--wait"]
    control_plane = _string(origin.get("control_plane"))
    if control_plane:
        command.extend(["--control-planes", control_plane])
    return _stage_result(
        "test",
        "completed",
        approved=True,
        command_result=runner(command),
    )


def _release(origin: dict[str, Any], runner: CommandRunner) -> dict[str, Any]:
    dev_id = _dev_task_id(origin)
    approved = _boolean(origin.get("approve_release"))
    if not dev_id:
        return _stage_result(
            "release",
            "skipped",
            approved=approved,
            message="Dev Task ID is empty.",
        )
    state_check = runner([*_base_command(), "get", "--dev-id", dev_id])
    command = [*_base_command(), "publish", "--dev-id", dev_id]
    release_ticket_id = _string(origin.get("release_ticket_id"))
    if release_ticket_id:
        command.extend(["--release-ticket-id", release_ticket_id])
    command.extend(["--yes"] if approved else ["--dry-run"])
    return _stage_result(
        "release",
        "completed" if approved else "dry_run",
        approved=approved,
        command_result=runner(command),
        state_check=state_check,
    )


def execute_stage(
    envelope: dict[str, Any],
    stage: str,
    runner: CommandRunner = _run_command,
) -> dict[str, Any]:
    origin = envelope.get("origin_input")
    if not isinstance(origin, dict):
        raise ValueError("Workflow input must contain origin_input")
    if stage == "deploy":
        return _deploy(origin, runner)
    if stage == "test":
        return _test(origin, runner)
    if stage == "release":
        return _release(origin, runner)
    raise ValueError(f"Unsupported BITS stage: {stage}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: bits_stage.py <deploy|test|release>", file=sys.stderr)
        return 2
    try:
        envelope = json.load(sys.stdin)
        if not isinstance(envelope, dict):
            raise ValueError("Workflow stdin must be a JSON object")
        result = execute_stage(envelope, sys.argv[1])
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as error:  # noqa: BLE001 - command boundary must report exact failure
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
