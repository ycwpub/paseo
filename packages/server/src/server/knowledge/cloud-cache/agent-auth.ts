import type { AgentPermissionResponse } from "../../agent/agent-sdk-types.js";
import type { AgentManager } from "../../agent/agent-manager.js";
import type { CloudDocumentCacheService } from "./service.js";
import { completeCloudDocumentAuthentication } from "./source.js";
import type { CloudDocumentAuthenticationIssue, CloudDocumentCacheTarget } from "./types.js";

export interface CloudKnowledgeAuthorizationRequest {
  target: CloudDocumentCacheTarget;
  issue: CloudDocumentAuthenticationIssue;
}

function permissionDescription(issue: CloudDocumentAuthenticationIssue): string {
  const instructions = issue.loginUrl
    ? "请先打开登录链接完成授权，然后点击“已完成授权，重试缓存”。"
    : "Paseo 未能自动生成授权链接。请点击“重新生成授权链接”再次尝试，无需手动执行命令。";
  return [`无法读取云文档：${issue.source}`, issue.message, instructions].join("\n\n");
}

async function handlePermissionResponse(input: {
  response: AgentPermissionResponse;
  agentId: string;
  target: CloudDocumentCacheTarget;
  issue: CloudDocumentAuthenticationIssue;
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
  try {
    await completeCloudDocumentAuthentication(input.issue);
  } catch (error) {
    await input.agentManager.appendTimelineItem(input.agentId, {
      type: "assistant_message",
      text: `飞书授权确认失败：${error instanceof Error ? error.message : String(error)}`,
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
  if (resolved.authIssue) {
    await requestCloudKnowledgeAuthorization({
      agentId: input.agentId,
      requests: [{ target: input.target, issue: resolved.authIssue }],
      service: input.service,
      agentManager: input.agentManager,
    });
    return;
  }
  const detail = resolved.error ?? "未知错误";
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
      `${request.target.scope}:${request.target.projectId ?? ""}:${request.target.assistantId ?? ""}:${request.target.source}`,
      request,
    ]),
  );
  for (const { target, issue } of uniqueRequests.values()) {
    const hasAuthorizationLink = Boolean(issue.loginUrl);
    await input.agentManager.requestFrameworkPermission(input.agentId, {
      request: {
        name: "cloud-knowledge-auth",
        kind: "other",
        title: "云文档需要登录授权",
        description: permissionDescription(issue),
        actions: [
          {
            id: hasAuthorizationLink ? "retry-after-auth" : "retry-auth-link",
            label: hasAuthorizationLink ? "已完成授权，重试缓存" : "重新生成授权链接",
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
          assistantId: target.assistantId ?? null,
          loginUrl: issue.loginUrl,
          authCommand: issue.authCommand,
        },
      },
      onResponse: (response) =>
        handlePermissionResponse({
          response,
          agentId: input.agentId,
          target,
          issue,
          service: input.service,
          agentManager: input.agentManager,
        }),
    });
  }
}
