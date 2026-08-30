import type { SettingsView } from "@/navigation/settings-navigation";
import type { HostSectionSlug } from "@/utils/host-feature-routes";

export function getSettingsViewServerId(view: SettingsView): string | null {
  switch (view.kind) {
    case "host":
    case "project":
    case "project-knowledge":
    case "project-lark-groups":
    case "project-lark-group":
    case "memory":
    case "memory-page":
    case "resource-sync":
    case "assistant":
    case "assistant-memory":
    case "team":
    case "instruction-templates":
    case "instruction-template":
    case "mcp-server":
    case "skill":
      return view.serverId;
    default:
      return null;
  }
}

export function getHostSectionAfterHostSwitch(view: SettingsView): HostSectionSlug | null {
  if (view.kind === "host") {
    return view.section === "relay" ? "connections" : view.section;
  }
  if (
    view.kind === "project" ||
    view.kind === "project-knowledge" ||
    view.kind === "project-lark-groups" ||
    view.kind === "project-lark-group"
  ) {
    return "projects";
  }
  if (view.kind === "memory") {
    return view.projectId ? "projects" : "memory";
  }
  if (view.kind === "memory-page") {
    return "memory";
  }
  if (view.kind === "resource-sync") {
    return "connections";
  }
  if (view.kind === "assistant" || view.kind === "assistant-memory" || view.kind === "team") {
    return "assistants";
  }
  if (view.kind === "instruction-templates" || view.kind === "instruction-template") {
    return "agents";
  }
  if (view.kind === "mcp-server") {
    return "mcp";
  }
  if (view.kind === "skill") {
    return "skills";
  }
  return null;
}
