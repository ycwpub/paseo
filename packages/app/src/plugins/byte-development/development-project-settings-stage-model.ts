import { buildProjectSettingsRoute } from "@/utils/host-routes";
import { DEVELOPMENT_STAGES } from "./flow-model";

export const DEVELOPMENT_PROJECT_SETTINGS_STAGE = {
  id: "project_settings",
  label: "Project 设置",
  description: "配置 Project 上下文",
} as const;

export const DEVELOPMENT_FLOW_NAVIGATION_STAGES = [
  {
    kind: "project_settings",
    ...DEVELOPMENT_PROJECT_SETTINGS_STAGE,
  },
  ...DEVELOPMENT_STAGES.map((stage) => ({
    kind: "workflow" as const,
    id: stage.id,
    label: stage.label,
  })),
] as const;

export function resolveDevelopmentProjectSettingsRoute(input: {
  serverId: string;
  projectId: string | null | undefined;
}): ReturnType<typeof buildProjectSettingsRoute> | null {
  const serverId = input.serverId.trim();
  const projectId = input.projectId?.trim();
  if (!serverId || !projectId) return null;
  return buildProjectSettingsRoute(serverId, projectId);
}
