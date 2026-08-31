import { router, type Href } from "expo-router";
import {
  openHostOverview,
  openProjectSettings,
  returnFromSettings as returnFromCoreSettings,
  type SettingsView as CoreSettingsView,
} from "./settings-navigation";
import {
  buildAssistantSettingsRoute,
  buildHostMemoryRoute,
  buildHostResourceSyncRoute,
  buildInstructionTemplatesSettingsRoute,
  buildProjectKnowledgeSettingsRoute,
  buildProjectLarkGroupSettingsRoute,
  buildProjectLarkGroupsSettingsRoute,
  buildProjectMemoryRoute,
  buildSettingsHostSectionRoute,
  type HostMemorySettingsPage,
  type HostResourceSyncPage,
  type HostSectionSlug as FeatureHostSectionSlug,
} from "@/utils/host-feature-routes";
import {
  buildProjectSettingsRoute,
  buildProjectsSettingsRoute,
  buildSettingsRoute,
} from "@/utils/host-routes";

export type SettingsView =
  | Exclude<CoreSettingsView, { kind: "host" }>
  | {
      kind: "host";
      serverId: string;
      section: FeatureHostSectionSlug;
    }
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

export { openHostOverview, openProjectSettings };

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

function isCoreSettingsView(view: SettingsView): view is CoreSettingsView {
  return view.kind === "root" || view.kind === "section" || view.kind === "project";
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
  if (isCoreSettingsView(view)) {
    returnFromCoreSettings(view);
    return;
  }

  let parent: Href;
  if (view.kind === "host") {
    parent = buildSettingsRoute();
  } else if (view.kind === "memory" && view.memoryId) {
    parent = view.projectId
      ? buildProjectMemoryRoute(view.serverId, view.projectId)
      : buildHostMemoryRoute(view.serverId);
  } else if (view.kind === "assistant-memory") {
    parent = buildAssistantSettingsRoute(view.serverId, view.assistantId);
  } else if (isProjectResourceView(view)) {
    parent = buildProjectSettingsRoute(view.serverId, view.projectId);
  } else if (view.kind === "memory" && view.projectId) {
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
  } else if (view.kind === "memory-page" || view.kind === "memory") {
    parent = buildSettingsHostSectionRoute(view.serverId, "memory");
  } else {
    parent = buildSettingsHostSectionRoute(view.serverId, "connections");
  }
  router.dismissTo(parent);
}
