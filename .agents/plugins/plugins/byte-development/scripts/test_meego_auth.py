import os
import tempfile
import unittest
from unittest.mock import patch

from scripts.meego_auth import _json_from_output, begin_login, complete_login


class MeegoAuthTest(unittest.TestCase):
    def test_parses_pretty_printed_meegle_json(self) -> None:
        self.assertEqual(
            _json_from_output(
                """{
  "client_id": "client-id",
  "device_code": "secret-device-code",
  "verification_uri": "https://meego.example.com/device"
}"""
            ),
            {
                "client_id": "client-id",
                "device_code": "secret-device-code",
                "verification_uri": "https://meego.example.com/device",
            },
        )

    def test_parses_pretty_printed_json_surrounded_by_cli_logs(self) -> None:
        self.assertEqual(
            _json_from_output(
                """Meegle CLI warning
{
  "status": "authorization_pending",
  "interval": 5
}
Login is still pending."""
            ),
            {
                "status": "authorization_pending",
                "interval": 5,
            },
        )

    def test_begin_and_complete_login_without_exposing_device_code(self) -> None:
        with tempfile.TemporaryDirectory() as state_dir:
            with (
                patch.dict(os.environ, {"BYTE_DEVELOPMENT_AUTH_STATE_DIR": state_dir}),
                patch(
                    "scripts.meego_auth._run_meegle",
                    side_effect=[
                        {
                            "device_code": "secret-device-code",
                            "client_id": "client-id",
                            "verification_uri_complete": "https://meego.example.com/device",
                            "user_code": "ABCD",
                            "expires_in": 600,
                            "interval": 1,
                        },
                        {"authenticated": True, "status": "success"},
                    ],
                ),
            ):
                started = begin_login()
                data = started["data"]
                self.assertEqual(data["loginStatus"], "pending")
                self.assertEqual(data["verificationUrl"], "https://meego.example.com/device")
                self.assertNotIn("device_code", data)

                completed = complete_login(data["completeToken"])
                self.assertEqual(completed["data"]["loginStatus"], "success")

    def test_complete_login_keeps_authorization_pending(self) -> None:
        with tempfile.TemporaryDirectory() as state_dir:
            with (
                patch.dict(os.environ, {"BYTE_DEVELOPMENT_AUTH_STATE_DIR": state_dir}),
                patch(
                    "scripts.meego_auth._run_meegle",
                    side_effect=[
                        {
                            "device_code": "secret-device-code",
                            "client_id": "client-id",
                            "verification_uri_complete": "https://meego.example.com/device",
                        },
                        {
                            "status": "authorization_pending",
                            "_paseo_exit_code": 1,
                        },
                    ],
                ),
            ):
                started = begin_login()
                completed = complete_login(started["data"]["completeToken"])

                self.assertEqual(completed["data"]["loginStatus"], "pending")


if __name__ == "__main__":
    unittest.main()
