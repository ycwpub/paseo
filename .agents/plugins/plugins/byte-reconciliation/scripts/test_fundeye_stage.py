import unittest

from scripts.fundeye_stage import execute_stage


class FundEyeStageTest(unittest.TestCase):
    def test_unapproved_write_only_returns_proposal(self):
        calls = []
        result = execute_stage(
            {
                "origin_input": {
                    "platform_action": "tcheck_create",
                    "approve_platform_write": False,
                },
                "data": {
                    "platform_action": "tcheck_create",
                    "platform_payload": {"name": "demo"},
                },
            },
            "apply",
            lambda command: calls.append(command) or {},
        )

        self.assertEqual(result["data"]["status"], "awaiting_approval")
        self.assertEqual(calls, [])

    def test_tcheck_draft_uses_allowlisted_argument_array(self):
        calls = []

        def runner(command):
            calls.append(command)
            if "get" in command:
                return {"data": {"rule_id": "rule-1"}}
            return {"data": {"saved": True}}

        result = execute_stage(
            {
                "origin_input": {
                    "platform_action": "tcheck_draft",
                    "approve_platform_write": True,
                    "rule_id": "rule-1",
                    "sitename": "cn",
                },
                "data": {
                    "platform_action": "tcheck_draft",
                    "platform_payload": {"priority": "P1"},
                },
            },
            "apply",
            runner,
        )

        self.assertEqual(result["data"]["status"], "completed")
        self.assertIn(
            [
                "bytedcli",
                "--json",
                "fundeye",
                "rule",
                "save-draft",
                "--product-type",
                "tcheck",
                "--rule-id",
                "rule-1",
                "--params",
                '{"priority":"P1"}',
                "--sitename",
                "cn",
            ],
            calls,
        )

    def test_fullink_debug_requires_explicit_approval(self):
        calls = []
        result = execute_stage(
            {
                "origin_input": {
                    "remote_test_mode": "fullink_double_debug",
                    "rule_id": "rule-1",
                    "approve_remote_test": False,
                },
                "data": {},
            },
            "test",
            lambda command: calls.append(command) or {},
        )

        self.assertEqual(result["data"]["status"], "awaiting_approval")
        self.assertEqual(calls, [])

    def test_approved_fullink_debug_passes_samples_as_arguments(self):
        calls = []
        result = execute_stage(
            {
                "origin_input": {
                    "remote_test_mode": "fullink_double_debug",
                    "rule_id": "rule-1",
                    "rule_version": "7",
                    "edge_seq": 2,
                    "upstream_data_json": '{"order_id":"a"}',
                    "downstream_data_json": '{"order_id":"a"}',
                    "approve_remote_test": True,
                },
                "data": {},
            },
            "test",
            lambda command: calls.append(command) or {"matched": True},
        )

        self.assertEqual(result["data"]["status"], "completed")
        self.assertEqual(
            calls[0],
            [
                "bytedcli",
                "--json",
                "fundeye",
                "rule",
                "double",
                "debug",
                "--rule-id",
                "rule-1",
                "--rule-version",
                "7",
                "--edge-seq",
                "2",
                "--upstream-data",
                '{"order_id":"a"}',
                "--downstream-data",
                '{"order_id":"a"}',
            ],
        )

    def test_diff_comparison_is_read_only(self):
        calls = []
        result = execute_stage(
            {
                "origin_input": {
                    "rule_id": "rule-1",
                    "product_type": "fullink",
                    "compare_start": "2026-08-01 00:00:00",
                    "compare_end": "2026-08-01 23:59:59",
                },
                "data": {},
            },
            "compare",
            lambda command: calls.append(command) or {"diffs": []},
        )

        self.assertEqual(result["data"]["status"], "completed")
        self.assertEqual(calls[0][3:6], ["diff", "list", "--rule-id"])
        self.assertNotIn("--yes", calls[0])


if __name__ == "__main__":
    unittest.main()
