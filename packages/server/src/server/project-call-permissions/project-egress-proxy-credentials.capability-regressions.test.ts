import { describe, expect, it } from "vitest";

import { ProjectEgressProxyCredentials } from "./project-egress-proxy-credentials.js";

describe("ProjectEgressProxyCredentials", () => {
  it("issues opaque expiring credentials without persisting policy data", () => {
    let now = 1_000;
    let sequence = 0;
    const credentials = new ProjectEgressProxyCredentials({
      now: () => now,
      createToken: () => `token-${++sequence}`,
      ttlMs: 5_000,
    });

    const issued = credentials.issue({
      workspaceId: "workspace-a",
      source: "agent_process",
    });
    expect(issued).toEqual({ token: "token-1", expiresAt: 6_000 });
    expect(credentials.resolve("token-1")).toEqual({
      workspaceId: "workspace-a",
      source: "agent_process",
    });

    now = 6_001;
    expect(credentials.resolve("token-1")).toBeNull();
  });

  it("revokes one credential without affecting another Workspace", () => {
    let sequence = 0;
    const credentials = new ProjectEgressProxyCredentials({
      now: () => 1_000,
      createToken: () => `token-${++sequence}`,
    });
    const first = credentials.issue({
      workspaceId: "workspace-a",
      source: "agent_process",
    });
    const second = credentials.issue({
      workspaceId: "workspace-b",
      source: "workflow_process",
    });

    credentials.revoke(first.token);

    expect(credentials.resolve(first.token)).toBeNull();
    expect(credentials.resolve(second.token)).toEqual({
      workspaceId: "workspace-b",
      source: "workflow_process",
    });
  });

  it("caps live credentials and evicts the oldest entry", () => {
    let sequence = 0;
    const credentials = new ProjectEgressProxyCredentials({
      now: () => 1_000,
      createToken: () => `token-${++sequence}`,
      maxEntries: 2,
    });
    credentials.issue({ workspaceId: "a", source: "agent_process" });
    credentials.issue({ workspaceId: "b", source: "agent_process" });
    credentials.issue({ workspaceId: "c", source: "agent_process" });

    expect(credentials.resolve("token-1")).toBeNull();
    expect(credentials.resolve("token-2")).toEqual({
      workspaceId: "b",
      source: "agent_process",
    });
    expect(credentials.resolve("token-3")).toEqual({
      workspaceId: "c",
      source: "agent_process",
    });
  });
});
