import { router, type Href } from "expo-router";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  buildOpenProjectRoute,
  buildProjectSettingsRoute,
  buildProjectsSettingsRoute,
  buildSettingsHostSectionRoute,
  buildSettingsRoute,
  type HostSectionSlug,
  type SettingsSectionSlug,
} from "@/utils/host-routes";

export type SettingsView =
  | { kind: "root" }
  | { kind: "section"; section: SettingsSectionSlug }
  | { kind: "host"; serverId: string; section: HostSectionSlug }
  | { kind: "project"; serverId: string; projectId: string }
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

export function returnFromSettings(view: SettingsView): void {
  if (view.kind === "root") {
    if (!navigateToLastWorkspace()) {
      router.replace(buildOpenProjectRoute());
    }
    return;
  }

  let parent: Href;
  if (view.kind === "project" || (view.kind === "memory" && view.projectId)) {
    parent = buildProjectsSettingsRoute(view.serverId);
  } else if (view.kind === "memory") {
    parent = buildSettingsHostSectionRoute(view.serverId, "memory");
  } else {
    parent = buildSettingsRoute();
  }
  router.dismissTo(parent as Href);
}
