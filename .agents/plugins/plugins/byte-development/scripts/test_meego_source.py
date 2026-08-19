import unittest

from scripts.meego_source import _error_message, execute_action


class MeegoSourceTest(unittest.TestCase):
    def test_preserves_authentication_hint_in_error_message(self) -> None:
        message = _error_message(
            {
                "status": "error",
                "error": {
                    "message": "Meegle CLI authentication is required.",
                    "hint": "Run `bytedcli meego login`, then retry.",
                },
            },
            "",
            1,
        )

        self.assertIn("Meegle CLI authentication is required.", message)
        self.assertIn("bytedcli meego login", message)

    def test_lists_and_normalizes_current_user_todos(self) -> None:
        result = execute_action(
            {"action": "list"},
            lambda command: {
                "status": "success",
                "data": {
                    "list": [
                        {
                            "work_item_id": 123,
                            "name": "登录优化",
                            "project_key": "demo",
                            "work_item_type": "story",
                            "status": {"label": "处理中"},
                            "url": "https://meego.example.com/demo/story/detail/123",
                        }
                    ]
                },
            },
        )

        self.assertEqual(
            result,
            {
                "data": {
                    "action": "list",
                    "items": [
                        {
                            "id": "demo:123",
                            "title": "登录优化",
                            "url": "https://meego.example.com/demo/story/detail/123",
                            "projectKey": "demo",
                            "workItemId": "123",
                            "status": "处理中",
                            "workItemType": "story",
                        }
                    ],
                }
            },
        )

    def test_resolves_rich_meego_description_into_prd(self) -> None:
        result = execute_action(
            {
                "action": "resolve",
                "url": "https://meego.example.com/demo/story/detail/123",
            },
            lambda command: {
                "status": "success",
                "data": {
                    "work_item": {
                        "work_item_id": "123",
                        "project_key": "demo",
                        "name": "登录优化",
                        "description_markdown": "降低登录失败率。",
                    }
                },
            },
        )

        self.assertEqual(result["data"]["title"], "登录优化")
        self.assertEqual(result["data"]["workItemId"], "123")
        self.assertIn("降低登录失败率。", result["data"]["prd"])
        self.assertTrue(result["data"]["rich"])

    def test_falls_back_to_basic_get_when_rich_read_is_unavailable(self) -> None:
        calls: list[list[str]] = []

        def runner(command: list[str]) -> dict:
            calls.append(command)
            if "--rich" in command:
                raise RuntimeError("Feishu session is required")
            return {
                "status": "success",
                "data": {"work_item_id": "123", "name": "登录优化", "description": "基础描述"},
            }

        result = execute_action(
            {"action": "resolve", "project_key": "demo", "work_item_id": "123"},
            runner,
        )

        self.assertEqual(len(calls), 2)
        self.assertFalse(result["data"]["rich"])
        self.assertIn("基础描述", result["data"]["prd"])


if __name__ == "__main__":
    unittest.main()
