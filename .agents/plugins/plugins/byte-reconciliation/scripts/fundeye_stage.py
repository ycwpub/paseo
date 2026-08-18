#!/usr/bin/env python3
"""Allowlisted FundEye execution adapter for the byte reconciliation plugin."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections.abc import Callable
from typing import Any

CommandRunner = Callable[[list[str]], dict[str, Any]]

CREATE_ACTIONS = {
    "fullink_single_create": "single",
    "fullink_double_create": "double",
    "fullink_udf_create": "udf",
}
UPDATE_ACTIONS = {
    "fullink_single_update": "single",
    "fullink_double_update": "double",
    "fullink_udf_update": "udf",
}


def _string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _boolean(value: Any) -> bool:
    return value is True


def _integer(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default


def _run_command(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.stderr.strip():
        print(completed.stderr.rstrip(), file=sys.stderr)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(
            f"FundEye command failed with exit code {completed.returncode}"
            + (f": {detail}" if detail else "")
        )
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"FundEye command did not return JSON: {error}") from error
    if not isinstance(result, dict):
        raise RuntimeError("FundEye command returned a non-object JSON value")
    return result


def _bytedcli() -> str:
    return os.environ.get("BYTE_RECONCILIATION_BYTEDCLI_BIN", "bytedcli")


def _base_command() -> list[str]:
    return [_bytedcli(), "--json", "fundeye"]


def _with_site(command: list[str], origin: dict[str, Any]) -> list[str]:
    site = _string(origin.get("sitename"))
    if site:
        command.extend(["--sitename", site])
    return command


def _required(origin: dict[str, Any], key: str, label: str) -> str:
    value = _string(origin.get(key))
    if not value:
        raise ValueError(f"{label} is required")
    return value


def _payload(data: dict[str, Any]) -> dict[str, Any]:
    payload = data.get("platform_payload")
    if not isinstance(payload, dict) or not payload:
        raise ValueError("Agent proposal must contain a non-empty data.platform_payload object")
    missing_fields = payload.get("missing_fields")
    if isinstance(missing_fields, list) and missing_fields:
        raise ValueError(
            "Agent proposal is incomplete; missing fields: "
            + ", ".join(str(item) for item in missing_fields)
        )
    return payload


def _result(
    stage: str,
    status: str,
    *,
    message: str = "",
    command_result: dict[str, Any] | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    proposal: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary = {
        "stage": stage,
        "status": status,
        "message": message,
        "proposal": proposal,
        "before": before,
        "after": after,
        "command_result": command_result,
    }
    text = json.dumps(summary, ensure_ascii=False, separators=(",", ":"))[:20_000]
    variable_name = {
        "platform": "platform_summary",
        "remote_test": "remote_test_summary",
        "compare": "compare_summary",
    }[stage]
    return {
        "data": summary,
        "modify": {"workflow": {"var": {variable_name: text}}},
    }


def _find_rule_id(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("rule_id", "ruleId"):
            candidate = value.get(key)
            if isinstance(candidate, (str, int)) and str(candidate).strip():
                return str(candidate)
        for child in value.values():
            found = _find_rule_id(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = _find_rule_id(child)
            if found:
                return found
    return ""


def _read_rule(
    rule_id: str,
    origin: dict[str, Any],
    runner: CommandRunner,
) -> dict[str, Any] | None:
    if not rule_id:
        return None
    return runner(_with_site([*_base_command(), "rule", "get", "--rule-id", rule_id], origin))


def _apply(
    origin: dict[str, Any],
    data: dict[str, Any],
    runner: CommandRunner,
) -> dict[str, Any]:
    action = _string(origin.get("platform_action")) or "none"
    proposed_action = _string(data.get("platform_action")) or "none"
    if proposed_action != action:
        raise ValueError(
            f"Agent proposal action {proposed_action!r} does not match requested action {action!r}"
        )
    if action == "none":
        return _result("platform", "skipped", message="No FundEye write was requested.")

    proposal = _payload(data)
    approved = _boolean(origin.get("approve_platform_write"))
    if not approved:
        return _result(
            "platform",
            "awaiting_approval",
            message="Generated payload was not written because approve_platform_write is false.",
            proposal=proposal,
        )

    rule_id = _string(origin.get("rule_id"))
    before = _read_rule(rule_id, origin, runner)
    payload_json = json.dumps(proposal, ensure_ascii=False, separators=(",", ":"))

    if action == "tcheck_create":
        owner = _required(origin, "rule_owner", "Rule owner")
        command = [
            *_base_command(),
            "rule",
            "create",
            "--product-type",
            "tcheck",
            "--rule-owner",
            owner,
            "--params",
            payload_json,
        ]
    elif action == "tcheck_draft":
        rule_id = _required(origin, "rule_id", "Rule ID")
        command = [
            *_base_command(),
            "rule",
            "save-draft",
            "--product-type",
            "tcheck",
            "--rule-id",
            rule_id,
            "--params",
            payload_json,
        ]
    elif action in CREATE_ACTIONS:
        command = [
            *_base_command(),
            "rule",
            CREATE_ACTIONS[action],
            "create",
            "--scene-name",
            _required(origin, "scene_name", "Scene name"),
            "--payload",
            payload_json,
        ]
        scene_id = _string(origin.get("scene_id"))
        if scene_id:
            command.extend(["--scene-id", scene_id])
    elif action in UPDATE_ACTIONS:
        command = [
            *_base_command(),
            "rule",
            UPDATE_ACTIONS[action],
            "update",
            "--scene-id",
            _required(origin, "scene_id", "Scene ID"),
            "--sub-rule-id",
            _required(origin, "sub_rule_id", "Sub-rule ID"),
            "--payload",
            payload_json,
        ]
    else:
        raise ValueError(f"Unsupported FundEye platform action: {action}")

    command_result = runner(_with_site(command, origin))
    resulting_rule_id = rule_id or _find_rule_id(command_result)
    after = _read_rule(resulting_rule_id, origin, runner)
    return _result(
        "platform",
        "completed",
        message="FundEye write completed. TCheck rules remain drafts until separately published.",
        proposal=proposal,
        command_result=command_result,
        before=before,
        after=after,
    )


def _test(origin: dict[str, Any], runner: CommandRunner) -> dict[str, Any]:
    mode = _string(origin.get("remote_test_mode")) or "none"
    if mode == "none":
        return _result("remote_test", "skipped", message="No remote test was requested.")
    rule_id = _required(origin, "rule_id", "Rule ID")
    if mode == "tcheck_record_list":
        command = [*_base_command(), "check-record", "list", "--rule-id", rule_id]
        record_date = _string(origin.get("record_date"))
        if record_date:
            command.extend(["--date", record_date])
        return _result(
            "remote_test",
            "completed",
            message="Read-only TCheck reconciliation records were queried.",
            command_result=runner(_with_site(command, origin)),
        )
    if mode != "fullink_double_debug":
        raise ValueError(f"Unsupported remote test mode: {mode}")
    if not _boolean(origin.get("approve_remote_test")):
        return _result(
            "remote_test",
            "awaiting_approval",
            message="Fullink debug was not triggered because approve_remote_test is false.",
        )
    upstream = json.loads(_required(origin, "upstream_data_json", "Upstream sample JSON"))
    downstream = json.loads(_required(origin, "downstream_data_json", "Downstream sample JSON"))
    command = [
        *_base_command(),
        "rule",
        "double",
        "debug",
        "--rule-id",
        rule_id,
        "--rule-version",
        _required(origin, "rule_version", "Rule version"),
        "--edge-seq",
        str(max(1, _integer(origin.get("edge_seq"), 1))),
        "--upstream-data",
        json.dumps(upstream, ensure_ascii=False, separators=(",", ":")),
        "--downstream-data",
        json.dumps(downstream, ensure_ascii=False, separators=(",", ":")),
    ]
    return _result(
        "remote_test",
        "completed",
        message="Fullink double-rule debug completed.",
        command_result=runner(_with_site(command, origin)),
    )


def _compare(origin: dict[str, Any], runner: CommandRunner) -> dict[str, Any]:
    rule_id = _string(origin.get("rule_id"))
    if not rule_id:
        return _result("compare", "skipped", message="Rule ID is empty.")
    start = _string(origin.get("compare_start"))
    end = _string(origin.get("compare_end"))
    if not start or not end:
        return _result(
            "compare",
            "skipped",
            message="Both compare_start and compare_end are required for Diff comparison.",
        )
    command = [
        *_base_command(),
        "diff",
        "list",
        "--rule-id",
        rule_id,
        "--product-type",
        _string(origin.get("product_type")) or "fullink",
        "--start",
        start,
        "--end",
        end,
        "--page",
        "1",
        "--page-size",
        "100",
    ]
    rule_version = _string(origin.get("rule_version"))
    if rule_version:
        command.extend(["--rule-version", rule_version])
    alarm_order_id = _string(origin.get("alarm_order_id"))
    if alarm_order_id:
        command.extend(["--alarm-order-id", alarm_order_id])
    return _result(
        "compare",
        "completed",
        message="Read-only FundEye Diff comparison completed.",
        command_result=runner(_with_site(command, origin)),
    )


def execute_stage(
    envelope: dict[str, Any],
    stage: str,
    runner: CommandRunner = _run_command,
) -> dict[str, Any]:
    origin = envelope.get("origin_input")
    data = envelope.get("data")
    if not isinstance(origin, dict) or not isinstance(data, dict):
        raise ValueError("Workflow input must contain origin_input and data objects")
    if stage == "apply":
        return _apply(origin, data, runner)
    if stage == "test":
        return _test(origin, runner)
    if stage == "compare":
        return _compare(origin, runner)
    raise ValueError(f"Unsupported FundEye stage: {stage}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: fundeye_stage.py <apply|test|compare>", file=sys.stderr)
        return 2
    try:
        envelope = json.load(sys.stdin)
        if not isinstance(envelope, dict):
            raise ValueError("Workflow stdin must be a JSON object")
        result = execute_stage(envelope, sys.argv[1])
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as error:  # noqa: BLE001 - process boundary returns exact failure
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
