const AIDEN_PROVIDER_ICON_ALIASES: Readonly<Record<string, string>> = {
  "aiden-claude": "claude",
  "aiden-codex": "codex",
};

export function resolveAidenProviderIconAlias(provider: string): string | null {
  return AIDEN_PROVIDER_ICON_ALIASES[provider] ?? null;
}
