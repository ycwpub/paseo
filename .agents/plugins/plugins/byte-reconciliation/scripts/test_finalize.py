import unittest

from scripts.finalize import run_node


class FinalizeTest(unittest.TestCase):
    def test_project_memory_uses_project_first_identifier(self):
        result = run_node(
            {
                "origin_input": {
                    "projectId": "project-1",
                    "memory_project": True,
                },
                "workflow": {"var": {"analysis_summary": "summary"}},
            }
        )

        self.assertEqual(
            result["data"]["memory"]["targets"],
            [{"type": "project", "id": "project-1"}],
        )


if __name__ == "__main__":
    unittest.main()
