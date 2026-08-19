import json
import unittest

from scripts.meego_auth import MeegoAuthenticationRequired
from scripts.meego_homepage import (
    DEFAULT_HOMEPAGE_URL,
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
