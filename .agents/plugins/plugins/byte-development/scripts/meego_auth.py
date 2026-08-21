"""Non-blocking official Meegle CLI authentication for the development plugin."""

from __future__ import annotations

import json
import os
import platform
import shutil
import stat
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

AUTH_ERROR_CODES = {
    "AUTH_REQUIRED",
    "MEEGLE_AUTH_REQUIRED",
    "MEEGO_AUTH_REQUIRED",
}


class MeegoAuthenticationRequired(RuntimeError):
    def __init__(self, message: str, *, code: str = "MEEGLE_AUTH_REQUIRED") -> None:
        super().__init__(message)
        self.code = code
        self.provider = "official" if "MEEGLE" in code else "legacy"


def _string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def authentication_error(payload: dict[str, Any], message: str) -> MeegoAuthenticationRequired | None:
    error = _record(payload.get("error"))
    data = _record(payload.get("data"))
    code = _string(error.get("code")) or _string(data.get("code"))
    normalized_message = message.lower()
    if (
        code in AUTH_ERROR_CODES
        or "authentication is required" in normalized_message
        or "bytedcli meego login" in normalized_message
    ):
        return MeegoAuthenticationRequired(message, code=code or "MEEGLE_AUTH_REQUIRED")
    return None


def _json_from_output(output: str) -> dict[str, Any]:
    normalized = output.strip()
    if normalized:
        try:
            value = json.loads(normalized)
        except json.JSONDecodeError:
            pass
        else:
            if isinstance(value, dict):
                return value

    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value

    decoder = json.JSONDecoder()
    records: list[dict[str, Any]] = []
    for index, character in enumerate(output):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(output, index)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    if records:
        return records[-1]
    raise RuntimeError("Meegle CLI did not return JSON")


def _resolve_meegle_binary() -> str:
    configured = os.environ.get("BYTE_DEVELOPMENT_MEEGLE_BIN", "").strip()
    if configured:
        executable = shutil.which(configured) if os.path.sep not in configured else configured
        if executable:
            return executable

    direct = shutil.which("meegle")
    if direct:
        return direct

    bytedcli = os.environ.get("BYTE_DEVELOPMENT_BYTEDCLI_BIN", "bytedcli")
    bytedcli_path = shutil.which(bytedcli) if os.path.sep not in bytedcli else bytedcli
    if bytedcli_path:
        resolved = Path(bytedcli_path).resolve()
        package_root = resolved.parent.parent
        bundled = package_root / "node_modules" / ".bin" / "meegle"
        if bundled.exists():
            return str(bundled)
        suffix = {
            ("Darwin", "arm64"): "darwin-arm64",
            ("Darwin", "x86_64"): "darwin-x64",
            ("Linux", "aarch64"): "linux-arm64",
            ("Linux", "x86_64"): "linux-x64",
        }.get((platform.system(), platform.machine()))
        if suffix:
            binary = package_root / "node_modules" / "@lark-project" / "meegle" / "bin" / f"meegle-{suffix}"
            if binary.exists():
                return str(binary)
    raise RuntimeError("未找到 Meegle CLI，请更新 bytedcli 后重试")


def _run_meegle(args: list[str]) -> dict[str, Any]:
    completed = subprocess.run(
        [_resolve_meegle_binary(), *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=45,
    )
    combined = "\n".join(part for part in (completed.stdout, completed.stderr) if part.strip())
    try:
        payload = _json_from_output(combined)
    except RuntimeError:
        if completed.returncode != 0:
            raise RuntimeError(combined.strip() or f"Meegle CLI exited with code {completed.returncode}")
        raise
    status = _string(payload.get("status")).lower()
    normalized_output = combined.lower()
    is_pending = status in {"pending", "authorization_pending", "slow_down"} or any(
        marker in normalized_output for marker in ("authorization_pending", "slow_down")
    )
    if completed.returncode != 0 and not is_pending:
        error = _record(payload.get("error"))
        message = _string(error.get("message")) or combined.strip()
        raise RuntimeError(message or f"Meegle CLI exited with code {completed.returncode}")
    return {**payload, "_paseo_exit_code": completed.returncode}


def _state_root() -> Path:
    configured = os.environ.get("BYTE_DEVELOPMENT_AUTH_STATE_DIR", "").strip()
    root = Path(configured).expanduser() if configured else Path.home() / ".paseo" / "plugin-state"
    path = root / "byte-development" / "meego-auth"
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def _challenge_path(token: str) -> Path:
    if not token or any(character not in "0123456789abcdef-" for character in token.lower()):
        raise ValueError("无效的 Meego 登录凭据")
    return _state_root() / f"{token}.json"


def _save_challenge(challenge: dict[str, Any]) -> str:
    token = str(uuid.uuid4())
    path = _challenge_path(token)
    path.write_text(json.dumps(challenge, ensure_ascii=False), encoding="utf-8")
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return token


def _load_challenge(token: str) -> dict[str, Any]:
    path = _challenge_path(token)
    if not path.exists():
        raise ValueError("Meego 登录二维码已过期，请重新登录")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Meego 登录状态无效，请重新登录")
    return value


def _delete_challenge(token: str) -> None:
    _challenge_path(token).unlink(missing_ok=True)


def _first(payload: dict[str, Any], *keys: str) -> Any:
    data = _record(payload.get("data"))
    for source in (data, payload):
        for key in keys:
            value = source.get(key)
            if value not in (None, ""):
                return value
    return None


def begin_login() -> dict[str, Any]:
    host = os.environ.get("BYTE_DEVELOPMENT_MEEGO_HOST", "meego.larkoffice.com").strip()
    profile = os.environ.get("BYTE_DEVELOPMENT_MEEGO_PROFILE", "bytedcli").strip()
    payload = _run_meegle(
        [
            "auth",
            "login",
            "--device-code",
            "--phase",
            "init",
            "--once",
            "--host",
            host,
            "--format",
            "json",
            "--profile",
            profile,
        ]
    )
    device_code = _string(_first(payload, "device_code", "deviceCode"))
    client_id = _string(_first(payload, "client_id", "clientId"))
    verification_url = _string(
        _first(
            payload,
            "verification_uri_complete",
            "verificationUriComplete",
            "verification_uri",
            "verificationUri",
        )
    )
    if not device_code or not client_id or not verification_url:
        raise RuntimeError("Meegle CLI 未返回可用的登录二维码或链接")
    expires_in = int(_first(payload, "expires_in", "expiresIn") or 600)
    interval = int(_first(payload, "interval") or 5)
    complete_token = _save_challenge(
        {
            "device_code": device_code,
            "client_id": client_id,
            "host": host,
            "profile": profile,
            "expires_in": expires_in,
            "interval": interval,
            "created_at": int(time.time()),
        }
    )
    return {
        "data": {
            "action": "login_begin",
            "loginStatus": "pending",
            "completeToken": complete_token,
            "verificationUrl": verification_url,
            "userCode": _string(_first(payload, "user_code", "userCode")),
            "expiresIn": expires_in,
            "pollIntervalSeconds": interval,
        }
    }


def complete_login(token: str) -> dict[str, Any]:
    challenge = _load_challenge(token)
    if int(time.time()) >= int(challenge["created_at"]) + int(challenge["expires_in"]):
        _delete_challenge(token)
        return {"data": {"action": "login_complete", "loginStatus": "expired"}}
    payload = _run_meegle(
        [
            "auth",
            "login",
            "--device-code",
            "--phase",
            "poll",
            "--once",
            "--host",
            str(challenge["host"]),
            "--format",
            "json",
            "--profile",
            str(challenge["profile"]),
            "--client-id",
            str(challenge["client_id"]),
            "--device-code-value",
            str(challenge["device_code"]),
            "--expires-in",
            str(challenge["expires_in"]),
            "--interval",
            str(challenge["interval"]),
        ]
    )
    status = _string(_first(payload, "login_status", "loginStatus", "status", "error")).lower()
    normalized_payload = json.dumps(payload, ensure_ascii=False).lower()
    authenticated = _first(payload, "authenticated")
    if authenticated is True or status in {"success", "authenticated", "ready", "completed"}:
        _delete_challenge(token)
        return {"data": {"action": "login_complete", "loginStatus": "success"}}
    if status in {"expired", "expired_token", "denied", "access_denied"} or any(
        marker in normalized_payload for marker in ("expired_token", "access_denied")
    ):
        _delete_challenge(token)
        return {"data": {"action": "login_complete", "loginStatus": "expired"}}
    if (
        int(payload.get("_paseo_exit_code", 1)) == 0
        and "authorization_pending" not in normalized_payload
        and "slow_down" not in normalized_payload
    ):
        _delete_challenge(token)
        return {"data": {"action": "login_complete", "loginStatus": "success"}}
    return {
        "data": {
            "action": "login_complete",
            "loginStatus": "pending",
            "completeToken": token,
        }
    }
