from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.meego_auth import MeegoAuthenticationRequired
from scripts.meego_homepage import (
    DEFAULT_HOMEPAGE_URL,
    REQUIRED_COOKIE_NAMES,
    _load_cookie_bundle,
    list_homepage_items,
    parse_homepage_items,
)


def hsr_payload() -> dict:
    return {
        "code": 0,
        "data": {
            "data": json.dumps(
                {
                    "json": [
                        {
                            "props": {"data": {"row": 1, "col": 1}},
                            "children": [{"props": {"content": "登录体验优化"}}],
                        },
                        {
                            "props": {"data": {"row": 1, "col": 2}},
                            "children": [
                                {"props": {"content": "开发中"}},
                                {"props": {"content": "2 天"}},
                            ],
                        },
                        {
                            "props": {"data": {"row": 2, "col": 1}},
                            "children": [{"props": {"content": "结算链路改造"}}],
                        },
                        {
                            "props": {"data": {"row": 2, "col": 2}},
                            "children": [{"props": {"content": "待评审"}}],
                        },
                    ],
                    "row_column_key": {
                        "row": ["__title", "__group_", "101", "102"],
                        "column": [
                            "index",
                            "project-key_story_name",
                            "project-key_story_work_item_status",
                        ],
                    },
                    "view_mode": "table",
                },
                ensure_ascii=False,
            )
        },
    }


class MeegoHomepageTest(unittest.TestCase):
    @staticmethod
    def _write_cookie_cache(path: Path, *, expired: set[str] | None = None) -> None:
        expired = expired or set()
        now_ms = int(time.time() * 1000)
        path.write_text(
            json.dumps(
                {
                    "cookies": [
                        {
                            "name": name,
                            "value": f"value-{name}",
                            "expiresAt": now_ms - 1 if name in expired else now_ms + 60_000,
                        }
                        for name in REQUIRED_COOKIE_NAMES
                    ]
                }
            ),
            encoding="utf-8",
        )

    def test_uses_valid_cookie_cache_without_refreshing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "meego_session.json"
            self._write_cookie_cache(cache_path)
            with (
                patch.dict(os.environ, {}, clear=False),
                patch("scripts.meego_homepage._session_path", return_value=cache_path),
                patch("scripts.meego_homepage.refresh_goapi_session") as refresh,
            ):
                cookie_header, csrf_token = _load_cookie_bundle()

        refresh.assert_not_called()
        self.assertIn("session=value-session", cookie_header)
        self.assertEqual(csrf_token, "value-meego_csrf_token")

    def test_refreshes_expired_cookie_cache_from_feishu_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "meego_session.json"
            self._write_cookie_cache(cache_path, expired={"sl_session"})

            def refresh() -> None:
                self._write_cookie_cache(cache_path)

            with (
                patch.dict(os.environ, {}, clear=False),
                patch("scripts.meego_homepage._session_path", return_value=cache_path),
                patch("scripts.meego_homepage.refresh_goapi_session", side_effect=refresh) as mocked,
            ):
                cookie_header, csrf_token = _load_cookie_bundle()

        mocked.assert_called_once_with()
        self.assertIn("sl_session=value-sl_session", cookie_header)
        self.assertEqual(csrf_token, "value-meego_csrf_token")

    def test_reports_login_only_when_automatic_refresh_is_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "meego_session.json"
            self._write_cookie_cache(cache_path, expired={"sl_session"})
            with (
                patch.dict(os.environ, {}, clear=False),
                patch("scripts.meego_homepage._session_path", return_value=cache_path),
                patch(
                    "scripts.meego_homepage.refresh_goapi_session",
                    side_effect=MeegoAuthenticationRequired(
                        "请刷新飞书登录态。",
                        code="MEEGO_GOAPI_AUTH_REQUIRED",
                        provider="goapi",
                    ),
                ),
                self.assertRaises(MeegoAuthenticationRequired) as raised,
            ):
                _load_cookie_bundle()

        self.assertEqual(raised.exception.code, "MEEGO_GOAPI_AUTH_REQUIRED")
        self.assertIn("刷新飞书登录态", str(raised.exception))

    def test_parses_visible_work_items_from_homepage_hsr(self) -> None:
        items = parse_homepage_items(
            hsr_payload(),
            homepage_url="https://meego.larkoffice.com/local_services/story/homepage",
        )

        self.assertEqual(
            items,
            [
                {
                    "id": "project-key:101",
                    "title": "登录体验优化",
                    "url": "https://meego.larkoffice.com/local_services/story/detail/101",
                    "projectKey": "project-key",
                    "workItemId": "101",
                    "status": "开发中",
                    "workItemType": "story",
                },
                {
                    "id": "project-key:102",
                    "title": "结算链路改造",
                    "url": "https://meego.larkoffice.com/local_services/story/detail/102",
                    "projectKey": "project-key",
                    "workItemId": "102",
                    "status": "待评审",
                    "workItemType": "story",
                },
            ],
        )

    def test_fetches_the_user_configured_homepage(self) -> None:
        requests: list[tuple[str, dict, str]] = []

        def request(url: str, body: dict, referer: str) -> dict:
            requests.append((url, body, referer))
            return hsr_payload()

        result = list_homepage_items(
            homepage_url=DEFAULT_HOMEPAGE_URL,
            requester=request,
        )

        self.assertEqual(result["data"]["source"], "homepage")
        self.assertEqual(result["data"]["homepageUrl"], DEFAULT_HOMEPAGE_URL)
        self.assertEqual(len(result["data"]["items"]), 2)
        self.assertEqual(
            requests,
            [
                (
                    "https://meego.larkoffice.com/goapi/v5/search/general/get_hsr",
                    {
                        "scene": 0,
                        "private_key": "/local_services/story/homepage",
                        "public_key": "/local_services/story",
                        "public_auth": {
                            "project_simple_name": "local_services",
                            "work_item_type_name": "story",
                        },
                    },
                    DEFAULT_HOMEPAGE_URL,
                )
            ],
        )

    def test_rejects_non_homepage_urls(self) -> None:
        with self.assertRaisesRegex(ValueError, "Meego 需求首页"):
            list_homepage_items(
                homepage_url="https://meego.larkoffice.com/local_services/story/detail/123",
                requester=lambda *_: hsr_payload(),
            )

    def test_requires_goapi_login_when_page_session_is_missing(self) -> None:
        def request(_url: str, _body: dict, _referer: str) -> dict:
            raise MeegoAuthenticationRequired(
                "请先登录 Meego 页面。",
                code="MEEGO_GOAPI_AUTH_REQUIRED",
                provider="goapi",
            )

        with self.assertRaises(MeegoAuthenticationRequired) as raised:
            list_homepage_items(homepage_url=DEFAULT_HOMEPAGE_URL, requester=request)

        self.assertEqual(raised.exception.provider, "goapi")


if __name__ == "__main__":
    unittest.main()
