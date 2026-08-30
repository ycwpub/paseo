import type {
  Assistant,
  PaseoMemoryState,
  PaseoMemoryTransferSelection,
} from "@getpaseo/protocol/messages";
import type { SelectFieldOption } from "@/components/ui/select-field";

export function memoryTransferSelectionKey(selection: PaseoMemoryTransferSelection): string {
  if (selection.type === "all") return "all:";
  return `${selection.type}:${selection.id ?? ""}`;
}

export function buildMemoryTransferSelectionOptions(input: {
  memory: PaseoMemoryState;
  assistants: readonly Assistant[];
}): SelectFieldOption<PaseoMemoryTransferSelection>[] {
  const activeUser = input.memory.users?.find((user) => user.id === input.memory.activeUserId);
  return [
    {
      id: "all",
      value: { type: "all" },
      label: "全部记忆",
      description: "包含当前主机的全部记忆",
    },
    {
      id: "global",
      value: { type: "global" },
      label: "全局记忆",
      description: activeUser?.name ?? "当前用户",
    },
    ...input.assistants.map((assistant) => ({
      id: `assistant:${assistant.id}`,
      value: { type: "assistant" as const, id: assistant.id },
      label: `助手记忆 · ${assistant.name.trim() || assistant.id}`,
      description: assistant.id,
    })),
  ];
}

export function memoryTransferSelectionLabel(
  selection: PaseoMemoryTransferSelection,
  assistants: readonly Assistant[],
): string {
  if (selection.type === "all") return "全部 Paseo 记忆";
  if (selection.type === "global") return "全局记忆";
  const assistant = assistants.find((entry) => entry.id === selection.id);
  return `${assistant?.name.trim() || selection.id}的助手记忆`;
}
