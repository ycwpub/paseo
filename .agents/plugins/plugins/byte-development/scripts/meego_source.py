"""Read current-user Meego work items and resolve a work item into PRD text."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from collections.abc import Callable
from typing import Any

from scripts.meego_auth import (
    MeegoAuthenticationRequired,
    authentication_error,
    begin_login,
    complete_login,
)
from scripts.meego_homepage import DEFAULT_HOMEPAGE_URL, list_homepage_items

CommandRunner = Callable[[list[str]], dict[str, Any]]
HomepageReader = Callable[[str], dict[str, Any]]


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
        message = _error_message(payload, completed.stderr, completed.returncode)
        auth_error = authentication_error(payload, message)
        if auth_error:
            raise auth_error
        raise RuntimeError(message)
    return payload


def _payload_data(payload: dict[str, Any]) -> Any:
    return payload.get("data", payload)


def list_current_user_items(
    homepage_url: str = DEFAULT_HOMEPAGE_URL,
    homepage_reader: HomepageReader = list_homepage_items,
) -> dict[str, Any]:
    return homepage_reader(homepage_url)


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
    except MeegoAuthenticationRequired as error:
        if error.provider == "official":
            raise
        rich_error = str(error)
        try:
            payload = runner(_resolve_command(origin, rich=False))
        except MeegoAuthenticationRequired:
            raise
        except Exception as fallback_error:  # noqa: BLE001 - report both provider failures
            detail = str(fallback_error)
            if rich_error and rich_error != detail:
                detail = f"{detail}（富文本读取失败：{rich_error}）"
            raise RuntimeError(detail) from fallback_error
    except Exception as error:  # noqa: BLE001 - fallback preserves a usable basic read
        rich_error = str(error)
        try:
            payload = runner(_resolve_command(origin, rich=False))
        except MeegoAuthenticationRequired:
            raise
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
    homepage_reader: HomepageReader = list_homepage_items,
) -> dict[str, Any]:
    action = _first_text(origin, "action")
    if action == "list":
        homepage_url = _first_text(origin, "homepageUrl", "homepage_url") or DEFAULT_HOMEPAGE_URL
        return list_current_user_items(homepage_url, homepage_reader)
    if action == "resolve":
        return resolve_prd(origin, runner)
    if action == "login_begin":
        return begin_login()
    if action == "login_complete":
        return complete_login(_first_text(origin, "completeToken", "complete_token"))
    raise ValueError(f"Unsupported Meego action: {action or '<empty>'}")


def run_node(input: dict[str, Any]) -> dict[str, Any]:
    origin = _record(input.get("origin_input"))
    try:
        return execute_action(origin)
    except MeegoAuthenticationRequired as error:
        auth_data = {
            "action": _first_text(origin, "action"),
            "authRequired": True,
            "authProvider": error.provider,
            "authCode": error.code,
            "authMessage": str(error),
        }
        if error.provider == "goapi":
            auth_data["authUrl"] = (
                _first_text(origin, "homepageUrl", "homepage_url") or DEFAULT_HOMEPAGE_URL
            )
        return {"data": auth_data}
    except Exception as error:  # noqa: BLE001 - Workflow boundary returns structured failure
        return {
            "data": {},
            "base_resp": {
                "status_code": 400,
                "status_msg": str(error),
                "forbid_retry": 1,
            },
        }
