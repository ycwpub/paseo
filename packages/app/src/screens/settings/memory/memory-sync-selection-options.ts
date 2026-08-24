import type { TFunction } from "i18next";
import type {
  Assistant,
  PaseoMemoryState,
  PaseoMemorySyncSelection,
} from "@getpaseo/protocol/messages";
import type { ProjectSummary } from "@/utils/projects";

export interface MemorySyncSelectionOption {
  selection: PaseoMemorySyncSelection;
  label: string;
  description?: string;
}

export function memorySyncSelectionKey(option: MemorySyncSelectionOption): string {
  return `${option.selection.type}:${option.selection.id ?? ""}`;
}

export function buildMemorySyncSelectionOptions(input: {
  serverId: string;
  memory: PaseoMemoryState;
  projects: readonly ProjectSummary[];
  assistants: readonly Assistant[];
  t: TFunction;
}): MemorySyncSelectionOption[] {
  const options = new Map<string, MemorySyncSelectionOption>();
  const activeUser = input.memory.users?.find((user) => user.id === input.memory.activeUserId);
  addOption(options, {
    selection: { type: "global" },
    label: input.t("memoryPolicies.sync.scopes.global"),
    description: activeUser?.name,
  });

  for (const project of input.projects) {
    for (const host of project.hosts) {
      if (host.serverId !== input.serverId) continue;
      addOption(options, {
        selection: { type: "project", id: host.projectId },
        label: input.t("memoryPolicies.sync.scopes.project", {
          name: host.projectCustomName ?? host.projectName,
        }),
        description: host.projectId,
      });
    }
  }

  for (const assistant of input.assistants) {
    addOption(options, {
      selection: { type: "assistant", id: assistant.id },
      label: input.t("memoryPolicies.sync.scopes.assistant", {
        name: assistant.name.trim() || assistant.id,
      }),
      description: assistant.id,
    });
  }

  return [...options.values()];
}

function addOption(
  options: Map<string, MemorySyncSelectionOption>,
  option: MemorySyncSelectionOption,
): void {
  options.set(memorySyncSelectionKey(option), option);
}
