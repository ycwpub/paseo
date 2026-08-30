const GENERIC_LARK_DISPLAY_NAMES = new Set(["lark user", "feishu user", "飞书用户"]);

export function normalizeLarkDirectoryEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  return normalized || null;
}

export function normalizeLarkDirectoryDisplayName(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || GENERIC_LARK_DISPLAY_NAMES.has(normalized.toLocaleLowerCase())) {
    return null;
  }
  return normalized;
}

export function pickLarkDirectoryDisplayName(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return (
    normalizeLarkDirectoryDisplayName(preferred) ??
    normalizeLarkDirectoryDisplayName(fallback) ??
    null
  );
}

export function hasCompleteLarkDirectoryUser(input: {
  email?: string | null;
  displayName?: string | null;
}): boolean {
  return Boolean(
    normalizeLarkDirectoryEmail(input.email) &&
    normalizeLarkDirectoryDisplayName(input.displayName),
  );
}

export function inferLarkGroupId(input: {
  groupId?: string | null;
  chatId: string;
  name?: string | null;
}): string {
  const groupId = input.groupId?.trim() ?? "";
  if (groupId && groupId !== input.chatId) return groupId;
  const name = input.name?.trim() ?? "";
  const explicitMatch = name.match(/(?:群\s*ID|group\s*id|id)\s*[=:：]?\s*(\d{10,})/iu);
  if (explicitMatch?.[1]) return explicitMatch[1];
  const parenthesizedMatch = name.match(/[（(](\d{10,})[）)]/u);
  return (parenthesizedMatch?.[1] ?? groupId) || input.chatId;
}
