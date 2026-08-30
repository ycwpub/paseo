import {
  HOST_SECTION_SLUGS as CORE_HOST_SECTION_SLUGS,
  type HostSectionSlug as CoreHostSectionSlug,
} from "@/utils/host-routes";

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function buildWorkflowsRoute() {
  return "/workflows" as const;
}

export const FEATURE_HOST_SECTION_SLUGS = [
  "relay",
  "assistants",
  "memory",
  "knowledge",
  "mcp",
  "skills",
  "channels",
] as const;

export type FeatureHostSectionSlug = (typeof FEATURE_HOST_SECTION_SLUGS)[number];
export type HostSectionSlug = CoreHostSectionSlug | FeatureHostSectionSlug;

export const HOST_SECTION_SLUGS: readonly HostSectionSlug[] = [
  ...CORE_HOST_SECTION_SLUGS,
  ...FEATURE_HOST_SECTION_SLUGS,
];

const LEGACY_FEATURE_HOST_SECTION_SLUGS: Record<string, HostSectionSlug> = {
  orchestration: "agents",
  daemon: "host",
  tools: "mcp",
};

export function isHostSectionSlug(value: string): value is HostSectionSlug {
  return (HOST_SECTION_SLUGS as readonly string[]).includes(value);
}

export function normalizeHostSectionSlug(value: string): HostSectionSlug | null {
  if (isHostSectionSlug(value)) return value;
  return LEGACY_FEATURE_HOST_SECTION_SLUGS[value] ?? null;
}

export function buildSettingsHostSectionRoute(serverId: string, section: HostSectionSlug) {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    throw new Error("buildSettingsHostSectionRoute requires a non-empty serverId");
  }
  return `/settings/hosts/${encodeSegment(normalized)}/${section}` as const;
}

export const HOST_RESOURCE_SYNC_PAGES = [
  "memory",
  "knowledge",
  "mcp",
  "skills",
  "plugins",
  "assistants",
] as const;

export type HostResourceSyncPage = (typeof HOST_RESOURCE_SYNC_PAGES)[number];

export function normalizeHostResourceSyncPage(value: string): HostResourceSyncPage | null {
  return (HOST_RESOURCE_SYNC_PAGES as readonly string[]).includes(value)
    ? (value as HostResourceSyncPage)
    : null;
}

export function buildHostResourceSyncRoute(serverId: string, page: HostResourceSyncPage) {
  const normalized = trimNonEmpty(serverId);
  if (!normalized) {
    throw new Error("buildHostResourceSyncRoute requires a non-empty serverId");
  }
  return `/settings/hosts/${encodeSegment(normalized)}/connections/sync/${page}` as const;
}

export function buildAssistantSettingsRoute(serverId: string, assistantId?: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  if (!normalizedServerId) {
    throw new Error("buildAssistantSettingsRoute requires a non-empty serverId");
  }
  const target = trimNonEmpty(assistantId) ?? "new";
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/assistants/${encodeSegment(target)}` as const;
}

export function buildAssistantMemorySettingsRoute(serverId: string, assistantId: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  const normalizedAssistantId = trimNonEmpty(assistantId);
  if (!normalizedServerId || !normalizedAssistantId) {
    throw new Error(
      "buildAssistantMemorySettingsRoute requires a non-empty serverId and assistantId",
    );
  }
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/assistants/${encodeSegment(normalizedAssistantId)}/memory` as const;
}

export function buildTeamSettingsRoute(serverId: string, teamId?: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  if (!normalizedServerId) {
    throw new Error("buildTeamSettingsRoute requires a non-empty serverId");
  }
  const target = trimNonEmpty(teamId) ?? "new";
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/teams/${encodeSegment(target)}` as const;
}

export function buildInstructionTemplatesSettingsRoute(serverId: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  if (!normalizedServerId) {
    throw new Error("buildInstructionTemplatesSettingsRoute requires a non-empty serverId");
  }
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/instruction-templates` as const;
}

export function buildInstructionTemplateSettingsRoute(serverId: string, templateId?: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  if (!normalizedServerId) {
    throw new Error("buildInstructionTemplateSettingsRoute requires a non-empty serverId");
  }
  const target = trimNonEmpty(templateId) ?? "new";
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/instruction-templates/${encodeSegment(target)}` as const;
}

export function buildMcpServerSettingsRoute(serverId: string, mcpServerId?: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  if (!normalizedServerId) {
    throw new Error("buildMcpServerSettingsRoute requires a non-empty serverId");
  }
  const target = trimNonEmpty(mcpServerId) ?? "new";
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/mcp-servers/${encodeSegment(target)}` as const;
}

export function buildSkillSettingsRoute(serverId: string, skillId?: string) {
  const normalizedServerId = trimNonEmpty(serverId);
  if (!normalizedServerId) {
    throw new Error("buildSkillSettingsRoute requires a non-empty serverId");
  }
  const target = trimNonEmpty(skillId) ?? "new";
  return `/settings/hosts/${encodeSegment(normalizedServerId)}/skills/${encodeSegment(target)}` as const;
}

function assertProjectRouteIds(serverId: string, projectId: string, functionName: string): void {
  if (!serverId.trim() || !projectId.trim()) {
    throw new Error(`${functionName} requires a serverId and projectId`);
  }
}

export function buildProjectLarkGroupsSettingsRoute(serverId: string, projectId: string) {
  assertProjectRouteIds(serverId, projectId, "buildProjectLarkGroupsSettingsRoute");
  return `/settings/hosts/${encodeSegment(serverId)}/projects/${encodeSegment(projectId)}/lark-groups` as const;
}

export function buildProjectLarkGroupSettingsRoute(
  serverId: string,
  projectId: string,
  groupId?: string,
) {
  assertProjectRouteIds(serverId, projectId, "buildProjectLarkGroupSettingsRoute");
  const target = trimNonEmpty(groupId) ?? "new";
  return `/settings/hosts/${encodeSegment(serverId)}/projects/${encodeSegment(projectId)}/lark-groups/${encodeSegment(target)}` as const;
}

export function buildProjectKnowledgeSettingsRoute(serverId: string, projectId: string) {
  assertProjectRouteIds(serverId, projectId, "buildProjectKnowledgeSettingsRoute");
  return `/settings/hosts/${encodeSegment(serverId)}/projects/${encodeSegment(projectId)}/knowledge` as const;
}

export function buildHostMemoryRoute(serverId: string) {
  if (!serverId.trim()) {
    throw new Error("buildHostMemoryRoute requires a non-empty serverId");
  }
  return `/settings/hosts/${encodeSegment(serverId)}/memories` as const;
}

export function buildHostMemoryDetailRoute(serverId: string, memoryId: string) {
  if (!serverId.trim() || !memoryId.trim()) {
    throw new Error("buildHostMemoryDetailRoute requires a serverId and memoryId");
  }
  return `/settings/hosts/${encodeSegment(serverId)}/memories/${encodeSegment(memoryId)}` as const;
}

export const HOST_MEMORY_SETTINGS_PAGES = ["policies", "summary", "sync", "transfer"] as const;
export type HostMemorySettingsPage = (typeof HOST_MEMORY_SETTINGS_PAGES)[number];

export function normalizeHostMemorySettingsPage(value: string): HostMemorySettingsPage | null {
  return (HOST_MEMORY_SETTINGS_PAGES as readonly string[]).includes(value)
    ? (value as HostMemorySettingsPage)
    : null;
}

export function buildHostMemorySettingsPageRoute(serverId: string, page: HostMemorySettingsPage) {
  if (!serverId.trim()) {
    throw new Error("buildHostMemorySettingsPageRoute requires a non-empty serverId");
  }
  return `/settings/hosts/${encodeSegment(serverId)}/memory/${page}` as const;
}

export function buildProjectMemoryRoute(serverId: string, projectId: string) {
  assertProjectRouteIds(serverId, projectId, "buildProjectMemoryRoute");
  return `/settings/hosts/${encodeSegment(serverId)}/projects/${encodeSegment(projectId)}/memories` as const;
}

export function buildProjectMemoryDetailRoute(
  serverId: string,
  projectId: string,
  memoryId: string,
) {
  if (!serverId.trim() || !projectId.trim() || !memoryId.trim()) {
    throw new Error("buildProjectMemoryDetailRoute requires a serverId, projectId, and memoryId");
  }
  return `/settings/hosts/${encodeSegment(serverId)}/projects/${encodeSegment(projectId)}/memories/${encodeSegment(memoryId)}` as const;
}
