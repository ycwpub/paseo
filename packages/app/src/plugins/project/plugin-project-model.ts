import {
  DEFAULT_PLUGIN_APP_PROJECT_BINDING,
  type PluginAppProjectBinding,
} from "@getpaseo/protocol/messages";
import {
  getHostProjectId,
  getHostProjectSourceDirectory,
  type HostProjectListItem,
} from "@/projects/host-projects";
import type { SelectFieldOption } from "@/components/ui/select-field";

export interface PluginProjectOption extends SelectFieldOption<string> {
  projectName: string;
  sourceDirectory: string | null;
}

export function resolvePluginProjectBinding(
  binding: PluginAppProjectBinding | undefined,
): PluginAppProjectBinding {
  return binding ?? DEFAULT_PLUGIN_APP_PROJECT_BINDING;
}

export function buildPluginProjectOptions(
  projects: readonly HostProjectListItem[],
  serverId: string,
): PluginProjectOption[] {
  return projects.flatMap((project) => {
    const projectId = getHostProjectId(project, serverId);
    if (!projectId) return [];
    const sourceDirectory = getHostProjectSourceDirectory(project, serverId);
    return [
      {
        id: projectId,
        value: projectId,
        label: project.projectName,
        description: sourceDirectory ?? projectId,
        projectName: project.projectName,
        sourceDirectory,
      },
    ];
  });
}

export function resolveInitialPluginProjectId(input: {
  currentProjectId: string | null;
  activeProjectId: string | null;
  options: readonly PluginProjectOption[];
}): string | null {
  if (
    input.currentProjectId &&
    input.options.some((option) => option.value === input.currentProjectId)
  ) {
    return input.currentProjectId;
  }
  if (
    input.activeProjectId &&
    input.options.some((option) => option.value === input.activeProjectId)
  ) {
    return input.activeProjectId;
  }
  return input.options[0]?.value ?? null;
}

export function buildPluginProjectFormValues(
  binding: PluginAppProjectBinding,
  project: PluginProjectOption,
): Record<string, unknown> {
  return {
    projectId: project.value,
    projectName: project.projectName,
    projectSourceDirectory: project.sourceDirectory ?? "",
    [binding.idField]: project.value,
    ...(binding.nameField ? { [binding.nameField]: project.projectName } : {}),
    ...(binding.sourceDirectoryField
      ? { [binding.sourceDirectoryField]: project.sourceDirectory ?? "" }
      : {}),
  };
}

export function pluginProjectBoundFieldIds(binding: PluginAppProjectBinding): string[] {
  return [
    "projectId",
    "projectName",
    "projectSourceDirectory",
    binding.idField,
    ...(binding.nameField ? [binding.nameField] : []),
    ...(binding.sourceDirectoryField ? [binding.sourceDirectoryField] : []),
  ].filter((value, index, values) => values.indexOf(value) === index);
}
