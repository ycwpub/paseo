import { describe, expect, it } from "vitest";

import {
  LinuxProjectNetworkIsolationAdapter,
  parseLinuxProjectNetworkHelperStatus,
} from "./linux-project-network-isolation-adapter.js";

describe("LinuxProjectNetworkIsolationAdapter", () => {
  it("activates the privileged project proxy helper after every process path is wired", async () => {
    const adapter = new LinuxProjectNetworkIsolationAdapter({
      platform: "linux",
      externalProxyAvailable: true,
      helperPath: "/opt/Paseo/resources/network-helper/paseo-network-helper",
      runStatus: async () =>
        JSON.stringify({
          version: "1",
          capability: "project_proxy",
          privilege_active: true,
          strict_ready: true,
        }),
    });

    await expect(adapter.status("project-a")).resolves.toBe("active");
  });

  it("stays unavailable on non-Debian Linux hosts", async () => {
    const adapter = new LinuxProjectNetworkIsolationAdapter({
      platform: "linux",
      externalProxyAvailable: false,
      helperPath: "/opt/Paseo/resources/network-helper/paseo-network-helper",
      runStatus: async () =>
        JSON.stringify({
          version: "3",
          capability: "project_proxy",
          privilege_active: true,
          strict_ready: true,
        }),
    });

    await expect(adapter.status("project-a")).resolves.toBe("unavailable");
  });

  it("accepts only a privileged helper that explicitly reports strict readiness", async () => {
    expect(
      parseLinuxProjectNetworkHelperStatus(
        JSON.stringify({
          version: "2",
          capability: "project_proxy",
          privilege_active: true,
          strict_ready: true,
        }),
      ),
    ).toEqual({
      version: "2",
      capability: "project_proxy",
      privilegeActive: true,
      strictReady: true,
    });
  });

  it("stays unavailable on non-Linux hosts and malformed helper responses", async () => {
    const adapter = new LinuxProjectNetworkIsolationAdapter({
      platform: "darwin",
      helperPath: "/missing",
      runStatus: async () => "not json",
    });

    await expect(adapter.status("project-a")).resolves.toBe("unavailable");
    expect(() => parseLinuxProjectNetworkHelperStatus("not json")).toThrow(
      "Invalid Linux network helper status",
    );
  });

  it("starts the proxy and returns helper launch environment", async () => {
    const adapter = new LinuxProjectNetworkIsolationAdapter({
      platform: "linux",
      externalProxyAvailable: true,
      helperPath: "/opt/Paseo/helper",
      runStatus: async () =>
        JSON.stringify({
          version: "3",
          capability: "project_proxy",
          privilege_active: true,
          strict_ready: true,
        }),
      proxyServer: {
        start: async () => ({ host: "0.0.0.0", port: 43123 }),
      },
      credentials: {
        issue: () => ({
          token: "token-value-0123456789",
          expiresAt: Date.now() + 60_000,
        }),
      },
    });

    await expect(
      adapter.prepare({
        projectId: "project-a",
        workspaceId: "workspace-a",
        source: "agent_process",
      }),
    ).resolves.toEqual({
      PASEO_PROJECT_NETWORK_ISOLATION: "1",
      PASEO_LINUX_NETWORK_HELPER_PATH: "/opt/Paseo/helper",
      PASEO_PROJECT_PROXY_PORT: "43123",
      PASEO_PROJECT_PROXY_TOKEN: "token-value-0123456789",
    });
  });
});
