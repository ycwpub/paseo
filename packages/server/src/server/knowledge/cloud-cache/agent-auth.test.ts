import { describe, expect, it } from "vitest";
import type { AgentManager } from "../../agent/agent-manager.js";
import { requestCloudKnowledgeAuthorization } from "./agent-auth.js";
import type { CloudDocumentCacheService } from "./service.js";

describe("requestCloudKnowledgeAuthorization", () => {
  it("asks Paseo to retry authorization initialization instead of asking the user to run a command", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const agentManager = {
      requestFrameworkPermission: async (_agentId: string, input: Record<string, unknown>) => {
        requests.push(input);
        return "request-1";
      },
    } as unknown as AgentManager;

    await requestCloudKnowledgeAuthorization({
      agentId: "agent-1",
      requests: [
        {
          target: {
            scope: "global",
            source: "https://bytedance.larkoffice.com/wiki/private",
          },
          issue: {
            kind: "authentication_required",
            source: "https://bytedance.larkoffice.com/wiki/private",
            message: "Paseo 自动生成飞书授权链接失败：找不到 lark-cli。",
            loginUrl: null,
            authCommand: "lark-cli auth login --domain docs,drive,wiki --recommend",
            completionToken: null,
          },
        },
      ],
      service: {} as CloudDocumentCacheService,
      agentManager,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      request: {
        description: expect.not.stringContaining("请先在主机执行"),
        actions: [
          expect.objectContaining({
            id: "retry-auth-link",
            label: "重新生成授权链接",
            behavior: "allow",
          }),
          expect.anything(),
        ],
      },
    });
  });

  it("requests a fresh permission card when retrying creates an authorization link", async () => {
    const requests: Array<{
      request: {
        metadata?: Record<string, unknown>;
      };
      onResponse: (response: { behavior: "allow" }) => Promise<void>;
    }> = [];
    const source = "https://bytedance.larkoffice.com/wiki/private";
    const agentManager = {
      requestFrameworkPermission: async (
        _agentId: string,
        input: {
          request: {
            metadata?: Record<string, unknown>;
          };
          onResponse: (response: { behavior: "allow" }) => Promise<void>;
        },
      ) => {
        requests.push(input);
        return `request-${requests.length}`;
      },
      appendTimelineItem: async () => undefined,
    } as unknown as AgentManager;
    const service = {
      resolve: async () => ({
        source,
        cached: false,
        cachedAt: null,
        checkedAt: null,
        localPath: null,
        stale: true,
        content: null,
        error: "需要授权",
        authIssue: {
          kind: "authentication_required" as const,
          source,
          message: "需要授权",
          loginUrl: "https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=flow",
          authCommand: null,
          completionToken: "device-code",
        },
      }),
    } as unknown as CloudDocumentCacheService;

    await requestCloudKnowledgeAuthorization({
      agentId: "agent-1",
      requests: [
        {
          target: { scope: "global", source },
          issue: {
            kind: "authentication_required",
            source,
            message: "Paseo 自动生成飞书授权链接失败：临时错误。",
            loginUrl: null,
            authCommand: null,
            completionToken: null,
          },
        },
      ],
      service,
      agentManager,
    });
    await requests[0]?.onResponse({ behavior: "allow" });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.request.metadata).toMatchObject({
      permissionType: "cloud-knowledge-auth",
      loginUrl: "https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=flow",
    });
  });
});
