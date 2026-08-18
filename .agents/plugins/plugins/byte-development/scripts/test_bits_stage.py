import unittest

from scripts.bits_stage import execute_stage


class BitsStageTest(unittest.TestCase):
    def test_unapproved_test_never_calls_bytedcli(self) -> None:
        calls: list[list[str]] = []
        result = execute_stage(
            {
                "origin_input": {
                    "bits_dev_task_id": "123",
                    "approve_test": False,
                }
            },
            "test",
            lambda command: calls.append(command) or {},
        )
        self.assertEqual(calls, [])
        self.assertEqual(result["data"]["status"], "awaiting_approval")

    def test_deploy_uses_dry_run_until_explicitly_approved(self) -> None:
        calls: list[list[str]] = []
        execute_stage(
            {
                "origin_input": {
                    "bits_dev_task_id": "123",
                    "bits_psm": "example.service",
                    "bits_project_type": "tce",
                    "bits_phase": "dev",
                    "target_branch": "master",
                    "control_plane": "cn",
                    "approve_deploy": False,
                }
            },
            "deploy",
            lambda command: calls.append(command) or {"status": "success"},
        )
        self.assertEqual(len(calls), 1)
        self.assertIn("--dry-run", calls[0])
        self.assertNotIn("--yes", calls[0])

    def test_release_checks_state_before_live_publish(self) -> None:
        calls: list[list[str]] = []
        execute_stage(
            {
                "origin_input": {
                    "bits_dev_task_id": "123",
                    "approve_release": True,
                }
            },
            "release",
            lambda command: calls.append(command) or {"status": "success"},
        )
        self.assertEqual(calls[0][-3:], ["get", "--dev-id", "123"])
        self.assertEqual(calls[1][-4:], ["publish", "--dev-id", "123", "--yes"])


if __name__ == "__main__":
    unittest.main()
