import { router, type Href } from "expo-router";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  buildOpenProjectRoute,
  buildProjectSettingsRoute,
  buildProjectsSettingsRoute,
  buildSettingsRoute,
  type SettingsSectionSlug,
} from "@/utils/host-routes";
import {
  buildAssistantSettingsRoute,
  buildHostMemoryRoute,
  buildHostResourceSyncRoute,
  buildInstructionTemplatesSettingsRoute,
  buildProjectLarkGroupSettingsRoute,
  buildProjectKnowledgeSettingsRoute,
  buildProjectMemoryRoute,
  buildProjectLarkGroupsSettingsRoute,
  buildSettingsHostSectionRoute,
  type HostMemorySettingsPage,
  type HostResourceSyncPage,
  type HostSectionSlug,
} from "@/utils/host-feature-routes";

export type SettingsView =
  | { kind: "root" }
  | { kind: "section"; section: SettingsSectionSlug }
  | { kind: "host"; serverId: string; section: HostSectionSlug }
  | { kind: "project"; serverId: string; projectId: string }
  | { kind: "project-knowledge"; serverId: string; projectId: string }
  | { kind: "project-lark-groups"; serverId: string; projectId: string }
  | { kind: "project-lark-group"; serverId: string; projectId: string; groupId?: string }
  | { kind: "assistant"; serverId: string; assistantId?: string }
  | { kind: "assistant-memory"; serverId: string; assistantId: string }
  | { kind: "team"; serverId: string; teamId?: string }
  | { kind: "instruction-templates"; serverId: string }
  | { kind: "instruction-template"; serverId: string; templateId?: string }
  | { kind: "mcp-server"; serverId: string; mcpServerId?: string }
  | { kind: "skill"; serverId: string; skillId?: string }
  | { kind: "memory-page"; serverId: string; page: HostMemorySettingsPage }
  | { kind: "resource-sync"; serverId: string; page: HostResourceSyncPage }
  | {
      kind: "memory";
      serverId: string;
      projectId?: string;
      memoryId?: string;
    };

export function openHostOverview(serverId: string): void {
  router.push(buildSettingsHostSectionRoute(serverId, "host"));
}

export function openProjectSettings(serverId: string, projectId: string): void {
  router.push(buildProjectSettingsRoute(serverId, projectId));
}

export function openProjectLarkGroupsSettings(serverId: string, projectId: string): void {
  router.push(buildProjectLarkGroupsSettingsRoute(serverId, projectId));
}

export function openProjectLarkGroupSettings(
  serverId: string,
  projectId: string,
  groupId?: string,
): void {
  router.push(buildProjectLarkGroupSettingsRoute(serverId, projectId, groupId));
}

export function openProjectKnowledgeSettings(serverId: string, projectId: string): void {
  router.push(buildProjectKnowledgeSettingsRoute(serverId, projectId));
}

export function openHostResourceSync(serverId: string, page: HostResourceSyncPage): void {
  router.push(buildHostResourceSyncRoute(serverId, page));
}

function returnFromSettingsRoot(view: SettingsView): boolean {
  if (view.kind !== "root") return false;
  if (!navigateToLastWorkspace()) {
    router.replace(buildOpenProjectRoute());
  }
  return true;
}

function isProjectResourceView(
  view: SettingsView,
): view is Extract<
  SettingsView,
  { kind: "project-lark-groups" | "project-lark-group" | "project-knowledge" }
> {
  return (
    view.kind === "project-lark-groups" ||
    view.kind === "project-lark-group" ||
    view.kind === "project-knowledge"
  );
}

export function returnFromSettings(view: SettingsView): void {
  if (returnFromSettingsRoot(view)) return;

  let parent: Href;
  if (view.kind === "memory" && view.memoryId) {
    parent = view.projectId
      ? buildProjectMemoryRoute(view.serverId, view.projectId)
      : buildHostMemoryRoute(view.serverId);
  } else if (view.kind === "assistant-memory") {
    parent = buildAssistantSettingsRoute(view.serverId, view.assistantId);
  } else if (isProjectResourceView(view)) {
    parent = buildProjectSettingsRoute(view.serverId, view.projectId);
  } else if (view.kind === "project" || (view.kind === "memory" && view.projectId)) {
    parent = buildProjectsSettingsRoute(view.serverId);
  } else if (view.kind === "assistant" || view.kind === "team") {
    parent = buildSettingsHostSectionRoute(view.serverId, "assistants");
  } else if (view.kind === "instruction-template") {
    parent = buildInstructionTemplatesSettingsRoute(view.serverId);
  } else if (view.kind === "instruction-templates") {
    parent = buildSettingsHostSectionRoute(view.serverId, "agents");
  } else if (view.kind === "mcp-server") {
    parent = buildSettingsHostSectionRoute(view.serverId, "mcp");
  } else if (view.kind === "skill") {
    parent = buildSettingsHostSectionRoute(view.serverId, "skills");
  } else if (view.kind === "memory-page") {
    parent = buildSettingsHostSectionRoute(view.serverId, "memory");
  } else if (view.kind === "resource-sync") {
    parent = buildSettingsHostSectionRoute(view.serverId, "connections");
  } else if (view.kind === "memory") {
    parent = buildSettingsHostSectionRoute(view.serverId, "memory");
  } else {
    parent = buildSettingsRoute();
  }
  router.dismissTo(parent as Href);
}
