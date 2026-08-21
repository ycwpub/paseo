import type { PaseoProjectLarkGroup } from "@getpaseo/protocol/messages";

export interface ProjectLarkGroupDraft {
  rowId: string;
  id: string;
  botId: string;
  chatId: string;
  enabled: boolean;
  messageLimitText: string;
  rawEntry: PaseoProjectLarkGroup;
}

let draftIdCounter = 0;

function nextDraftId(): string {
  draftIdCounter += 1;
  return `project-lark-group-${draftIdCounter}`;
}

export function projectLarkGroupsToDraft(
  groups: readonly PaseoProjectLarkGroup[] | null | undefined,
): ProjectLarkGroupDraft[] {
  return (groups ?? []).map((group) => ({
    rowId: nextDraftId(),
    id: group.id,
    botId: group.botId,
    chatId: group.chatId,
    enabled: group.enabled !== false,
    messageLimitText: String(group.messageLimit ?? 50),
    rawEntry: group,
  }));
}

export function createProjectLarkGroupDraft(): ProjectLarkGroupDraft {
  const suffix = `${Date.now()}-${nextDraftId()}`;
  return {
    rowId: suffix,
    id: `lark-group-${suffix}`,
    botId: "",
    chatId: "",
    enabled: true,
    messageLimitText: "50",
    rawEntry: {
      id: `lark-group-${suffix}`,
      botId: "",
      chatId: "",
    },
  };
}

export function parseProjectLarkMessageLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[0-9]+$/u.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : null;
}

export function projectLarkGroupDraftError(
  groups: readonly ProjectLarkGroupDraft[],
): string | null {
  const ids = new Set<string>();
  for (const [index, group] of groups.entries()) {
    const label = `第 ${index + 1} 个飞书群`;
    if (!group.botId.trim()) return `${label}未选择飞书机器人。`;
    if (!group.chatId.trim()) return `${label}未选择飞书群。`;
    if (parseProjectLarkMessageLimit(group.messageLimitText) === null) {
      return `${label}的消息数量必须是 1 到 200 之间的整数。`;
    }
    const id = group.id.trim();
    if (!id) return `${label}缺少绑定 ID。`;
    if (ids.has(id)) return `${label}的绑定 ID 重复。`;
    ids.add(id);
  }
  return null;
}

export function projectLarkGroupDraftsToConfig(
  groups: readonly ProjectLarkGroupDraft[],
): PaseoProjectLarkGroup[] {
  return groups.flatMap((group) => {
    const messageLimit = parseProjectLarkMessageLimit(group.messageLimitText);
    if (!group.id.trim() || !group.botId.trim() || !group.chatId.trim() || messageLimit === null) {
      return [];
    }
    return [
      {
        ...group.rawEntry,
        id: group.id.trim(),
        botId: group.botId.trim(),
        chatId: group.chatId.trim(),
        enabled: group.enabled,
        messageLimit,
      },
    ];
  });
}
