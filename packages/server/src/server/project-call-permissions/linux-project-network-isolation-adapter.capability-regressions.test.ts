import { describe, expect, it } from "vitest";

import {
  LinuxProjectNetworkIsolationAdapter,
  parseLinuxProjectNetworkHelperStatus,
} from "./linux-project-network-isolation-adapter.js";

describe("LinuxProjectNetworkIsolationAdapter", () => {
  it("does not treat the deny-only helper as strict-ready", async () => {
    const adapter = new LinuxProjectNetworkIsolationAdapter({
      platform: "linux",
      helperPath: "/opt/Paseo/resources/network-helper/paseo-network-helper",
      runStatus: async () =>
        JSON.stringify({
          version: "1",
          capability: "proxy_namespace",
          privilege_active: true,
          strict_ready: false,
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
});
