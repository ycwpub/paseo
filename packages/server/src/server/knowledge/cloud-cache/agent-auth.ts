import type { AgentPermissionResponse } from "../../agent/agent-sdk-types.js";
import type { AgentManager } from "../../agent/agent-manager.js";
import type { CloudDocumentCacheService } from "./service.js";
import type { CloudDocumentAuthenticationIssue, CloudDocumentCacheTarget } from "./types.js";

export interface CloudKnowledgeAuthorizationRequest {
  target: CloudDocumentCacheTarget;
  issue: CloudDocumentAuthenticationIssue;
}

function permissionDescription(issue: CloudDocumentAuthenticationIssue): string {
  let instructions = "请先完成对应云文档服务的登录或授权，然后重试缓存。";
  if (issue.loginUrl) {
    instructions = "请先打开登录链接完成授权，然后点击“已完成授权，重试缓存”。";
  } else if (issue.authCommand) {
    instructions = `请先在主机执行：${issue.authCommand}，然后点击“已完成授权，重试缓存”。`;
  }
  return [`无法读取云文档：${issue.source}`, issue.message, instructions].join("\n\n");
}

async function handlePermissionResponse(input: {
  response: AgentPermissionResponse;
  agentId: string;
  target: CloudDocumentCacheTarget;
  service: CloudDocumentCacheService;
  agentManager: AgentManager;
}): Promise<void> {
  if (input.response.behavior !== "allow") {
    await input.agentManager.appendTimelineItem(input.agentId, {
      type: "assistant_message",
      text: `已暂不缓存云文档：${input.target.source}`,
    });
    return;
  }
  const resolved = await input.service.resolve(input.target, { force: true });
  if (resolved.cached && !resolved.authIssue) {
    await input.agentManager.appendTimelineItem(input.agentId, {
      type: "assistant_message",
      text: `云文档已缓存到本地：${resolved.localPath ?? input.target.source}`,
    });
    return;
  }
  const detail = resolved.authIssue?.message ?? resolved.error ?? "未知错误";
  await input.agentManager.appendTimelineItem(input.agentId, {
    type: "assistant_message",
    text: `云文档缓存仍然失败：${input.target.source}\n${detail}`,
  });
}

export async function requestCloudKnowledgeAuthorization(input: {
  agentId: string;
  requests: readonly CloudKnowledgeAuthorizationRequest[];
  service: CloudDocumentCacheService;
  agentManager: AgentManager;
}): Promise<void> {
  const uniqueRequests = new Map(
    input.requests.map((request) => [
      `${request.target.scope}:${request.target.projectId ?? ""}:${request.target.source}`,
      request,
    ]),
  );
  for (const { target, issue } of uniqueRequests.values()) {
    await input.agentManager.requestFrameworkPermission(input.agentId, {
      request: {
        name: "cloud-knowledge-auth",
        kind: "other",
        title: "云文档需要登录授权",
        description: permissionDescription(issue),
        actions: [
          {
            id: "retry-after-auth",
            label: "已完成授权，重试缓存",
            behavior: "allow",
            variant: "primary",
          },
          {
            id: "skip",
            label: "暂不授权",
            behavior: "deny",
            variant: "secondary",
            intent: "dismiss",
          },
        ],
        metadata: {
          permissionType: "cloud-knowledge-auth",
          source: issue.source,
          scope: target.scope,
          projectId: target.projectId ?? null,
          loginUrl: issue.loginUrl,
          authCommand: issue.authCommand,
        },
      },
      onResponse: (response) =>
        handlePermissionResponse({
          response,
          agentId: input.agentId,
          target,
          service: input.service,
          agentManager: input.agentManager,
        }),
    });
  }
}
