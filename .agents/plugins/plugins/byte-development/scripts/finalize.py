"""Build the final development result and optional Paseo memory payload."""

from __future__ import annotations

import json
from typing import Any


def _text(value: Any, limit: int = 8_000) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def _target(target_type: str, target_id: str = "") -> dict[str, str]:
    if target_type == "global":
        return {"type": "global"}
    return {"type": target_type, "id": target_id}


def _memory_targets(origin: dict[str, Any]) -> tuple[list[dict[str, str]], str | None]:
    targets: list[dict[str, str]] = []
    if origin.get("memory_global") is True:
        targets.append(_target("global"))
    if origin.get("memory_project") is True:
        project_id = _text(origin.get("project_id"), 256)
        if not project_id:
            return [], "Project ID is required when project memory is enabled."
        targets.append(_target("project", project_id))
    if origin.get("memory_assistant") is True:
        assistant_id = _text(origin.get("assistant_id"), 256)
        if not assistant_id:
            return [], "Assistant ID is required when assistant memory is enabled."
        targets.append(_target("assistant", assistant_id))
    return targets, None


def _entry(title: str, category: str, content: str, *keywords: str) -> dict[str, Any]:
    return {
        "title": title,
        "category": category,
        "content": content,
        "keywords": list(keywords),
        "confidence": 0.9,
        "importance": 0.8,
    }


def run_node(input: dict[str, Any]) -> dict[str, Any]:
    origin = input.get("origin_input")
    variables = input.get("workflow", {}).get("var", {})
    if not isinstance(origin, dict) or not isinstance(variables, dict):
        return {
            "data": {},
            "base_resp": {
                "status_code": 400,
                "status_msg": "Invalid Workflow input envelope.",
                "forbid_retry": 1,
            },
        }

    targets, target_error = _memory_targets(origin)
    if target_error:
        return {
            "data": {},
            "base_resp": {
                "status_code": 400,
                "status_msg": target_error,
                "forbid_retry": 1,
            },
        }

    stage_fields = [
        ("prd_analysis", "PRD 分析", "project", ("prd", "requirements")),
        ("technical_design", "技术方案", "decision", ("architecture", "design")),
        ("agent_instruction", "Agent 开发指令", "procedure", ("agent", "implementation")),
        ("development_summary", "开发结果", "project", ("development", "changes")),
        ("review_summary", "Review 结论", "decision", ("review", "quality")),
    ]
    entries = []
    memory_instructions = _text(origin.get("memory_instructions"), 2_000)
    for variable_name, title, category, keywords in stage_fields:
        content = _text(variables.get(variable_name))
        if content:
            if memory_instructions:
                content = f"{content}\n\n记忆规范：{memory_instructions}"[:8_000]
            entries.append(_entry(title, category, content, *keywords))

    bits = {
        "deploy": _text(variables.get("deploy_summary")),
        "test": _text(variables.get("test_summary")),
        "release": _text(variables.get("release_summary")),
    }
    bits_content = json.dumps(bits, ensure_ascii=False, indent=2)
    if any(bits.values()):
        entries.append(
            _entry(
                "BITS 流程经验",
                "procedure",
                bits_content[:8_000],
                "bits",
                "deploy",
                "test",
                "release",
            )
        )

    return {
        "data": {
            "status": "completed",
            "repository_path": _text(origin.get("repository_path"), 4_096),
            "stages": {
                key: _text(variables.get(key), 20_000)
                for key in (
                    "prd_analysis",
                    "technical_design",
                    "agent_instruction",
                    "development_summary",
                    "review_summary",
                    "deploy_summary",
                    "test_summary",
                    "release_summary",
                )
            },
            "memory": {
                "targets": targets,
                "entries": entries,
            },
        }
    }
