import { describe, expect, it } from "vitest";
import { SessionInboundMessageSchema, SessionOutboundMessageSchema } from "../messages.js";

describe("cloud knowledge cache RPC schemas", () => {
  it("accepts cache and status request/response messages", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "knowledge.cloud_document.cache.request",
        requestId: "req-1",
        scope: "project",
        projectId: "prj-1",
        source: "https://example.com/doc",
        force: true,
      }),
    ).toMatchObject({ type: "knowledge.cloud_document.cache.request" });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "knowledge.cloud_document.cache.response",
        payload: {
          requestId: "req-1",
          status: {
            source: "https://example.com/doc",
            cached: false,
            cachedAt: null,
            checkedAt: null,
            localPath: null,
            stale: true,
            error: "需要登录",
            authIssue: {
              kind: "authentication_required",
              source: "https://example.com/doc",
              message: "需要登录",
              loginUrl: "https://example.com/login",
              authCommand: null,
            },
          },
          error: null,
        },
      }),
    ).toMatchObject({ type: "knowledge.cloud_document.cache.response" });
  });

  it("keeps the capability optional for older server_info payloads", () => {
    expect(
      SessionOutboundMessageSchema.safeParse({
        type: "status",
        payload: {
          status: "server_info",
          serverId: "server-1",
          features: {},
        },
      }).success,
    ).toBe(true);
  });
});
