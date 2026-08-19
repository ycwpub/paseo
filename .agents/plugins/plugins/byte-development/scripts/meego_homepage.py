"""Read the visible work-item list from a Meego requirement homepage."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from scripts.meego_auth import MeegoAuthenticationRequired

DEFAULT_HOMEPAGE_URL = "https://meego.larkoffice.com/local_services/story/homepage"
HOMEPAGE_HSR_PATH = "/goapi/v5/search/general/get_hsr"
REQUIRED_COOKIE_NAMES = {
    "session",
    "sl_session",
    "meego_csrf_token",
    "passport_web_did",
    "login_asset_key",
    "login_tenant_key",
}

HomepageRequester = Callable[[str, dict[str, Any], str], dict[str, Any]]


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def _homepage_parts(homepage_url: str) -> tuple[str, str, str, str]:
    parsed = urlparse(homepage_url)
    parts = [part for part in parsed.path.split("/") if part]
    if (
        parsed.scheme != "https"
        or parsed.hostname != "meego.larkoffice.com"
        or len(parts) != 3
        or parts[2] != "homepage"
    ):
        raise ValueError("请输入 Meego 需求首页链接，例如 /local_services/story/homepage")
    project_simple_name, work_item_type, _ = parts
    private_key = f"/{project_simple_name}/{work_item_type}/homepage"
    public_key = f"/{project_simple_name}/{work_item_type}"
    return project_simple_name, work_item_type, private_key, public_key


def _cookie_pairs(cookie_header: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for raw_pair in cookie_header.split(";"):
        name, separator, value = raw_pair.strip().partition("=")
        if separator and name and value and name not in pairs:
            pairs[name] = value
    return pairs


def _session_path() -> Path:
    configured = os.environ.get("BYTE_DEVELOPMENT_MEEGO_COOKIE_FILE", "").strip()
    if configured:
        return Path(configured).expanduser()
    profile = os.environ.get("BYTEDCLI_PROFILE", "").strip()
    root = Path.home() / ".local" / "share" / "bytedcli"
    data_dir = root / "profiles" / profile / "data" if profile else root / "data"
    return data_dir / "meego_session.json"


def _load_cookie_bundle() -> tuple[str, str]:
    injected = os.environ.get("BYTEDCLI_MEEGO_COOKIE", "").strip()
    if injected:
        pairs = _cookie_pairs(injected)
        missing = REQUIRED_COOKIE_NAMES.difference(pairs)
        if missing:
            raise MeegoAuthenticationRequired(
                f"Meego 页面登录信息不完整，缺少：{', '.join(sorted(missing))}",
                code="MEEGO_GOAPI_AUTH_REQUIRED",
                provider="goapi",
            )
        return injected, pairs["meego_csrf_token"]

    path = _session_path()
    if not path.exists():
        raise MeegoAuthenticationRequired(
            "需要登录 Meego 页面。请打开 Meego 需求首页完成登录，"
            "或执行 `bytedcli auth login --session --feishu` 后重试。",
            code="MEEGO_GOAPI_AUTH_REQUIRED",
            provider="goapi",
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MeegoAuthenticationRequired(
            "Meego 页面登录信息不可用，请重新登录后重试。",
            code="MEEGO_GOAPI_AUTH_REQUIRED",
            provider="goapi",
        ) from error

    cookies = payload.get("cookies") if isinstance(payload, dict) else None
    if not isinstance(cookies, list):
        raise MeegoAuthenticationRequired(
            "Meego 页面登录信息格式无效，请重新登录后重试。",
            code="MEEGO_GOAPI_AUTH_REQUIRED",
            provider="goapi",
        )

    now_ms = int(time.time() * 1000)
    pairs: dict[str, str] = {}
    for cookie in cookies:
        record = _record(cookie)
        name = _string(record.get("name"))
        value = _string(record.get("value"))
        expires_at = record.get("expiresAt")
        if isinstance(expires_at, (int, float)) and expires_at <= now_ms:
            continue
        if name in REQUIRED_COOKIE_NAMES and value:
            pairs[name] = value

    missing = REQUIRED_COOKIE_NAMES.difference(pairs)
    if missing:
        raise MeegoAuthenticationRequired(
            "Meego 页面登录已失效，请重新打开页面登录，"
            "或执行 `bytedcli auth login --session --feishu` 后重试。",
            code="MEEGO_GOAPI_AUTH_EXPIRED",
            provider="goapi",
        )
    cookie_header = "; ".join(f"{name}={pairs[name]}" for name in sorted(REQUIRED_COOKIE_NAMES))
    return cookie_header, pairs["meego_csrf_token"]


def _request_homepage(url: str, body: dict[str, Any], referer: str) -> dict[str, Any]:
    cookie_header, csrf_token = _load_cookie_bundle()
    request = Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Content-Type": "application/json",
            "Cookie": cookie_header,
            "Referer": referer,
            "User-Agent": "Paseo Byte Development Plugin",
            "X-Content-Language": "zh",
            "X-Lark-Gw": "1",
            "X-Meego-Csrf-Token": csrf_token,
            "X-Meego-From": "web",
            "X-Meego-Gw-Path": HOMEPAGE_HSR_PATH,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code in {301, 302, 303, 307, 308, 401}:
            raise MeegoAuthenticationRequired(
                "Meego 页面登录已失效，请重新登录后重试。",
                code="MEEGO_GOAPI_AUTH_EXPIRED",
                provider="goapi",
            ) from error
        raise RuntimeError(f"Meego 页面请求失败：HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"无法访问 Meego 页面：{error.reason}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("Meego 页面返回了无效的 JSON") from error

    if not isinstance(payload, dict):
        raise RuntimeError("Meego 页面返回了无效的数据")
    code = payload.get("code")
    if code in {400, 10022, 11456}:
        raise MeegoAuthenticationRequired(
            "Meego 页面登录已失效，请重新登录后重试。",
            code="MEEGO_GOAPI_AUTH_EXPIRED",
            provider="goapi",
        )
    if code not in {None, 0}:
        message = _string(payload.get("msg")) or _string(payload.get("message"))
        raise RuntimeError(message or f"Meego 页面请求失败：code={code}")
    return payload


def _collect_text(value: Any) -> list[str]:
    texts: list[str] = []

    def visit(candidate: Any) -> None:
        if isinstance(candidate, list):
            for item in candidate:
                visit(item)
            return
        if not isinstance(candidate, dict):
            return
        content = _record(candidate.get("props")).get("content")
        if isinstance(content, str) and content.strip():
            texts.append(content.strip())
        for nested in candidate.values():
            visit(nested)

    visit(value)
    return texts


def _collect_cells(value: Any) -> dict[tuple[int, int], list[str]]:
    cells: dict[tuple[int, int], list[str]] = {}

    def visit(candidate: Any) -> None:
        if isinstance(candidate, list):
            for item in candidate:
                visit(item)
            return
        if not isinstance(candidate, dict):
            return
        cell = _record(_record(candidate.get("props")).get("data"))
        row = cell.get("row")
        column = cell.get("col")
        if isinstance(row, int) and isinstance(column, int):
            texts = _collect_text(candidate)
            if texts:
                cells[(row, column)] = texts
        for nested in candidate.values():
            visit(nested)

    visit(value)
    return cells


def _column_index(columns: list[Any], suffix: str) -> int:
    for index, column in enumerate(columns):
        if isinstance(column, str) and column.endswith(suffix):
            return index
    return -1


def parse_homepage_items(
    payload: dict[str, Any],
    *,
    homepage_url: str,
) -> list[dict[str, str]]:
    project_simple_name, work_item_type, _, _ = _homepage_parts(homepage_url)
    outer_data = _record(payload.get("data"))
    rendered = outer_data.get("data")
    if not isinstance(rendered, str):
        raise RuntimeError("Meego 需求首页没有返回可解析的列表")
    try:
        page = json.loads(rendered)
    except json.JSONDecodeError as error:
        raise RuntimeError("Meego 需求首页列表解析失败") from error
    if not isinstance(page, dict):
        raise RuntimeError("Meego 需求首页列表格式无效")

    keys = _record(page.get("row_column_key"))
    rows = keys.get("row")
    columns = keys.get("column")
    if not isinstance(rows, list) or not isinstance(columns, list):
        raise RuntimeError("Meego 需求首页缺少行列信息")
    title_column = _column_index(columns, f"_{work_item_type}_name")
    status_column = _column_index(columns, f"_{work_item_type}_work_item_status")
    if title_column < 0:
        raise RuntimeError("Meego 需求首页缺少需求名称列")

    title_key = _string(columns[title_column])
    project_key = title_key[: -len(f"_{work_item_type}_name")]
    cells = _collect_cells(page.get("json"))
    work_item_ids = [
        _string(row) for row in rows if _string(row) and not _string(row).startswith("__")
    ]
    items: list[dict[str, str]] = []
    for row_index, work_item_id in enumerate(work_item_ids, start=1):
        title_values = cells.get((row_index, title_column), [])
        title = title_values[0] if title_values else ""
        if not title:
            continue
        status_values = cells.get((row_index, status_column), []) if status_column >= 0 else []
        status = status_values[0] if status_values else ""
        items.append(
            {
                "id": f"{project_key}:{work_item_id}",
                "title": title,
                "url": (
                    f"https://meego.larkoffice.com/{project_simple_name}/"
                    f"{work_item_type}/detail/{work_item_id}"
                ),
                "projectKey": project_key,
                "workItemId": work_item_id,
                "status": status,
                "workItemType": work_item_type,
            }
        )
    return items


def list_homepage_items(
    homepage_url: str = DEFAULT_HOMEPAGE_URL,
    requester: HomepageRequester = _request_homepage,
) -> dict[str, Any]:
    project_simple_name, work_item_type, private_key, public_key = _homepage_parts(homepage_url)
    parsed = urlparse(homepage_url)
    endpoint = f"{parsed.scheme}://{parsed.netloc}{HOMEPAGE_HSR_PATH}"
    payload = requester(
        endpoint,
        {
            "scene": 0,
            "private_key": private_key,
            "public_key": public_key,
            "public_auth": {
                "project_simple_name": project_simple_name,
                "work_item_type_name": work_item_type,
            },
        },
        homepage_url,
    )
    items = parse_homepage_items(payload, homepage_url=homepage_url)
    return {
        "data": {
            "action": "list",
            "source": "homepage",
            "homepageUrl": homepage_url,
            "items": items,
        }
    }
