import { describe, expect, it, vi } from "vitest";

import { projectFetch } from "./project-http-client.js";

describe("projectFetch", () => {
  it("does not issue a request when the Project denies its method and path", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const authorize = vi.fn(async () => {
      throw new Error("PROJECT_PERMISSION_DENIED");
    });

    await expect(
      projectFetch("https://api.example.com/private/jobs", {
        method: "POST",
        workspaceId: "workspace-a",
        source: "workflow",
        authorize,
        fetchImplementation,
      }),
    ).rejects.toThrow("PROJECT_PERMISSION_DENIED");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("reauthorizes every redirect target before following it", async () => {
    const authorize = vi
      .fn()
      .mockResolvedValueOnce({
        allowed: true,
        reason: "matched_allow",
        matchedRuleId: "allow-first",
        enforcement: "managed",
      })
      .mockRejectedValueOnce(new Error("PROJECT_PERMISSION_DENIED"));
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://blocked.example.net/secret" },
      }),
    );

    await expect(
      projectFetch("https://allowed.example.com/start", {
        workspaceId: "workspace-a",
        source: "plugin",
        authorize,
        fetchImplementation,
      }),
    ).rejects.toThrow("PROJECT_PERMISSION_DENIED");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-a",
      source: "plugin",
      request: {
        kind: "http",
        url: "https://blocked.example.net/secret",
        method: "GET",
      },
    });
  });
});
