import type { Assistant } from "@getpaseo/protocol/messages";
import type { SelectFieldDisplay, SelectFieldOption } from "@/components/ui/select-field";

export function buildDevelopmentAssistantOptions(
  assistants: readonly Assistant[],
): SelectFieldOption<string>[] {
  return assistants.map((assistant) => ({
    id: assistant.id,
    value: assistant.id,
    label: assistant.name.trim() || "未命名助手",
    description: assistant.description.trim() || undefined,
  }));
}

export function resolveDevelopmentAssistantDisplay(
  options: readonly SelectFieldOption<string>[],
  assistantId: string | null,
): SelectFieldDisplay | null {
  if (!assistantId) return null;
  const selected = options.find((option) => option.value === assistantId);
  return selected
    ? {
        label: selected.label,
        description: selected.description,
      }
    : null;
}
