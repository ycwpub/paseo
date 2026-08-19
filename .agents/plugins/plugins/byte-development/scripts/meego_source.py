"""Read current-user Meego work items and resolve a work item into PRD text."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from collections.abc import Callable
from typing import Any

CommandRunner = Callable[[list[str]], dict[str, Any]]


def _string(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first_text(record: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = _string(record.get(key))
        if value:
            return value
    return ""


def _json_from_stdout(stdout: str) -> dict[str, Any]:
    for line in reversed(stdout.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"bytedcli did not return JSON: {error}") from error
    if not isinstance(value, dict):
        raise RuntimeError("bytedcli returned a non-object JSON value")
    return value


def _error_message(payload: dict[str, Any], stderr: str, return_code: int) -> str:
    error = _record(payload.get("error"))
    action = _record(payload.get("data"))
    candidates = [
        _string(error.get("message")),
        _string(error.get("hint")),
        _string(action.get("message")) if payload.get("event") == "action_required" else "",
        stderr.strip(),
    ]
    parts: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in parts:
            parts.append(candidate)
    if parts:
        return "；".join(parts)
    return f"bytedcli exited with code {return_code}"


def _run_bytedcli(args: list[str]) -> dict[str, Any]:
    configured = os.environ.get("BYTE_DEVELOPMENT_BYTEDCLI_BIN", "bytedcli")
    executable = shutil.which(configured) if os.path.sep not in configured else configured
    if not executable:
        raise RuntimeError("未找到 bytedcli，请先安装并完成 Meego 登录")
    completed = subprocess.run(
        [executable, "--json", "--no-auto-upgrade", "meego", *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=45,
    )
    try:
        payload = _json_from_stdout(completed.stdout)
    except RuntimeError:
        if completed.returncode != 0:
            raise RuntimeError(
                completed.stderr.strip() or f"bytedcli exited with code {completed.returncode}"
            )
        raise
    if completed.returncode != 0 or payload.get("status") == "error":
        raise RuntimeError(_error_message(payload, completed.stderr, completed.returncode))
    return payload


def _payload_data(payload: dict[str, Any]) -> Any:
    return payload.get("data", payload)


def _candidate_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = _payload_data(payload)
    if isinstance(data, list):
        return [entry for entry in data if isinstance(entry, dict)]
    record = _record(data)
    for key in ("list", "items", "work_items", "workItems", "records"):
        entries = record.get(key)
        if isinstance(entries, list):
            return [entry for entry in entries if isinstance(entry, dict)]
    for value in record.values():
        nested = _record(value)
        for key in ("list", "items", "work_items", "workItems", "records"):
            entries = nested.get(key)
            if isinstance(entries, list):
                return [entry for entry in entries if isinstance(entry, dict)]
    return []


def _label(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    record = _record(value)
    return _first_text(record, "label", "name", "value")


def _normalize_item(item: dict[str, Any], index: int) -> dict[str, str] | None:
    work_item_id = _first_text(
        item, "work_item_id", "workItemId", "id", "work_item_instance_id"
    )
    title = _first_text(item, "name", "title", "work_item_name", "workItemName")
    url = _first_text(item, "url", "link", "detail_url", "detailUrl")
    if not title or (not work_item_id and not url):
        return None
    project_key = _first_text(item, "project_key", "projectKey", "space_key", "spaceKey")
    work_item_type = _first_text(
        item, "work_item_type", "workItemType", "work_item_type_key", "workItemTypeKey"
    )
    status = _label(item.get("status")) or _label(item.get("work_item_status"))
    identity = f"{project_key}:{work_item_id}" if work_item_id else url
    return {
        "id": identity or str(index),
        "title": title,
        "url": url,
        "projectKey": project_key,
        "workItemId": work_item_id,
        "status": status,
        "workItemType": work_item_type,
    }


def list_current_user_items(runner: CommandRunner = _run_bytedcli) -> dict[str, Any]:
    payload = runner(["todo", "list", "--action", "todo"])
    items = []
    seen: set[str] = set()
    for index, raw_item in enumerate(_candidate_items(payload)):
        item = _normalize_item(raw_item, index)
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)
        if len(items) >= 100:
            break
    return {"data": {"action": "list", "items": items}}


def _walk_records(value: Any, depth: int = 0) -> list[dict[str, Any]]:
    if depth > 4:
        return []
    if isinstance(value, dict):
        records = [value]
        for nested in value.values():
            records.extend(_walk_records(nested, depth + 1))
        return records
    if isinstance(value, list):
        records: list[dict[str, Any]] = []
        for nested in value[:100]:
            records.extend(_walk_records(nested, depth + 1))
        return records
    return []


def _find_text(value: Any, keys: tuple[str, ...]) -> str:
    for record in _walk_records(value):
        text = _first_text(record, *keys)
        if text:
            return text
    return ""


def _textify(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return str(value)


def _find_description(value: Any) -> str:
    keys = (
        "description_markdown",
        "descriptionMarkdown",
        "description",
        "prd",
        "content",
        "detail",
        "markdown",
    )
    for record in _walk_records(value):
        for key in keys:
            text = _textify(record.get(key))
            if text:
                return text
    return ""


def _resolve_command(origin: dict[str, Any], *, rich: bool) -> list[str]:
    url = _first_text(origin, "url", "meego_url")
    project_key = _first_text(origin, "projectKey", "project_key", "meego_project_key")
    work_item_id = _first_text(origin, "workItemId", "work_item_id", "meego_work_item_id")
    command = ["workitem", "get"]
    if rich:
        command.append("--rich")
    if url:
        command.extend(["--url", url])
        return command
    if not work_item_id:
        raise ValueError("请输入 Meego 工作项链接或选择一个 Meego 工作项")
    command.extend(["--work-item-id", work_item_id])
    if project_key:
        command.extend(["--project-key", project_key])
    return command


def resolve_prd(
    origin: dict[str, Any],
    runner: CommandRunner = _run_bytedcli,
) -> dict[str, Any]:
    rich_error = ""
    try:
        payload = runner(_resolve_command(origin, rich=True))
    except Exception as error:  # noqa: BLE001 - fallback preserves a usable basic read
        rich_error = str(error)
        try:
            payload = runner(_resolve_command(origin, rich=False))
        except Exception as fallback_error:  # noqa: BLE001 - report both provider failures
            detail = str(fallback_error)
            if rich_error and rich_error != detail:
                detail = f"{detail}（富文本读取失败：{rich_error}）"
            raise RuntimeError(detail) from fallback_error

    data = _payload_data(payload)
    title = _find_text(data, ("name", "title", "work_item_name", "workItemName"))
    description = _find_description(data)
    url = _first_text(origin, "url", "meego_url") or _find_text(
        data, ("url", "link", "detail_url", "detailUrl")
    )
    project_key = _first_text(
        origin, "projectKey", "project_key", "meego_project_key"
    ) or _find_text(data, ("project_key", "projectKey", "space_key", "spaceKey"))
    work_item_id = _first_text(
        origin, "workItemId", "work_item_id", "meego_work_item_id"
    ) or _find_text(data, ("work_item_id", "workItemId", "id"))
    if not title:
        title = f"Meego 工作项 {work_item_id}".strip()
    if not description:
        description = json.dumps(data, ensure_ascii=False, indent=2)
    prd_parts = [f"# {title}"]
    if url:
        prd_parts.append(f"Meego：{url}")
    prd_parts.append(description[:30_000])
    return {
        "data": {
            "action": "resolve",
            "title": title,
            "url": url,
            "projectKey": project_key,
            "workItemId": work_item_id,
            "prd": "\n\n".join(part for part in prd_parts if part).strip(),
            "rich": not bool(rich_error),
        }
    }


def execute_action(
    origin: dict[str, Any],
    runner: CommandRunner = _run_bytedcli,
) -> dict[str, Any]:
    action = _first_text(origin, "action")
    if action == "list":
        return list_current_user_items(runner)
    if action == "resolve":
        return resolve_prd(origin, runner)
    raise ValueError(f"Unsupported Meego action: {action or '<empty>'}")


def run_node(input: dict[str, Any]) -> dict[str, Any]:
    origin = _record(input.get("origin_input"))
    try:
        return execute_action(origin)
    except Exception as error:  # noqa: BLE001 - Workflow boundary returns structured failure
        return {
            "data": {},
            "base_resp": {
                "status_code": 400,
                "status_msg": str(error),
                "forbid_retry": 1,
            },
        }
