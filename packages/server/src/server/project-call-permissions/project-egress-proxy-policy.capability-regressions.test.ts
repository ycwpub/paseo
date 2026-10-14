import { describe, expect, it, vi } from "vitest";

import {
  authorizeProjectProxyTarget,
  isRestrictedProjectProxyAddress,
  parseProjectProxyConnectTarget,
} from "./project-egress-proxy-policy.js";

describe("Project egress proxy policy", () => {
  it("authorizes an absolute HTTP request with its visible method and path", async () => {
    const authorize = vi.fn(async () => ({
      allowed: true,
      reason: "matched_allow" as const,
      matchedRuleId: "allow-api",
      enforcement: "strict" as const,
    }));

    await authorizeProjectProxyTarget({
      workspaceId: "workspace-a",
      source: "agent_process",
      method: "POST",
      target: "https://api.example.com/v1/jobs?dry_run=1",
      authorize,
    });

    expect(authorize).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      source: "agent_process",
      request: {
        kind: "http",
        url: "https://api.example.com/v1/jobs?dry_run=1",
        method: "POST",
      },
    });
  });

  it("maps CONNECT authority to a host-level HTTPS authorization request", async () => {
    expect(parseProjectProxyConnectTarget("api.example.com:8443")).toEqual({
      hostname: "api.example.com",
      port: 8443,
      authorizationUrl: "https://api.example.com:8443/",
    });
    expect(parseProjectProxyConnectTarget("[2001:db8::1]:443")).toEqual({
      hostname: "2001:db8::1",
      port: 443,
      authorizationUrl: "https://[2001:db8::1]/",
    });

    const authorize = vi.fn(async () => ({
      allowed: true,
      reason: "matched_allow" as const,
      matchedRuleId: "allow-host",
      enforcement: "strict" as const,
    }));
    await authorizeProjectProxyTarget({
      workspaceId: "workspace-a",
      source: "agent_process",
      method: "CONNECT",
      target: "api.example.com:8443",
      authorize,
    });
    expect(authorize).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      source: "agent_process",
      request: {
        kind: "http",
        url: "https://api.example.com:8443/",
        method: "CONNECT",
      },
    });
  });

  it("rejects malformed CONNECT authorities", () => {
    for (const target of [
      "api.example.com",
      "api.example.com:0",
      "api.example.com:65536",
      "user@api.example.com:443",
      "https://api.example.com:443",
    ]) {
      expect(() => parseProjectProxyConnectTarget(target)).toThrow(
        "Invalid Project proxy CONNECT target",
      );
    }
  });

  it("identifies loopback, link-local, private, multicast, and unspecified addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.1.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "::",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isRestrictedProjectProxyAddress(address), address).toBe(true);
    }
    expect(isRestrictedProjectProxyAddress("8.8.8.8")).toBe(false);
    expect(isRestrictedProjectProxyAddress("2606:4700:4700::1111")).toBe(false);
  });
});
