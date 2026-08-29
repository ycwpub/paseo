import type { HostResourceSyncPage } from "@/utils/host-routes";

export interface HostResourceSyncEntry {
  page: HostResourceSyncPage;
  title: string;
  description: string;
}

export const HOST_RESOURCE_SYNC_ENTRIES: readonly HostResourceSyncEntry[] = [
  {
    page: "memory",
    title: "同步记忆",
    description: "按全局、Project 或助手范围在不同主机之间同步记忆。",
  },
  {
    page: "knowledge",
    title: "同步知识",
    description: "同步全局、Project 或助手知识，并可创建、覆盖或合并本地内容。",
  },
  {
    page: "mcp",
    title: "同步 MCP",
    description: "同步 MCP 服务定义、传输配置和启用状态。",
  },
  {
    page: "skills",
    title: "同步技能",
    description: "同步技能内容、元数据和启用状态。",
  },
  {
    page: "plugins",
    title: "同步插件",
    description: "同步插件安装来源、启用状态和本地插件目录内容。",
  },
  {
    page: "assistants",
    title: "同步助手",
    description: "同步助手定义、提示词、知识、记忆和资源选择。",
  },
];

export const HOST_RESOURCE_SYNC_PAGE_TITLES: Record<HostResourceSyncPage, string> =
  Object.fromEntries(
    HOST_RESOURCE_SYNC_ENTRIES.map((entry) => [entry.page, entry.title]),
  ) as Record<HostResourceSyncPage, string>;
