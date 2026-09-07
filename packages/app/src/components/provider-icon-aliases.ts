import { resolveAidenProviderIconAlias } from "@/components/aiden-provider-icon-aliases";

const PROVIDER_ICON_ALIASES: Readonly<Record<string, string>> = {
  traex: "traecli",
};

export function resolveProviderIconAlias(provider: string): string | null {
  return resolveAidenProviderIconAlias(provider) ?? PROVIDER_ICON_ALIASES[provider] ?? null;
}
