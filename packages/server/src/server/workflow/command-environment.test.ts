import { describe, expect, it } from "vitest";
import { resolveWorkflowCommandEnvironment } from "./command-environment.js";

describe("workflow command environment", () => {
  it("merges workflow variables over the daemon environment", async () => {
    await expect(
      resolveWorkflowCommandEnvironment(
        {
          inherit: "daemon",
          variables: {
            PATH: "/workflow/bin",
            FIXED_WIKI_URL: "https://example.test/wiki",
          },
        },
        {
          baseEnvironment: {
            PATH: "/daemon/bin",
            HOME: "/tmp/home",
          },
        },
      ),
    ).resolves.toEqual({
      env: {
        PATH: "/workflow/bin",
        HOME: "/tmp/home",
        FIXED_WIKI_URL: "https://example.test/wiki",
      },
      source: "daemon",
      path: "/workflow/bin",
    });
  });

  it("uses the login-shell environment before applying workflow variables", async () => {
    await expect(
      resolveWorkflowCommandEnvironment(
        {
          inherit: "login-shell",
          variables: { MODE: "scan_only" },
        },
        {
          baseEnvironment: { SHELL: "/bin/test-shell" },
          loadLoginShellEnvironment: async () => ({
            PATH: "/login/bin",
            MODE: "full",
          }),
        },
      ),
    ).resolves.toEqual({
      env: {
        PATH: "/login/bin",
        MODE: "scan_only",
      },
      source: "login-shell",
      path: "/login/bin",
    });
  });
});
